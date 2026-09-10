const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/connection');

const REFRESH_TOKEN_BYTES = 64;
const SALT_ROUNDS = 10;

const hashToken = (token) => bcrypt.hashSync(token, SALT_ROUNDS);

const refreshTokenService = {
  generateToken: () => {
    return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
  },

  create: async (idUsuario, expiresInDays = 7) => {
    const rawToken = refreshTokenService.generateToken();
    const tokenHash = hashToken(rawToken);
    const idRefreshToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    await db.run(
      `INSERT INTO refresh_token (id_refresh_token, id_usuario, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [idRefreshToken, idUsuario, tokenHash, expiresAt.toISOString()]
    );

    return { idRefreshToken, rawToken, expiresAt };
  },

  findByHash: async (tokenHash) => {
    return db.get(
      `SELECT * FROM refresh_token WHERE token_hash = ? AND revoked_at IS NULL`,
      [tokenHash]
    );
  },

  validate: async (rawToken) => {
    if (!rawToken) return null;

    // Buscamos por todos los tokens activos del usuario y comparamos con bcrypt.
    // Esto es más lento que un lookup directo, pero necesario porque guardamos hashes.
    const tokens = await db.all(
      `SELECT * FROM refresh_token WHERE revoked_at IS NULL AND expires_at > datetime('now')`
    );

    for (const token of tokens) {
      if (await bcrypt.compare(rawToken, token.token_hash)) {
        return token;
      }
    }

    return null;
  },

  revoke: async (idRefreshToken) => {
    await db.run(
      `UPDATE refresh_token SET revoked_at = datetime('now') WHERE id_refresh_token = ?`,
      [idRefreshToken]
    );
  },

  revokeAllForUser: async (idUsuario) => {
    await db.run(
      `UPDATE refresh_token SET revoked_at = datetime('now') WHERE id_usuario = ? AND revoked_at IS NULL`,
      [idUsuario]
    );
  },

  rotate: async (tokenRecord, expiresInDays = 7) => {
    await refreshTokenService.revoke(tokenRecord.id_refresh_token);
    return refreshTokenService.create(tokenRecord.id_usuario, expiresInDays);
  },

  cleanupExpired: async () => {
    await db.run(
      `DELETE FROM refresh_token WHERE expires_at < datetime('now', '-7 days') OR revoked_at IS NOT NULL`
    );
  },
};

module.exports = refreshTokenService;
