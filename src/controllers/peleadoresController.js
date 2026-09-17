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

      const torneos = await db.all(
        `SELECT t.id_torneo AS id, t.nombre, t.fecha_torneo AS fechaTorneo, t.imagen,
                e.id_equipo AS equipoId, e.nombre AS equipoNombre, e.logo AS equipoLogo,
                tep.numero_peleador AS numeroPeleador
         FROM torneo_equipo_peleador tep
         JOIN torneo t ON tep.id_torneo = t.id_torneo
         JOIN equipo e ON tep.id_equipo = e.id_equipo
         WHERE tep.id_usuario = ?
         ORDER BY t.fecha_torneo DESC`,
        [id]
      );

      const equipos = await db.all(
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

      const estadisticas = await db.all(
        `SELECT tl.id_torneo AS torneoId, t.nombre AS torneoNombre,
                tl.cantidad_combates AS combates, tl.cantidad_victorias AS victorias,
                tl.cantidad_derrotas AS derrotas, tl.cantidad_rounds_ganados AS roundsGanados,
                tl.cantidad_rounds_perdidos AS roundsPerdidos
         FROM torneo_luchador tl
         JOIN torneo t ON tl.id_torneo = t.id_torneo
         WHERE tl.id_usuario = ?
         ORDER BY t.fecha_torneo DESC`,
        [id]
      );

      res.json({
        id: user.id_usuario,
        nombre: user.nombre,
        apellido: user.apellido,
        luchador: luchador || null,
        torneos: torneos.map((t) => ({
          id: t.id,
          nombre: t.nombre,
          fechaTorneo: t.fechaTorneo,
          imagen: t.imagen,
          equipo: { id: t.equipoId, nombre: t.equipoNombre, logo: t.equipoLogo },
          numeroPeleador: t.numeroPeleador,
        })),
        equipos,
        estadisticas,
      });
    } catch (error) {
      console.error('Error en getById peleador:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },
};

export default peleadoresController;
