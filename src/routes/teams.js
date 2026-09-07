const express = require('express');
const router = express.Router();
const teamsController = require('../controllers/teamsController');

router.get('/v1/teams/by-filters', teamsController.getByFilters);
router.get('/v1/teams/:idTeam', teamsController.getById);
router.get('/v1/get-teams-simplify/:idClub', teamsController.getSimplify);
router.get('/v1/tournaments-team/:idTeam', teamsController.getTournamentStats);

router.post('/v1/teams', teamsController.create);
router.post('/v1/admin/teams', teamsController.adminCreate);
router.put('/v1/teams/:idTeam', teamsController.update);
router.delete('/v1/teams/:idTeam', teamsController.delete);

module.exports = router;
