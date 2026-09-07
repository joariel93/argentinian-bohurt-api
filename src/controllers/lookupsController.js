const db = require('../database/connection');

const lookupsController = {
  getColores: async (req, res) => {
    const rows = await db.all('SELECT id_color AS id, nombre AS valor FROM colores ORDER BY id_color');
    res.json(rows);
  },

  getGenero: async (req, res) => {
    const rows = await db.all('SELECT id_genero AS id, nombre AS valor FROM genero ORDER BY id_genero');
    res.json(rows);
  },

  getModalidad: async (req, res) => {
    const rows = await db.all('SELECT id_modalidad AS id, nombre AS valor FROM modalidad ORDER BY id_modalidad');
    res.json(rows);
  },

  getCategorias: async (req, res) => {
    const { idModalidad } = req.params;
    const rows = await db.all(
      'SELECT id_categoria AS id, nombre AS valor FROM categoria WHERE id_modalidad = ? ORDER BY id_categoria',
      [idModalidad]
    );
    res.json(rows);
  },

  getTipoTorneo: async (req, res) => {
    const rows = await db.all('SELECT id_tipo_torneo AS id, nombre AS valor FROM tipo_torneo ORDER BY id_tipo_torneo');
    res.json(rows);
  },

  getTipoUsuario: async (req, res) => {
    const rows = await db.all('SELECT id_tipo_usuario AS id, nombre AS valor FROM tipo_usuario ORDER BY id_tipo_usuario');
    res.json(rows);
  },

  getRedesSociales: async (req, res) => {
    const rows = await db.all('SELECT id_red_social AS id, nombre AS valor FROM redes_sociales ORDER BY id_red_social');
    res.json(rows);
  },

  getReglamento: async (req, res) => {
    const rows = await db.all('SELECT id_reglamento AS id, nombre AS valor FROM reglamento ORDER BY id_reglamento');
    res.json(rows);
  },
};

module.exports = lookupsController;
