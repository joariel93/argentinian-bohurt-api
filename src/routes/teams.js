const express = require('express');
const router = express.Router();
const teamsController = require('../controllers/teamsController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const ADMIN_ROLES = [1];

router.get('/v1/teams', teamsController.getAll);
router.get('/v1/teams/by-filters', teamsController.getByFilters);
router.get('/v1/teams/:idTeam', teamsController.getById);
router.get('/v1/get-teams-simplify/:idClub', teamsController.getSimplify);
router.get('/v1/tournaments-team/:idTeam', teamsController.getTournamentStats);

router.post('/v1/teams', authMiddleware, roleMiddleware(ADMIN_ROLES), teamsController.create);
router.post('/v1/admin/teams', authMiddleware, roleMiddleware(ADMIN_ROLES), teamsController.adminCreate);
router.put('/v1/teams/:idTeam', authMiddleware, roleMiddleware(ADMIN_ROLES), teamsController.update);
router.delete('/v1/teams/:idTeam', authMiddleware, roleMiddleware(ADMIN_ROLES), teamsController.delete);

module.exports = router;
