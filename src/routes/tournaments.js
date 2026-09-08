const express = require('express');
const router = express.Router();
const tournamentsController = require('../controllers/tournamentsController');
const apiKeyMiddleware = require('../middleware/apiKeyMiddleware');

router.get('/v1/tournaments', tournamentsController.getAll);
router.get('/v1/combat-types/:idModalidad', tournamentsController.getCombatTypes);
router.get('/v1/tournaments/:tournamentId/info', tournamentsController.getInfo);
router.get('/v1/tournaments/by-organizer/:organizerId', tournamentsController.checkExists);
router.get('/v1/torneo/:idTorneo/equipos', tournamentsController.getEquipos);
router.get('/v1/torneo/:idTorneo/combates', tournamentsController.getCombates);
router.get('/v1/torneo/:idTorneo/estadisticas', tournamentsController.getEstadisticas);
router.post('/v1/tournaments', apiKeyMiddleware, tournamentsController.submit);
router.post('/v1/organizers/:organizerId/tournaments', apiKeyMiddleware, (req, res) => {
  req.body.tournamentData = req.body.tournamentData || req.body;
  tournamentsController.submit(req, res);
});
router.post('/v1/torneo/:idTorneo/equipos', apiKeyMiddleware, tournamentsController.addEquipo);
router.post('/v1/torneo/:idTorneo/combates', apiKeyMiddleware, tournamentsController.addCombates)
router.put('/v1/tournaments/:id', apiKeyMiddleware, tournamentsController.update);
router.delete('/v1/tournaments/:id', apiKeyMiddleware, tournamentsController.delete);
router.delete('/v1/torneo/:idTorneo/equipos/:idEquipo', apiKeyMiddleware, tournamentsController.removeEquipo);

module.exports = router;
