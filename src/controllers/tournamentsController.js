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

    if (!idUsuario || !idClub) {
      return res.status(400).json({ error: 'idUsuario e idClub son requeridos' });
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

    const club = await db.get(`SELECT id_club FROM club WHERE id_club = ?`, [idClub]);
    if (!club) return res.status(404).json({ error: 'Club no encontrado' });

    try {
      await db.run(
        `INSERT INTO torneo_peleador (id_torneo, id_usuario, id_club, posicion, cantidad_combates,
                                     cantidad_victorias, cantidad_derrotas, cantidad_puntos,
                                     cantidad_amarillas, descalificado)
         VALUES (?, ?, ?, NULL, 0, 0, 0, 0, 0, 0)`,
        [idTorneo, idUsuario, idClub]
      );
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return res.status(409).json({ error: 'El peleador ya está inscripto en este torneo' });
      }
      throw err;
    }

    res.status(201).json({ message: 'Peleador inscripto exitosamente' });
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
};

export default tournamentsController;
