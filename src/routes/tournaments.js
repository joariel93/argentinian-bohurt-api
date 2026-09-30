import express from 'express';
import tournamentsController from '../controllers/tournamentsController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import roleMiddleware from '../middleware/roleMiddleware.js';

const router = express.Router();

const ADMIN_ROLES = [1];

router.get('/v1/tournaments', tournamentsController.getAll);
router.get('/v1/combat-types/:idModalidad', tournamentsController.getCombatTypes);
router.get('/v1/tournaments/:tournamentId/info', tournamentsController.getInfo);
router.get('/v1/tournaments/by-organizer/:organizerId', tournamentsController.checkExists);
router.get('/v1/torneo/:idTorneo/equipos', tournamentsController.getEquipos);
router.get('/v1/torneo/:idTorneo/equipo/:idEquipo', tournamentsController.getEquipoEnTorneo);
router.get('/v1/torneo/:idTorneo/combates', tournamentsController.getCombates);
router.get('/v1/torneo/:idTorneo/estadisticas', tournamentsController.getEstadisticas);
router.post('/v1/tournaments', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.submit);
router.post('/v1/organizers/:organizerId/tournaments', authMiddleware, roleMiddleware(ADMIN_ROLES), (req, res) => {
  req.body.tournamentData = req.body.tournamentData || req.body;
  tournamentsController.submit(req, res);
});
router.post('/v1/torneo/:idTorneo/equipos', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.addEquipo);
router.post('/v1/torneo/:idTorneo/combates', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.addCombates);
router.put('/v1/torneo/:idTorneo/combate/:idCombate/link', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.updateCombateLink);
router.get('/v1/tournaments/:id/admin', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.getAdmin);
router.get('/v1/tournaments/:id/full-edit', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.getFullEdit);
router.put('/v1/tournaments/:id', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.update);
router.post('/v1/tournaments/:id/regenerate-otp', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.regenerateOtp);
router.delete('/v1/tournaments/:id', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.delete);
router.delete('/v1/torneo/:idTorneo/equipos/:idEquipo', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.removeEquipo);
router.put('/v1/torneo/:idTorneo/combate/:idCombate/round/:round', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.updateRound);

router.get('/v1/torneo/:idTorneo/peleadores', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.getPeleadores);
router.post('/v1/torneo/:idTorneo/peleadores', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.addPeleador);
router.delete('/v1/torneo/:idTorneo/peleadores/:idUsuario', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.removePeleador);
router.delete('/v1/torneo/:idTorneo/equipo/:idEquipo/peleador/:idUsuario', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.removePeleadorDeEquipo);

// Combates individuales (Duelo/Profight) — Fase B
router.get('/v1/torneo/:idTorneo/combates-individuales', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.getCombatesIndividuales);
router.post('/v1/torneo/:idTorneo/combates-individuales', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.createCombatesIndividuales);
router.delete('/v1/torneo/:idTorneo/combates-individuales', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.eliminarCombatesIndividuales);
router.post('/v1/torneo/:idTorneo/combate-individual/:idCombate/round', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.grabarRoundIndividual);
router.post('/v1/torneo/:idTorneo/combate-individual/:idCombate/cerrar', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.cerrarCombateIndividual);
router.post('/v1/torneo/:idTorneo/sorteo-individual', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.sorteoIndividual);
router.put('/v1/torneo/:idTorneo/combates-individuales/orden', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.reordenarCombatesIndividuales);
router.put('/v1/torneo/:idTorneo/combate-individual/:idCombate', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.editarCombateIndividual);

export default router;
