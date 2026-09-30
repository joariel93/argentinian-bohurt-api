import db from '../database/connection.js';
import { v4 as uuidv4 } from 'uuid';
import otpService from '../services/otpService.js';
import { decryptDni } from '../utils/dniCrypto.js';


// SELECT base que une torneo con evento para exponer los campos que antes vivían en torneo
const TORNEO_JOIN_EVENTO_SELECT = `
  SELECT t.id_torneo,
         t.id_evento,
         t.id_modalidad,
         t.id_categoria,
         t.id_genero,
         t.id_tipo_torneo,
         t.estado,
         t.password,
         e.nombre,
         e.localizacion,
         e.fecha_evento AS fecha_torneo,
         e.fecha_cierre_inscripcion,
         e.imagen,
         e.link_transmision AS link_transmision,
         e.id_reglamento,
         e.id_organizador
  FROM torneo t
  JOIN evento e ON t.id_evento = e.id_evento
`;


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

async function getRedesSocialesEventoPorIdTorneo(idTorneo) {
  const rows = await db.all(
    `SELECT rs.nombre AS platform, ers.link AS url, rs.icono
     FROM torneo t
     JOIN evento_redes_sociales ers ON ers.id_evento = t.id_evento
     JOIN redes_sociales rs ON ers.id_red_social = rs.id_red_social
     WHERE t.id_torneo = ?`,
    [idTorneo]
  );
  return rows.map((r) => ({ platform: r.platform, url: r.url || '', iconClass: mapIconClass(r.icono) }));
}

async function getRedesSocialesTorneo(idTorneo) {
  // DEPRECATED: las redes sociales ahora viven en evento_redes_sociales.
  return getRedesSocialesEventoPorIdTorneo(idTorneo);
}

async function getRedesSocialesTorneoAdmin(idTorneo) {
  const rows = await db.all(
    `SELECT rs.id_red_social AS idRedSocial, ers.link
     FROM torneo t
     JOIN evento_redes_sociales ers ON ers.id_evento = t.id_evento
     JOIN redes_sociales rs ON ers.id_red_social = rs.id_red_social
     WHERE t.id_torneo = ?`,
    [idTorneo]
  );
  return rows.map((r) => ({ idRedSocial: r.idRedSocial, link: r.link || '' }));
}

const tournamentsController = {
  getAll: async (req, res) => {
    const rows = await db.all(
      `${TORNEO_JOIN_EVENTO_SELECT},
              m.nombre AS modalidad, g.nombre AS sexo, c.nombre AS categoria
       JOIN modalidad m ON t.id_modalidad = m.id_modalidad
       JOIN genero g ON t.id_genero = g.id_genero
       JOIN categoria c ON t.id_categoria = c.id_categoria AND t.id_modalidad = c.id_modalidad
       ORDER BY e.fecha_evento ASC`
    );
    res.json(rows.map((r) => ({
      id: r.id_torneo,
      idEvento: r.id_evento,
      nombre: r.nombre,
      fechaTorneo: r.fecha_torneo,
      fechaCierreInscripcion: r.fecha_cierre_inscripcion,
      localizacion: r.localizacion,
      imagen: r.imagen,
      linkTransmision: r.link_transmision,
      modalidad: r.modalidad,
      sexo: r.sexo,
      categoria: r.categoria,
      equiposInscritos: 0,
      estado: r.estado,
    })));
  },

  getInfo: async (req, res) => {
    const { tournamentId } = req.params;
    const t = await db.get(
      `${TORNEO_JOIN_EVENTO_SELECT},
              m.nombre AS modalidad, g.nombre AS sexo, c.nombre AS categoria,
              tt.nombre AS tipoTorneo
       JOIN modalidad m ON t.id_modalidad = m.id_modalidad
       JOIN genero g ON t.id_genero = g.id_genero
       JOIN categoria c ON t.id_categoria = c.id_categoria AND t.id_modalidad = c.id_modalidad
       LEFT JOIN tipo_torneo tt ON t.id_tipo_torneo = tt.id_tipo_torneo
       WHERE t.id_torneo = ?`,
      [tournamentId]
    );
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });

    const [clubs, reglamento, campeon] = await Promise.all([
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
         JOIN evento e ON e.id_reglamento = r.id_reglamento
         WHERE e.id_evento = ?`,
        [t.id_evento]
      ),
      db.get(
        `SELECT te.id_equipo AS id, eq.nombre, eq.logo
         FROM torneo_equipo te
         JOIN equipo eq ON te.id_equipo = eq.id_equipo
         WHERE te.id_torneo = ? AND te.posicion = 1`,
        [tournamentId]
      ),
    ]);

    // Redes sociales ahora vienen del evento padre (la tabla torneo_redes_sociales fue eliminada)
    const redesSociales = await getRedesSocialesEventoPorIdTorneo(tournamentId);

    let peleadoresIndividuales = [];
    if ([2, 3].includes(t.id_modalidad)) {
      const rows = await db.all(
        `SELECT tp.id_usuario AS idUsuario, tp.id_club AS idClub,
                u.nombre, u.apellido,
                c.nombre AS clubNombre,
                c.id_color1, c.id_color2, c.id_color3,
                tp.posicion, tp.cantidad_combates AS cantidadCombates,
                tp.cantidad_victorias AS cantidadVictorias,
                tp.cantidad_derrotas AS cantidadDerrotas,
                tp.cantidad_puntos AS cantidadPuntos,
                tp.cantidad_amarillas AS cantidadAmarillas,
                tp.descalificado
         FROM torneo_peleador tp
         JOIN usuario u ON tp.id_usuario = u.id_usuario
         JOIN club c ON tp.id_club = c.id_club
         WHERE tp.id_torneo = ?
         ORDER BY u.apellido, u.nombre`,
        [tournamentId]
      );

      const coloresIds = [...new Set(rows.flatMap((r) => [r.id_color1, r.id_color2, r.id_color3]))];
      const colores = coloresIds.length
        ? await db.all(
            `SELECT id_color AS id, nombre, hex FROM colores WHERE id_color IN (${coloresIds.map(() => '?').join(',')})`,
            coloresIds
          )
        : [];
      const coloresMap = new Map(colores.map((c) => [c.id, c]));

      peleadoresIndividuales = rows.map((r) => ({
        idUsuario: r.idUsuario,
        nombre: r.nombre,
        apellido: r.apellido,
        idClub: r.idClub,
        clubNombre: r.clubNombre,
        clubColores: [r.id_color1, r.id_color2, r.id_color3]
          .map((id) => coloresMap.get(id))
          .filter(Boolean),
        posicion: r.posicion,
        cantidadCombates: r.cantidadCombates || 0,
        cantidadVictorias: r.cantidadVictorias || 0,
        cantidadDerrotas: r.cantidadDerrotas || 0,
        cantidadPuntos: r.cantidadPuntos || 0,
        cantidadAmarillas: r.cantidadAmarillas || 0,
        descalificado: !!r.descalificado,
      }));
    }

    res.json({
      id: t.id_torneo,
      idEvento: t.id_evento,
      idModalidad: t.id_modalidad,
      idGenero: t.id_genero,
      idCategoria: t.id_categoria,
      idTipoTorneo: t.id_tipo_torneo,
      nombre: t.nombre,
      fechaTorneo: t.fecha_torneo,
      fechaCierreInscripcion: t.fecha_cierre_inscripcion,
      localizacion: t.localizacion,
      imagen: t.imagen,
      linkTransmision: t.link_transmision,
      modalidad: t.modalidad,
      sexo: t.sexo,
      categoria: t.categoria,
      tipoTorneo: t.tipoTorneo,
      reglamento: reglamento ? { nombre: reglamento.nombre, link: reglamento.link } : null,
      redesSociales,
      clubesInvitados: clubs,
      campeon: campeon ? { id: campeon.id, nombre: campeon.nombre, logo: campeon.logo } : null,
      peleadoresIndividuales,
    });
  },

  getAdmin: async (req, res) => {
    const { id } = req.params;

    const t = await db.get(
      `${TORNEO_JOIN_EVENTO_SELECT}`,
      [id]
    );
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });

    const [clubs, redesSociales, peleadoresPorEquipoRows, peleadoresIndividualesRows] = await Promise.all([
      db.all(
        `SELECT DISTINCT c.id_club AS id, c.nombre
         FROM club c
         JOIN club_equipos ce ON c.id_club = ce.id_club
         JOIN torneo_equipo te ON ce.id_equipo = te.id_equipo
         WHERE te.id_torneo = ?`,
        [id]
      ),
      getRedesSocialesTorneoAdmin(id),
      db.all(
        `SELECT te.id_equipo AS idEquipo, u.id_usuario AS idUsuario, u.nombre, u.apellido,
                tep.numero_peleador AS numeroPeleador, tep.cantidad_amarillas AS cantidadAmarillas,
                tep.descalificado
         FROM torneo_equipo te
         JOIN torneo_equipo_peleador tep ON tep.id_torneo = te.id_torneo AND tep.id_equipo = te.id_equipo
         JOIN usuario u ON tep.id_usuario = u.id_usuario
         WHERE te.id_torneo = ?
         ORDER BY te.id_equipo, tep.numero_peleador`,
        [id]
      ),
      db.all(
        `SELECT tp.id_usuario AS idUsuario, tp.id_club AS idClub,
                u.nombre, u.apellido,
                c.nombre AS clubNombre,
                c.id_color1, c.id_color2, c.id_color3,
                tp.posicion, tp.cantidad_combates AS cantidadCombates,
                tp.cantidad_victorias AS cantidadVictorias,
                tp.cantidad_derrotas AS cantidadDerrotas,
                tp.cantidad_puntos AS cantidadPuntos,
                tp.cantidad_amarillas AS cantidadAmarillas,
                tp.descalificado
         FROM torneo_peleador tp
         JOIN usuario u ON tp.id_usuario = u.id_usuario
         JOIN club c ON tp.id_club = c.id_club
         WHERE tp.id_torneo = ?
         ORDER BY u.apellido, u.nombre`,
        [id]
      ),
    ]);

    // Agrupar peleadores por equipo
    const peleadoresPorEquipoMap = new Map();
    for (const p of peleadoresPorEquipoRows) {
      if (!peleadoresPorEquipoMap.has(p.idEquipo)) peleadoresPorEquipoMap.set(p.idEquipo, []);
      peleadoresPorEquipoMap.get(p.idEquipo).push({
        id: p.idUsuario,
        nombre: p.nombre,
        apellido: p.apellido,
        numeroPeleador: p.numeroPeleador,
        cantidadAmarillas: p.cantidadAmarillas || 0,
        descalificado: !!p.descalificado,
      });
    }
    const peleadoresPorEquipo = [...peleadoresPorEquipoMap.entries()].map(([idEquipo, peleadores]) => ({
      idEquipo,
      peleadores,
    }));

    // Colores de los clubes de los peleadores individuales
    const coloresIds = [...new Set(peleadoresIndividualesRows.flatMap((r) => [r.id_color1, r.id_color2, r.id_color3]))];
    const colores = coloresIds.length
      ? await db.all(
          `SELECT id_color AS id, nombre, hex FROM colores WHERE id_color IN (${coloresIds.map(() => '?').join(',')})`,
          coloresIds
        )
      : [];
    const coloresMap = new Map(colores.map((c) => [c.id, c]));

    const peleadoresIndividuales = peleadoresIndividualesRows.map((r) => ({
      idUsuario: r.idUsuario,
      nombre: r.nombre,
      apellido: r.apellido,
      idClub: r.idClub,
      clubNombre: r.clubNombre,
      clubColores: [r.id_color1, r.id_color2, r.id_color3]
        .map((id) => coloresMap.get(id))
        .filter(Boolean),
      posicion: r.posicion,
      cantidadCombates: r.cantidadCombates || 0,
      cantidadVictorias: r.cantidadVictorias || 0,
      cantidadDerrotas: r.cantidadDerrotas || 0,
      cantidadPuntos: r.cantidadPuntos || 0,
      cantidadAmarillas: r.cantidadAmarillas || 0,
      descalificado: !!r.descalificado,
    }));

    res.json({
      id: t.id_torneo,
      idEvento: t.id_evento,
      nombre: t.nombre,
      fechaTorneo: t.fecha_torneo,
      fechaCierreInscripcion: t.fecha_cierre_inscripcion,
      localizacion: t.localizacion,
      imagen: t.imagen,
      linkTransmision: t.link_transmision,
      password: '',
      idOrganizador: t.id_organizador,
      idReglamento: t.id_reglamento,
      idGenero: t.id_genero,
      idCategoria: t.id_categoria,
      idModalidad: t.id_modalidad,
      idTipoTorneo: t.id_tipo_torneo,
      redesSociales,
      clubesInvitados: clubs,
      peleadoresPorEquipo,
      peleadoresIndividuales,
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
    const { idEvento, idGenero, idCategoria, idModalidad, idTipoTorneo, password } = req.body;

    if (!idEvento) {
      return res.status(400).json({ error: 'idEvento es requerido (los datos comunes viven en el evento padre)' });
    }
    if (!idGenero || !idCategoria || !idModalidad) {
      return res.status(400).json({ error: 'idGenero, idCategoria y idModalidad son requeridos' });
    }

    const evento = await db.get(`SELECT id_evento FROM evento WHERE id_evento = ?`, [idEvento]);
    if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });

    const normalizeFk = (val) => {
      if (val === undefined || val === null) return null;
      if (typeof val === 'object' && 'value' in val) return val.value || null;
      return val;
    };

    const otp = password || otpService.generate();
    const otpHash = otpService.hash(otp);
    const idTorneo = uuidv4();

    await db.run(
      `INSERT INTO torneo (id_torneo, id_evento, id_modalidad, id_categoria, id_genero, id_tipo_torneo, password, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Pendiente')`,
      [idTorneo, idEvento,
        normalizeFk(idModalidad) || 1,
        normalizeFk(idCategoria) || 1,
        normalizeFk(idGenero) || 1,
        normalizeFk(idTipoTorneo),
        otpHash]
    );

    res.status(201).json({ id: idTorneo, password: otp, message: 'Torneo creado exitosamente' });
  },

  update: async (req, res) => {
    const { id } = req.params;
    const existing = await db.get(`SELECT id_torneo FROM torneo WHERE id_torneo = ?`, [id]);
    if (!existing) return res.status(404).json({ error: 'Torneo no encontrado' });

    const updates = req.body;
    const fieldMap = {
      idGenero: 'id_genero',
      idCategoria: 'id_categoria',
      idModalidad: 'id_modalidad',
      idTipoTorneo: 'id_tipo_torneo',
      idEvento: 'id_evento',
    };
    const allowedFields = ['id_evento', 'id_genero', 'id_categoria', 'id_modalidad', 'id_tipo_torneo', 'password', 'estado'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      const dbField = fieldMap[key] || key;
      if (allowedFields.includes(dbField) && value !== undefined) {
        if (dbField === 'password') {
          fields.push(`${dbField} = ?`);
          values.push(otpService.hash(value));
        } else {
          fields.push(`${dbField} = ?`);
          values.push(value);
        }
      }
    }

    if (fields.length > 0) {
      values.push(id);
      await db.run(`UPDATE torneo SET ${fields.join(', ')} WHERE id_torneo = ?`, values);
    }

    // Las redes sociales y datos comunes (nombre, fechas, localizacion, etc.)
    // se editan en el evento padre a través de /api/v1/events/:id.

    res.json({ message: 'Torneo actualizado exitosamente' });
  },

  regenerateOtp: async (req, res) => {
    const { id } = req.params;
    const existing = await db.get(`SELECT id_torneo FROM torneo WHERE id_torneo = ?`, [id]);
    if (!existing) return res.status(404).json({ error: 'Torneo no encontrado' });

    const otp = otpService.generate();
    const otpHash = otpService.hash(otp);
    await db.run(`UPDATE torneo SET password = ? WHERE id_torneo = ?`, [otpHash, id]);
    res.json({ id, password: otp });
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
      await trx.run(`DELETE FROM round_combate_individual WHERE id_torneo = ?`, [id]);
      await trx.run(`DELETE FROM combate_individual WHERE id_torneo = ?`, [id]);
      await trx.run(`DELETE FROM torneo_peleador WHERE id_torneo = ?`, [id]);
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

  getEquipoEnTorneo: async (req, res) => {
    const { idTorneo, idEquipo } = req.params;

    const torneo = await db.get(
      `SELECT t.id_torneo, e.nombre, e.fecha_evento AS fechaTorneo, e.localizacion, e.imagen
       FROM torneo t JOIN evento e ON t.id_evento = e.id_evento
       WHERE t.id_torneo = ?`,
      [idTorneo]
    );
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

    const equipo = await db.get(
      `SELECT e.id_equipo AS id, e.nombre, e.logo, e.fecha_creacion AS fechaCreacion,
              m.nombre AS modalidad, c.nombre AS categoria, g.nombre AS genero,
              cl.id_club AS clubId, cl.nombre AS clubNombre, cl.logo AS clubLogo
       FROM equipo e
       LEFT JOIN modalidad m ON e.id_modalidad = m.id_modalidad
       LEFT JOIN categoria c ON e.id_categoria = c.id_categoria AND e.id_modalidad = c.id_modalidad
       LEFT JOIN genero g ON e.id_genero = g.id_genero
       LEFT JOIN club_equipos ce ON e.id_equipo = ce.id_equipo
       LEFT JOIN club cl ON ce.id_club = cl.id_club
       WHERE e.id_equipo = ?`,
      [idEquipo]
    );
    if (!equipo) return res.status(404).json({ error: 'Equipo no encontrado' });

    const stats = await db.get(
      `SELECT posicion, cantidad_combates AS combates, cantidad_victorias AS victorias,
              cantidad_derrotas AS derrotas, cantidad_rounds_ganados AS roundsGanados,
              cantidad_rounds_perdidos AS roundsPerdidos, es_cabeza_serie AS esCabezaSerie
       FROM torneo_equipo
       WHERE id_torneo = ? AND id_equipo = ?`,
      [idTorneo, idEquipo]
    );

    const peleadores = await db.all(
      `SELECT u.id_usuario AS id, u.nombre, u.apellido,
              tep.numero_peleador AS numeroPeleador, tep.cantidad_amarillas AS amarillas, tep.descalificado
       FROM torneo_equipo_peleador tep
       JOIN usuario u ON tep.id_usuario = u.id_usuario
       WHERE tep.id_torneo = ? AND tep.id_equipo = ?
       ORDER BY tep.numero_peleador`,
      [idTorneo, idEquipo]
    );

    res.json({
      torneo: {
        id: torneo.id_torneo,
        nombre: torneo.nombre,
        fechaTorneo: torneo.fechaTorneo,
        localizacion: torneo.localizacion,
        imagen: torneo.imagen,
      },
      equipo,
      stats: stats || null,
      peleadores: peleadores.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        apellido: p.apellido,
        numeroPeleador: p.numeroPeleador,
        amarillas: p.amarillas,
        descalificado: !!p.descalificado,
      })),
    });
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
                  rc.hombres_en_pie_a, rc.hombres_en_pie_b, eg.nombre AS nombreEquipoGanador
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
              hombresEnPieA: r.hombres_en_pie_a ?? 0,
              hombresEnPieB: r.hombres_en_pie_b ?? 0,
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
      `SELECT id_torneo, id_tipo_torneo, id_modalidad FROM torneo WHERE id_torneo = ?`,
      [idTorneo]
    );
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

    // Para Duelo/Profight devolvemos estadísticas por peleador desde torneo_peleador.
    // Para Bohurt/Captura devolvemos estadísticas por equipo desde torneo_equipo.
    // El frontend decide cómo mostrarlo según idModalidad.
    const isIndividual = [2, 3].includes(torneo.id_modalidad);

    let rows;
    if (isIndividual) {
      rows = await db.all(
        `SELECT tp.id_usuario AS id,
                u.nombre, u.apellido,
                tp.id_club AS idClub,
                c.nombre AS clubNombre,
                COALESCE(tp.cantidad_combates, 0) AS combates,
                COALESCE(tp.cantidad_victorias, 0) AS victorias,
                COALESCE(tp.cantidad_derrotas, 0) AS derrotas,
                COALESCE(tp.cantidad_puntos, 0) AS puntos,
                COALESCE(tp.cantidad_amarillas, 0) AS amarillas,
                tp.posicion,
                tp.descalificado
         FROM torneo_peleador tp
         JOIN usuario u ON tp.id_usuario = u.id_usuario
         LEFT JOIN club c ON tp.id_club = c.id_club
         WHERE tp.id_torneo = ?
         ORDER BY tp.cantidad_victorias DESC, tp.cantidad_puntos DESC, u.apellido, u.nombre`,
        [idTorneo]
      );
    } else {
      rows = await db.all(
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
    }

    res.json({ idTorneo, idTipoTorneo: torneo.id_tipo_torneo, idModalidad: torneo.id_modalidad, items: rows });
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
    const { equipos, combates, peleadores } = req.body;

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

        if (Array.isArray(peleadores)) {
          for (const p of peleadores) {
            await trx.run(
              `INSERT OR IGNORE INTO equipo_peleador (id_equipo, id_usuario) VALUES (?, ?)`,
              [p.idEquipo, p.idUsuario]
            );
            await trx.run(
              `INSERT OR REPLACE INTO torneo_equipo_peleador
               (id_torneo, id_equipo, id_usuario, numero_peleador, cantidad_amarillas, descalificado)
               VALUES (?, ?, ?, ?, 0, 0)`,
              [idTorneo, p.idEquipo, p.idUsuario, p.numeroPeleador]
            );
            await trx.run(
              `INSERT OR IGNORE INTO torneo_luchador
               (id_torneo, id_usuario, cantidad_combates, cantidad_victorias, cantidad_derrotas, cantidad_rounds_ganados, cantidad_rounds_perdidos)
               VALUES (?, ?, 0, 0, 0, 0, 0)`,
              [idTorneo, p.idUsuario]
            );
          }
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

    const hasCombates = await db.get(
      `SELECT 1 FROM combate WHERE id_torneo = ? AND (id_equipo_a = ? OR id_equipo_b = ? OR id_equipo_ganador = ?) LIMIT 1`,
      [idTorneo, idEquipo, idEquipo, idEquipo]
    );
    if (hasCombates) {
      return res.status(409).json({ error: 'No se puede eliminar un equipo que tiene combates registrados' });
    }

    await db.run(
      `DELETE FROM torneo_equipo_peleador WHERE id_torneo = ? AND id_equipo = ?`,
      [idTorneo, idEquipo]
    );
    await db.run(
      `DELETE FROM torneo_equipo WHERE id_torneo = ? AND id_equipo = ?`,
      [idTorneo, idEquipo]
    );

    res.json({ message: 'Equipo removido del torneo' });
  },

  getFullEdit: async (req, res) => {
    try {
      const { id } = req.params;

      const torneo = await db.get(
        `${TORNEO_JOIN_EVENTO_SELECT}`,
        [id]
      );
      if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

      const redesSociales = await getRedesSocialesTorneoAdmin(id);

      const equipos = await db.all(
        `SELECT te.id_equipo AS id, e.nombre, e.logo, e.fecha_creacion AS fechaCreacion, te.posicion
         FROM torneo_equipo te
         JOIN equipo e ON te.id_equipo = e.id_equipo
         WHERE te.id_torneo = ?
         ORDER BY e.nombre`,
        [id]
      );

      const equiposConPeleadores = await Promise.all(
        equipos.map(async (eq) => {
          const peleadores = await db.all(
            `SELECT u.id_usuario AS id, u.nombre, u.apellido, u.username,
                    tep.numero_peleador AS numeroPeleador, tep.cantidad_amarillas AS amarillas, tep.descalificado
             FROM torneo_equipo_peleador tep
             JOIN usuario u ON tep.id_usuario = u.id_usuario
             WHERE tep.id_torneo = ? AND tep.id_equipo = ?
             ORDER BY tep.numero_peleador`,
            [id, eq.id]
          );
          return {
            ...eq,
            peleadores: peleadores.map((p) => ({
              id: p.id,
              nombre: p.nombre,
              apellido: p.apellido,
              dni: decryptDni(p.username),
              numeroPeleador: p.numeroPeleador,
              amarillas: p.amarillas,
              descalificado: !!p.descalificado,
            })),
          };
        })
      );

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
        [id]
      );

      const combatesConRounds = await Promise.all(
        combates.map(async (c) => {
          const rounds = await db.all(
            `SELECT rc.round, rc.id_equipo_ganador, rc.puntos_ganador, rc.puntos_perdedor,
                    rc.hombres_en_pie_a, rc.hombres_en_pie_b, eg.nombre AS nombreEquipoGanador
             FROM round_combate rc
             LEFT JOIN equipo eg ON rc.id_equipo_ganador = eg.id_equipo
             WHERE rc.id_torneo = ? AND rc.id_combate = ?
             ORDER BY rc.round ASC`,
            [id, c.id_combate]
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
                hombresEnPieA: r.hombres_en_pie_a ?? 0,
                hombresEnPieB: r.hombres_en_pie_b ?? 0,
              };
            }),
          };
        })
      );

      res.json({
        torneo: {
          id: torneo.id_torneo,
          idEvento: torneo.id_evento,
          idModalidad: torneo.id_modalidad,
          idGenero: torneo.id_genero,
          idCategoria: torneo.id_categoria,
          idTipoTorneo: torneo.id_tipo_torneo,
          nombre: torneo.nombre,
          fechaTorneo: torneo.fecha_torneo,
          fechaCierreInscripcion: torneo.fecha_cierre_inscripcion,
          localizacion: torneo.localizacion,
          imagen: torneo.imagen,
          linkTransmision: torneo.link_transmision,
          idOrganizador: torneo.id_organizador,
          idReglamento: torneo.id_reglamento,
          redesSociales,
        },
        equipos: equiposConPeleadores,
        combates: combatesConRounds,
      });
    } catch (error) {
      console.error('Error en getFullEdit:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  updateRound: async (req, res) => {
    try {
      const { idTorneo, idCombate, round } = req.params;
      const { puntosEquipoA, puntosEquipoB, hombresEnPieA, hombresEnPieB } = req.body;

      const combate = await db.get(
        `SELECT id_equipo_a, id_equipo_b, id_equipo_ganador FROM combate WHERE id_torneo = ? AND id_combate = ?`,
        [idTorneo, idCombate]
      );
      if (!combate) return res.status(404).json({ error: 'Combate no encontrado' });

      const ganoA = combate.id_equipo_ganador === combate.id_equipo_a;
      const puntosGanador = ganoA ? puntosEquipoA : puntosEquipoB;
      const puntosPerdedor = ganoA ? puntosEquipoB : puntosEquipoA;

      await db.run(
        `UPDATE round_combate
         SET puntos_ganador = ?, puntos_perdedor = ?, hombres_en_pie_a = ?, hombres_en_pie_b = ?
         WHERE id_torneo = ? AND id_combate = ? AND round = ?`,
        [puntosGanador, puntosPerdedor, hombresEnPieA ?? 0, hombresEnPieB ?? 0, idTorneo, idCombate, round]
      );

      res.json({ message: 'Round actualizado' });
    } catch (error) {
      console.error('Error en updateRound:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  getPeleadores: async (req, res) => {
    const { idTorneo } = req.params;

    const torneo = await db.get(
      `SELECT id_torneo, id_modalidad AS idModalidad FROM torneo WHERE id_torneo = ?`,
      [idTorneo]
    );
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

    if (![2, 3].includes(torneo.idModalidad)) {
      return res.status(400).json({ error: 'Este endpoint aplica solo a torneos Duelo/Profight' });
    }

    const rows = await db.all(
      `SELECT tp.id_usuario AS idUsuario, tp.id_club AS idClub,
              u.nombre, u.apellido,
              c.nombre AS clubNombre,
              c.id_color1, c.id_color2, c.id_color3,
              tp.posicion, tp.cantidad_combates AS cantidadCombates,
              tp.cantidad_victorias AS cantidadVictorias,
              tp.cantidad_derrotas AS cantidadDerrotas,
              tp.cantidad_puntos AS cantidadPuntos,
              tp.cantidad_amarillas AS cantidadAmarillas,
              tp.descalificado
       FROM torneo_peleador tp
       JOIN usuario u ON tp.id_usuario = u.id_usuario
       JOIN club c ON tp.id_club = c.id_club
       WHERE tp.id_torneo = ?
       ORDER BY u.apellido, u.nombre`,
      [idTorneo]
    );

    const coloresIds = [...new Set(rows.flatMap((r) => [r.id_color1, r.id_color2, r.id_color3]))];
    const colores = coloresIds.length
      ? await db.all(
          `SELECT id_color AS id, nombre, hex FROM colores WHERE id_color IN (${coloresIds.map(() => '?').join(',')})`,
          coloresIds
        )
      : [];
    const coloresMap = new Map(colores.map((c) => [c.id, c]));

    const peleadores = rows.map((r) => ({
      idUsuario: r.idUsuario,
      nombre: r.nombre,
      apellido: r.apellido,
      idClub: r.idClub,
      clubNombre: r.clubNombre,
      clubColores: [r.id_color1, r.id_color2, r.id_color3]
        .map((id) => coloresMap.get(id))
        .filter(Boolean),
      posicion: r.posicion,
      cantidadCombates: r.cantidadCombates || 0,
      cantidadVictorias: r.cantidadVictorias || 0,
      cantidadDerrotas: r.cantidadDerrotas || 0,
      cantidadPuntos: r.cantidadPuntos || 0,
      cantidadAmarillas: r.cantidadAmarillas || 0,
      descalificado: !!r.descalificado,
    }));

    res.json(peleadores);
  },

  addPeleador: async (req, res) => {
    const { idTorneo } = req.params;
    const { idUsuario, idClub } = req.body;

    if (!idUsuario) {
      return res.status(400).json({ error: 'idUsuario es requerido' });
    }

    const torneo = await db.get(
      `SELECT id_torneo, id_modalidad AS idModalidad FROM torneo WHERE id_torneo = ?`,
      [idTorneo]
    );
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (![2, 3].includes(torneo.idModalidad)) {
      return res.status(400).json({ error: 'Este endpoint aplica solo a torneos Duelo/Profight' });
    }

    const peleador = await db.get(
      `SELECT id_usuario, id_tipo_usuario FROM usuario WHERE id_usuario = ?`,
      [idUsuario]
    );
    if (!peleador) return res.status(404).json({ error: 'Peleador no encontrado' });
    if (peleador.id_tipo_usuario !== 4) {
      return res.status(400).json({ error: 'El usuario debe ser de tipo Luchador' });
    }

    // Si no se especifica club, asignar Mercenarios (si existe).
    let finalClub = idClub;
    if (!finalClub) {
      const clubRow = await db.get(`SELECT id_club FROM club WHERE nombre = 'Mercenarios' LIMIT 1`);
      finalClub = clubRow?.id_club;
    }
    if (!finalClub) {
      return res.status(400).json({
        error: 'Debe especificar un club o existir el club "Mercenarios"',
      });
    }

    try {
      await db.run(
        `INSERT INTO torneo_peleador (id_torneo, id_usuario, id_club, posicion, cantidad_combates,
                                     cantidad_victorias, cantidad_derrotas, cantidad_puntos,
                                     cantidad_amarillas, descalificado)
         VALUES (?, ?, ?, NULL, 0, 0, 0, 0, 0, 0)`,
        [idTorneo, idUsuario, finalClub]
      );
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return res.status(409).json({ error: 'El peleador ya está inscripto en este torneo' });
      }
      throw err;
    }

    res.status(201).json({ message: 'Peleador inscripto exitosamente', idClub: finalClub });
  },

  removePeleador: async (req, res) => {
    const { idTorneo, idUsuario } = req.params;

    const result = await db.run(
      `DELETE FROM torneo_peleador WHERE id_torneo = ? AND id_usuario = ?`,
      [idTorneo, idUsuario]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Peleador no encontrado en este torneo' });
    }

    res.json({ message: 'Peleador removido del torneo' });
  },

  removePeleadorDeEquipo: async (req, res) => {
    const { idTorneo, idEquipo, idUsuario } = req.params;

    const result = await db.run(
      `DELETE FROM torneo_equipo_peleador WHERE id_torneo = ? AND id_equipo = ? AND id_usuario = ?`,
      [idTorneo, idEquipo, idUsuario]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Peleador no encontrado en este equipo del torneo' });
    }

    await db.run(
      `DELETE FROM torneo_luchador WHERE id_torneo = ? AND id_usuario = ?`,
      [idTorneo, idUsuario]
    );

    res.json({ message: 'Peleador removido del equipo' });
  },

  // ════════════════════════════════════════════════════════════════════════
  // FASE B: Combates individuales (Duelo/Profight)
  // ════════════════════════════════════════════════════════════════════════

  async requireTorneoIndividual(req, res) {
    const { idTorneo } = req.params;
    const torneo = await db.get(
      `SELECT id_torneo AS id, id_modalidad AS idModalidad FROM torneo WHERE id_torneo = ?`,
      [idTorneo]
    );
    if (!torneo) {
      res.status(404).json({ error: 'Torneo no encontrado' });
      return null;
    }
    if (![2, 3].includes(torneo.idModalidad)) {
      res.status(400).json({ error: 'Este endpoint aplica solo a torneos Duelo/Profight' });
      return null;
    }
    return torneo;
  },

  getCombatesIndividuales: async (req, res) => {
    const { idTorneo } = req.params;
    const torneo = await tournamentsController.requireTorneoIndividual(req, res);
    if (!torneo) return;

    const combates = await db.all(
      `SELECT ci.id_combate AS id, ci.orden, ci.link, ci.fase, ci.grupo, ci.ronda, ci.nivel,
              ci.id_usuario_a AS idUsuarioA, ci.id_usuario_b AS idUsuarioB,
              ci.id_usuario_ganador AS idUsuarioGanador,
              ci.cantidad_round_ganados_ganador AS roundsGanadosGanador,
              ci.cantidad_round_ganados_perdedor AS roundsGanadosPerdedor,
              ua.nombre AS nombreUsuarioA, ua.apellido AS apellidoUsuarioA,
              ub.nombre AS nombreUsuarioB, ub.apellido AS apellidoUsuarioB,
              ug.nombre AS nombreUsuarioGanador, ug.apellido AS apellidoUsuarioGanador
       FROM combate_individual ci
       JOIN usuario ua ON ci.id_usuario_a = ua.id_usuario
       LEFT JOIN usuario ub ON ci.id_usuario_b = ub.id_usuario
       LEFT JOIN usuario ug ON ci.id_usuario_ganador = ug.id_usuario
       WHERE ci.id_torneo = ?
       ORDER BY ci.orden ASC`,
      [idTorneo]
    );

    const result = await Promise.all(
      combates.map(async (c) => {
        const rounds = await db.all(
          `SELECT round, id_usuario_ganador AS idUsuarioGanador,
                  puntos_ganador AS puntosGanador, puntos_perdedor AS puntosPerdedor
           FROM round_combate_individual
           WHERE id_torneo = ? AND id_combate = ?
           ORDER BY round ASC`,
          [idTorneo, c.id]
        );
        const finalizado = c.idUsuarioGanador !== null;
        return {
          id: c.id,
          orden: c.orden,
          link: c.link || null,
          fase: c.fase || null,
          grupo: c.grupo || null,
          ronda: c.ronda || null,
          nivel: c.nivel ?? null,
          finalizado,
          idUsuarioA: c.idUsuarioA,
          nombreUsuarioA: c.nombreUsuarioA,
          apellidoUsuarioA: c.apellidoUsuarioA,
          idUsuarioB: c.idUsuarioB,
          nombreUsuarioB: c.nombreUsuarioB,
          apellidoUsuarioB: c.apellidoUsuarioB,
          idUsuarioGanador: c.idUsuarioGanador,
          nombreUsuarioGanador: c.nombreUsuarioGanador,
          apellidoUsuarioGanador: c.apellidoUsuarioGanador,
          roundsGanadosGanador: c.roundsGanadosGanador || 0,
          roundsGanadosPerdedor: c.roundsGanadosPerdedor || 0,
          rounds,
        };
      })
    );

    res.json({ idTorneo, combates: result });
  },

  createCombatesIndividuales: async (req, res) => {
    const { idTorneo } = req.params;
    const torneo = await tournamentsController.requireTorneoIndividual(req, res);
    if (!torneo) return;

    const { combates } = req.body;
    if (!Array.isArray(combates) || combates.length === 0) {
      return res.status(400).json({ error: 'El array combates es requerido y no puede estar vacío' });
    }

    const inscriptos = await db.all(
      `SELECT id_usuario AS idUsuario FROM torneo_peleador WHERE id_torneo = ?`,
      [idTorneo]
    );
    const inscriptosSet = new Set(inscriptos.map((p) => p.idUsuario));

    try {
      await db.transaction(async (trx) => {
        for (let i = 0; i < combates.length; i++) {
          const c = combates[i];
          if (!c.idUsuarioA) {
            throw new Error(`Combate ${i}: idUsuarioA es requerido`);
          }
          if (c.idUsuarioA === c.idUsuarioB) {
            throw new Error(`Combate ${i}: idUsuarioA y idUsuarioB no pueden ser iguales`);
          }
          if (!inscriptosSet.has(c.idUsuarioA)) {
            throw new Error(`Combate ${i}: peleador A no inscripto en el torneo`);
          }
          if (c.idUsuarioB && !inscriptosSet.has(c.idUsuarioB)) {
            throw new Error(`Combate ${i}: peleador B no inscripto en el torneo`);
          }

          await trx.run(
            `INSERT INTO combate_individual
               (id_torneo, id_combate, orden, fase, grupo, ronda, nivel,
                id_usuario_a, id_usuario_b, id_usuario_ganador,
                cantidad_round_ganados_ganador, cantidad_round_ganados_perdedor, link)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 0, ?)`,
            [
              idTorneo, c.id || uuidv4(), i + 1,
              c.fase || null, c.grupo || null, c.ronda || null, c.nivel ?? null,
              c.idUsuarioA, c.idUsuarioB || null,
              c.link || null,
            ]
          );
        }
      });
      res.status(201).json({ message: 'Combates individuales creados exitosamente' });
    } catch (err) {
      console.error('Error en createCombatesIndividuales:', err);
      res.status(400).json({ error: err.message || 'Error al crear combates individuales' });
    }
  },

  eliminarCombatesIndividuales: async (req, res) => {
    const { idTorneo } = req.params;
    const torneo = await tournamentsController.requireTorneoIndividual(req, res);
    if (!torneo) return;

    await db.transaction(async (trx) => {
      await trx.run(`DELETE FROM round_combate_individual WHERE id_torneo = ?`, [idTorneo]);
      await trx.run(`DELETE FROM combate_individual WHERE id_torneo = ?`, [idTorneo]);
    });
    res.json({ message: 'Combates individuales eliminados' });
  },

  grabarRoundIndividual: async (req, res) => {
    const { idTorneo, idCombate } = req.params;
    const torneo = await tournamentsController.requireTorneoIndividual(req, res);
    if (!torneo) return;

    const { round, idUsuarioGanador, puntosGanador, puntosPerdedor } = req.body;
    if (!round || idUsuarioGanador === undefined || puntosGanador === undefined || puntosPerdedor === undefined) {
      return res.status(400).json({ error: 'round, idUsuarioGanador, puntosGanador y puntosPerdedor son requeridos' });
    }

    const combate = await db.get(
      `SELECT id_usuario_a, id_usuario_b FROM combate_individual WHERE id_torneo = ? AND id_combate = ?`,
      [idTorneo, idCombate]
    );
    if (!combate) return res.status(404).json({ error: 'Combate no encontrado' });
    if (idUsuarioGanador !== combate.id_usuario_a && idUsuarioGanador !== combate.id_usuario_b) {
      return res.status(400).json({ error: 'El ganador del round debe ser uno de los participantes' });
    }

    const maxOrden = await db.get(
      `SELECT COALESCE(MAX(orden), 0) AS maxOrden FROM round_combate_individual WHERE id_torneo = ? AND id_combate = ?`,
      [idTorneo, idCombate]
    );

    await db.run(
      `INSERT INTO round_combate_individual (id_torneo, id_combate, orden, round, id_usuario_ganador, puntos_ganador, puntos_perdedor)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [idTorneo, idCombate, maxOrden.maxOrden + 1, round, idUsuarioGanador, puntosGanador, puntosPerdedor]
    );

    res.status(201).json({ message: 'Round registrado exitosamente' });
  },

  cerrarCombateIndividual: async (req, res) => {
    const { idTorneo, idCombate } = req.params;
    const { idUsuarioGanador } = req.body;
    const torneo = await tournamentsController.requireTorneoIndividual(req, res);
    if (!torneo) return;

    if (!idUsuarioGanador) {
      return res.status(400).json({ error: 'idUsuarioGanador es requerido' });
    }

    const combate = await db.get(
      `SELECT id_usuario_a, id_usuario_b FROM combate_individual WHERE id_torneo = ? AND id_combate = ?`,
      [idTorneo, idCombate]
    );
    if (!combate) return res.status(404).json({ error: 'Combate no encontrado' });
    if (idUsuarioGanador !== combate.id_usuario_a && idUsuarioGanador !== combate.id_usuario_b) {
      return res.status(400).json({ error: 'El ganador debe ser uno de los participantes' });
    }

    const rounds = await db.all(
      `SELECT id_usuario_ganador FROM round_combate_individual WHERE id_torneo = ? AND id_combate = ?`,
      [idTorneo, idCombate]
    );
    const ganadosGanador = rounds.filter((r) => r.id_usuario_ganador === idUsuarioGanador).length;
    const ganadosPerdedor = rounds.length - ganadosGanador;

    // Si es bye (id_usuario_b IS NULL), no se cuentan combates ni victorias para nadie.
    // El peleador simplemente pasa de ronda sin stats asociadas.
    const esBye = combate.id_usuario_b === null;

    await db.transaction(async (trx) => {
      await trx.run(
        `UPDATE combate_individual
         SET id_usuario_ganador = ?,
             cantidad_round_ganados_ganador = ?,
             cantidad_round_ganados_perdedor = ?
         WHERE id_torneo = ? AND id_combate = ?`,
        [idUsuarioGanador, ganadosGanador, ganadosPerdedor, idTorneo, idCombate]
      );

      if (!esBye) {
        await trx.run(
          `UPDATE torneo_peleador
           SET cantidad_combates = COALESCE(cantidad_combates, 0) + 1,
               cantidad_victorias = COALESCE(cantidad_victorias, 0) + 1,
               cantidad_puntos = COALESCE(cantidad_puntos, 0) + ?,
               cantidad_derrotas = COALESCE(cantidad_derrotas, 0)
           WHERE id_torneo = ? AND id_usuario = ?`,
          [ganadosGanador, idTorneo, idUsuarioGanador]
        );

        const idPerdedor = idUsuarioGanador === combate.id_usuario_a ? combate.id_usuario_b : combate.id_usuario_a;
        if (idPerdedor) {
          await trx.run(
            `UPDATE torneo_peleador
             SET cantidad_combates = COALESCE(cantidad_combates, 0) + 1,
                 cantidad_derrotas = COALESCE(cantidad_derrotas, 0) + 1,
                 cantidad_puntos = COALESCE(cantidad_puntos, 0) + ?,
                 cantidad_victorias = COALESCE(cantidad_victorias, 0)
             WHERE id_torneo = ? AND id_usuario = ?`,
            [ganadosPerdedor, idTorneo, idPerdedor]
          );
        }
      }
    });

    res.json({ message: 'Combate cerrado exitosamente' });
  },

  /**
   * Sorteo individual: arma eliminación directa con la restricción de no cruzar peleadores del mismo club.
   * Devuelve { combates: [...], tieneCrucesIntraClub: boolean }.
   */
  sorteoIndividual: async (req, res) => {
    const { idTorneo } = req.params;
    const { cantidadGrupos } = req.body || {};
    const torneo = await tournamentsController.requireTorneoIndividual(req, res);
    if (!torneo) return;

    // Validar que el tipo de torneo esté definido.
    const torneoFull = await db.get(
      `SELECT id_tipo_torneo AS idTipoTorneo FROM torneo WHERE id_torneo = ?`,
      [idTorneo]
    );
    if (!torneoFull) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (torneoFull.idTipoTorneo === null) {
      return res.status(400).json({
        error: 'Debe definir el tipo de torneo antes de sortear',
        code: 'TIPO_TORNEO_REQUERIDO',
      });
    }

    const inscriptos = await db.all(
      `SELECT tp.id_usuario AS idUsuario, tp.id_club AS idClub, u.nombre, u.apellido
       FROM torneo_peleador tp
       JOIN usuario u ON tp.id_usuario = u.id_usuario
       WHERE tp.id_torneo = ?
       ORDER BY tp.id_club, u.apellido, u.nombre`,
      [idTorneo]
    );

    if (inscriptos.length < 2) {
      return res.status(400).json({ error: 'Se necesitan al menos 2 peleadores inscriptos' });
    }

    // Limpiar combates individuales existentes (rondas o llaves previas) antes de re-sortear.
    await db.transaction(async (trx) => {
      await trx.run(`DELETE FROM round_combate_individual WHERE id_torneo = ?`, [idTorneo]);
      await trx.run(`DELETE FROM combate_individual WHERE id_torneo = ?`, [idTorneo]);
    });

    let resultado;
    try {
      switch (torneoFull.idTipoTorneo) {
        case 3:
          resultado = generarLiga(inscriptos);
          break;
        case 2:
          resultado = generarEliminatoriaBracket(inscriptos);
          break;
        case 1: {
          // Default sugerido: 2 grupos si hay >= 4 peleadores; sino 1 grupo.
          const sugerido = inscriptos.length >= 4 ? 2 : 1;
          const grupos = Number.isInteger(cantidadGrupos) && cantidadGrupos > 0 ? cantidadGrupos : sugerido;
          if (grupos < 1 || grupos > inscriptos.length) {
            return res.status(400).json({ error: `cantidadGrupos debe estar entre 1 y ${inscriptos.length}` });
          }
          resultado = generarGruposEliminatoria(inscriptos, grupos);
          // Persistir la cantidad de grupos en organizacion_torneo.
          await db.run(
            `INSERT INTO organizacion_torneo (id_torneo, id_tipo_torneo, cantidad_grupos)
             VALUES (?, ?, ?)
             ON CONFLICT(id_torneo) DO UPDATE SET id_tipo_torneo = excluded.id_tipo_torneo, cantidad_grupos = excluded.cantidad_grupos`,
            [idTorneo, torneoFull.idTipoTorneo, grupos]
          );
          break;
        }
        default:
          return res.status(400).json({ error: 'Tipo de torneo inválido' });
      }
    } catch (err) {
      console.error('Error generando sorteo:', err);
      return res.status(500).json({ error: err.message || 'Error al generar el sorteo' });
    }

    res.json({
      tipoTorneo: tipoTorneoNombre(torneoFull.idTipoTorneo),
      cantidadGrupos: torneoFull.idTipoTorneo === 1 ? resultado.cantidadGrupos : undefined,
      totalPeleadores: inscriptos.length,
      combates: resultado.combates,
      tieneCrucesIntraClub: resultado.tieneCrucesIntraClub || false,
    });
  },

  reordenarCombatesIndividuales: async (req, res) => {
    const { idTorneo } = req.params;
    const { nuevoOrden } = req.body;
    const torneo = await tournamentsController.requireTorneoIndividual(req, res);
    if (!torneo) return;

    if (!Array.isArray(nuevoOrden)) {
      return res.status(400).json({ error: 'nuevoOrden debe ser un array de id_combate' });
    }

    const existentes = await db.all(
      `SELECT id_combate FROM combate_individual WHERE id_torneo = ?`,
      [idTorneo]
    );
    const existentesSet = new Set(existentes.map((c) => c.id_combate));
    const nuevoSet = new Set(nuevoOrden);

    if (nuevoOrden.length !== existentes.length || ![...existentesSet].every((id) => nuevoSet.has(id))) {
      return res.status(400).json({ error: 'nuevoOrden debe contener exactamente los mismos id_combate' });
    }

    await db.transaction(async (trx) => {
      for (let i = 0; i < nuevoOrden.length; i++) {
        await trx.run(
          `UPDATE combate_individual SET orden = ? WHERE id_torneo = ? AND id_combate = ?`,
          [i + 1, idTorneo, nuevoOrden[i]]
        );
      }
    });

    res.json({ message: 'Combates reordenados' });
  },

  editarCombateIndividual: async (req, res) => {
    const { idTorneo, idCombate } = req.params;
    const cambios = req.body;
    const torneo = await tournamentsController.requireTorneoIndividual(req, res);
    if (!torneo) return;

    const combate = await db.get(
      `SELECT id_usuario_ganador FROM combate_individual WHERE id_torneo = ? AND id_combate = ?`,
      [idTorneo, idCombate]
    );
    if (!combate) return res.status(404).json({ error: 'Combate no encontrado' });
    if (combate.id_usuario_ganador !== null) {
      return res.status(409).json({ error: 'No se puede editar un combate ya cerrado' });
    }

    const allowedFields = ['id_usuario_a', 'id_usuario_b', 'orden', 'ronda', 'fase', 'grupo', 'nivel', 'link'];
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(cambios)) {
      const dbField = key === 'idUsuarioA' ? 'id_usuario_a'
                    : key === 'idUsuarioB' ? 'id_usuario_b'
                    : key;
      if (!allowedFields.includes(dbField)) continue;
      fields.push(`${dbField} = ?`);
      values.push(value);
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

    values.push(idTorneo, idCombate);
    await db.run(
      `UPDATE combate_individual SET ${fields.join(', ')} WHERE id_torneo = ? AND id_combate = ?`,
      values
    );
    res.json({ message: 'Combate actualizado' });
  },
};

// ════════════════════════════════════════════════════════════════════════
// Helpers para los algoritmos de sorteo (Fase B-bis)
// ════════════════════════════════════════════════════════════════════════

function tipoTorneoNombre(id) {
  return id === 1 ? 'grupos_eliminatoria' : id === 2 ? 'eliminatoria' : id === 3 ? 'liga' : null;
}

/**
 * Intercala peleadores por club (snake-draft) para minimizar cruces intra-club.
 * Devuelve un array nuevo en el orden óptimo.
 */
function intercalarPorClub(peleadores) {
  const gruposPorClub = new Map();
  for (const p of peleadores) {
    const clave = p.idClub || '__null__';
    if (!gruposPorClub.has(clave)) gruposPorClub.set(clave, []);
    gruposPorClub.get(clave).push(p);
  }
  // Ordenar clubes por tamaño descendente para intercalar mejor.
  const clubes = [...gruposPorClub.values()].sort((a, b) => b.length - a.length);

  const orden = [];
  let i = 0;
  while (orden.length < peleadores.length) {
    for (const c of clubes) {
      if (c[i]) orden.push(c[i]);
    }
    i++;
  }
  return orden;
}

/**
 * Cuenta cuántos emparejamientos son intra-club.
 */
function contarCrucesIntraClub(emparejamientos) {
  let count = 0;
  for (const p of emparejamientos) {
    if (p.b && p.a.idClub === p.b.idClub) count++;
  }
  return count;
}

/**
 * Intenta reducir cruces intra-club swapping emparejamientos consecutivos.
 */
function reducirCruces(emparejamientos) {
  let tiene = contarCrucesIntraClub(emparejamientos) > 0;
  let cambios = true;
  let iter = 0;
  while (tiene && cambios && iter < emparejamientos.length) {
    cambios = false;
    for (let j = 0; j < emparejamientos.length - 1; j++) {
      const par1 = emparejamientos[j];
      const par2 = emparejamientos[j + 1];
      if (!par1.b || !par2.b) continue;
      if (par1.a.idClub === par1.b.idClub &&
          par1.a.idClub !== par2.a.idClub &&
          par1.a.idClub !== par2.b.idClub) {
        const tmp = par1.b;
        emparejamientos[j] = { a: par1.a, b: par2.a };
        emparejamientos[j + 1] = { a: tmp, b: par2.b };
        cambios = true;
      }
    }
    tiene = contarCrucesIntraClub(emparejamientos) > 0;
    iter++;
  }
  return emparejamientos;
}

/**
 * Genera el orden de emparejamientos para una eliminatoria directa (sin byes por ahora).
 */
function emparejarEliminatoria(peleadores) {
  const orden = intercalarPorClub(peleadores);
  const emparejamientos = [];
  for (let j = 0; j < orden.length; j += 2) {
    const a = orden[j];
    const b = orden[j + 1] || null;
    emparejamientos.push({ a, b });
  }
  reducirCruces(emparejamientos);
  return {
    emparejamientos,
    tieneCrucesIntraClub: contarCrucesIntraClub(emparejamientos) > 0,
  };
}

/**
 * Genera los combates de una Liga (round-robin clásico).
 * - Si N es par: N-1 rondas, N/2 combates por ronda.
 * - Si N es impar: N rondas, un peleador descansa por ronda (bye automático con id_usuario_b = null).
 */
function generarLiga(peleadores) {
  const n = peleadores.length;
  const esImpar = n % 2 === 1;
  // Si N es impar, agregamos un null (bye) para que el algoritmo funcione de forma par.
  const lista = esImpar ? [...peleadores, null] : [...peleadores];
  const totalSlots = lista.length;
  const rondas = totalSlots - 1;
  const resultado = [];

  // El primer elemento queda fijo, el resto rota.
  const rotacion = [...lista];
  for (let r = 0; r < rondas; r++) {
    for (let i = 0; i < totalSlots / 2; i++) {
      const a = rotacion[i];
      const b = rotacion[totalSlots - 1 - i];
      // Solo agregamos el combate si ambos son peleadores reales (descartar bye vs bye).
      if (a && b) {
        resultado.push({
          fase: 'liga',
          ronda: `Ronda ${r + 1}`,
          nivel: null,
          grupo: null,
          idUsuarioA: a.idUsuario,
          idUsuarioB: b.idUsuario,
        });
      }
    }
    // Rotar: mover el último elemento al segundo puesto (rotación horaria estándar).
    rotacion.splice(1, 0, rotacion.pop());
  }

  return { combates: resultado.map((c, idx) => ({ ...c, orden: idx + 1 })), tieneCrucesIntraClub: false };
}

/**
 * Genera los combates de una Eliminatoria directa usando el bracketTemplate (32 llaves).
 * - Calcula el tamaño del bracket como la próxima potencia de 2 >= N.
 * - Si N es menor al bracket size, agrega byes en los primeros slots (los de arriba del bracket).
 * - Devuelve combates con `fase = "eliminatoria"`, `ronda` según la instancia del bracket, `nivel` según el bracket.
 */
function generarEliminatoriaBracket(peleadores) {
  const n = peleadores.length;
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
  const numByes = bracketSize - n;

  // Emparejar la primera ronda con la restricción intra-club.
  const { emparejamientos, tieneCrucesIntraClub } = emparejarEliminatoria(peleadores);

  // Mapeo de cantidad de llaves a la primera ronda del bracketTemplate.
  // Para N peleadores, la primera ronda tiene N/2 llaves (con byes donde corresponda).
  const llavesPrimeraRonda = emparejamientos.length;
  // Necesitamos las primeras `llavesPrimeraRonda` llaves del template (sin 3er Puesto).
  // Pero el template tiene 32 llaves en total (16 de primera ronda). Vamos a usar las primeras.
  const mapaBracket = {
    1: { instancia: 'Final', nivel: 0 },
    2: { instancia: 'Semifinal', nivel: 1 },
    4: { instancia: 'Cuartos', nivel: 2 },
    8: { instancia: 'Octavos', nivel: 3 },
    16: { instancia: 'Dieciseisavos', nivel: 4 },
  };
  const instanciaRonda = mapaBracket[bracketSize] || { instancia: `Ronda de ${bracketSize}`, nivel: 5 };

  const combates = [];
  for (let i = 0; i < emparejamientos.length; i++) {
    const par = emparejamientos[i];
    // Los byes van en los primeros slots del bracket (los "mejores" sembrados).
    const tieneBye = i < numByes && par.b === null;
    combates.push({
      fase: 'eliminatoria',
      ronda: instanciaRonda.instancia,
      nivel: instanciaRonda.nivel,
      grupo: null,
      idUsuarioA: par.a.idUsuario,
      idUsuarioB: tieneBye ? null : par.b?.idUsuario || null,
      // Marcamos que es bye para que la UI lo muestre como descanso.
      _esBye: tieneBye,
    });
  }

  return {
    combates: combates.map((c, idx) => ({ ...c, orden: idx + 1 })),
    tieneCrucesIntraClub,
    bracketSize,
    numByes,
  };
}

/**
 * Genera los combates de Grupos + Eliminatorias.
 * 1. Reparte los peleadores en grupos (intercalando por club).
 * 2. Round-robin dentro de cada grupo (todos contra todos).
 * 3. Llave final con los 2 primeros de cada grupo (top N por grupo, N=2).
 */
function generarGruposEliminatoria(peleadores, cantidadGrupos) {
  const n = peleadores.length;
  const grupos = Array.from({ length: cantidadGrupos }, (_, i) => []);

  // Repartir con snake-draft por club.
  const orden = intercalarPorClub(peleadores);
  // Asignar a grupos en round-robin (no en bloques) para mezclar.
  let idx = 0;
  let direccion = 1;
  let i = 0;
  while (idx < orden.length) {
    grupos[i].push(orden[idx]);
    idx++;
    // Snake pattern: alternar la dirección en cada grupo.
    if (idx % cantidadGrupos === 0) {
      direccion = -direccion;
    }
    i += direccion;
    if (i < 0) i = cantidadGrupos - 1;
    if (i >= cantidadGrupos) i = 0;
  }

  // Generar round-robin por grupo.
  const combates = [];
  let ordenGlobal = 0;
  for (let g = 0; g < grupos.length; g++) {
    const grupo = grupos[g];
    const nombreGrupo = String.fromCharCode(65 + g); // A, B, C, ...
    if (grupo.length < 2) continue; // grupo de 1 peleador: pasa directo a la llave.
    const subLiga = generarLiga(grupo);
    for (const c of subLiga.combates) {
      combates.push({
        ...c,
        orden: ++ordenGlobal,
        grupo: nombreGrupo,
      });
    }
    // Si el grupo tiene cantidad impar, queda un peleador que avanzó por bye.
    // Ese peleador se agrega después como clasificado automático.
  }

  // Los top N (N=2 por default) de cada grupo pasan a la llave.
  // Como los grupos no se han jugado todavía, el sistema permite ordenar a los peleadores
  // alfabéticamente o por orden de inscripción. Vamos a usar el orden del array original.
  const clasificados = [];
  for (let g = 0; g < grupos.length; g++) {
    const grupo = grupos[g];
    const nombreGrupo = String.fromCharCode(65 + g);
    // Tomar los primeros N=2 del grupo (en orden de aparición).
    for (let i = 0; i < Math.min(2, grupo.length); i++) {
      clasificados.push({ peleador: grupo[i], grupoOrigen: nombreGrupo });
    }
  }

  // Armar la llave con los clasificados (eliminatoria directa).
  if (clasificados.length >= 2) {
    const { emparejamientos, tieneCrucesIntraClub } = emparejarEliminatoria(clasificados.map((c) => c.peleador));
    // Determinar la ronda según la cantidad de clasificados.
    const mapaBracket = {
      2: { instancia: 'Final', nivel: 0 },
      4: { instancia: 'Semifinal', nivel: 1 },
      8: { instancia: 'Cuartos', nivel: 2 },
      16: { instancia: 'Octavos', nivel: 3 },
    };
    const instanciaRonda = mapaBracket[clasificados.length] || { instancia: `Ronda de ${clasificados.length}`, nivel: 5 };

    for (let i = 0; i < emparejamientos.length; i++) {
      const par = emparejamientos[i];
      combates.push({
        orden: ++ordenGlobal,
        fase: 'eliminatoria',
        grupo: null,
        ronda: instanciaRonda.instancia,
        nivel: instanciaRonda.nivel,
        idUsuarioA: par.a.idUsuario,
        idUsuarioB: par.b ? par.b.idUsuario : null,
        // Marcamos la fase para distinguir "eliminatoria de grupos" (post-grupos).
        _postGrupos: true,
      });
    }
    return {
      combates,
      tieneCrucesIntraClub,
      cantidadGrupos: grupos.length,
      grupos: grupos.map((g, i) => ({ nombre: String.fromCharCode(65 + i), cantidad: g.length })),
    };
  }

  return {
    combates,
    tieneCrucesIntraClub: false,
    cantidadGrupos: grupos.length,
    grupos: grupos.map((g, i) => ({ nombre: String.fromCharCode(65 + i), cantidad: g.length })),
  };
}

export default tournamentsController;
