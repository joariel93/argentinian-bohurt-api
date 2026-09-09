const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

const authMiddleware = (req, res, next) => {
  if (!JWT_SECRET) {
    console.error('JWT_SECRET no está configurada');
    return res.status(500).json({ error: 'Configuración de seguridad incompleta' });
  }

  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.id,
      email: decoded.email,
      tipoUsuario: decoded.tipoUsuario,
    };
    next();
  } catch (error) {
    console.error('Error validando token:', error.message);
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

module.exports = authMiddleware;
