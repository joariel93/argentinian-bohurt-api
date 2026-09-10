const express = require('express');
const router = express.Router();
const tournamentsController = require('../controllers/tournamentsController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const ADMIN_ROLES = [1];

router.get('/v1/tournaments', tournamentsController.getAll);
router.get('/v1/combat-types/:idModalidad', tournamentsController.getCombatTypes);
router.get('/v1/tournaments/:tournamentId/info', tournamentsController.getInfo);
router.get('/v1/tournaments/by-organizer/:organizerId', tournamentsController.checkExists);
router.get('/v1/torneo/:idTorneo/equipos', tournamentsController.getEquipos);
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
router.put('/v1/tournaments/:id', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.update);
router.post('/v1/tournaments/:id/regenerate-otp', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.regenerateOtp);
router.delete('/v1/tournaments/:id', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.delete);
router.delete('/v1/torneo/:idTorneo/equipos/:idEquipo', authMiddleware, roleMiddleware(ADMIN_ROLES), tournamentsController.removeEquipo);

module.exports = router;
