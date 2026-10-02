import db from '../database/connection.js';
import { v4 as uuidv4 } from 'uuid';
import otpService from '../services/otpService.js';


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

async function getRedesSocialesEvento(idEvento) {
  const rows = await db.all(
    `SELECT rs.id_red_social AS idRedSocial, rs.nombre, rs.icono, ers.link
     FROM evento_redes_sociales ers
     JOIN redes_sociales rs ON ers.id_red_social = rs.id_red_social
     WHERE ers.id_evento = ?`,
    [idEvento]
  );
  return rows.map((r) => ({
    idRedSocial: r.idRedSocial,
    nombre: r.nombre,
    icono: r.icono,
    link: r.link,
    iconClass: mapIconClass(r.icono),
  }));
}

async function getRedesSocialesEventoAdmin(idEvento) {
  const rows = await db.all(
    `SELECT rs.id_red_social AS idRedSocial, ers.link
     FROM evento_redes_sociales ers
     JOIN redes_sociales rs ON ers.id_red_social = rs.id_red_social
     WHERE ers.id_evento = ?`,
    [idEvento]
  );
  return rows.map((r) => ({ idRedSocial: r.idRedSocial, link: r.link || '' }));
}

async function getClubesInvitados(idEvento) {
  return db.all(
    `SELECT id_club AS idClub, nombre_club_manual AS nombreClubManual, email, telefono
     FROM evento_clubes_invitados
     WHERE id_evento = ?`,
    [idEvento]
  );
}

async function getTorneosByEvento(idEvento) {
  return db.all(
    `SELECT t.id_torneo AS id, t.id_modalidad AS idModalidad,
            t.id_categoria AS idCategoria, t.id_genero AS idGenero,
            t.id_tipo_torneo AS idTipoTorneo,
            t.estado,
            m.nombre AS modalidad, c.nombre AS categoria, g.nombre AS genero,
            tt.nombre AS tipoTorneo
     FROM torneo t
     JOIN modalidad m ON t.id_modalidad = m.id_modalidad
     JOIN categoria c ON t.id_categoria = c.id_categoria AND t.id_modalidad = c.id_modalidad
     JOIN genero g ON t.id_genero = g.id_genero
     LEFT JOIN tipo_torneo tt ON t.id_tipo_torneo = tt.id_tipo_torneo
     WHERE t.id_evento = ?
     ORDER BY m.nombre, c.nombre, g.nombre`,
    [idEvento]
  );
}

const eventsController = {
  getAll: async (req, res) => {
    const eventos = await db.all(
      `SELECT e.id_evento AS id, e.nombre, e.localizacion,
              e.fecha_evento AS fechaEvento, e.fecha_cierre_inscripcion AS fechaCierreInscripcion,
              e.imagen, e.link_transmision AS linkTransmision,
              e.estado,
              (SELECT COUNT(*) FROM torneo t WHERE t.id_evento = e.id_evento) AS cantidadTorneos,
              (SELECT GROUP_CONCAT(DISTINCT m.nombre)
               FROM torneo t
               JOIN modalidad m ON t.id_modalidad = m.id_modalidad
               WHERE t.id_evento = e.id_evento) AS modalidades
       FROM evento e
       ORDER BY e.fecha_evento DESC`
    );
    res.json(eventos.map((e) => ({
      ...e,
      modalidades: e.modalidades ? e.modalidades.split(',') : [],
    })));
  },

  getTournamentsByEvent: async (req, res) => {
    const { id } = req.params;
    const torneos = await getTorneosByEvento(id);
    res.json(torneos);
  },

  getById: async (req, res) => {
    const { id } = req.params;
    const evento = await db.get(
      `SELECT id_evento AS id, nombre, localizacion,
              fecha_evento AS fechaEvento, fecha_cierre_inscripcion AS fechaCierreInscripcion,
              imagen, link_transmision AS linkTransmision,
              id_reglamento AS idReglamento, estado
       FROM evento WHERE id_evento = ?`,
      [id]
    );
    if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });

    const [redesSociales, clubesInvitados, torneos] = await Promise.all([
      getRedesSocialesEvento(id),
      getClubesInvitados(id),
      getTorneosByEvento(id),
    ]);

    const reglamento = await db.get(
      `SELECT nombre, link FROM reglamento WHERE id_reglamento = ?`,
      [evento.idReglamento]
    );

    res.json({
      ...evento,
      reglamento: reglamento || null,
      redesSociales,
      clubesInvitados,
      torneos,
    });
  },

  getAdmin: async (req, res) => {
    const { id } = req.params;
    const evento = await db.get(
      `SELECT id_evento AS id, nombre, localizacion,
              fecha_evento AS fechaEvento, fecha_cierre_inscripcion AS fechaCierreInscripcion,
              imagen, link_transmision AS linkTransmision, password,
              id_reglamento AS idReglamento, id_organizador AS idOrganizador, estado
       FROM evento WHERE id_evento = ?`,
      [id]
    );
    if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });

    const [redesSociales, clubesInvitados, torneos] = await Promise.all([
      getRedesSocialesEventoAdmin(id),
      getClubesInvitados(id),
      db.all(
        `SELECT t.id_torneo AS id, t.id_modalidad AS idModalidad,
                t.id_categoria AS idCategoria, t.id_genero AS idGenero,
                t.id_tipo_torneo AS idTipoTorneo,
                t.estado
         FROM torneo t
         WHERE t.id_evento = ?`,
        [id]
      ),
    ]);

    res.json({
      ...evento,
      password: '',
      redesSociales,
      clubesInvitados,
      // Por seguridad, no devolvemos el password del torneo (es un hash bcrypt).
      // El OTP plano solo se muestra al crear/regenerar el torneo.
      torneos: torneos.map((t) => ({ ...t, password: '' })),
    });
  },

  create: async (req, res) => {
    const {
      nombre, localizacion, fechaEvento, fechaCierreInscripcion,
      idReglamento, idOrganizador, imagen, linkTransmision,
      redesSociales, clubesInvitados, torneos, password,
    } = req.body;

    if (!nombre || !localizacion || !fechaEvento || !fechaCierreInscripcion) {
      return res.status(400).json({ error: 'nombre, localizacion, fechaEvento y fechaCierreInscripcion son requeridos' });
    }
    if (!Array.isArray(torneos) || torneos.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un torneo' });
    }

    const idEvento = uuidv4();
    const eventoOtp = password || otpService.generate();
    const eventoOtpHash = otpService.hash(eventoOtp);

    await db.transaction(async (trx) => {
      await trx.run(
        `INSERT INTO evento (id_evento, nombre, localizacion, fecha_evento, fecha_cierre_inscripcion,
                            id_reglamento, id_organizador, imagen, link_transmision, password, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente')`,
        [idEvento, nombre, localizacion, fechaEvento, fechaCierreInscripcion,
          idReglamento || 1, idOrganizador || null, imagen || null, linkTransmision || null, eventoOtpHash]
      );

      if (Array.isArray(redesSociales)) {
        for (const rs of redesSociales) {
          if (!rs.idRedSocial) continue;
          await trx.run(
            `INSERT OR REPLACE INTO evento_redes_sociales (id_evento, id_red_social, link) VALUES (?, ?, ?)`,
            [idEvento, rs.idRedSocial, rs.link || null]
          );
        }
      }

      if (Array.isArray(clubesInvitados)) {
        for (const c of clubesInvitados) {
          await trx.run(
            `INSERT INTO evento_clubes_invitados (id_evento, id_club, nombre_club_manual, email, telefono)
             VALUES (?, ?, ?, ?, ?)`,
            [idEvento, c.idClub || null, c.nombreClubManual || null, c.email || null, c.telefono || null]
          );
        }
      }

      const torneosCreados = [];
      for (const t of torneos) {
        const idTorneo = uuidv4();
        const torneoOtp = t.password || otpService.generate();
        const torneoOtpHash = otpService.hash(torneoOtp);
        await trx.run(
          `INSERT INTO torneo (id_torneo, id_evento, id_modalidad, id_categoria, id_genero, id_tipo_torneo, password, estado)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'Pendiente')`,
          [idTorneo, idEvento,
            t.idModalidad || 1, t.idCategoria || 1, t.idGenero || 1,
            t.idTipoTorneo || null, torneoOtpHash]
        );
        torneosCreados.push({ id: idTorneo, password: torneoOtp });
      }

      req._torneosCreados = torneosCreados;
    });

    const torneosCreados = req._torneosCreados;
    res.status(201).json({
      id: idEvento,
      password: eventoOtp,
      torneos: torneosCreados,
      message: 'Evento y torneos creados exitosamente',
    });
  },

  update: async (req, res) => {
    const { id } = req.params;
    const existing = await db.get(`SELECT id_evento FROM evento WHERE id_evento = ?`, [id]);
    if (!existing) return res.status(404).json({ error: 'Evento no encontrado' });

    const {
      nombre, localizacion, fechaEvento, fechaCierreInscripcion,
      idReglamento, idOrganizador, imagen, linkTransmision,
      redesSociales, clubesInvitados, torneos, password,
    } = req.body;

    await db.transaction(async (trx) => {
      const fields = [];
      const values = [];

      if (nombre !== undefined) { fields.push('nombre = ?'); values.push(nombre); }
      if (localizacion !== undefined) { fields.push('localizacion = ?'); values.push(localizacion); }
      if (fechaEvento !== undefined) { fields.push('fecha_evento = ?'); values.push(fechaEvento); }
      if (fechaCierreInscripcion !== undefined) { fields.push('fecha_cierre_inscripcion = ?'); values.push(fechaCierreInscripcion); }
      if (idReglamento !== undefined) { fields.push('id_reglamento = ?'); values.push(idReglamento); }
      if (idOrganizador !== undefined) { fields.push('id_organizador = ?'); values.push(idOrganizador); }
      if (imagen !== undefined) { fields.push('imagen = ?'); values.push(imagen); }
      if (linkTransmision !== undefined) { fields.push('link_transmision = ?'); values.push(linkTransmision); }
      if (password) { fields.push('password = ?'); values.push(otpService.hash(password)); }

      if (fields.length > 0) {
        values.push(id);
        await trx.run(`UPDATE evento SET ${fields.join(', ')} WHERE id_evento = ?`, values);
      }

      if (Array.isArray(redesSociales)) {
        await trx.run(`DELETE FROM evento_redes_sociales WHERE id_evento = ?`, [id]);
        for (const rs of redesSociales) {
          if (!rs.idRedSocial) continue;
          await trx.run(
            `INSERT INTO evento_redes_sociales (id_evento, id_red_social, link) VALUES (?, ?, ?)`,
            [id, rs.idRedSocial, rs.link || null]
          );
        }
      }

      if (Array.isArray(clubesInvitados)) {
        await trx.run(`DELETE FROM evento_clubes_invitados WHERE id_evento = ?`, [id]);
        for (const c of clubesInvitados) {
          await trx.run(
            `INSERT INTO evento_clubes_invitados (id_evento, id_club, nombre_club_manual, email, telefono)
             VALUES (?, ?, ?, ?, ?)`,
            [id, c.idClub || null, c.nombreClubManual || null, c.email || null, c.telefono || null]
          );
        }
      }

      if (Array.isArray(torneos)) {
        // 1. Detectar ids que ya están en el evento y eliminar los que ya no están.
        const idsEnRequest = torneos.filter((t) => t.id).map((t) => t.id);
        const idsActualesRows = await trx.all(
          `SELECT id_torneo FROM torneo WHERE id_evento = ?`,
          [id]
        );
        const idsActuales = idsActualesRows.map((r) => r.id_torneo);
        const idsAEliminar = idsActuales.filter((idt) => !idsEnRequest.includes(idt));
        for (const idt of idsAEliminar) {
          await trx.run(`DELETE FROM round_peleador WHERE id_torneo = ?`, [idt]);
          await trx.run(`DELETE FROM round_combate WHERE id_torneo = ?`, [idt]);
          await trx.run(`DELETE FROM combate WHERE id_torneo = ?`, [idt]);
          await trx.run(`DELETE FROM torneo_equipo_peleador WHERE id_torneo = ?`, [idt]);
          await trx.run(`DELETE FROM torneo_equipo WHERE id_torneo = ?`, [idt]);
          await trx.run(`DELETE FROM torneo_peleador WHERE id_torneo = ?`, [idt]);
          await trx.run(`DELETE FROM torneo WHERE id_torneo = ?`, [idt]);
        }

        // 2. Upsert de cada torneo del array.
        for (const t of torneos) {
          if (t.id) {
            // Update
            const fieldsT = [];
            const valuesT = [];
            if (t.idModalidad !== undefined) { fieldsT.push('id_modalidad = ?'); valuesT.push(t.idModalidad); }
            if (t.idCategoria !== undefined) { fieldsT.push('id_categoria = ?'); valuesT.push(t.idCategoria); }
            if (t.idGenero !== undefined) { fieldsT.push('id_genero = ?'); valuesT.push(t.idGenero); }
            if (t.idTipoTorneo !== undefined) { fieldsT.push('id_tipo_torneo = ?'); valuesT.push(t.idTipoTorneo); }
            if (t.password) { fieldsT.push('password = ?'); valuesT.push(otpService.hash(t.password)); }
            if (fieldsT.length > 0) {
              valuesT.push(t.id);
              await trx.run(`UPDATE torneo SET ${fieldsT.join(', ')} WHERE id_torneo = ?`, valuesT);
            }
          } else {
            // Create
            const idTorneo = uuidv4();
            const torneoPassword = t.password || otpService.generate();
            await trx.run(
              `INSERT INTO torneo (id_torneo, id_evento, id_modalidad, id_categoria, id_genero, id_tipo_torneo, password, estado)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'Pendiente')`,
              [
                idTorneo,
                id,
                t.idModalidad || 1,
                t.idCategoria || 1,
                t.idGenero || 1,
                t.idTipoTorneo || null,
                otpService.hash(torneoPassword),
              ]
            );
          }
        }
      }
    });

    res.json({ message: 'Evento actualizado exitosamente' });
  },

  delete: async (req, res) => {
    const { id } = req.params;
    const existing = await db.get(`SELECT id_evento FROM evento WHERE id_evento = ?`, [id]);
    if (!existing) return res.status(404).json({ error: 'Evento no encontrado' });

    await db.transaction(async (trx) => {
      const torneos = await trx.all(`SELECT id_torneo FROM torneo WHERE id_evento = ?`, [id]);
      for (const t of torneos) {
        await trx.run(`DELETE FROM torneo_equipo_peleador WHERE id_torneo = ?`, [t.id_torneo]);
        await trx.run(`DELETE FROM torneo_luchador WHERE id_torneo = ?`, [t.id_torneo]);
        await trx.run(`DELETE FROM torneo_equipo WHERE id_torneo = ?`, [t.id_torneo]);
        await trx.run(`DELETE FROM equipos_por_grupo WHERE id_torneo = ?`, [t.id_torneo]);
        await trx.run(`DELETE FROM round_combate WHERE id_torneo = ?`, [t.id_torneo]);
        await trx.run(`DELETE FROM combate WHERE id_torneo = ?`, [t.id_torneo]);
        await trx.run(`DELETE FROM round_combate_individual WHERE id_torneo = ?`, [t.id_torneo]);
        await trx.run(`DELETE FROM combate_individual WHERE id_torneo = ?`, [t.id_torneo]);
        await trx.run(`DELETE FROM torneo_peleador WHERE id_torneo = ?`, [t.id_torneo]);
        await trx.run(`DELETE FROM torneo WHERE id_torneo = ?`, [t.id_torneo]);
      }
      await trx.run(`DELETE FROM evento_redes_sociales WHERE id_evento = ?`, [id]);
      await trx.run(`DELETE FROM evento_clubes_invitados WHERE id_evento = ?`, [id]);
      await trx.run(`DELETE FROM evento WHERE id_evento = ?`, [id]);
    });

    res.json({ message: 'Evento eliminado exitosamente' });
  },

  getCombatesByEvento: async (req, res) => {
    const { id } = req.params;

    const evento = await db.get(`SELECT id_evento FROM evento WHERE id_evento = ?`, [id]);
    if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });

    const torneos = await db.all(
      `SELECT t.id_torneo AS id, t.id_modalidad AS idModalidad,
              t.id_categoria AS idCategoria, t.id_genero AS idGenero,
              t.id_tipo_torneo AS idTipoTorneo,
              m.nombre AS modalidad, c.nombre AS categoria, g.nombre AS genero,
              tt.nombre AS tipoTorneo
       FROM torneo t
       JOIN modalidad m ON t.id_modalidad = m.id_modalidad
       JOIN categoria c ON t.id_categoria = c.id_categoria AND t.id_modalidad = c.id_modalidad
       JOIN genero g ON t.id_genero = g.id_genero
       LEFT JOIN tipo_torneo tt ON t.id_tipo_torneo = tt.id_tipo_torneo
       WHERE t.id_evento = ?
       ORDER BY m.nombre, c.nombre, g.nombre`,
      [id]
    );

    const result = await Promise.all(
      torneos.map(async (t) => {
        const isIndividual = [2, 3].includes(t.idModalidad);

        if (isIndividual) {
          const combates = await db.all(
            `SELECT ci.id_combate AS id, ci.orden, ci.link, ci.fase, ci.grupo, ci.ronda, ci.nivel,
                    ci.id_usuario_a AS idUsuarioA, ci.id_usuario_b AS idUsuarioB,
                    ci.id_usuario_ganador AS idUsuarioGanador,
                    ci.cantidad_round_ganados_ganador AS roundsGanadosGanador,
                    ci.cantidad_round_ganados_perdedor AS roundsGanadosPerdedor,
                    ua.nombre AS nombreUsuarioA, ua.apellido AS apellidoUsuarioA,
                    ub.nombre AS nombreUsuarioB, ub.apellido AS apellidoUsuarioB,
                    ug.nombre AS nombreUsuarioGanador, ug.apellido AS apellidoUsuarioGanador,
                    ca.id_color1 AS idColor1A, ca.id_color2 AS idColor2A, ca.id_color3 AS idColor3A,
                    cb.id_color1 AS idColor1B, cb.id_color2 AS idColor2B, cb.id_color3 AS idColor3B
             FROM combate_individual ci
             JOIN usuario ua ON ci.id_usuario_a = ua.id_usuario
             LEFT JOIN usuario ub ON ci.id_usuario_b = ub.id_usuario
             LEFT JOIN usuario ug ON ci.id_usuario_ganador = ug.id_usuario
             LEFT JOIN torneo_peleador tpa ON tpa.id_torneo = ci.id_torneo AND tpa.id_usuario = ci.id_usuario_a
             LEFT JOIN club ca ON ca.id_club = tpa.id_club
             LEFT JOIN torneo_peleador tpb ON tpb.id_torneo = ci.id_torneo AND tpb.id_usuario = ci.id_usuario_b
             LEFT JOIN club cb ON cb.id_club = tpb.id_club
             WHERE ci.id_torneo = ?
             ORDER BY ci.orden ASC`,
            [t.id]
          );

          const coloresIds = [...new Set(combates.flatMap((c) => [c.idColor1A, c.idColor2A, c.idColor3A, c.idColor1B, c.idColor2B, c.idColor3B]))];
          const colores = coloresIds.length
            ? await db.all(
              `SELECT id_color AS id, nombre, hex FROM colores WHERE id_color IN (${coloresIds.map(() => '?').join(',')})`,
              coloresIds
            )
            : [];
          const coloresMap = new Map(colores.map((c) => [c.id, c]));

          const combatesConRounds = await Promise.all(
            combates.map(async (c) => {
              const rounds = await db.all(
                `SELECT round, id_usuario_ganador AS idUsuarioGanador,
                        puntos_ganador AS puntosGanador, puntos_perdedor AS puntosPerdedor
                 FROM round_combate_individual
                 WHERE id_torneo = ? AND id_combate = ?
                 ORDER BY round ASC`,
                [t.id, c.id]
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
                usuarioA: {
                  idUsuario: c.idUsuarioA,
                  nombre: c.nombreUsuarioA,
                  apellido: c.apellidoUsuarioA,
                  colores: [c.idColor1A, c.idColor2A, c.idColor3A].map((id) => coloresMap.get(id)).filter(Boolean),
                },
                usuarioB: c.idUsuarioB ? {
                  idUsuario: c.idUsuarioB,
                  nombre: c.nombreUsuarioB,
                  apellido: c.apellidoUsuarioB,
                  colores: [c.idColor1B, c.idColor2B, c.idColor3B].map((id) => coloresMap.get(id)).filter(Boolean),
                } : null,
                usuarioGanador: c.idUsuarioGanador ? {
                  idUsuario: c.idUsuarioGanador,
                  nombre: c.nombreUsuarioGanador,
                  apellido: c.apellidoUsuarioGanador,
                } : null,
                roundsGanadosGanador: c.roundsGanadosGanador || 0,
                roundsGanadosPerdedor: c.roundsGanadosPerdedor || 0,
                rounds,
              };
            })
          );

          return { ...t, combates: combatesConRounds };
        }

        const combates = await db.all(
          `SELECT c.id_combate AS id, c.orden, c.link, c.fase, c.grupo, c.ronda, c.nivel,
                  c.id_equipo_a AS idEquipoA, c.id_equipo_b AS idEquipoB,
                  c.id_equipo_ganador AS idEquipoGanador,
                  c.cantidad_round_ganados_ganador AS roundsGanadosGanador,
                  c.cantidad_round_ganados_perdedor AS roundsGanadosPerdedor,
                  ea.nombre AS nombreEquipoA, ea.logo AS logoEquipoA,
                  eb.nombre AS nombreEquipoB, eb.logo AS logoEquipoB,
                  eg.nombre AS nombreEquipoGanador
           FROM combate c
           JOIN equipo ea ON c.id_equipo_a = ea.id_equipo
           LEFT JOIN equipo eb ON c.id_equipo_b = eb.id_equipo
           LEFT JOIN equipo eg ON c.id_equipo_ganador = eg.id_equipo
           WHERE c.id_torneo = ?
           ORDER BY c.orden ASC`,
          [t.id]
        );

        const combatesConRounds = await Promise.all(
          combates.map(async (c) => {
            const rounds = await db.all(
              `SELECT round, id_equipo_ganador AS idEquipoGanador,
                      puntos_ganador AS puntosGanador, puntos_perdedor AS puntosPerdedor
               FROM round_combate
               WHERE id_torneo = ? AND id_combate = ?
               ORDER BY round ASC`,
              [t.id, c.id]
            );
            const finalizado = c.idEquipoGanador !== null;
            return {
              id: c.id,
              orden: c.orden,
              link: c.link || null,
              fase: c.fase || null,
              grupo: c.grupo || null,
              ronda: c.ronda || null,
              nivel: c.nivel ?? null,
              finalizado,
              equipoA: { idEquipo: c.idEquipoA, nombre: c.nombreEquipoA, logo: c.logoEquipoA },
              equipoB: c.idEquipoB ? { idEquipo: c.idEquipoB, nombre: c.nombreEquipoB, logo: c.logoEquipoB } : null,
              equipoGanador: c.idEquipoGanador ? { idEquipo: c.idEquipoGanador, nombre: c.nombreEquipoGanador } : null,
              roundsGanadosGanador: c.roundsGanadosGanador || 0,
              roundsGanadosPerdedor: c.roundsGanadosPerdedor || 0,
              rounds,
            };
          })
        );

        return { ...t, combates: combatesConRounds };
      })
    );

    res.json({ idEvento: id, torneos: result });
  },

  validateOtp: async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'password es requerido' });

    const evento = await db.get(`SELECT password FROM evento WHERE id_evento = ?`, [id]);
    if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });

    const valid = await otpService.verify(password, evento.password);
    if (!valid) return res.status(401).json({ error: 'OTP inválido' });

    res.json({ valid: true });
  },
};

export default eventsController;
