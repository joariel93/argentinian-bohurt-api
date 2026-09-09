const db = require('../database/connection');
const { v4: uuidv4 } = require('uuid');
const { deleteTeamAndDependencies } = require('../controllers/teamsController');

function mapIconClass(icono) {
  const map = {
    'fa-facebook-f': 'pi pi-facebook',
    'fa-instagram': 'pi pi-instagram',
    'fa-twitter': 'pi pi-twitter',
    'fa-tiktok': 'pi pi-tiktok',
    'fa-youtube': 'pi pi-youtube',
    'fa-twitch': 'pi pi-twitch',
    'fa-discord': 'pi pi-discord',
  };
  return map[icono] || 'pi pi-globe';
}

async function getRedesSocialesClub(idClub) {
  const rows = await db.all(
    `SELECT rs.nombre AS platform, crs.link AS url, rs.icono
     FROM club_redes_sociales crs
     JOIN redes_sociales rs ON crs.id_red_social = rs.id_red_social
     WHERE crs.id_club = ?`,
    [idClub]
  );
  return rows.map((r) => ({ platform: r.platform, url: r.url || '', iconClass: mapIconClass(r.icono) }));
}

async function getRedesSocialesEquipo(idEquipo) {
  const rows = await db.all(
    `SELECT rs.nombre AS platform, ers.link AS url, rs.icono
     FROM equipo_redes_sociales ers
     JOIN redes_sociales rs ON ers.id_red_social = rs.id_red_social
     WHERE ers.id_equipo = ?`,
    [idEquipo]
  );
  return rows.map((r) => ({ platform: r.platform, url: r.url || '', iconClass: mapIconClass(r.icono) }));
}

async function getTeamsByClub(idClub) {
  const rows = await db.all(
    `SELECT e.id_equipo, e.nombre, e.logo, e.id_genero, e.id_categoria, e.id_modalidad,
            g.nombre AS genero, m.nombre AS modalidad_nombre
     FROM equipo e
     JOIN club_equipos ce ON e.id_equipo = ce.id_equipo
     LEFT JOIN genero g ON e.id_genero = g.id_genero
     LEFT JOIN modalidad m ON e.id_modalidad = m.id_modalidad
     WHERE ce.id_club = ? ORDER BY e.id_modalidad, e.id_categoria, e.nombre`,
    [idClub]
  );

  const groups = new Map();
  for (const r of rows) {
    const key = `${r.nombre}__${r.id_genero}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: r.id_equipo,
        nombre: r.nombre,
        logo: r.logo,
        esMasculino: r.genero === 'Masculino' || r.id_genero === 1,
        modalidades: [],
      });
    }
    const group = groups.get(key);
    if (!group.modalidades.some((m) => m.id === r.id_modalidad)) {
      group.modalidades.push({ id: r.id_modalidad, nombre: r.modalidad_nombre });
    }
  }

  return [...groups.values()];
}

const clubsController = {
  getAll: async (req, res) => {
    const clubs = await db.all(
      `SELECT id_club AS id, nombre, pais AS country, logo FROM club ORDER BY nombre`
    );
    const result = await Promise.all(
      clubs.map(async (c) => ({
        ...c,
        redesSociales: await getRedesSocialesClub(c.id),
      }))
    );
    res.json(result);
  },

  getById: async (req, res) => {
    const { idClub } = req.params;

    const club = await db.get(`SELECT id_club, nombre, pais, logo, fundacion, info FROM club WHERE id_club = ?`, [idClub]);

    if (!club) return res.status(404).json({ error: 'Club no encontrado' });

    const clubRedes = await getRedesSocialesClub(club.id_club);
    const teams = await getTeamsByClub(club.id_club);

    const teamsWithSN = await Promise.all(
      teams.map(async (t) => {
        const teamSN = await getRedesSocialesEquipo(t.id);
        return {
          id: t.id,
          nombre: t.nombre,
          esMasculino: t.esMasculino,
          logo: t.logo,
          club: club.nombre,
          modalidades: t.modalidades,
          redesSociales: teamSN.length > 0 ? teamSN : clubRedes,
        };
      })
    );

    res.json({
      club: club.nombre,
      logo: club.logo,
      foundation: club.fundacion,
      info: club.info,
      country: club.pais,
      redesSociales: clubRedes,
      teams: teamsWithSN,
    });
  },

  getSimplify: async (req, res) => {
    const rows = await db.all(`SELECT id_club AS id, nombre FROM club ORDER BY nombre`);
    res.json(rows);
  },

  getStats: async (req, res) => {
    const { idClub } = req.params;
    const rows = await db.all(
      `SELECT te.id_torneo,
              t.nombre || ' - ' || t.fecha_torneo || ' - ' || m.nombre || ' ' || g.nombre AS torneo,
              m.nombre AS modalidad,
              g.nombre AS genero,
              SUM(te.cantidad_combates) AS combates,
              SUM(te.cantidad_victorias) AS victorias,
              SUM(te.cantidad_derrotas) AS derrotas,
              SUM(te.cantidad_rounds_ganados) AS roundsGanados,
              SUM(te.cantidad_rounds_perdidos) AS roundsPerdidos
       FROM torneo_equipo te
       JOIN equipo e ON te.id_equipo = e.id_equipo
       JOIN club_equipos ce ON e.id_equipo = ce.id_equipo
       JOIN torneo t ON te.id_torneo = t.id_torneo
       JOIN modalidad m ON t.id_modalidad = m.id_modalidad
       JOIN genero g ON t.id_genero = g.id_genero
       WHERE ce.id_club = ?
       GROUP BY te.id_torneo, t.nombre, t.fecha_torneo, m.nombre, g.nombre
       ORDER BY t.fecha_torneo DESC`,
      [idClub]
    );
    res.json(rows);
  },

  create: async (req, res) => {
    const { nombre, pais, logo, fundacion, info, redesSociales } = req.body;
    if (!nombre || !fundacion) return res.status(400).json({ error: 'nombre y fundacion son requeridos' });

    const idClub = uuidv4();
    await db.transaction(async (trx) => {
      await trx.run(
        `INSERT INTO club (id_club, nombre, pais, logo, fundacion, info) VALUES (?, ?, ?, ?, ?, ?)`,
        [idClub, nombre, pais || null, logo || null, fundacion, info || null]
      );

      if (Array.isArray(redesSociales)) {
        for (const sn of redesSociales) {
          await trx.run(
            `INSERT OR REPLACE INTO club_redes_sociales (id_club, id_red_social, link) VALUES (?, ?, ?)`,
            [idClub, sn.idRedSocial, sn.link || null]
          );
        }
      }
    });

    res.status(201).json({ id: idClub, message: 'Club creado exitosamente' });
  },

  update: async (req, res) => {
    const { idClub } = req.params;
    const existing = await db.get(`SELECT id_club FROM club WHERE id_club = ?`, [idClub]);
    if (!existing) return res.status(404).json({ error: 'Club no encontrado' });

    const { nombre, pais, logo, fundacion, info, redesSociales } = req.body;

    await db.transaction(async (trx) => {
      const fields = [];
      const values = [];

      if (nombre !== undefined) { fields.push('nombre = ?'); values.push(nombre); }
      if (pais !== undefined) { fields.push('pais = ?'); values.push(pais); }
      if (logo !== undefined) { fields.push('logo = ?'); values.push(logo); }
      if (fundacion !== undefined) { fields.push('fundacion = ?'); values.push(fundacion); }
      if (info !== undefined) { fields.push('info = ?'); values.push(info); }

      if (fields.length > 0) {
        values.push(idClub);
        await trx.run(`UPDATE club SET ${fields.join(', ')} WHERE id_club = ?`, values);
      }

      if (Array.isArray(redesSociales)) {
        await trx.run(`DELETE FROM club_redes_sociales WHERE id_club = ?`, [idClub]);
        for (const sn of redesSociales) {
          await trx.run(
            `INSERT INTO club_redes_sociales (id_club, id_red_social, link) VALUES (?, ?, ?)`,
            [idClub, sn.idRedSocial, sn.link || null]
          );
        }
      }
    });

    res.json({ message: 'Club actualizado exitosamente' });
  },

  delete: async (req, res) => {
    const { idClub } = req.params;
    const existing = await db.get(`SELECT id_club FROM club WHERE id_club = ?`, [idClub]);
    if (!existing) return res.status(404).json({ error: 'Club no encontrado' });

    await db.transaction(async (trx) => {
      // 1. Eliminar redes sociales del club
      await trx.run(`DELETE FROM club_redes_sociales WHERE id_club = ?`, [idClub]);

      // 2. Obtener equipos del club y eliminarlos con todas sus dependencias
      const equipos = await trx.all(
        `SELECT id_equipo FROM club_equipos WHERE id_club = ?`,
        [idClub]
      );
      for (const equipo of equipos) {
        await deleteTeamAndDependencies(trx, equipo.id_equipo);
      }

      // 3. Eliminar el club
      await trx.run(`DELETE FROM club WHERE id_club = ?`, [idClub]);
    });

    res.json({ message: 'Club eliminado exitosamente' });
  },
};

module.exports = clubsController;
