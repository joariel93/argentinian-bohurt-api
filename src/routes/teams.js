import express from 'express';
import teamsController from '../controllers/teamsController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import roleMiddleware from '../middleware/roleMiddleware.js';

const router = express.Router();

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

export default router;
