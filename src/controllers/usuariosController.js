const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const db = require('../database/connection');
const { v4: uuidv4 } = require('uuid');
const refreshTokenService = require('../services/refreshTokenService');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS || '7', 10);

const TIPOS_HABILITADOS = [1, 2, 5]; // Admin, Organizador, Marshall

const parseMaxAge = (duration) => {
  const match = duration.match(/^(\d+)([hdm])$/);
  if (!match) return 15 * 60 * 1000;
  const value = parseInt(match[1], 10);
  const multipliers = { h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000, m: 60 * 1000 };
  return value * multipliers[match[2]];
};

const isSecureRequest = (req) => {
  const origin = req?.headers?.origin || '';
  return origin.startsWith('https://') || req?.headers?.['x-forwarded-proto'] === 'https';
};

const getCookieOptions = (req, maxAge) => {
  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path: '/',
    maxAge,
  };
};

const setAuthCookies = (res, req, accessToken, refreshTokenRaw, refreshExpiresAt) => {
  const accessMaxAge = parseMaxAge(ACCESS_TOKEN_EXPIRES_IN);
  const refreshMaxAge = refreshExpiresAt.getTime() - Date.now();
  res.cookie('access_token', accessToken, getCookieOptions(req, accessMaxAge));
  res.cookie('refresh_token', refreshTokenRaw, getCookieOptions(req, refreshMaxAge));
};

const createAccessToken = (user) => {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    {
      id: user.id_usuario,
      email: user.email,
      tipoUsuario: user.id_tipo_usuario,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
};

const buildUserResponse = (user) => ({
  id: user.id_usuario,
  nombre: user.nombre,
  apellido: user.apellido,
  email: user.email,
  tipoUsuario: user.id_tipo_usuario,
});

const usuariosController = {
  loginMarshall: async (req, res) => {
    try {
      if (!JWT_SECRET) {
        return res.status(500).json({ error: 'Configuración de seguridad incompleta' });
      }

      const { email, password } = req.body;

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

      const accessToken = createAccessToken(user);
      const { rawToken: refreshTokenRaw, expiresAt } = await refreshTokenService.create(
        user.id_usuario,
        REFRESH_TOKEN_EXPIRES_IN_DAYS
      );

      setAuthCookies(res, req, accessToken, refreshTokenRaw, expiresAt);
      res.json(buildUserResponse(user));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  loginGoogle: async (req, res) => {
    try {
      if (!JWT_SECRET) {
        return res.status(500).json({ error: 'Configuración de seguridad incompleta' });
      }

      if (!GOOGLE_CLIENT_ID) {
        return res.status(500).json({ error: 'GOOGLE_CLIENT_ID no configurado' });
      }

      const { idToken } = req.body;
      const client = new OAuth2Client(GOOGLE_CLIENT_ID);

      let ticket;
      try {
        ticket = await client.verifyIdToken({
          idToken,
          audience: GOOGLE_CLIENT_ID,
        });
      } catch (err) {
        console.error('Error validando token de Google:', err);
        return res.status(401).json({ error: 'Token de Google inválido' });
      }

      const payload = ticket.getPayload();
      const email = payload.email;
      const nombre = payload.given_name || payload.name || '';
      const apellido = payload.family_name || '';

      if (!email) {
        return res.status(400).json({ error: 'El token de Google no contiene email' });
      }

      let user = await db.get(
        `SELECT id_usuario, nombre, apellido, email, id_tipo_usuario
         FROM usuario WHERE email = ?`,
        [email]
      );

      if (!user) {
        // Crear usuario automáticamente como marshall (tipo 5)
        const idUsuario = uuidv4();
        await db.run(
          `INSERT INTO usuario (id_usuario, username, password, nombre, apellido, email, telefono, id_tipo_usuario)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [idUsuario, email, '', nombre, apellido, email, null, 5]
        );
        user = {
          id_usuario: idUsuario,
          nombre,
          apellido,
          email,
          id_tipo_usuario: 5,
        };
      }

      if (!TIPOS_HABILITADOS.includes(user.id_tipo_usuario)) {
        return res.status(403).json({ error: 'Usuario no habilitado para esta aplicación' });
      }

      const accessToken = createAccessToken(user);
      const { rawToken: refreshTokenRaw, expiresAt } = await refreshTokenService.create(
        user.id_usuario,
        REFRESH_TOKEN_EXPIRES_IN_DAYS
      );

      setAuthCookies(res, req, accessToken, refreshTokenRaw, expiresAt);
      res.json(buildUserResponse(user));
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
