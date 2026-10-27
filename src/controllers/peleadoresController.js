import db from '../database/connection.js';
import { decryptDni } from '../utils/dniCrypto.js';


const peleadoresController = {
  getById: async (req, res) => {
    try {
      const { id } = req.params;

      const user = await db.get(
        `SELECT id_usuario, nombre, apellido
         FROM usuario WHERE id_usuario = ?`,
        [id]
      );
      if (!user) return res.status(404).json({ error: 'Peleador no encontrado' });

      const luchador = await db.get(
        `SELECT fecha_nacimiento AS fechaNacimiento, nombre_contacto_emergencia AS contactoEmergencia,
                telefono_contacto_emergencia AS telefonoEmergencia, domicilio
         FROM luchador WHERE id_usuario = ?`,
        [id]
      );

      const torneosBohurt = await db.all(
        `SELECT t.id_torneo AS id, ev.nombre, ev.fecha_evento AS fechaTorneo,
                t.id_categoria AS categoria,
                e.id_equipo AS equipoId, e.nombre AS equipoNombre, e.logo AS equipoLogo,
                tep.numero_peleador AS numeroPeleador
         FROM torneo_equipo_peleador tep
         JOIN torneo t ON tep.id_torneo = t.id_torneo
         JOIN equipo e ON tep.id_equipo = e.id_equipo
         JOIN evento ev on t.id_evento = ev.id_evento
         WHERE tep.id_usuario = ? AND t.id_modalidad = 1
         ORDER BY ev.fecha_evento DESC`,
        [id]
      );

      const equiposBohurt = await db.all(
        `SELECT DISTINCT e.id_equipo AS id, e.nombre, e.logo,
                cl.id_club AS clubId, cl.nombre AS clubNombre
         FROM equipo_peleador ep
         JOIN equipo e ON ep.id_equipo = e.id_equipo
         LEFT JOIN club_equipos ce ON e.id_equipo = ce.id_equipo
         LEFT JOIN club cl ON ce.id_club = cl.id_club
         WHERE ep.id_usuario = ?
         ORDER BY e.nombre`,
        [id]
      );

      const estadisticasBohurt = await db.all(
        `SELECT tl.id_torneo AS torneoId, e.nombre AS torneoNombre,
                tl.cantidad_combates AS combates, tl.cantidad_victorias AS victorias,
                tl.cantidad_derrotas AS derrotas, tl.cantidad_rounds_ganados AS roundsGanados,
                tl.cantidad_rounds_perdidos AS roundsPerdidos
         FROM torneo_luchador tl
         JOIN torneo t ON tl.id_torneo = t.id_torneo
         JOIN evento e on t.id_evento = e.id_evento
         WHERE tl.id_usuario = ?
         ORDER BY e.fecha_evento DESC`,
        [id]
      );

      const torneosDuelo = await db.all(
        `SELECT t.id_torneo AS id, ev.nombre, ev.fecha_evento AS fechaTorneo,
                tp.posicion AS posicion, t.id_categoria AS categoria, c.nombre AS categoriaNombre, tp.cantidad_combates AS cantidadCombates, 
                tp.cantidad_victorias AS victorias, tp.cantidad_derrotas AS derrotas, tp.cantidad_puntos AS puntos
         FROM torneo_peleador tp
         INNER JOIN torneo t ON tp.id_torneo = t.id_torneo
         INNER JOIN evento ev on t.id_evento = ev.id_evento
         INNER JOIN categoria c on t.id_modalidad = c.id_modalidad AND t.id_categoria = c.id_categoria
         WHERE tp.id_usuario = ? AND t.id_modalidad = 2 
         ORDER BY ev.fecha_evento DESC`,
        [id]
      );

      const torneosProfight = await db.all(
        `SELECT t.id_torneo AS id, ev.nombre, ev.fecha_evento AS fechaCombate, t.id_categoria, c.nombre AS categoriaNombre,
          tp.cantidad_victorias AS victoria, tp.cantidad_derrotas AS derrota, tp.cantidad_puntos AS puntos,
          adversario.apellido AS apellidoRetador, adversario.nombre AS nombreRetador
        FROM torneo_peleador tp
          INNER JOIN torneo t ON tp.id_torneo = t.id_torneo
          INNER JOIN combate_individual ci ON tp.id_torneo = ci.id_torneo AND (tp.id_usuario = ci.id_usuario_a OR tp.id_usuario = ci.id_usuario_b)
          INNER JOIN evento ev ON t.id_evento = ev.id_evento
          INNER JOIN categoria c on t.id_modalidad = c.id_modalidad AND t.id_categoria = c.id_categoria
          INNER JOIN usuario adversario ON adversario.id_usuario = CASE WHEN tp.id_usuario = ci.id_usuario_a THEN ci.id_usuario_b ELSE ci.id_usuario_a END
        WHERE tp.id_usuario = ? AND t.id_modalidad = 3
        ORDER BY ev.fecha_evento DESC;`,
        [id]
      )

      res.json({
        id: user.id_usuario,
        nombre: user.nombre,
        apellido: user.apellido,
        luchador: luchador || null,
        torneosBohurt: torneosBohurt.map((t) => ({
          id: t.id,
          nombre: t.nombre,
          fechaTorneo: t.fechaTorneo,
          equipo: { id: t.equipoId, nombre: t.equipoNombre, logo: t.equipoLogo },
          numeroPeleador: t.numeroPeleador,
        })),
        equipos: equiposBohurt,
        estadisticasBohurt: estadisticasBohurt,
        torneosDuelo: torneosDuelo.map((t) => ({
          id: t.id,
          nombre: t.nombre,
          fechaTorneo: t.fechaTorneo,
          categoria: t.categoria,
          nombreCategoria: t.categoriaNombre,
          posicion: t.posicion,
          cantidadCombates: t.cantidadCombates,
          victorias: t.victorias,
          derrotas: t.derrotas,
          puntos: t.puntos,
        })),
        estadisticasProfight: torneosProfight.map((t) => ({
          id: t.id,
          nombre: t.nombre,
          fechaTorneo: t.fechaTorneo,
          categoria: t.categoria,
          nombreCategoria: t.categoriaNombre,
          victorias: t.victoria,
          derrotas: t.derrota,
          puntos: t.puntos,
          nombreRetador: t.nombreRetador,
          apellidoRetador: t.apellidoRetador,
        }))
      });
    } catch (error) {
      console.error('Error en getById peleador:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },
};

export default peleadoresController;
