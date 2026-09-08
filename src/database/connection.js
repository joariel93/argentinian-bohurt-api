const { createClient } = require('@libsql/client');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const useTurso = process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN;

let dbAsync;

if (useTurso) {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const wrapResult = (result) => ({
    lastID: result.lastInsertRowid != null ? Number(result.lastInsertRowid) : undefined,
    changes: result.rowsAffected,
  });

  dbAsync = {
    run: async (sql, params = []) => {
      const result = await client.execute({ sql, args: params });
      return wrapResult(result);
    },

    get: async (sql, params = []) => {
      const result = await client.execute({ sql, args: params });
      return result.rows[0] ?? null;
    },

    all: async (sql, params = []) => {
      const result = await client.execute({ sql, args: params });
      return result.rows;
    },

    transaction: async (callback) => {
      const transaction = await client.transaction('write');

      const trx = {
        run: async (sql, params = []) => {
          const result = await transaction.execute({ sql, args: params });
          return wrapResult(result);
        },
        get: async (sql, params = []) => {
          const result = await transaction.execute({ sql, args: params });
          return result.rows[0] ?? null;
        },
        all: async (sql, params = []) => {
          const result = await transaction.execute({ sql, args: params });
          return result.rows;
        },
      };

      try {
        const result = await callback(trx);
        await transaction.commit();
        return result;
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    },
  };
} else {
  // Fallback SQLite local para desarrollo offline
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = process.env.DB_PATH || './src/database/buhurt.db';
  const db = new sqlite3.Database(path.resolve(__dirname, '../../', dbPath));

  db.run('PRAGMA foreign_keys = ON');

  const runAsync = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });

  const getAsync = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row ?? null);
      });
    });

  const allAsync = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

  dbAsync = {
    run: runAsync,
    get: getAsync,
    all: allAsync,

    transaction: async (callback) => {
      await new Promise((resolve, reject) => {
        db.run('BEGIN', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const trx = {
        run: runAsync,
        get: getAsync,
        all: allAsync,
      };

      try {
        const result = await callback(trx);
        await new Promise((resolve, reject) => {
          db.run('COMMIT', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        return result;
      } catch (err) {
        await new Promise((resolve) => {
          db.run('ROLLBACK', () => resolve());
        });
        throw err;
      }
    },
  };
}

module.exports = dbAsync;
