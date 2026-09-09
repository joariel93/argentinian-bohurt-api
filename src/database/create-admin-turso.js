require('dotenv').config();
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function createAdmin() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!url || !authToken || !email || !password) {
    console.error('Faltan variables de entorno: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, ADMIN_EMAIL, ADMIN_PASSWORD');
    process.exit(1);
  }

  const client = createClient({ url, authToken });

  try {
    const existing = await client.execute({
      sql: 'SELECT id_usuario FROM usuario WHERE email = ?',
      args: [email],
    });

    if (existing.rows.length > 0) {
      console.log(`Ya existe un usuario con el email ${email}.`);
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const idUsuario = uuidv4();

    await client.execute({
      sql: `INSERT INTO usuario (id_usuario, username, password, nombre, apellido, email, telefono, id_tipo_usuario)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [idUsuario, email, hashedPassword, 'Admin', 'Principal', email, null, 1],
    });

    console.log(`Usuario admin creado exitosamente: ${email}`);
  } catch (error) {
    console.error('Error creando usuario admin:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

createAdmin();
