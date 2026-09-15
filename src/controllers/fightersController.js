const db = require('../database/connection');
const { v4: uuidv4 } = require('uuid');
const { encryptDni, decryptDni } = require('../utils/dniCrypto');

const TIPO_LUCHADOR = 4;

const fightersController = {
  search: async (req, res) => {
    try {
      const { search, dni } = req.query;

      if (dni) {
        const encrypted = encryptDni(dni);
        const user = await db.get(
          `SELECT u.id_usuario AS id, u.nombre, u.apellido, u.username
           FROM usuario u
           WHERE u.username = ? AND u.id_tipo_usuario = ?`,
          [encrypted, TIPO_LUCHADOR]
        );
        if (!user) return res.json([]);
        return res.json([{
          id: user.id,
          nombre: user.nombre,
          apellido: user.apellido,
          dni: decryptDni(user.username),
        }]);
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
        return res.json(users.map((u) => ({
          id: u.id,
          nombre: u.nombre,
          apellido: u.apellido,
          dni: decryptDni(u.username),
        })));
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
      return res.json(users.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        apellido: u.apellido,
        dni: decryptDni(u.username),
      })));
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

      const encryptedDni = encryptDni(dni);

      let user = await db.get(
        `SELECT id_usuario FROM usuario WHERE username = ? AND id_tipo_usuario = ?`,
        [encryptedDni, TIPO_LUCHADOR]
      );

      let idUsuario;
      if (user) {
        idUsuario = user.id_usuario;
      } else {
        idUsuario = uuidv4();
        await db.run(
          `INSERT INTO usuario (id_usuario, username, password, nombre, apellido, id_tipo_usuario)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [idUsuario, encryptedDni, '', nombre, apellido, TIPO_LUCHADOR]
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
        await db.run(
          `INSERT OR REPLACE INTO torneo_equipo_peleador
           (id_torneo, id_equipo, id_usuario, numero_peleador, cantidad_amarillas, descalificado)
           VALUES (?, ?, ?, ?, 0, 0)`,
          [idTorneo, idEquipo, idUsuario, numeroPeleador]
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
        dni,
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

      await db.run(
        `INSERT OR IGNORE INTO equipo_peleador (id_equipo, id_usuario) VALUES (?, ?)`,
        [idEquipo, idUsuario]
      );

      await db.run(
        `INSERT OR REPLACE INTO torneo_equipo_peleador
         (id_torneo, id_equipo, id_usuario, numero_peleador, cantidad_amarillas, descalificado)
         VALUES (?, ?, ?, ?, 0, 0)`,
        [idTorneo, idEquipo, idUsuario, numeroPeleador]
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
};

module.exports = fightersController;
