const db = require('../database/connection');
const { v4: uuidv4 } = require('uuid');
const { encryptDni, decryptDni, dniHash, dniLast4, normalizeDni } = require('../utils/dniCrypto');

const TIPO_LUCHADOR = 4;

function mapFighter(u) {
  return {
    id: u.id,
    nombre: u.nombre,
    apellido: u.apellido,
    dni: decryptDni(u.username),
  };
}

async function findDuplicateNumber(trx, idTorneo, idEquipo, numeroPeleador, excludeUserId = null) {
  const sql = excludeUserId
    ? `SELECT 1 FROM torneo_equipo_peleador WHERE id_torneo = ? AND id_equipo = ? AND numero_peleador = ? AND id_usuario != ? LIMIT 1`
    : `SELECT 1 FROM torneo_equipo_peleador WHERE id_torneo = ? AND id_equipo = ? AND numero_peleador = ? LIMIT 1`;
  const params = excludeUserId
    ? [idTorneo, idEquipo, numeroPeleador, excludeUserId]
    : [idTorneo, idEquipo, numeroPeleador];
  return trx ? trx.get(sql, params) : db.get(sql, params);
}

const fightersController = {
  search: async (req, res) => {
    try {
      const { search, dni } = req.query;

      if (dni) {
        const clean = normalizeDni(dni);
        if (!clean) return res.json([]);

        // Búsqueda exacta por hash completo
        const hash = dniHash(clean);
        const exact = await db.get(
          `SELECT u.id_usuario AS id, u.nombre, u.apellido, u.username
           FROM usuario u
           WHERE u.dni_hash = ? AND u.id_tipo_usuario = ?`,
          [hash, TIPO_LUCHADOR]
        );
        if (exact) return res.json([mapFighter(exact)]);

        // Búsqueda parcial por últimos 4 dígitos
        if (clean.length >= 1) {
          const last4 = dniLast4(clean);
          const users = await db.all(
            `SELECT u.id_usuario AS id, u.nombre, u.apellido, u.username
             FROM usuario u
             WHERE u.dni_last4 = ? AND u.id_tipo_usuario = ? AND u.dni_hash != ?
             ORDER BY u.apellido, u.nombre
             LIMIT 50`,
            [last4, TIPO_LUCHADOR, hash]
          );
          if (users.length > 0) return res.json(users.map(mapFighter));
        }

        return res.json([]);
      }

      if (!search || search.trim() === '') {
        const users = await db.all(
          `SELECT u.id_usuario AS id, u.nombre, u.apellido, u.username
           FROM usuario u
           WHERE u.id_tipo_usuario = ?
           ORDER BY u.apellido, u.nombre
           LIMIT 50`,
          [TIPO_LUCHADOR]
        );
        return res.json(users.map(mapFighter));
      }

      const term = `%${search.trim()}%`;
      const users = await db.all(
        `SELECT u.id_usuario AS id, u.nombre, u.apellido, u.username
         FROM usuario u
         WHERE u.id_tipo_usuario = ?
           AND (u.nombre LIKE ? OR u.apellido LIKE ?)
         ORDER BY u.apellido, u.nombre
         LIMIT 50`,
        [TIPO_LUCHADOR, term, term]
      );
      return res.json(users.map(mapFighter));
    } catch (error) {
      console.error('Error en search fighters:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  create: async (req, res) => {
    try {
      const { nombre, apellido, dni, fechaNacimiento, idEquipo, idTorneo, numeroPeleador } = req.body;

      if (!nombre || !apellido || !dni || !fechaNacimiento) {
        return res.status(400).json({ error: 'nombre, apellido, dni y fechaNacimiento son requeridos' });
      }

      const cleanDni = normalizeDni(dni);
      if (!cleanDni) {
        return res.status(400).json({ error: 'DNI inválido' });
      }

      const encryptedDni = encryptDni(cleanDni);
      const hash = dniHash(cleanDni);
      const last4 = dniLast4(cleanDni);

      let user = await db.get(
        `SELECT id_usuario FROM usuario WHERE username = ? AND id_tipo_usuario = ?`,
        [encryptedDni, TIPO_LUCHADOR]
      );

      let idUsuario;
      if (user) {
        idUsuario = user.id_usuario;
        await db.run(
          `UPDATE usuario SET nombre = ?, apellido = ?, dni_hash = ?, dni_last4 = ? WHERE id_usuario = ?`,
          [nombre, apellido, hash, last4, idUsuario]
        );
      } else {
        idUsuario = uuidv4();
        await db.run(
          `INSERT INTO usuario (id_usuario, username, password, nombre, apellido, id_tipo_usuario, dni_hash, dni_last4)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [idUsuario, encryptedDni, '', nombre, apellido, TIPO_LUCHADOR, hash, last4]
        );
      }

      await db.run(
        `INSERT OR REPLACE INTO luchador (id_usuario, fecha_nacimiento) VALUES (?, ?)`,
        [idUsuario, fechaNacimiento]
      );

      if (idEquipo) {
        await db.run(
          `INSERT OR IGNORE INTO equipo_peleador (id_equipo, id_usuario) VALUES (?, ?)`,
          [idEquipo, idUsuario]
        );
      }

      if (idTorneo && idEquipo && numeroPeleador !== undefined && numeroPeleador !== null) {
        const num = parseInt(numeroPeleador, 10);
        if (Number.isNaN(num) || num <= 0) {
          return res.status(400).json({ error: 'numeroPeleador debe ser mayor a 0' });
        }
        const dup = await findDuplicateNumber(null, idTorneo, idEquipo, num, idUsuario);
        if (dup) {
          return res.status(409).json({ error: 'El número de peleador ya está en uso en este equipo' });
        }
        await db.run(
          `INSERT OR REPLACE INTO torneo_equipo_peleador
           (id_torneo, id_equipo, id_usuario, numero_peleador, cantidad_amarillas, descalificado)
           VALUES (?, ?, ?, ?, 0, 0)`,
          [idTorneo, idEquipo, idUsuario, num]
        );

        await db.run(
          `INSERT OR IGNORE INTO torneo_luchador
           (id_torneo, id_usuario, cantidad_combates, cantidad_victorias, cantidad_derrotas, cantidad_rounds_ganados, cantidad_rounds_perdidos)
           VALUES (?, ?, 0, 0, 0, 0, 0)`,
          [idTorneo, idUsuario]
        );
      }

      res.status(201).json({
        id: idUsuario,
        nombre,
        apellido,
        dni: cleanDni,
        fechaNacimiento,
      });
    } catch (error) {
      console.error('Error en create fighter:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  addToTeamTournament: async (req, res) => {
    try {
      const { idTorneo, idEquipo } = req.params;
      const { idUsuario, numeroPeleador } = req.body;

      if (!idUsuario || numeroPeleador === undefined || numeroPeleador === null) {
        return res.status(400).json({ error: 'idUsuario y numeroPeleador son requeridos' });
      }

      const num = parseInt(numeroPeleador, 10);
      if (Number.isNaN(num) || num <= 0) {
        return res.status(400).json({ error: 'numeroPeleador debe ser mayor a 0' });
      }

      const user = await db.get(
        `SELECT id_tipo_usuario FROM usuario WHERE id_usuario = ?`,
        [idUsuario]
      );
      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
      if (user.id_tipo_usuario !== TIPO_LUCHADOR) {
        return res.status(400).json({ error: 'El usuario no es un luchador' });
      }

      const dup = await findDuplicateNumber(null, idTorneo, idEquipo, num, idUsuario);
      if (dup) {
        return res.status(409).json({ error: 'El número de peleador ya está en uso en este equipo' });
      }

      await db.run(
        `INSERT OR IGNORE INTO equipo_peleador (id_equipo, id_usuario) VALUES (?, ?)`,
        [idEquipo, idUsuario]
      );

      await db.run(
        `INSERT OR REPLACE INTO torneo_equipo_peleador
         (id_torneo, id_equipo, id_usuario, numero_peleador, cantidad_amarillas, descalificado)
         VALUES (?, ?, ?, ?, 0, 0)`,
        [idTorneo, idEquipo, idUsuario, num]
      );

      await db.run(
        `INSERT OR IGNORE INTO torneo_luchador
         (id_torneo, id_usuario, cantidad_combates, cantidad_victorias, cantidad_derrotas, cantidad_rounds_ganados, cantidad_rounds_perdidos)
         VALUES (?, ?, 0, 0, 0, 0, 0)`,
        [idTorneo, idUsuario]
      );

      res.status(201).json({ message: 'Peleador inscrito exitosamente' });
    } catch (error) {
      console.error('Error en addToTeamTournament:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  updateNumeroPeleador: async (req, res) => {
    try {
      const { idTorneo, idEquipo, idUsuario } = req.params;
      const { numeroPeleador } = req.body;

      const num = parseInt(numeroPeleador, 10);
      if (Number.isNaN(num) || num <= 0) {
        return res.status(400).json({ error: 'numeroPeleador debe ser mayor a 0' });
      }

      const exists = await db.get(
        `SELECT 1 FROM torneo_equipo_peleador WHERE id_torneo = ? AND id_equipo = ? AND id_usuario = ?`,
        [idTorneo, idEquipo, idUsuario]
      );
      if (!exists) {
        return res.status(404).json({ error: 'Peleador no inscrito en este equipo/torneo' });
      }

      const dup = await findDuplicateNumber(null, idTorneo, idEquipo, num, idUsuario);
      if (dup) {
        return res.status(409).json({ error: 'El número de peleador ya está en uso en este equipo' });
      }

      await db.run(
        `UPDATE torneo_equipo_peleador SET numero_peleador = ? WHERE id_torneo = ? AND id_equipo = ? AND id_usuario = ?`,
        [num, idTorneo, idEquipo, idUsuario]
      );

      res.json({ message: 'Número actualizado' });
    } catch (error) {
      console.error('Error en updateNumeroPeleador:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  removeFromTeamTournament: async (req, res) => {
    try {
      const { idTorneo, idEquipo, idUsuario } = req.params;

      const hasRounds = await db.get(
        `SELECT 1 FROM round_peleador WHERE id_torneo = ? AND id_usuario = ? LIMIT 1`,
        [idTorneo, idUsuario]
      );
      if (hasRounds) {
        return res.status(409).json({ error: 'No se puede eliminar un peleador que tiene rounds registrados' });
      }

      await db.run(
        `DELETE FROM torneo_equipo_peleador WHERE id_torneo = ? AND id_equipo = ? AND id_usuario = ?`,
        [idTorneo, idEquipo, idUsuario]
      );

      const stillInTournament = await db.get(
        `SELECT 1 FROM torneo_equipo_peleador WHERE id_torneo = ? AND id_usuario = ? LIMIT 1`,
        [idTorneo, idUsuario]
      );
      if (!stillInTournament) {
        await db.run(
          `DELETE FROM torneo_luchador WHERE id_torneo = ? AND id_usuario = ?`,
          [idTorneo, idUsuario]
        );
      }

      res.json({ message: 'Peleador eliminado de la inscripción' });
    } catch (error) {
      console.error('Error en removeFromTeamTournament:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },
};

module.exports = fightersController;
