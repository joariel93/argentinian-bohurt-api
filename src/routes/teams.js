const express = require('express');
const router = express.Router();
const teamsController = require('../controllers/teamsController');
const apiKeyMiddleware = require('../middleware/apiKeyMiddleware');

router.get('/v1/teams/by-filters', teamsController.getByFilters);
router.get('/v1/teams/:idTeam', teamsController.getById);
router.get('/v1/get-teams-simplify/:idClub', teamsController.getSimplify);
router.get('/v1/tournaments-team/:idTeam', teamsController.getTournamentStats);

router.post('/v1/teams', apiKeyMiddleware, teamsController.create);
router.post('/v1/admin/teams', apiKeyMiddleware, teamsController.adminCreate);
router.put('/v1/teams/:idTeam', apiKeyMiddleware, teamsController.update);
router.delete('/v1/teams/:idTeam', apiKeyMiddleware, teamsController.delete);

module.exports = router;
