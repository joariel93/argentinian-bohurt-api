const db = require('../database/connection');
const { v4: uuidv4 } = require('uuid');

async function deleteTeamAndDependencies(trx, idEquipo) {
  // 1. Eliminar combates donde el equipo participa (A, B o ganador)
  const combates = await trx.all(
    `SELECT id_torneo, id_combate FROM combate WHERE id_equipo_a = ? OR id_equipo_b = ? OR id_equipo_ganador = ?`,
    [idEquipo, idEquipo, idEquipo]
  );

  for (const combate of combates) {
    await trx.run(
      `DELETE FROM round_peleador WHERE id_torneo = ? AND id_combate = ?`,
      [combate.id_torneo, combate.id_combate]
    );
    await trx.run(
      `DELETE FROM round_combate WHERE id_torneo = ? AND id_combate = ?`,
      [combate.id_torneo, combate.id_combate]
    );
    await trx.run(
      `DELETE FROM combate WHERE id_torneo = ? AND id_combate = ?`,
      [combate.id_torneo, combate.id_combate]
    );
  }

  // 2. Eliminar dependencias directas del equipo
  await trx.run(`DELETE FROM torneo_equipo_peleador WHERE id_equipo = ?`, [idEquipo]);
  await trx.run(`DELETE FROM torneo_equipo WHERE id_equipo = ?`, [idEquipo]);
  await trx.run(`DELETE FROM equipos_por_grupo WHERE id_equipo = ?`, [idEquipo]);
  await trx.run(`DELETE FROM equipo_peleador WHERE id_equipo = ?`, [idEquipo]);
  await trx.run(`DELETE FROM equipo_redes_sociales WHERE id_equipo = ?`, [idEquipo]);
  await trx.run(`DELETE FROM club_equipos WHERE id_equipo = ?`, [idEquipo]);

  // 3. Eliminar el equipo
  await trx.run(`DELETE FROM equipo WHERE id_equipo = ?`, [idEquipo]);
}

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

const teamsController = {
  getAll: async (req, res) => {
    const rows = await db.all(
      `SELECT e.id_equipo AS id, e.nombre, e.logo, e.fecha_creacion AS fechaCreacion,
              g.nombre AS genero, m.nombre AS modalidad, cat.nombre AS categoria,
              c.id_club AS clubId, c.nombre AS clubNombre
       FROM equipo e
       LEFT JOIN genero g ON e.id_genero = g.id_genero
       LEFT JOIN categoria cat ON e.id_categoria = cat.id_categoria AND e.id_modalidad = cat.id_modalidad
       LEFT JOIN modalidad m ON e.id_modalidad = m.id_modalidad
       LEFT JOIN club_equipos ce ON e.id_equipo = ce.id_equipo
       LEFT JOIN club c ON ce.id_club = c.id_club
       ORDER BY e.nombre`
    );
    const result = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        redesSociales: await getRedesSocialesEquipo(r.id),
      }))
    );
    res.json(result);
  },

  getById: async (req, res) => {
    const { idTeam } = req.params;

    const team = await db.get(
      `SELECT e.id_equipo, e.nombre, e.logo, e.id_genero, e.id_categoria, e.id_modalidad,
              g.nombre AS genero, cat.nombre AS categoria_nombre, m.nombre AS modalidad,
              e.id_color1, e.id_color2, e.id_color3
       FROM equipo e
       LEFT JOIN genero g ON e.id_genero = g.id_genero
       LEFT JOIN categoria cat ON e.id_categoria = cat.id_categoria AND e.id_modalidad = cat.id_modalidad
       LEFT JOIN modalidad m ON e.id_modalidad = m.id_modalidad
       WHERE e.id_equipo = ?`,
      [idTeam]
    );
    if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

    const redes = await getRedesSocialesEquipo(idTeam);

    const ce = await db.get(
      `SELECT c.id_club, c.nombre, c.info FROM club_equipos ce JOIN club c ON ce.id_club = c.id_club WHERE ce.id_equipo = ?`,
      [idTeam]
    );

    res.json({
      id: team.id_equipo,
      nombre: team.nombre,
      etiqueta: team.categoria_nombre,
      idModalidad: team.id_modalidad,
      modalidad: team.modalidad,
      esMasculino: team.genero === 'Masculino' || team.id_genero === 1,
      logo: team.logo,
      clubId: ce ? ce.id_club : null,
      club: ce ? ce.nombre : null,
      info: ce ? ce.info : null,
      color1: team.id_color1,
      color2: team.id_color2,
      color3: team.id_color3,
      redesSociales: redes,
    });
  },

  getSimplify: async (req, res) => {
    const { idClub } = req.params;
    const rows = await db.all(
      `SELECT e.id_equipo AS id, e.nombre FROM equipo e
       JOIN club_equipos ce ON e.id_equipo = ce.id_equipo
       WHERE ce.id_club = ? `,
      [idClub]
    );
    res.json(rows);
  },

  getTournamentStats: async (req, res) => {
    const { idTeam } = req.params;

    const team = await db.get(
      `SELECT e.nombre, e.id_genero, ce.id_club
       FROM equipo e
       JOIN club_equipos ce ON e.id_equipo = ce.id_equipo
       WHERE e.id_equipo = ?`,
      [idTeam]
    );
    if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

    const equipos = await db.all(
      `SELECT e.id_equipo, e.id_categoria, e.id_modalidad,
              cat.nombre AS categoria, m.nombre AS modalidad
       FROM equipo e
       JOIN club_equipos ce ON e.id_equipo = ce.id_equipo
       LEFT JOIN categoria cat ON cat.id_categoria = e.id_categoria AND cat.id_modalidad = e.id_modalidad
       LEFT JOIN modalidad m ON m.id_modalidad = e.id_modalidad
       WHERE ce.id_club = ? AND e.nombre = ? AND e.id_genero = ?
       ORDER BY e.id_modalidad, e.id_categoria`,
      [team.id_club, team.nombre, team.id_genero]
    );

    const result = await Promise.all(
      equipos.map(async (eq) => {
        const parentRows = await db.all(
          `SELECT te.cantidad_combates, te.cantidad_victorias, te.cantidad_derrotas,
                  te.cantidad_rounds_ganados, te.cantidad_rounds_perdidos
           FROM torneo_equipo te
           WHERE te.id_equipo = ?`,
          [eq.id_equipo]
        );

        const totales = parentRows.reduce(
          (acc, r) => ({
            combates: acc.combates + (r.cantidad_combates || 0),
            victorias: acc.victorias + (r.cantidad_victorias || 0),
            derrotas: acc.derrotas + (r.cantidad_derrotas || 0),
            roundsGanados: acc.roundsGanados + (r.cantidad_rounds_ganados || 0),
            roundsPerdidos: acc.roundsPerdidos + (r.cantidad_rounds_perdidos || 0),
          }),
          { combates: 0, victorias: 0, derrotas: 0, roundsGanados: 0, roundsPerdidos: 0 }
        );

        const torneosRows = await db.all(
          `SELECT te.id_torneo AS id, t.nombre AS torneo,
                  te.cantidad_combates AS combates,
                  te.cantidad_victorias AS victorias,
                  te.cantidad_derrotas AS derrotas,
                  te.cantidad_rounds_ganados AS roundsGanados,
                  te.cantidad_rounds_perdidos AS roundsPerdidos
           FROM torneo_equipo te
           JOIN torneo t ON te.id_torneo = t.id_torneo
           WHERE te.id_equipo = ?
           ORDER BY t.fecha_torneo DESC`,
          [eq.id_equipo]
        );

        return {
          idEquipo: eq.id_equipo,
          categoria: eq.categoria,
          modalidad: eq.modalidad,
          ...totales,
          torneos: torneosRows,
        };
      })
    );

    res.json(result);
  },

  create: async (req, res) => {
    const { idClub, nombre, logo, idColor1, idColor2, idColor3, idCategoria, idModalidad, idGenero, fechaCreacion, redesSociales } = req.body;
    if (!nombre || !idClub) return res.status(400).json({ error: 'nombre e idClub son requeridos' });

    const club = await db.get(`SELECT id_club FROM club WHERE id_club = ?`, [idClub]);
    if (!club) return res.status(404).json({ error: 'Club no encontrado' });

    const idEquipo = uuidv4();
    await db.transaction(async (trx) => {
      await trx.run(
        `INSERT INTO equipo (id_equipo, nombre, logo, fecha_creacion, id_color1, id_color2, id_color3, id_categoria, id_modalidad, id_genero)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [idEquipo, nombre, logo || null, fechaCreacion || null, idColor1 || 1, idColor2 || 2, idColor3 || 3, idCategoria || 1, idModalidad || 1, idGenero || 1]
      );

      await trx.run(`INSERT OR REPLACE INTO club_equipos (id_club, id_equipo) VALUES (?, ?)`, [idClub, idEquipo]);

      if (Array.isArray(redesSociales)) {
        for (const sn of redesSociales) {
          await trx.run(
            `INSERT OR REPLACE INTO equipo_redes_sociales (id_equipo, id_red_social, link) VALUES (?, ?, ?)`,
            [idEquipo, sn.idRedSocial, sn.link || null]
          );
        }
      }
    });

    res.status(201).json({ id: idEquipo, message: 'Equipo creado exitosamente' });
  },

  update: async (req, res) => {
    const { idTeam } = req.params;
    const existing = await db.get(`SELECT id_equipo FROM equipo WHERE id_equipo = ?`, [idTeam]);
    if (!existing) return res.status(404).json({ error: 'Equipo no encontrado' });

    const { nombre, logo, idColor1, idColor2, idColor3, idCategoria, idModalidad, idGenero, fechaCreacion, redesSociales } = req.body;

    await db.transaction(async (trx) => {
      const fields = [];
      const values = [];

      if (nombre !== undefined) { fields.push('nombre = ?'); values.push(nombre); }
      if (logo !== undefined) { fields.push('logo = ?'); values.push(logo); }
      if (idColor1 !== undefined) { fields.push('id_color1 = ?'); values.push(idColor1); }
      if (idColor2 !== undefined) { fields.push('id_color2 = ?'); values.push(idColor2); }
      if (idColor3 !== undefined) { fields.push('id_color3 = ?'); values.push(idColor3); }
      if (idCategoria !== undefined) { fields.push('id_categoria = ?'); values.push(idCategoria); }
      if (idModalidad !== undefined) { fields.push('id_modalidad = ?'); values.push(idModalidad); }
      if (idGenero !== undefined) { fields.push('id_genero = ?'); values.push(idGenero); }
      if (fechaCreacion !== undefined) { fields.push('fecha_creacion = ?'); values.push(fechaCreacion); }

      if (fields.length > 0) {
        values.push(idTeam);
        await trx.run(`UPDATE equipo SET ${fields.join(', ')} WHERE id_equipo = ?`, values);
      }

      if (Array.isArray(redesSociales)) {
        await trx.run(`DELETE FROM equipo_redes_sociales WHERE id_equipo = ?`, [idTeam]);
        for (const sn of redesSociales) {
          await trx.run(
            `INSERT INTO equipo_redes_sociales (id_equipo, id_red_social, link) VALUES (?, ?, ?)`,
            [idTeam, sn.idRedSocial, sn.link || null]
          );
        }
      }
    });

    res.json({ message: 'Equipo actualizado exitosamente' });
  },

  delete: async (req, res) => {
    const { idTeam } = req.params;
    const existing = await db.get(`SELECT id_equipo FROM equipo WHERE id_equipo = ?`, [idTeam]);
    if (!existing) return res.status(404).json({ error: 'Equipo no encontrado' });

    await db.transaction(async (trx) => {
      await deleteTeamAndDependencies(trx, idTeam);
    });

    res.json({ message: 'Equipo eliminado exitosamente' });
  },

  getByFilters: async (req, res) => {
    const { modalidad, categoria, genero } = req.query;
    const rows = await db.all(
      `SELECT id_equipo AS id, nombre, logo, fecha_creacion AS fechaCreacion
       FROM equipo
       WHERE id_modalidad = ? AND id_categoria = ? AND id_genero = ?
       ORDER BY nombre`,
      [modalidad || 1, categoria || 1, genero || 1]
    );
    res.json(rows);
  },

  adminCreate: async (req, res) => {
    const { nombre, fechaCreacion, logo, idCategoria, idModalidad, idGenero } = req.body;
    if (!nombre || !fechaCreacion) return res.status(400).json({ error: 'nombre y fechaCreacion son requeridos' });

    const idEquipo = uuidv4();
    await db.run(
      `INSERT INTO equipo (id_equipo, nombre, logo, fecha_creacion, id_categoria, id_modalidad, id_genero)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [idEquipo, nombre, logo || '/Mercenarios.svg', fechaCreacion, idCategoria || 1, idModalidad || 1, idGenero || 1]
    );

    res.status(201).json({ id: idEquipo, message: 'Equipo creado exitosamente' });
  },
};

module.exports = { ...teamsController, deleteTeamAndDependencies };
