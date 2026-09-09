const roleMiddleware = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    if (!allowedRoles.includes(req.user.tipoUsuario)) {
      return res.status(403).json({ error: 'No tiene permisos para realizar esta acción' });
    }

    next();
  };
};

module.exports = roleMiddleware;
