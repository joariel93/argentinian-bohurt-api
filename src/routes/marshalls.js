const express = require('express');
const router = express.Router();
const marshallsController = require('../controllers/marshallsController');
const usuariosController = require('../controllers/usuariosController');

// Auth
router.post('/v1/marshall/auth/login', usuariosController.login);

// Usuarios (luchadores)
router.get('/v1/marshall/usuarios', usuariosController.buscarPorUsername);
router.post('/v1/marshall/usuarios', usuariosController.crear);

// Acceso a torneo
router.post('/v1/marshall/torneo/acceso', marshallsController.acceso);

// Combates
router.get('/v1/marshall/torneo/:idTorneo/combates', marshallsController.getCombates);
router.post('/v1/marshall/torneo/:idTorneo/estructura', marshallsController.crearEstructura);
router.post('/v1/marshall/torneo/:idTorneo/combate', marshallsController.createCombate);
router.post('/v1/marshall/torneo/:idTorneo/generar-combates', marshallsController.generarCombates);
router.post('/v1/marshall/torneo/:idTorneo/combate/:idCombate/round', marshallsController.grabarRound);
router.post('/v1/marshall/torneo/:idTorneo/combate/:idCombate/cerrar', marshallsController.cerrarCombate);
router.delete('/v1/marshall/torneo/:idTorneo/combate/:idCombate', marshallsController.deleteCombate);
router.delete('/v1/marshall/torneo/:idTorneo/combates', marshallsController.deleteCombates);

// Equipos
router.get('/v1/marshall/torneo/:idTorneo/equipos', marshallsController.getEquipos);
router.post('/v1/marshall/torneo/:idTorneo/equipo', marshallsController.crearEquipoCoalicion);
router.delete('/v1/marshall/torneo/:idTorneo/equipo/:idEquipo', marshallsController.eliminarEquipo);
router.put('/v1/marshall/torneo/:idTorneo/equipo/:idEquipo/cabeza-serie', marshallsController.setCabezaSerie);

// Sorteo dirigido (sugerencia, no persiste)
router.post('/v1/marshall/torneo/:idTorneo/sorteo', marshallsController.sorteo);

// Peleadores
router.post('/v1/marshall/torneo/:idTorneo/equipo/:idEquipo/peleador', marshallsController.inscribirPeleador);
router.delete('/v1/marshall/torneo/:idTorneo/equipo/:idEquipo/peleador/:idUsuario', marshallsController.eliminarPeleador);
router.put('/v1/marshall/torneo/:idTorneo/equipos/peleadores/numeros', marshallsController.guardarNumerosPeleadores);

// Grupos
router.get('/v1/marshall/torneo/:idTorneo/grupos', marshallsController.getGrupos);
router.put('/v1/marshall/torneo/:idTorneo/grupos', marshallsController.guardarGrupos);

// Estadísticas
router.get('/v1/marshall/torneo/:idTorneo/estadisticas', marshallsController.getEstadisticas);

module.exports = router;
