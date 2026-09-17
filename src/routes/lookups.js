import express from 'express';
import lookupsController from '../controllers/lookupsController.js';

const router = express.Router();

router.get('/lookups/colores', lookupsController.getColores);
router.get('/lookups/genero', lookupsController.getGenero);
router.get('/lookups/modalidad', lookupsController.getModalidad);
router.get('/lookups/categoria/:idModalidad', lookupsController.getCategorias);
router.get('/lookups/tipo-torneo', lookupsController.getTipoTorneo);
router.get('/lookups/tipo-usuario', lookupsController.getTipoUsuario);
router.get('/lookups/redes-sociales', lookupsController.getRedesSociales);
router.get('/lookups/reglamento', lookupsController.getReglamento);

export default router;
