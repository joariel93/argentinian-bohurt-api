const bcrypt = require('bcryptjs');
const db = require('../database/connection');
const { v4: uuidv4 } = require('uuid');

const TIPOS_HABILITADOS = [1, 2, 5];

const usuariosController = {
  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email y password son requeridos' });
      }

      const user = await db.get(
        `SELECT id_usuario, nombre, apellido, email, id_tipo_usuario, password
         FROM usuario WHERE email = ?`,
        [email]
      );

      if (!user) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      if (!TIPOS_HABILITADOS.includes(user.id_tipo_usuario)) {
        return res.status(403).json({ error: 'Usuario no habilitado para esta aplicación' });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      res.json({
        id: user.id_usuario,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        tipoUsuario: user.id_tipo_usuario,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  buscarPorUsername: async (req, res) => {
    try {
      const { username } = req.query;

      if (!username) {
        return res.status(400).json({ error: 'El parámetro username es requerido' });
      }

      const user = await db.get(
        `SELECT id_usuario AS idUsuario, nombre, apellido, username
         FROM usuario WHERE username = ?`,
        [username]
      );

      if (!user) {
        return res.json(null);
      }

      res.json(user);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  crear: async (req, res) => {
    try {
      const { nombre, apellido, username } = req.body;

      if (!nombre || !apellido || !username) {
        return res.status(400).json({ error: 'nombre, apellido y username son requeridos' });
      }

      const existing = await db.get(
        `SELECT id_usuario FROM usuario WHERE username = ?`,
        [username]
      );
      if (existing) {
        return res.status(409).json({ error: 'Ya existe un usuario con ese documento' });
      }

      const idUsuario = uuidv4();
      await db.run(
        `INSERT INTO usuario (id_usuario, username, password, nombre, apellido, id_tipo_usuario)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [idUsuario, username, '', nombre, apellido, 4]
      );

      res.status(201).json({ id: idUsuario, nombre, apellido, username });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },
};

module.exports = usuariosController;
