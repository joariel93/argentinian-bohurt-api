const db = require('../database/connection');

const newsController = {
  getAll: async (req, res) => {
    const rows = await db.all(
      `SELECT id_noticia AS id, titulo, subtitulo, imagen, fecha, autor
       FROM noticia ORDER BY fecha DESC`
    );
    res.json(rows);
  },

  getById: async (req, res) => {
    const { id } = req.params;
    const row = await db.get(
      `SELECT id_noticia AS id, titulo, subtitulo, descripcion, imagen, fecha, autor, cuerpo
       FROM noticia WHERE id_noticia = ?`,
      [id]
    );
    if (!row) return res.status(404).json({ error: 'Noticia no encontrada' });
    res.json(row);
  },

  create: async (req, res) => {
    const { titulo, subtitulo, descripcion, imagen, fecha, autor, cuerpo } = req.body;
    if (!titulo) return res.status(400).json({ error: 'titulo es requerido' });

    const result = await db.run(
      `INSERT INTO noticia (titulo, subtitulo, descripcion, imagen, fecha, autor, cuerpo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [titulo, subtitulo || null, descripcion || null, imagen || null, fecha || null, autor || null, cuerpo || null]
    );

    res.status(201).json({ id: result.lastID, message: 'Noticia creada exitosamente' });
  },

  update: async (req, res) => {
    const { id } = req.params;
    const existing = await db.get(`SELECT id_noticia FROM noticia WHERE id_noticia = ?`, [id]);
    if (!existing) return res.status(404).json({ error: 'Noticia no encontrada' });

    const updates = req.body;
    const allowedFields = ['titulo', 'subtitulo', 'descripcion', 'imagen', 'fecha', 'autor', 'cuerpo'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length > 0) {
      values.push(id);
      await db.run(`UPDATE noticia SET ${fields.join(', ')} WHERE id_noticia = ?`, values);
    }

    res.json({ message: 'Noticia actualizada exitosamente' });
  },

  delete: async (req, res) => {
    const { id } = req.params;
    const existing = await db.get(`SELECT id_noticia FROM noticia WHERE id_noticia = ?`, [id]);
    if (!existing) return res.status(404).json({ error: 'Noticia no encontrada' });

    await db.run(`DELETE FROM noticia WHERE id_noticia = ?`, [id]);
    res.json({ message: 'Noticia eliminada exitosamente' });
  },
};

module.exports = newsController;
