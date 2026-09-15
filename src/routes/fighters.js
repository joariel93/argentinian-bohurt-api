const express = require('express');
const router = express.Router();
const fightersController = require('../controllers/fightersController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const ADMIN_ROLES = [1];

router.get('/v1/admin/fighters', authMiddleware, roleMiddleware(ADMIN_ROLES), fightersController.search);
router.post('/v1/admin/fighters', authMiddleware, roleMiddleware(ADMIN_ROLES), fightersController.create);
router.post('/v1/admin/torneo/:idTorneo/equipo/:idEquipo/peleador', authMiddleware, roleMiddleware(ADMIN_ROLES), fightersController.addToTeamTournament);

module.exports = router;
