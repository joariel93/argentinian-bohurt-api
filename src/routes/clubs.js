import express from 'express';
import clubsController from '../controllers/clubsController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import roleMiddleware from '../middleware/roleMiddleware.js';

const router = express.Router();

const ADMIN_ROLES = [1];

router.get('/v1/clubs', clubsController.getAll);
router.get('/v1/club/:idClub', clubsController.getById);
router.get('/v1/clubStats/:idClub', clubsController.getStats);
router.get('/v1/get-clubs-simplify', clubsController.getSimplify);

router.post('/v1/clubs', authMiddleware, roleMiddleware(ADMIN_ROLES), clubsController.create);
router.put('/v1/club/:idClub', authMiddleware, roleMiddleware(ADMIN_ROLES), clubsController.update);
router.delete('/v1/club/:idClub', authMiddleware, roleMiddleware(ADMIN_ROLES), clubsController.delete);

export default router;
