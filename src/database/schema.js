const db = require('./connection');

const createTables = async () => {
  // ---- LOOKUP TABLES (INTEGER PKs) ----

  await db.run(`CREATE TABLE IF NOT EXISTS tipo_usuario (
    id_tipo_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS colores (
    id_color INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    hex TEXT NOT NULL
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS genero (
    id_genero INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS modalidad (
    id_modalidad INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS categoria (
    id_categoria INTEGER NOT NULL,
    id_modalidad INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    cantidad_peleadores INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (id_categoria, id_modalidad),
    FOREIGN KEY (id_modalidad) REFERENCES modalidad(id_modalidad)
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS tipo_torneo (
    id_tipo_torneo INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    con_grupos INTEGER NOT NULL DEFAULT 0,
    con_eliminatorias INTEGER NOT NULL DEFAULT 0
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS redes_sociales (
    id_red_social INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    icono TEXT
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS reglamento (
    id_reglamento INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    link TEXT
  )`);

  // ---- MAIN ENTITIES (TEXT PKs - GUID) ----

  await db.run(`CREATE TABLE IF NOT EXISTS usuario (
    id_usuario TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL,
    email TEXT,
    telefono TEXT,
    id_tipo_usuario INTEGER NOT NULL,
    FOREIGN KEY (id_tipo_usuario) REFERENCES tipo_usuario(id_tipo_usuario)
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS luchador (
    id_usuario TEXT PRIMARY KEY,
    fecha_nacimiento TEXT NOT NULL,
    nombre_contacto_emergencia TEXT,
    telefono_contacto_emergencia TEXT,
    domicilio TEXT,
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS club (
    id_club TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    pais TEXT,
    logo TEXT,
    fundacion TEXT NOT NULL,
    info TEXT
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS equipo (
    id_equipo TEXT PRIMARY KEY,
    logo TEXT,
    nombre TEXT NOT NULL,
    fecha_creacion TEXT,
    id_color1 INTEGER NOT NULL DEFAULT 1,
    id_color2 INTEGER NOT NULL DEFAULT 2,
    id_color3 INTEGER NOT NULL DEFAULT 3,
    id_categoria INTEGER NOT NULL DEFAULT 1,
    id_modalidad INTEGER NOT NULL DEFAULT 1,
    id_genero INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (id_color1) REFERENCES colores(id_color),
    FOREIGN KEY (id_color2) REFERENCES colores(id_color),
    FOREIGN KEY (id_color3) REFERENCES colores(id_color),
    FOREIGN KEY (id_categoria, id_modalidad) REFERENCES categoria(id_categoria, id_modalidad),
    FOREIGN KEY (id_modalidad) REFERENCES modalidad(id_modalidad),
    FOREIGN KEY (id_genero) REFERENCES genero(id_genero)
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS torneo (
    id_torneo TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    localizacion TEXT NOT NULL,
    fecha_torneo TEXT NOT NULL,
    fecha_cierre_inscripcion TEXT NOT NULL,
    id_organizador TEXT,
    id_reglamento INTEGER NOT NULL DEFAULT 1,
    id_genero INTEGER NOT NULL DEFAULT 1,
    id_categoria INTEGER NOT NULL DEFAULT 1,
    id_modalidad INTEGER NOT NULL DEFAULT 1,
    id_tipo_torneo INTEGER,
    imagen TEXT,
    link_transmision TEXT,
    password TEXT,
    FOREIGN KEY (id_organizador) REFERENCES usuario(id_usuario),
    FOREIGN KEY (id_reglamento) REFERENCES reglamento(id_reglamento),
    FOREIGN KEY (id_genero) REFERENCES genero(id_genero),
    FOREIGN KEY (id_categoria, id_modalidad) REFERENCES categoria(id_categoria, id_modalidad),
    FOREIGN KEY (id_modalidad) REFERENCES modalidad(id_modalidad),
    FOREIGN KEY (id_tipo_torneo) REFERENCES tipo_torneo(id_tipo_torneo)
  )`);

  const torneoCols = await db.all(`PRAGMA table_info(torneo)`);
  if (!torneoCols.some((c) => c.name === 'link_transmision')) {
    await db.run(`ALTER TABLE torneo ADD COLUMN link_transmision TEXT`);
  }

  await db.run(`CREATE TABLE IF NOT EXISTS organizacion_torneo (
    id_torneo TEXT PRIMARY KEY,
    id_tipo_torneo INTEGER NOT NULL,
    cantidad_grupos INTEGER,
    FOREIGN KEY (id_torneo) REFERENCES torneo(id_torneo),
    FOREIGN KEY (id_tipo_torneo) REFERENCES tipo_torneo(id_tipo_torneo)
  )`);

  // ---- JUNCTION TABLES ----

  await db.run(`CREATE TABLE IF NOT EXISTS club_equipos (
    id_club TEXT NOT NULL,
    id_equipo TEXT NOT NULL,
    PRIMARY KEY (id_club, id_equipo),
    FOREIGN KEY (id_club) REFERENCES club(id_club),
    FOREIGN KEY (id_equipo) REFERENCES equipo(id_equipo)
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS club_redes_sociales (
    id_club TEXT NOT NULL,
    id_red_social INTEGER NOT NULL,
    link TEXT,
    PRIMARY KEY (id_club, id_red_social),
    FOREIGN KEY (id_club) REFERENCES club(id_club),
    FOREIGN KEY (id_red_social) REFERENCES redes_sociales(id_red_social)
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS equipo_peleador (
    id_equipo TEXT NOT NULL,
    id_usuario TEXT NOT NULL,
    PRIMARY KEY (id_equipo, id_usuario),
    FOREIGN KEY (id_equipo) REFERENCES equipo(id_equipo),
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS equipo_redes_sociales (
    id_equipo TEXT NOT NULL,
    id_red_social INTEGER NOT NULL,
    link TEXT,
    PRIMARY KEY (id_equipo, id_red_social),
    FOREIGN KEY (id_equipo) REFERENCES equipo(id_equipo),
    FOREIGN KEY (id_red_social) REFERENCES redes_sociales(id_red_social)
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS equipos_por_grupo (
    id_torneo TEXT NOT NULL,
    id_equipo TEXT NOT NULL,
    grupo INTEGER NOT NULL,
    PRIMARY KEY (id_torneo, id_equipo),
    FOREIGN KEY (id_torneo) REFERENCES torneo(id_torneo),
    FOREIGN KEY (id_equipo) REFERENCES equipo(id_equipo)
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS torneo_equipo (
    id_equipo TEXT NOT NULL,
    id_torneo TEXT NOT NULL,
    posicion INTEGER,
    cantidad_combates INTEGER DEFAULT 0,
    cantidad_victorias INTEGER DEFAULT 0,
    cantidad_derrotas INTEGER DEFAULT 0,
    cantidad_rounds_ganados INTEGER DEFAULT 0,
    cantidad_rounds_perdidos INTEGER DEFAULT 0,
    cantidad_hombres_en_pie INTEGER DEFAULT 0,
    es_cabeza_serie INTEGER DEFAULT 0,
    PRIMARY KEY (id_equipo, id_torneo),
    FOREIGN KEY (id_equipo) REFERENCES equipo(id_equipo),
    FOREIGN KEY (id_torneo) REFERENCES torneo(id_torneo)
  )`);

  const teCols = await db.all(`PRAGMA table_info(torneo_equipo)`);
  if (!teCols.some((c) => c.name === 'cantidad_hombres_en_pie')) {
    await db.run(`ALTER TABLE torneo_equipo ADD COLUMN cantidad_hombres_en_pie INTEGER DEFAULT 0`);
  }
  if (!teCols.some((c) => c.name === 'es_cabeza_serie')) {
    await db.run(`ALTER TABLE torneo_equipo ADD COLUMN es_cabeza_serie INTEGER DEFAULT 0`);
  }

  await db.run(`CREATE TABLE IF NOT EXISTS torneo_equipo_peleador (
    id_torneo TEXT NOT NULL,
    id_equipo TEXT NOT NULL,
    id_usuario TEXT NOT NULL,
    numero_peleador INTEGER NOT NULL,
    cantidad_amarillas INTEGER DEFAULT 0,
    descalificado INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (id_torneo, id_equipo, id_usuario),
    FOREIGN KEY (id_torneo) REFERENCES torneo(id_torneo),
    FOREIGN KEY (id_equipo) REFERENCES equipo(id_equipo),
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS torneo_luchador (
    id_torneo TEXT NOT NULL,
    id_usuario TEXT NOT NULL,
    cantidad_combates INTEGER DEFAULT 0,
    cantidad_puntos INTEGER,
    cantidad_victorias INTEGER DEFAULT 0,
    cantidad_derrotas INTEGER DEFAULT 0,
    cantidad_rounds_ganados INTEGER DEFAULT 0,
    cantidad_rounds_perdidos INTEGER DEFAULT 0,
    cantidad_rounds_en_pie INTEGER,
    PRIMARY KEY (id_torneo, id_usuario),
    FOREIGN KEY (id_torneo) REFERENCES torneo(id_torneo),
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS torneo_redes_sociales (
    id_torneo TEXT NOT NULL,
    id_red_social INTEGER NOT NULL,
    link TEXT,
    PRIMARY KEY (id_torneo, id_red_social),
    FOREIGN KEY (id_torneo) REFERENCES torneo(id_torneo),
    FOREIGN KEY (id_red_social) REFERENCES redes_sociales(id_red_social)
  )`);

  // ---- COMBAT TABLES ----

  await db.run(`CREATE TABLE IF NOT EXISTS combate (
    id_torneo TEXT NOT NULL,
    id_combate TEXT NOT NULL,
    link TEXT,
    orden INTEGER NOT NULL,
    fase TEXT,
    grupo TEXT,
    ronda TEXT,
    nivel INTEGER,
    origen_a TEXT,
    origen_b TEXT,
    id_combate_origen_a TEXT,
    id_combate_origen_b TEXT,
    grupo_origen_a TEXT,
    grupo_origen_b TEXT,
    posicion_origen_a INTEGER,
    posicion_origen_b INTEGER,
    cantidad_round_ganados_ganador INTEGER DEFAULT 0,
    cantidad_round_ganados_perdedor INTEGER DEFAULT 0,
    id_equipo_a TEXT,
    id_equipo_b TEXT,
    id_equipo_ganador TEXT,
    PRIMARY KEY (id_torneo, id_combate),
    FOREIGN KEY (id_torneo) REFERENCES torneo(id_torneo),
    FOREIGN KEY (id_equipo_a) REFERENCES equipo(id_equipo),
    FOREIGN KEY (id_equipo_b) REFERENCES equipo(id_equipo),
    FOREIGN KEY (id_equipo_ganador) REFERENCES equipo(id_equipo)
  )`);

  // Migración: si la tabla venía con el esquema viejo, se reconstruye preservando datos.
  const combateCols = await db.all(`PRAGMA table_info(combate)`);
  const hasOrigen = combateCols.some((c) => c.name === 'origen_a');
  if (!hasOrigen) {
    for (const col of [
      { name: 'link', ddl: 'TEXT' },
      { name: 'fase', ddl: 'TEXT' },
      { name: 'grupo', ddl: 'TEXT' },
      { name: 'ronda', ddl: 'TEXT' },
    ]) {
      if (!combateCols.some((c) => c.name === col.name)) {
        await db.run(`ALTER TABLE combate ADD COLUMN ${col.name} ${col.ddl}`);
      }
    }

    try {
      await db.run('PRAGMA foreign_keys=OFF');
    } catch (pragmaErr) {
      console.warn('No se pudo desactivar foreign_keys (esperado en Turso):', pragmaErr.message);
    }
    await db.run(`CREATE TABLE combate_new (
      id_torneo TEXT NOT NULL,
      id_combate TEXT NOT NULL,
      link TEXT,
      orden INTEGER NOT NULL,
      fase TEXT,
      grupo TEXT,
      ronda TEXT,
      nivel INTEGER,
      origen_a TEXT,
      origen_b TEXT,
      id_combate_origen_a TEXT,
      id_combate_origen_b TEXT,
      grupo_origen_a TEXT,
      grupo_origen_b TEXT,
      posicion_origen_a INTEGER,
      posicion_origen_b INTEGER,
      cantidad_round_ganados_ganador INTEGER DEFAULT 0,
      cantidad_round_ganados_perdedor INTEGER DEFAULT 0,
      id_equipo_a TEXT,
      id_equipo_b TEXT,
      id_equipo_ganador TEXT,
      PRIMARY KEY (id_torneo, id_combate),
      FOREIGN KEY (id_torneo) REFERENCES torneo(id_torneo),
      FOREIGN KEY (id_equipo_a) REFERENCES equipo(id_equipo),
      FOREIGN KEY (id_equipo_b) REFERENCES equipo(id_equipo),
      FOREIGN KEY (id_equipo_ganador) REFERENCES equipo(id_equipo)
    )`);
    await db.run(`INSERT INTO combate_new
      (id_torneo, id_combate, link, orden, fase, grupo, ronda,
       cantidad_round_ganados_ganador, cantidad_round_ganados_perdedor,
       id_equipo_a, id_equipo_b, id_equipo_ganador, origen_a, origen_b)
      SELECT id_torneo, id_combate, link, orden, fase, grupo, ronda,
       cantidad_round_ganados_ganador, cantidad_round_ganados_perdedor,
       id_equipo_a, id_equipo_b, id_equipo_ganador, 'equipo', 'equipo'
      FROM combate`);
    await db.run(`DROP TABLE combate`);
    await db.run(`ALTER TABLE combate_new RENAME TO combate`);
    try {
      await db.run('PRAGMA foreign_keys=ON');
    } catch (pragmaErr) {
      console.warn('No se pudo reactivar foreign_keys (esperado en Turso):', pragmaErr.message);
    }
  }

  await db.run(`CREATE TABLE IF NOT EXISTS fase_torneo (
    id_torneo TEXT NOT NULL,
    orden INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    cantidad_grupos INTEGER,
    clasifican_por_grupo INTEGER,
    tercer_puesto INTEGER DEFAULT 0,
    PRIMARY KEY (id_torneo, orden),
    FOREIGN KEY (id_torneo) REFERENCES torneo(id_torneo)
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS round_combate (
    id_torneo TEXT NOT NULL,
    id_combate TEXT NOT NULL,
    orden INTEGER NOT NULL,
    round INTEGER NOT NULL,
    id_equipo_ganador TEXT,
    puntos_ganador INTEGER DEFAULT 0,
    puntos_perdedor INTEGER DEFAULT 0,
    PRIMARY KEY (id_torneo, id_combate, orden, round),
    FOREIGN KEY (id_torneo, id_combate) REFERENCES combate(id_torneo, id_combate),
    FOREIGN KEY (id_equipo_ganador) REFERENCES equipo(id_equipo)
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS round_peleador (
    id_torneo TEXT NOT NULL,
    id_combate TEXT NOT NULL,
    orden INTEGER NOT NULL,
    round INTEGER NOT NULL,
    id_usuario TEXT NOT NULL,
    en_pie INTEGER NOT NULL DEFAULT 1,
    amonestado INTEGER NOT NULL DEFAULT 0,
    expulsado INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (id_torneo, id_combate, orden, round, id_usuario),
    FOREIGN KEY (id_torneo, id_combate, orden, round) REFERENCES round_combate(id_torneo, id_combate, orden, round),
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
  )`);

  // ---- APP-SPECIFIC TABLES ----

  await db.run(`CREATE TABLE IF NOT EXISTS noticia (
    id_noticia INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    subtitulo TEXT,
    descripcion TEXT,
    imagen TEXT,
    fecha TEXT,
    autor TEXT,
    cuerpo TEXT
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS refresh_token (
    id_refresh_token TEXT PRIMARY KEY,
    id_usuario TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME,
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
  )`);

  console.log('Tablas creadas correctamente');
};

module.exports = createTables;
