const express = require('express');
const router = express.Router();
const marshallsController = require('../controllers/marshallsController');
const usuariosController = require('../controllers/usuariosController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const MARSHALL_ROLES = [1, 2, 5]; // Admin, Organizador, Marshall

// Auth (sin middleware, es el login mismo)
router.post('/v1/marshall/auth/login', usuariosController.loginMarshall);
router.post('/v1/marshall/auth/google', usuariosController.loginGoogle);

// Usuarios (luchadores)
router.get('/v1/marshall/usuarios', authMiddleware, roleMiddleware(MARSHALL_ROLES), usuariosController.buscarPorUsername);
router.post('/v1/marshall/usuarios', authMiddleware, roleMiddleware(MARSHALL_ROLES), usuariosController.crear);

// Acceso a torneo
router.post('/v1/marshall/torneo/acceso', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.acceso);

// Combates
router.get('/v1/marshall/torneo/:idTorneo/combates', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.getCombates);
router.post('/v1/marshall/torneo/:idTorneo/estructura', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.crearEstructura);
router.post('/v1/marshall/torneo/:idTorneo/combate', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.createCombate);
router.post('/v1/marshall/torneo/:idTorneo/generar-combates', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.generarCombates);
router.post('/v1/marshall/torneo/:idTorneo/combate/:idCombate/round', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.grabarRound);
router.post('/v1/marshall/torneo/:idTorneo/combate/:idCombate/cerrar', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.cerrarCombate);
router.delete('/v1/marshall/torneo/:idTorneo/combate/:idCombate', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.deleteCombate);
router.delete('/v1/marshall/torneo/:idTorneo/combates', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.deleteCombates);

// Equipos
router.get('/v1/marshall/torneo/:idTorneo/equipos', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.getEquipos);
router.post('/v1/marshall/torneo/:idTorneo/equipo', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.crearEquipoCoalicion);
router.delete('/v1/marshall/torneo/:idTorneo/equipo/:idEquipo', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.eliminarEquipo);
router.put('/v1/marshall/torneo/:idTorneo/equipo/:idEquipo/cabeza-serie', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.setCabezaSerie);

// Sorteo dirigido (sugerencia, no persiste)
router.post('/v1/marshall/torneo/:idTorneo/sorteo', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.sorteo);

// Peleadores
router.post('/v1/marshall/torneo/:idTorneo/equipo/:idEquipo/peleador', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.inscribirPeleador);
router.delete('/v1/marshall/torneo/:idTorneo/equipo/:idEquipo/peleador/:idUsuario', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.eliminarPeleador);
router.put('/v1/marshall/torneo/:idTorneo/equipos/peleadores/numeros', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.guardarNumerosPeleadores);
// Alias POST para compatibilidad con clientes antiguos
router.post('/v1/marshall/torneo/:idTorneo/equipos/peleadores/numeros', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.guardarNumerosPeleadores);

// Grupos
router.get('/v1/marshall/torneo/:idTorneo/grupos', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.getGrupos);
router.put('/v1/marshall/torneo/:idTorneo/grupos', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.guardarGrupos);

// Estadísticas
router.get('/v1/marshall/torneo/:idTorneo/estadisticas', authMiddleware, roleMiddleware(MARSHALL_ROLES), marshallsController.getEstadisticas);

module.exports = router;
