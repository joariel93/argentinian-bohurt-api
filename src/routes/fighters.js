import express from 'express';
import fightersController from '../controllers/fightersController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import roleMiddleware from '../middleware/roleMiddleware.js';

const router = express.Router();

const ADMIN_ROLES = [1];

router.get('/v1/admin/fighters', authMiddleware, roleMiddleware(ADMIN_ROLES), fightersController.search);
router.post('/v1/admin/fighters', authMiddleware, roleMiddleware(ADMIN_ROLES), fightersController.create);
router.post('/v1/admin/torneo/:idTorneo/equipo/:idEquipo/peleador', authMiddleware, roleMiddleware(ADMIN_ROLES), fightersController.addToTeamTournament);
router.put('/v1/admin/torneo/:idTorneo/equipo/:idEquipo/peleador/:idUsuario/numero', authMiddleware, roleMiddleware(ADMIN_ROLES), fightersController.updateNumeroPeleador);
router.delete('/v1/admin/torneo/:idTorneo/equipo/:idEquipo/peleador/:idUsuario', authMiddleware, roleMiddleware(ADMIN_ROLES), fightersController.removeFromTeamTournament);

export default router;
