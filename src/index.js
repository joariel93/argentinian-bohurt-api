require('dotenv').config();
const express = require('express');
const cors = require('cors');

const lookupsRoutes = require('./routes/lookups');
const clubsRoutes = require('./routes/clubs');
const teamsRoutes = require('./routes/teams');
const tournamentsRoutes = require('./routes/tournaments');
const organizersRoutes = require('./routes/organizers');
const newsRoutes = require('./routes/news');
const marshallsRoutes = require('./routes/marshalls');

const initSchema = require('./database/schema');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api', lookupsRoutes);
app.use('/api', clubsRoutes);
app.use('/api', teamsRoutes);
app.use('/api', tournamentsRoutes);
app.use('/api', organizersRoutes);
app.use('/api', newsRoutes);
app.use('/api', marshallsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
  });
});

initSchema() // cambiar a initSchema
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API Buhurt Argentina corriendo en http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error inicializando la DB:', err);
    process.exit(1);
  });

module.exports = { app, asyncHandler };
