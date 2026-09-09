const bcrypt = require('bcryptjs');
const db = require('../database/connection');
const { v4: uuidv4 } = require('uuid');

const SALT_ROUNDS = 10;

const validarEmail = (email) => {
  if (!email) return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

const usersController = {
  getAll: async (_req, res) => {
    try {
      const users = await db.all(
        `SELECT u.id_usuario AS id, u.username, u.nombre, u.apellido, u.email, u.telefono,
                u.id_tipo_usuario AS tipoUsuario, t.nombre AS tipoUsuarioNombre
         FROM usuario u
         JOIN tipo_usuario t ON u.id_tipo_usuario = t.id_tipo_usuario
         ORDER BY u.apellido, u.nombre`
      );
      res.json(users);
    } catch (error) {
      console.error('Error en getAll users:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const user = await db.get(
        `SELECT u.id_usuario AS id, u.username, u.nombre, u.apellido, u.email, u.telefono,
                u.id_tipo_usuario AS tipoUsuario, t.nombre AS tipoUsuarioNombre
         FROM usuario u
         JOIN tipo_usuario t ON u.id_tipo_usuario = t.id_tipo_usuario
         WHERE u.id_usuario = ?`,
        [id]
      );

      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      res.json(user);
    } catch (error) {
      console.error('Error en getById user:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  create: async (req, res) => {
    try {
      const { username, password, nombre, apellido, email, telefono, idTipoUsuario } = req.body;

      if (!username || !password || !nombre || !apellido || !idTipoUsuario) {
        return res.status(400).json({
          error: 'username, password, nombre, apellido e idTipoUsuario son requeridos',
        });
      }

      if (email && !validarEmail(email)) {
        return res.status(400).json({ error: 'El email no tiene un formato válido' });
      }

      const existingUsername = await db.get(
        `SELECT id_usuario FROM usuario WHERE username = ?`,
        [username]
      );
      if (existingUsername) {
        return res.status(409).json({ error: 'Ya existe un usuario con ese username' });
      }

      if (email) {
        const existingEmail = await db.get(
          `SELECT id_usuario FROM usuario WHERE email = ?`,
          [email]
        );
        if (existingEmail) {
          return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
        }
      }

      const idUsuario = uuidv4();
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      await db.run(
        `INSERT INTO usuario (id_usuario, username, password, nombre, apellido, email, telefono, id_tipo_usuario)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [idUsuario, username, hashedPassword, nombre, apellido, email || null, telefono || null, idTipoUsuario]
      );

      res.status(201).json({
        id: idUsuario,
        username,
        nombre,
        apellido,
        email,
        telefono,
        tipoUsuario: idTipoUsuario,
      });
    } catch (error) {
      console.error('Error en create user:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params;
      const { username, password, nombre, apellido, email, telefono, idTipoUsuario } = req.body;

      const existing = await db.get(
        `SELECT id_usuario FROM usuario WHERE id_usuario = ?`,
        [id]
      );
      if (!existing) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      if (email && !validarEmail(email)) {
        return res.status(400).json({ error: 'El email no tiene un formato válido' });
      }

      if (username) {
        const existingUsername = await db.get(
          `SELECT id_usuario FROM usuario WHERE username = ? AND id_usuario != ?`,
          [username, id]
        );
        if (existingUsername) {
          return res.status(409).json({ error: 'Ya existe otro usuario con ese username' });
        }
      }

      if (email) {
        const existingEmail = await db.get(
          `SELECT id_usuario FROM usuario WHERE email = ? AND id_usuario != ?`,
          [email, id]
        );
        if (existingEmail) {
          return res.status(409).json({ error: 'Ya existe otro usuario con ese email' });
        }
      }

      const fields = [];
      const values = [];

      if (username !== undefined) { fields.push('username = ?'); values.push(username); }
      if (nombre !== undefined) { fields.push('nombre = ?'); values.push(nombre); }
      if (apellido !== undefined) { fields.push('apellido = ?'); values.push(apellido); }
      if (email !== undefined) { fields.push('email = ?'); values.push(email); }
      if (telefono !== undefined) { fields.push('telefono = ?'); values.push(telefono); }
      if (idTipoUsuario !== undefined) { fields.push('id_tipo_usuario = ?'); values.push(idTipoUsuario); }
      if (password !== undefined) {
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        fields.push('password = ?');
        values.push(hashedPassword);
      }

      if (fields.length === 0) {
        return res.status(400).json({ error: 'No se proporcionaron campos para actualizar' });
      }

      values.push(id);
      await db.run(
        `UPDATE usuario SET ${fields.join(', ')} WHERE id_usuario = ?`,
        values
      );

      res.json({ message: 'Usuario actualizado exitosamente' });
    } catch (error) {
      console.error('Error en update user:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  delete: async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await db.get(
        `SELECT id_usuario FROM usuario WHERE id_usuario = ?`,
        [id]
      );
      if (!existing) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      await db.transaction(async (trx) => {
        await trx.run(`DELETE FROM luchador WHERE id_usuario = ?`, [id]);
        await trx.run(`DELETE FROM torneo_equipo_peleador WHERE id_usuario = ?`, [id]);
        await trx.run(`DELETE FROM equipo_peleador WHERE id_usuario = ?`, [id]);
        await trx.run(`DELETE FROM usuario WHERE id_usuario = ?`, [id]);
      });

      res.json({ message: 'Usuario eliminado exitosamente' });
    } catch (error) {
      console.error('Error en delete user:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },
};

module.exports = usersController;
