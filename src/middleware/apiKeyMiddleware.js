const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

const apiKeyMiddleware = (req, res, next) => {
  if (!ADMIN_API_KEY) {
    console.error('ADMIN_API_KEY no está configurada');
    return res.status(500).json({ error: 'Configuración de seguridad incompleta' });
  }

  const providedKey = req.headers['x-api-key'];

  if (!providedKey || providedKey !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  next();
};

module.exports = apiKeyMiddleware;
