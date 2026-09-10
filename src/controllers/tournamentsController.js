const db = require('../database/connection');
const { v4: uuidv4 } = require('uuid');

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

async function getRedesSocialesTorneo(idTorneo) {
  const rows = await db.all(
    `SELECT rs.nombre AS platform, trs.link AS url, rs.icono
     FROM torneo_redes_sociales trs
     JOIN redes_sociales rs ON trs.id_red_social = rs.id_red_social
     WHERE trs.id_torneo = ?`,
    [idTorneo]
  );
  return rows.map((r) => ({ platform: r.platform, url: r.url || '', iconClass: mapIconClass(r.icono) }));
}

const tournamentsController = {
  getAll: async (req, res) => {
    const rows = await db.all(
      `SELECT t.id_torneo AS id, t.nombre, t.fecha_torneo AS fechaTorneo,
              t.fecha_cierre_inscripcion AS fechaCierreInscripcion,
              t.localizacion, t.imagen, t.link_transmision AS linkTransmision,
              m.nombre AS modalidad, g.nombre AS sexo, c.nombre AS categoria,
              (SELECT COUNT(*) FROM torneo_equipo te WHERE te.id_torneo = t.id_torneo) AS equiposInscritos,
              CASE
                WHEN t.fecha_cierre_inscripcion > date('now') THEN 'Inscripciones abiertas'
                WHEN t.fecha_torneo > date('now') THEN 'Inscripciones cerradas'
                ELSE 'Finalizado'
              END AS estado
       FROM torneo t
       JOIN modalidad m ON t.id_modalidad = m.id_modalidad
       JOIN genero g ON t.id_genero = g.id_genero
       JOIN categoria c ON t.id_categoria = c.id_categoria AND t.id_modalidad = c.id_modalidad
       ORDER BY t.fecha_torneo ASC`
    );
    res.json(rows);
  },

  getInfo: async (req, res) => {
    const { tournamentId } = req.params;
    const t = await db.get(
      `SELECT t.id_torneo, t.nombre, t.fecha_torneo AS fechaTorneo, t.fecha_cierre_inscripcion AS fechaCierreInscripcion,
              t.localizacion, t.imagen, t.link_transmision AS linkTransmision, t.id_tipo_torneo AS idTipoTorneo,
              m.nombre AS modalidad, g.nombre AS sexo, c.nombre AS categoria,
              tt.nombre AS tipoTorneo
       FROM torneo t
       JOIN modalidad m ON t.id_modalidad = m.id_modalidad
       JOIN genero g ON t.id_genero = g.id_genero
       JOIN categoria c ON t.id_categoria = c.id_categoria AND t.id_modalidad = c.id_modalidad
       LEFT JOIN tipo_torneo tt ON t.id_tipo_torneo = tt.id_tipo_torneo
       WHERE t.id_torneo = ?`,
      [tournamentId]
    );
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });

    const [clubs, reglamento, redesSociales, campeon] = await Promise.all([
      db.all(
        `SELECT DISTINCT c.id_club AS id, c.nombre
         FROM club c
         JOIN club_equipos ce ON c.id_club = ce.id_club
         JOIN torneo_equipo te ON ce.id_equipo = te.id_equipo
         WHERE te.id_torneo = ?`,
        [tournamentId]
      ),
      db.get(
        `SELECT r.nombre, r.link
         FROM reglamento r
         JOIN torneo t ON t.id_reglamento = r.id_reglamento
         WHERE t.id_torneo = ?`,
        [tournamentId]
      ),
      getRedesSocialesTorneo(tournamentId),
      db.get(
        `SELECT te.id_equipo AS id, e.nombre, e.logo
         FROM torneo_equipo te
         JOIN equipo e ON te.id_equipo = e.id_equipo
         WHERE te.id_torneo = ? AND te.posicion = 1`,
        [tournamentId]
      ),
    ]);

    res.json({
      id: t.id_torneo,
      nombre: t.nombre,
      fechaTorneo: t.fechaTorneo,
      fechaCierreInscripcion: t.fechaCierreInscripcion,
      localizacion: t.localizacion,
      imagen: t.imagen,
      idTipoTorneo: t.idTipoTorneo,
      modalidad: t.modalidad,
      sexo: t.sexo,
      categoria: t.categoria,
      tipoTorneo: t.tipoTorneo,
      reglamento: reglamento ? { nombre: reglamento.nombre, link: reglamento.link } : null,
      redesSociales,
      clubesInvitados: clubs,
      campeon: campeon ? { id: campeon.id, nombre: campeon.nombre, logo: campeon.logo } : null,
    });
  },

  checkExists: async (req, res) => {
    const { organizerId } = req.params;
    const row = await db.get(`SELECT id_torneo FROM torneo WHERE id_organizador = ?`, [organizerId]);
    res.json(!!row);
  },

  getCombatTypes: async (req, res) => {
    const { idModalidad } = req.params;
    const rows = await db.all(
      `SELECT id_categoria AS value, nombre AS label FROM categoria WHERE id_modalidad = ? ORDER BY id_categoria`,
      [idModalidad]
    );
    res.json(rows);
  },

  submit: async (req, res) => {
    const { nombre, localizacion, fechaTorneo, fechaCierreInscripcion,
      idOrganizador, idReglamento, idGenero, idCategoria, idModalidad,
      idTipoTorneo, imagen, linkTransmision, password, redesSociales } = req.body;

    if (!nombre || !localizacion || !fechaTorneo || !fechaCierreInscripcion) {
      return res.status(400).json({ error: 'nombre, localizacion, fechaTorneo y fechaCierreInscripcion son requeridos' });
    }

    const idTorneo = uuidv4();
    await db.transaction(async (trx) => {
      await trx.run(
        `INSERT INTO torneo (id_torneo, nombre, localizacion, fecha_torneo, fecha_cierre_inscripcion,
                             id_organizador, id_reglamento, id_genero, id_categoria, id_modalidad,
                             id_tipo_torneo, imagen, link_transmision, password)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [idTorneo, nombre, localizacion, fechaTorneo, fechaCierreInscripcion,
          idOrganizador || null, idReglamento || 1, idGenero || 1, idCategoria || 1, idModalidad || 1,
          idTipoTorneo || null, imagen || null, linkTransmision || null, password || null]
      );

      if (Array.isArray(redesSociales)) {
        for (const sn of redesSociales) {
          await trx.run(
            `INSERT OR REPLACE INTO torneo_redes_sociales (id_torneo, id_red_social, link) VALUES (?, ?, ?)`,
            [idTorneo, sn.idRedSocial, sn.link || null]
          );
        }
      }
    });

    res.status(201).json({ id: idTorneo, message: 'Torneo creado exitosamente' });
  },

  update: async (req, res) => {
    const { id } = req.params;
    const existing = await db.get(`SELECT id_torneo FROM torneo WHERE id_torneo = ?`, [id]);
    if (!existing) return res.status(404).json({ error: 'Torneo no encontrado' });

    const updates = req.body;
    const { redesSociales } = updates;
    const fieldMap = {
      fechaTorneo: 'fecha_torneo',
      fechaCierreInscripcion: 'fecha_cierre_inscripcion',
      idOrganizador: 'id_organizador',
      idReglamento: 'id_reglamento',
      idGenero: 'id_genero',
      idCategoria: 'id_categoria',
      idModalidad: 'id_modalidad',
      idTipoTorneo: 'id_tipo_torneo',
      linkTransmision: 'link_transmision',
    };
    const allowedFields = ['nombre', 'localizacion', 'fecha_torneo', 'fecha_cierre_inscripcion',
      'id_organizador', 'id_reglamento', 'id_genero', 'id_categoria', 'id_modalidad',
      'id_tipo_torneo', 'imagen', 'link_transmision', 'password'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      const dbField = fieldMap[key] || key;
      if (allowedFields.includes(dbField) && value !== undefined) {
        fields.push(`${dbField} = ?`);
        values.push(value);
      }
    }

    if (fields.length > 0) {
      values.push(id);
      await db.run(`UPDATE torneo SET ${fields.join(', ')} WHERE id_torneo = ?`, values);
    }

    if (Array.isArray(redesSociales)) {
      await db.run(`DELETE FROM torneo_redes_sociales WHERE id_torneo = ?`, [id]);
      for (const sn of redesSociales) {
        await db.run(
          `INSERT OR REPLACE INTO torneo_redes_sociales (id_torneo, id_red_social, link) VALUES (?, ?, ?)`,
          [id, sn.idRedSocial, sn.link || null]
        );
      }
    }

    res.json({ message: 'Torneo actualizado exitosamente' });
  },

  delete: async (req, res) => {
    const { id } = req.params;
    const existing = await db.get(`SELECT id_torneo FROM torneo WHERE id_torneo = ?`, [id]);
    if (!existing) return res.status(404).json({ error: 'Torneo no encontrado' });

    await db.transaction(async (trx) => {
      await trx.run(`DELETE FROM torneo_redes_sociales WHERE id_torneo = ?`, [id]);
      await trx.run(`DELETE FROM torneo_equipo_peleador WHERE id_torneo = ?`, [id]);
      await trx.run(`DELETE FROM torneo_luchador WHERE id_torneo = ?`, [id]);
      await trx.run(`DELETE FROM torneo_equipo WHERE id_torneo = ?`, [id]);
      await trx.run(`DELETE FROM equipos_por_grupo WHERE id_torneo = ?`, [id]);
      await trx.run(`DELETE FROM round_combate WHERE id_torneo = ?`, [id]);
      await trx.run(`DELETE FROM combate WHERE id_torneo = ?`, [id]);
      await trx.run(`DELETE FROM organizacion_torneo WHERE id_torneo = ?`, [id]);
      await trx.run(`DELETE FROM torneo WHERE id_torneo = ?`, [id]);
    });

    res.json({ message: 'Torneo eliminado exitosamente' });
  },

  getEquipos: async (req, res) => {
    const { idTorneo } = req.params;
    const rows = await db.all(
      `SELECT te.id_equipo AS id, e.nombre, e.logo, e.fecha_creacion AS fechaCreacion, te.posicion
       FROM torneo_equipo te
       JOIN equipo e ON te.id_equipo = e.id_equipo
       WHERE te.id_torneo = ?
       ORDER BY e.nombre`,
      [idTorneo]
    );
    res.json(rows);
  },

  getCombates: async (req, res) => {
    const { idTorneo } = req.params;

    const torneo = await db.get(`SELECT id_torneo FROM torneo WHERE id_torneo = ?`, [idTorneo]);
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

    const combates = await db.all(
      `SELECT c.id_combate, c.orden, c.link, c.fase, c.grupo, c.ronda,
              c.id_equipo_a, c.id_equipo_b, c.id_equipo_ganador,
              c.cantidad_round_ganados_ganador, c.cantidad_round_ganados_perdedor,
              ea.nombre AS nombreEquipoA, ea.logo AS logoEquipoA,
              eb.nombre AS nombreEquipoB, eb.logo AS logoEquipoB,
              eg.nombre AS nombreEquipoGanador
       FROM combate c
       JOIN equipo ea ON c.id_equipo_a = ea.id_equipo
       JOIN equipo eb ON c.id_equipo_b = eb.id_equipo
       LEFT JOIN equipo eg ON c.id_equipo_ganador = eg.id_equipo
       WHERE c.id_torneo = ?
       ORDER BY c.orden ASC`,
      [idTorneo]
    );

    const result = await Promise.all(
      combates.map(async (c) => {
        const rounds = await db.all(
          `SELECT rc.round, rc.id_equipo_ganador, rc.puntos_ganador, rc.puntos_perdedor,
                  eg.nombre AS nombreEquipoGanador
           FROM round_combate rc
           LEFT JOIN equipo eg ON rc.id_equipo_ganador = eg.id_equipo
           WHERE rc.id_torneo = ? AND rc.id_combate = ?
           ORDER BY rc.round ASC`,
          [idTorneo, c.id_combate]
        );

        return {
          id: c.id_combate,
          orden: c.orden,
          link: c.link || null,
          fase: c.fase || null,
          grupo: c.grupo || null,
          ronda: c.ronda || null,
          finalizado: !!c.id_equipo_ganador,
          idEquipoA: c.id_equipo_a,
          nombreEquipoA: c.nombreEquipoA,
          logoEquipoA: c.logoEquipoA,
          idEquipoB: c.id_equipo_b,
          nombreEquipoB: c.nombreEquipoB,
          logoEquipoB: c.logoEquipoB,
          idEquipoGanador: c.id_equipo_ganador,
          nombreEquipoGanador: c.nombreEquipoGanador,
          roundsGanadosGanador: c.cantidad_round_ganados_ganador,
          roundsGanadosPerdedor: c.cantidad_round_ganados_perdedor,
          rounds: rounds.map((r) => {
            const ganoA = r.id_equipo_ganador === c.id_equipo_a;
            return {
              round: r.round,
              idEquipoGanador: r.id_equipo_ganador,
              nombreEquipoGanador: r.nombreEquipoGanador,
              puntosEquipoA: ganoA ? r.puntos_ganador : r.puntos_perdedor,
              puntosEquipoB: ganoA ? r.puntos_perdedor : r.puntos_ganador,
            };
          }),
        };
      })
    );

    res.json({ idTorneo, combates: result });
  },

  getEstadisticas: async (req, res) => {
    const { idTorneo } = req.params;

    const torneo = await db.get(
      `SELECT id_torneo, id_tipo_torneo FROM torneo WHERE id_torneo = ?`,
      [idTorneo]
    );
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

    const rows = await db.all(
      `SELECT te.id_equipo AS id, e.nombre, e.logo, te.posicion,
              COALESCE(te.cantidad_combates, 0) AS combates,
              COALESCE(te.cantidad_victorias, 0) AS victorias,
              COALESCE(te.cantidad_derrotas, 0) AS derrotas,
              COALESCE(te.cantidad_rounds_ganados, 0) AS roundsGanados,
              COALESCE(te.cantidad_rounds_perdidos, 0) AS roundsPerdidos,
              epg.grupo
       FROM torneo_equipo te
       JOIN equipo e ON te.id_equipo = e.id_equipo
       LEFT JOIN equipos_por_grupo epg ON epg.id_torneo = te.id_torneo AND epg.id_equipo = te.id_equipo
       WHERE te.id_torneo = ?
       ORDER BY (te.posicion IS NULL), te.posicion ASC, te.cantidad_victorias DESC, te.cantidad_derrotas ASC, te.cantidad_rounds_ganados DESC`,
      [idTorneo]
    );

    res.json({ idTorneo, idTipoTorneo: torneo.id_tipo_torneo, equipos: rows });
  },

  addEquipo: async (req, res) => {
    const { idTorneo } = req.params;
    const { idEquipo, posicion } = req.body;

    if (!idEquipo) return res.status(400).json({ error: 'idEquipo es requerido' });

    await db.run(
      `INSERT OR REPLACE INTO torneo_equipo (id_equipo, id_torneo, posicion, cantidad_combates, cantidad_victorias, cantidad_derrotas, cantidad_rounds_ganados, cantidad_rounds_perdidos)
       VALUES (?, ?, ?, 0, 0, 0, 0, 0)`,
      [idEquipo, idTorneo, posicion || null]
    );

    res.status(201).json({ message: 'Equipo agregado al torneo' });
  },

  addCombates: async (req, res) => {
    const { idTorneo } = req.params;
    const { equipos, combates } = req.body;

    if (!idTorneo || !combates) return res.status(400).json({ error: 'Faltan parametros del endpoint' });

    try {
      await db.transaction(async (trx) => {
        for (let i = 0; i < equipos.length; i++) {
          const equipo = equipos[i];
          await trx.run(
            `INSERT OR REPLACE INTO torneo_equipo (id_equipo, id_torneo, posicion, cantidad_combates, cantidad_victorias, cantidad_derrotas, cantidad_rounds_ganados, cantidad_rounds_perdidos)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [equipo.id_equipo, idTorneo, equipo.posicion, equipo.cantidadCombates, equipo.cantidadVictorias, equipo.cantidadDerrotas, equipo.cantidadRoundGanados, equipo.cantidadRoundPerdidos || null]
          );
        }

        for (let i = 0; i < combates.length; i++) {
          const combate = combates[i];
          const idCombate = uuidv4();
          const roundsGanador = combate.rounds.filter(round => round.idGanador === combate.idGanadorCombate).length;
          const roundsPerdedor = combate.rounds.length - roundsGanador;
          await trx.run(
            `INSERT INTO combate (id_torneo, id_combate, orden, cantidad_round_ganados_ganador, cantidad_round_ganados_perdedor,
              id_equipo_a, id_equipo_b, id_equipo_ganador, link)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [idTorneo, idCombate, i + 1, roundsGanador, roundsPerdedor,
            combate.idEquipo1, combate.idEquipo2, combate.idGanadorCombate, combate.link || null]
          );
          for (let j = 0; j < combate.rounds.length; j++) {
            const round = combate.rounds[j];
            const ganadorEquipo1 = round.idGanador === combate.idEquipo1;
            await trx.run(`INSERT INTO round_combate (id_torneo, id_combate, orden, round, id_equipo_ganador, puntos_ganador, puntos_perdedor)
             VALUES (?, ?, ?, ?, ?, ?, ?)`, [idTorneo, idCombate, i + 1, j + 1, round.idGanador,
              ganadorEquipo1 ? round.puntajeEquipo1 : round.puntajeEquipo2,
              ganadorEquipo1 ? round.puntajeEquipo2 : round.puntajeEquipo1]);
          }
        }
      });

      res.status(201).json({ message: 'Combates registrados exitosamente' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  updateCombateLink: async (req, res) => {
    const { idTorneo, idCombate } = req.params;
    const { link } = req.body;

    if (link === undefined) {
      return res.status(400).json({ error: 'El campo link es requerido' });
    }

    const combate = await db.get(
      `SELECT id_combate FROM combate WHERE id_torneo = ? AND id_combate = ?`,
      [idTorneo, idCombate]
    );
    if (!combate) return res.status(404).json({ error: 'Combate no encontrado' });

    await db.run(
      `UPDATE combate SET link = ? WHERE id_torneo = ? AND id_combate = ?`,
      [link || null, idTorneo, idCombate]
    );

    res.json({ message: 'Link del combate actualizado' });
  },

  removeEquipo: async (req, res) => {
    const { idTorneo, idEquipo } = req.params;

    await db.run(
      `DELETE FROM torneo_equipo WHERE id_torneo = ? AND id_equipo = ?`,
      [idTorneo, idEquipo]
    );

    res.json({ message: 'Equipo removido del torneo' });
  },
};

module.exports = tournamentsController;
