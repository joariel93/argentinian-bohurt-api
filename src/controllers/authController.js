const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/connection');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

const getCookieOptions = (req) => {
  const maxAgeMatch = JWT_EXPIRES_IN.match(/^(\d+)([hdm])$/);
  let maxAgeMs = 24 * 60 * 60 * 1000; // default 24h

  if (maxAgeMatch) {
    const value = parseInt(maxAgeMatch[1], 10);
    const unit = maxAgeMatch[2];
    const multipliers = { h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000, m: 60 * 1000 };
    maxAgeMs = value * multipliers[unit];
  }

  const origin = req?.headers?.origin || '';
  const isHttps = origin.startsWith('https://') || req?.headers?.['x-forwarded-proto'] === 'https';

  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
};

const authController = {
  login: async (req, res) => {
    try {
      if (!JWT_SECRET) {
        console.error('JWT_SECRET no está configurada');
        return res.status(500).json({ error: 'Configuración de seguridad incompleta' });
      }

      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email y password son requeridos' });
      }

      const user = await db.get(
        `SELECT id_usuario, username, nombre, apellido, email, telefono, id_tipo_usuario, password
         FROM usuario WHERE email = ?`,
        [email]
      );

      if (!user) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      const token = jwt.sign(
        {
          id: user.id_usuario,
          email: user.email,
          tipoUsuario: user.id_tipo_usuario,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      const cookieOptions = getCookieOptions(req);
      console.log('Set-Cookie options:', cookieOptions, 'x-forwarded-proto:', req.headers['x-forwarded-proto'], 'origin:', req.headers.origin);
      res.cookie('token', token, cookieOptions);

      res.json({
        id: user.id_usuario,
        username: user.username,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        telefono: user.telefono,
        tipoUsuario: user.id_tipo_usuario,
      });
    } catch (error) {
      console.error('Error en login:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  logout: (req, res) => {
    const origin = req?.headers?.origin || '';
    const isHttps = origin.startsWith('https://') || req?.headers?.['x-forwarded-proto'] === 'https';
    res.clearCookie('token', {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? 'none' : 'lax',
      path: '/',
    });
    res.json({ message: 'Sesión cerrada exitosamente' });
  },

  me: async (req, res) => {
    try {
      const user = await db.get(
        `SELECT id_usuario, username, nombre, apellido, email, telefono, id_tipo_usuario
         FROM usuario WHERE id_usuario = ?`,
        [req.user.id]
      );

      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      res.json({
        id: user.id_usuario,
        username: user.username,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        telefono: user.telefono,
        tipoUsuario: user.id_tipo_usuario,
      });
    } catch (error) {
      console.error('Error en me:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },
};

module.exports = authController;
