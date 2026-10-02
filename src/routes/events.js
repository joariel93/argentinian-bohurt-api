import express from 'express';
import eventsController from '../controllers/eventsController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import roleMiddleware from '../middleware/roleMiddleware.js';

const router = express.Router();

const ADMIN_ROLES = [1];

router.get('/v1/events', eventsController.getAll);
router.get('/v1/events/:id', eventsController.getById);
router.get('/v1/events/:id/admin', authMiddleware, roleMiddleware(ADMIN_ROLES), eventsController.getAdmin);
router.get('/v1/events/:id/combates', authMiddleware, roleMiddleware(ADMIN_ROLES), eventsController.getCombatesByEvento);
router.post('/v1/events', authMiddleware, roleMiddleware(ADMIN_ROLES), eventsController.create);
router.put('/v1/events/:id', authMiddleware, roleMiddleware(ADMIN_ROLES), eventsController.update);
router.delete('/v1/events/:id', authMiddleware, roleMiddleware(ADMIN_ROLES), eventsController.delete);
router.post('/v1/events/:id/validate-otp', eventsController.validateOtp);
router.get('/v1/events/:id/tournaments', eventsController.getTournamentsByEvent);

export default router;
