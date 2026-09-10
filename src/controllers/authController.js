const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/connection');
const refreshTokenService = require('../services/refreshTokenService');

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS || '7', 10);

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

const clearCookieOptions = (req) => {
  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path: '/',
  };
};

const createAccessToken = (user) => {
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

const setAuthCookies = (res, req, accessToken, refreshTokenRaw, refreshExpiresAt) => {
  const accessMaxAge = parseMaxAge(ACCESS_TOKEN_EXPIRES_IN);
  const refreshMaxAge = refreshExpiresAt.getTime() - Date.now();

  res.cookie('access_token', accessToken, getCookieOptions(req, accessMaxAge));
  res.cookie('refresh_token', refreshTokenRaw, getCookieOptions(req, refreshMaxAge));
};

const clearAuthCookies = (res, req) => {
  res.clearCookie('access_token', clearCookieOptions(req));
  res.clearCookie('refresh_token', clearCookieOptions(req));
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

      const accessToken = createAccessToken(user);
      const { rawToken: refreshTokenRaw, expiresAt } = await refreshTokenService.create(
        user.id_usuario,
        REFRESH_TOKEN_EXPIRES_IN_DAYS
      );

      setAuthCookies(res, req, accessToken, refreshTokenRaw, expiresAt);

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

  refresh: async (req, res) => {
    try {
      if (!JWT_SECRET) {
        console.error('JWT_SECRET no está configurada');
        return res.status(500).json({ error: 'Configuración de seguridad incompleta' });
      }

      const refreshToken = req.cookies?.refresh_token;
      if (!refreshToken) {
        return res.status(401).json({ error: 'No autenticado' });
      }

      const tokenRecord = await refreshTokenService.validate(refreshToken);
      if (!tokenRecord) {
        clearAuthCookies(res, req);
        return res.status(401).json({ error: 'Sesión inválida' });
      }

      const user = await db.get(
        `SELECT id_usuario, username, nombre, apellido, email, telefono, id_tipo_usuario
         FROM usuario WHERE id_usuario = ?`,
        [tokenRecord.id_usuario]
      );

      if (!user) {
        clearAuthCookies(res, req);
        return res.status(401).json({ error: 'Usuario no encontrado' });
      }

      const accessToken = createAccessToken(user);
      const { rawToken: newRefreshTokenRaw, expiresAt } = await refreshTokenService.rotate(
        tokenRecord,
        REFRESH_TOKEN_EXPIRES_IN_DAYS
      );

      setAuthCookies(res, req, accessToken, newRefreshTokenRaw, expiresAt);

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
      console.error('Error en refresh:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  logout: async (req, res) => {
    try {
      const refreshToken = req.cookies?.refresh_token;
      if (refreshToken) {
        const tokenRecord = await refreshTokenService.validate(refreshToken);
        if (tokenRecord) {
          await refreshTokenService.revoke(tokenRecord.id_refresh_token);
        }
      }

      clearAuthCookies(res, req);
      res.json({ message: 'Sesión cerrada exitosamente' });
    } catch (error) {
      console.error('Error en logout:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  logoutAll: async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'No autenticado' });
      }

      await refreshTokenService.revokeAllForUser(userId);
      clearAuthCookies(res, req);
      res.json({ message: 'Sesiones cerradas en todos los dispositivos' });
    } catch (error) {
      console.error('Error en logoutAll:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
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
