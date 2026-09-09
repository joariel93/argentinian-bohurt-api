const db = require('./connection');
const initSchema = require('./schema');
const bcrypt = require('bcryptjs');

const KEY = 'buhurt-marshall-dni';
function encryptDni(dni) {
  const keyBytes = [...KEY].map((c) => c.charCodeAt(0));
  const bytes = [...String(dni)].map((c, i) => c.charCodeAt(0) ^ keyBytes[i % keyBytes.length]);
  return Buffer.from(bytes).toString('base64');
}

const seedDemo = async () => {
  await initSchema();

  const hashedPass = bcrypt.hashSync('pass', 10);
  const hashedAdmin = bcrypt.hashSync('admin', 10);

  // Marshall (tipo 5) y Organizador (tipo 2) para login
  await db.run(
    `INSERT OR REPLACE INTO usuario (id_usuario, username, password, nombre, apellido, email, id_tipo_usuario)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['user-marshall-1', 'marshall@test.com', '', 'Carlos', 'Rodriguez', 'marshall@test.com', 5]
  );
  await db.run(
    `INSERT OR REPLACE INTO usuario (id_usuario, username, password, nombre, apellido, email, id_tipo_usuario)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['user-org-1', 'org@test.com', hashedPass, 'Org', 'Organizador', 'org@test.com', 2]
  );

  // Administrador (tipo 1) para panel de administración
  await db.run(
    `INSERT OR REPLACE INTO usuario (id_usuario, username, password, nombre, apellido, email, id_tipo_usuario)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['user-admin-1', 'admin@test.com', hashedAdmin, 'Admin', 'Principal', 'admin@test.com', 1]
  );

  // Luchadores (tipo 4), username = DNI encriptado
  const luchadores = [
    ['user-f1', 'Juan', 'Pérez', '30123456'],
    ['user-f2', 'Pedro', 'Gómez', '30234567'],
    ['user-f3', 'Lucas', 'Díaz', '30345678'],
    ['user-f4', 'Mateo', 'Fernández', '30456789'],
    ['user-f5', 'Santiago', 'López', '30567890'],
    ['user-f6', 'Nicolás', 'Martínez', '30678901'],
    ['user-f7', 'Federico', 'Ruiz', '31012345'],
    ['user-f8', 'Agustín', 'Álvarez', '31123456'],
  ];
  for (const [id, nombre, apellido, dni] of luchadores) {
    await db.run(
      `INSERT OR REPLACE INTO usuario (id_usuario, username, password, nombre, apellido, id_tipo_usuario)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, encryptDni(dni), '', nombre, apellido, 4]
    );
  }

  // Clubes
  const clubes = [
    ['club-001', 'Club Norte', 'Buenos Aires', '2010-01-01'],
    ['club-002', 'Club Sur', 'Córdoba', '2012-05-01'],
  ];
  for (const [id, nombre, pais, fundacion] of clubes) {
    await db.run(
      `INSERT OR REPLACE INTO club (id_club, nombre, pais, fundacion) VALUES (?, ?, ?, ?)`,
      [id, nombre, pais, fundacion]
    );
  }

  // Equipos
  const equipos = [
    ['equipo-001', 'Mercenarios', 1, 2, 7],
    ['equipo-002', 'Guardianes', 1, 3, 2],
    ['equipo-003', 'Acero', 4, 11, 1],
    ['equipo-004', 'Fénix', 3, 6, 7],
  ];
  for (const [id, nombre, c1, c2, c3] of equipos) {
    await db.run(
      `INSERT OR REPLACE INTO equipo (id_equipo, nombre, logo, id_color1, id_color2, id_color3, id_categoria, id_modalidad, id_genero)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, nombre, null, c1, c2, c3, 1, 1, 1]
    );
  }

  // Relación club -> equipos (Club Norte: Mercenarios + Guardianes; Club Sur: Acero + Fénix)
  const clubEquipos = [
    ['club-001', 'equipo-001'],
    ['club-001', 'equipo-002'],
    ['club-002', 'equipo-003'],
    ['club-002', 'equipo-004'],
  ];
  for (const [idClub, idEquipo] of clubEquipos) {
    await db.run(
      `INSERT OR REPLACE INTO club_equipos (id_club, id_equipo) VALUES (?, ?)`,
      [idClub, idEquipo]
    );
  }

  // Torneo con OTP "ABC123" (sin combates => organizado = false)
  await db.run(
    `INSERT OR REPLACE INTO torneo (id_torneo, nombre, localizacion, fecha_torneo, fecha_cierre_inscripcion, id_modalidad, id_categoria, id_genero, id_tipo_torneo, password)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['torneo-001', 'Torneo Nacional 2026', 'Buenos Aires', '2026-12-01', '2026-11-15', 1, 1, 1, 1, 'ABC123']
  );

  // Inscripción de equipos (Mercenarios y Acero como cabezas de serie)
  const equiposTorneo = [
    ['equipo-001', 1],
    ['equipo-002', 0],
    ['equipo-003', 1],
    ['equipo-004', 0],
  ];
  for (const [idEquipo, esCabeza] of equiposTorneo) {
    await db.run(
      `INSERT OR REPLACE INTO torneo_equipo (id_equipo, id_torneo, posicion, cantidad_combates, cantidad_victorias, cantidad_derrotas, cantidad_rounds_ganados, cantidad_rounds_perdidos, es_cabeza_serie)
       VALUES (?, ?, NULL, 0, 0, 0, 0, 0, ?)`,
      [idEquipo, 'torneo-001', esCabeza]
    );
  }

  // Peleadores inscriptos por equipo
  const inscripciones = [
    ['equipo-001', 'user-f1', 1],
    ['equipo-001', 'user-f2', 2],
    ['equipo-002', 'user-f3', 1],
    ['equipo-002', 'user-f4', 2],
    ['equipo-003', 'user-f5', 1],
    ['equipo-003', 'user-f6', 2],
    ['equipo-004', 'user-f7', 1],
    ['equipo-004', 'user-f8', 2],
  ];
  for (const [idEquipo, idUsuario, numero] of inscripciones) {
    await db.run(
      `INSERT OR REPLACE INTO torneo_equipo_peleador (id_torneo, id_equipo, id_usuario, numero_peleador, cantidad_amarillas, descalificado)
       VALUES (?, ?, ?, ?, 0, 0)`,
      ['torneo-001', idEquipo, idUsuario, numero]
    );
  }

  console.log('Demo seed completado: usuario marshall@test.com, torneo con OTP ABC123');
};

if (require.main === module) {
  seedDemo()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error en seed-demo:', err);
      process.exit(1);
    });
}

module.exports = seedDemo;
