import express from 'express';
import peleadoresController from '../controllers/peleadoresController.js';

const router = express.Router();

router.get('/v1/peleadores/:id', peleadoresController.getById);

export default router;
