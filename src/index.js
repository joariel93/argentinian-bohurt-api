require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const lookupsRoutes = require('./routes/lookups');
const clubsRoutes = require('./routes/clubs');
const teamsRoutes = require('./routes/teams');
const tournamentsRoutes = require('./routes/tournaments');
const organizersRoutes = require('./routes/organizers');
const newsRoutes = require('./routes/news');
const marshallsRoutes = require('./routes/marshalls');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const uploadRoutes = require('./routes/upload');

const initSchema = require('./database/schema');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://bohurtargentina.vercel.app',
  'https://marshalls-bohurt-app.vercel.app',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS bloqueado para origen: ${origin}`);
      callback(new Error('Origen no permitido por CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

app.use('/api', lookupsRoutes);
app.use('/api', clubsRoutes);
app.use('/api', teamsRoutes);
app.use('/api', tournamentsRoutes);
app.use('/api', organizersRoutes);
app.use('/api', newsRoutes);
app.use('/api', marshallsRoutes);
app.use('/api', authRoutes);
app.use('/api', usersRoutes);
app.use('/api', uploadRoutes);

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
