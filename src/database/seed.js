const db = require('./connection');
const initSchema = require('./schema');

const seed = async () => {
  await initSchema();

  // ---- TIPO USUARIO ----
  await db.run('INSERT OR REPLACE INTO tipo_usuario (id_tipo_usuario, nombre) VALUES (?, ?)', [1, 'Administrador']);
  await db.run('INSERT OR REPLACE INTO tipo_usuario (id_tipo_usuario, nombre) VALUES (?, ?)', [2, 'Organizador']);
  await db.run('INSERT OR REPLACE INTO tipo_usuario (id_tipo_usuario, nombre) VALUES (?, ?)', [3, 'Club']);
  await db.run('INSERT OR REPLACE INTO tipo_usuario (id_tipo_usuario, nombre) VALUES (?, ?)', [4, 'Luchador']);
  await db.run('INSERT OR REPLACE INTO tipo_usuario (id_tipo_usuario, nombre) VALUES (?, ?)', [5, 'Marshall']);

  // ---- COLORES ----
  const colors = [
    [1, 'Negro', '#000000'],
    [2, 'Blanco', '#ffffff'],
    [3, 'Rojo', '#e00e00'],
    [4, 'Azul', '#000aaa'],
    [5, 'Verde', '#055000'],
    [6, 'Amarillo', '#fff000'],
    [7, 'Naranja', '#ff6a00'],
    [8, 'Rosa', '#ff60ae'],
    [9, 'Violeta', '#670aaa'],
    [10, 'Marron', '#633300'],
    [11, 'Gris', '#707070'],
    [12, 'Celeste', '#3996a2']
  ];
  for (const [id, name, hex] of colors) {
    await db.run('INSERT OR REPLACE INTO colores (id_color, nombre, hex) VALUES (?, ?, ?)', [id, name, hex]);
  }

  // ---- GENERO ----
  await db.run('INSERT OR REPLACE INTO genero (id_genero, nombre) VALUES (?, ?)', [1, 'Masculino']);
  await db.run('INSERT OR REPLACE INTO genero (id_genero, nombre) VALUES (?, ?)', [2, 'Femenino']);

  // ---- MODALIDAD ----
  await db.run('INSERT OR REPLACE INTO modalidad (id_modalidad, nombre) VALUES (?, ?)', [1, 'Bohurt']);
  await db.run('INSERT OR REPLACE INTO modalidad (id_modalidad, nombre) VALUES (?, ?)', [2, 'Duelo']);
  await db.run('INSERT OR REPLACE INTO modalidad (id_modalidad, nombre) VALUES (?, ?)', [3, 'Profight']);

  // ---- CATEGORIA (PK compuesta: id_categoria + id_modalidad) ----
  const categorias = [
    [1, 1, '5 vs 5', 5], [2, 1, '3 vs 3', 3], [3, 1, '12 vs 12', 1], [4, 1, '20 vs 20', 1],
    [1, 2, 'Heraldico', 1], [2, 2, 'Broquel', 1], [3, 2, 'Espada larga', 1], [4, 2, 'Astas', 1],
    [1, 3, '80kg', 1], [2, 3, '90kg', 1], [3, 3, '100kg', 1], [4, 3, '+100kg', 1],
  ];
  for (const [idC, idM, name, cantidad] of categorias) {
    await db.run('INSERT OR REPLACE INTO categoria (id_categoria, id_modalidad, nombre, cantidad_peleadores) VALUES (?, ?, ?, ?)', [idC, idM, name, cantidad]);
  }

  // ---- REDES SOCIALES ----
  const redes = [
    [1, 'Facebook', 'fa-facebook-f'],
    [2, 'Instagram', 'fa-instagram'],
    [3, 'Twitter', 'fa-twitter'],
    [4, 'TikTok', 'fa-tiktok'],
    [5, 'YouTube', 'fa-youtube'],
    [6, 'Twitch', 'fa-twitch'],
    [7, 'Discord', 'fa-discord'],
  ];
  for (const [id, name, icon] of redes) {
    await db.run('INSERT OR REPLACE INTO redes_sociales (id_red_social, nombre, icono) VALUES (?, ?, ?)', [id, name, icon]);
  }

  // ---- REGLAMENTO ----
  await db.run('INSERT OR REPLACE INTO reglamento (id_reglamento, nombre, link) VALUES (?, ?, ?)', [1, 'Buhurt international', 'https://www.buhurtinternational.com/rules']);
  await db.run('INSERT OR REPLACE INTO reglamento (id_reglamento, nombre, link) VALUES (?, ?, ?)', [2, 'Alacom', 'https://alianzamedieval.com/reglamentos-oficiales/']);

  // ---- TIPO TORNEO ----
  await db.run('INSERT OR REPLACE INTO tipo_torneo (id_tipo_torneo, nombre, con_grupos, con_eliminatorias) VALUES (?, ?, ?, ?)', [1, 'Grupos y eliminatorias', 1, 1]);
  await db.run('INSERT OR REPLACE INTO tipo_torneo (id_tipo_torneo, nombre, con_grupos, con_eliminatorias) VALUES (?, ?, ?, ?)', [2, 'Eliminatorias', 0, 1]);
  await db.run('INSERT OR REPLACE INTO tipo_torneo (id_tipo_torneo, nombre, con_grupos, con_eliminatorias) VALUES (?, ?, ?, ?)', [3, 'Liga', 1, 0]);

  console.log('Datos insertados correctamente');
};

if (require.main === module) {
  seed()
    .then(() => {
      console.log('Seed completado');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error en seed:', err);
      process.exit(1);
    });
}

module.exports = seed;
