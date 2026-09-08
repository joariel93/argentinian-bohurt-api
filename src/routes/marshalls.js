const express = require('express');
const router = express.Router();
const marshallsController = require('../controllers/marshallsController');
const usuariosController = require('../controllers/usuariosController');
const apiKeyMiddleware = require('../middleware/apiKeyMiddleware');

// Auth
router.post('/v1/marshall/auth/login', usuariosController.login);

// Usuarios (luchadores)
router.get('/v1/marshall/usuarios', usuariosController.buscarPorUsername);
router.post('/v1/marshall/usuarios', apiKeyMiddleware, usuariosController.crear);

// Acceso a torneo
router.post('/v1/marshall/torneo/acceso', apiKeyMiddleware, marshallsController.acceso);

// Combates
router.get('/v1/marshall/torneo/:idTorneo/combates', marshallsController.getCombates);
router.post('/v1/marshall/torneo/:idTorneo/estructura', apiKeyMiddleware, marshallsController.crearEstructura);
router.post('/v1/marshall/torneo/:idTorneo/combate', apiKeyMiddleware, marshallsController.createCombate);
router.post('/v1/marshall/torneo/:idTorneo/generar-combates', apiKeyMiddleware, marshallsController.generarCombates);
router.post('/v1/marshall/torneo/:idTorneo/combate/:idCombate/round', apiKeyMiddleware, marshallsController.grabarRound);
router.post('/v1/marshall/torneo/:idTorneo/combate/:idCombate/cerrar', apiKeyMiddleware, marshallsController.cerrarCombate);
router.delete('/v1/marshall/torneo/:idTorneo/combate/:idCombate', apiKeyMiddleware, marshallsController.deleteCombate);
router.delete('/v1/marshall/torneo/:idTorneo/combates', apiKeyMiddleware, marshallsController.deleteCombates);

// Equipos
router.get('/v1/marshall/torneo/:idTorneo/equipos', marshallsController.getEquipos);
router.post('/v1/marshall/torneo/:idTorneo/equipo', apiKeyMiddleware, marshallsController.crearEquipoCoalicion);
router.delete('/v1/marshall/torneo/:idTorneo/equipo/:idEquipo', apiKeyMiddleware, marshallsController.eliminarEquipo);
router.put('/v1/marshall/torneo/:idTorneo/equipo/:idEquipo/cabeza-serie', apiKeyMiddleware, marshallsController.setCabezaSerie);

// Sorteo dirigido (sugerencia, no persiste)
router.post('/v1/marshall/torneo/:idTorneo/sorteo', apiKeyMiddleware, marshallsController.sorteo);

// Peleadores
router.post('/v1/marshall/torneo/:idTorneo/equipo/:idEquipo/peleador', apiKeyMiddleware, marshallsController.inscribirPeleador);
router.delete('/v1/marshall/torneo/:idTorneo/equipo/:idEquipo/peleador/:idUsuario', apiKeyMiddleware, marshallsController.eliminarPeleador);
router.put('/v1/marshall/torneo/:idTorneo/equipos/peleadores/numeros', apiKeyMiddleware, marshallsController.guardarNumerosPeleadores);

// Grupos
router.get('/v1/marshall/torneo/:idTorneo/grupos', marshallsController.getGrupos);
router.put('/v1/marshall/torneo/:idTorneo/grupos', apiKeyMiddleware, marshallsController.guardarGrupos);

// Estadísticas
router.get('/v1/marshall/torneo/:idTorneo/estadisticas', marshallsController.getEstadisticas);

module.exports = router;
