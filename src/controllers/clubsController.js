import db from '../database/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { deleteTeamAndDependencies } from '../controllers/teamsController.js';


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
      `SELECT id_club AS id, nombre, pais AS country, ciudad, provincia, logo, fundacion, info,
              id_color1, id_color2, id_color3
       FROM club ORDER BY nombre`
    );
    const result = await Promise.all(
      clubs.map(async (c) => ({
        ...c,
        idColor1: c.id_color1,
        idColor2: c.id_color2,
        idColor3: c.id_color3,
        redesSociales: await getRedesSocialesClub(c.id),
      }))
    );
    res.json(result);
  },

  getById: async (req, res) => {
    const { idClub } = req.params;

    const club = await db.get(
      `SELECT id_club, nombre, pais, ciudad, provincia, logo, fundacion, info,
              id_color1, id_color2, id_color3
       FROM club WHERE id_club = ?`,
      [idClub]
    );

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
      ciudad: club.ciudad,
      provincia: club.provincia,
      idColor1: club.id_color1,
      idColor2: club.id_color2,
      idColor3: club.id_color3,
      redesSociales: clubRedes,
      teams: teamsWithSN,
    });
  },

  getSimplify: async (req, res) => {
    const rows = await db.all(`SELECT id_club AS id, nombre, logo FROM club ORDER BY nombre`);
    res.json(rows);
  },

  getStats: async (req, res) => {
    const { idClub } = req.params;
    const rows = await db.all(
      `SELECT te.id_torneo,
              e.nombre || ' - ' || e.fecha_evento || ' - ' || m.nombre || ' ' || g.nombre AS torneo,
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
       JOIN evento e ON t.id_evento = e.id_evento
       WHERE ce.id_club = ?
       GROUP BY te.id_torneo, e.nombre, e.fecha_evento, m.nombre, g.nombre
       ORDER BY e.fecha_evento DESC`,
      [idClub]
    );
    res.json(rows);
  },

  create: async (req, res) => {
    const { nombre, pais, ciudad, provincia, logo, fundacion, info, redesSociales, idColor1, idColor2, idColor3 } = req.body;
    if (!nombre || !fundacion) return res.status(400).json({ error: 'nombre y fundacion son requeridos' });

    const idClub = uuidv4();
    await db.transaction(async (trx) => {
      await trx.run(
        `INSERT INTO club (id_club, nombre, pais, ciudad, provincia, logo, fundacion, info, id_color1, id_color2, id_color3)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [idClub, nombre, pais || null, ciudad || null, provincia || null, logo || null, fundacion, info || null,
          idColor1 || 1, idColor2 || 1, idColor3 || 1]
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

    const { nombre, pais, ciudad, provincia, logo, fundacion, info, redesSociales, idColor1, idColor2, idColor3 } = req.body;

    await db.transaction(async (trx) => {
      const fields = [];
      const values = [];

      if (nombre !== undefined) { fields.push('nombre = ?'); values.push(nombre); }
      if (pais !== undefined) { fields.push('pais = ?'); values.push(pais); }
      if (ciudad !== undefined) { fields.push('ciudad = ?'); values.push(ciudad); }
      if (provincia !== undefined) { fields.push('provincia = ?'); values.push(provincia); }
      if (logo !== undefined) { fields.push('logo = ?'); values.push(logo); }
      if (fundacion !== undefined) { fields.push('fundacion = ?'); values.push(fundacion); }
      if (info !== undefined) { fields.push('info = ?'); values.push(info); }
      if (idColor1 !== undefined) { fields.push('id_color1 = ?'); values.push(idColor1); }
      if (idColor2 !== undefined) { fields.push('id_color2 = ?'); values.push(idColor2); }
      if (idColor3 !== undefined) { fields.push('id_color3 = ?'); values.push(idColor3); }

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

  getDuelistas: async (req, res) => {
    const { idClub } = req.params;
    const club = await db.get(`SELECT id_club, nombre FROM club WHERE id_club = ?`, [idClub]);
    if (!club) return res.status(404).json({ error: 'Club no encontrado' });

    // Estadísticas agregadas por peleador (solo cuenta los combates donde realmente participó,
    // es decir donde tuvo id_usuario_b !== null, o sea: no se cuentan los byes).
    const peleadores = await db.all(
      `SELECT tp.id_usuario AS idUsuario,
              u.nombre, u.apellido,
              SUM(tp.cantidad_combates) AS combates,
              SUM(tp.cantidad_victorias) AS victorias,
              SUM(tp.cantidad_derrotas) AS derrotas,
              SUM(tp.cantidad_puntos) AS puntos,
              SUM(tp.cantidad_amarillas) AS amarillas
       FROM torneo_peleador tp
       JOIN usuario u ON tp.id_usuario = u.id_usuario
       JOIN torneo t ON tp.id_torneo = t.id_torneo
       WHERE tp.id_club = ?
         AND t.id_modalidad IN (2, 3)
       GROUP BY tp.id_usuario, u.nombre, u.apellido
       ORDER BY u.apellido, u.nombre`,
      [idClub]
    );

    // Torneos en los que participó el peleador (sin contar byes).
    const torneosPorPeleador = await db.all(
      `SELECT tp.id_usuario AS idUsuario,
              tp.id_torneo AS idTorneo,
              t.nombre AS torneoNombre,
              m.nombre AS modalidad,
              m.id_modalidad AS idModalidad,
              c.nombre AS categoria,
              c.id_categoria AS idCategoria,
              g.nombre AS genero,
              g.id_genero AS idGenero,
              e.id_evento AS idEvento,
              e.nombre AS eventoNombre,
              e.fecha_evento AS fechaEvento,
              tp.posicion,
              tp.cantidad_combates AS combates,
              tp.cantidad_victorias AS victorias,
              tp.cantidad_derrotas AS derrotas,
              tp.cantidad_puntos AS puntos,
              tp.cantidad_amarillas AS amarillas,
              tp.descalificado
       FROM torneo_peleador tp
       JOIN torneo t ON tp.id_torneo = t.id_torneo
       JOIN modalidad m ON t.id_modalidad = m.id_modalidad
       JOIN categoria c ON t.id_categoria = c.id_categoria AND t.id_modalidad = c.id_modalidad
       JOIN genero g ON t.id_genero = g.id_genero
       JOIN evento e ON t.id_evento = e.id_evento
       WHERE tp.id_club = ?
         AND t.id_modalidad IN (2, 3)
       ORDER BY e.fecha_evento DESC, e.nombre`,
      [idClub]
    );

    // Combates donde el peleador participó realmente (con id_usuario_b no null) — útil para excluir byes.
    const combatesRealesPorPeleador = await db.all(
      `SELECT ci.id_usuario_a AS idUsuario,
              t.id_torneo AS idTorneo,
              1 AS combate_real
       FROM combate_individual ci
       JOIN torneo t ON ci.id_torneo = t.id_torneo
       WHERE ci.id_usuario_b IS NOT NULL AND t.id_modalidad IN (2, 3) AND t.id_evento IN (
         SELECT id_evento FROM torneo WHERE id_torneo IN (SELECT id_torneo FROM torneo_peleador WHERE id_club = ?)
       )
       UNION ALL
       SELECT ci.id_usuario_b AS idUsuario,
              t.id_torneo AS idTorneo,
              1 AS combate_real
       FROM combate_individual ci
       JOIN torneo t ON ci.id_torneo = t.id_torneo
       WHERE ci.id_usuario_a IS NOT NULL AND t.id_modalidad IN (2, 3) AND t.id_evento IN (
         SELECT id_evento FROM torneo WHERE id_torneo IN (SELECT id_torneo FROM torneo_peleador WHERE id_club = ?)
       )`,
      [idClub, idClub]
    );

    // También combates del peleador en el lado "b" (porque arriba pueden tener id_usuario_a con bye).
    // Lo importante: solo contar si realmente tuvo un combate con otro peleador.

    // Construir respuesta
    const combatesMap = {};
    for (const c of combatesRealesPorPeleador) {
      if (!combatesMap[c.idUsuario]) combatesMap[c.idUsuario] = {};
      if (!combatesMap[c.idUsuario][c.idTorneo]) combatesMap[c.idUsuario][c.idTorneo] = 0;
      combatesMap[c.idUsuario][c.idTorneo] += 1;
    }

    const torneosMap = {};
    for (const t of torneosPorPeleador) {
      if (!torneosMap[t.idUsuario]) torneosMap[t.idUsuario] = [];
      const combatesReales = combatesMap[t.idUsuario]?.[t.idTorneo] || 0;
      torneosMap[t.idUsuario].push({
        idTorneo: t.idTorneo,
        idEvento: t.idEvento,
        torneoNombre: t.torneoNombre,
        modalidad: t.modalidad,
        idModalidad: t.idModalidad,
        categoria: t.categoria,
        idCategoria: t.idCategoria,
        genero: t.genero,
        idGenero: t.idGenero,
        eventoNombre: t.eventoNombre,
        fechaEvento: t.fechaEvento,
        posicion: t.posicion,
        combates: combatesReales,
        combatesTotales: t.combates || 0,
        victorias: t.victorias || 0,
        derrotas: t.derrotas || 0,
        puntos: t.puntos || 0,
        amarillas: t.amarillas || 0,
        descalificado: !!t.descalificado,
      });
    }

    const result = peleadores.map((p) => ({
      idUsuario: p.idUsuario,
      nombre: p.nombre,
      apellido: p.apellido,
      dni: null, // No exponemos DNI.
      combates: p.combates || 0,
      victorias: p.victorias || 0,
      derrotas: p.derrotas || 0,
      puntos: p.puntos || 0,
      amarillas: p.amarillas || 0,
      torneos: torneosMap[p.idUsuario] || [],
    }));

    res.json({ idClub, clubNombre: club.nombre, peleadores: result });
  },
};

export default clubsController;
