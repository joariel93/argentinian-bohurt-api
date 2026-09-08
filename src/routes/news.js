const express = require('express');
const router = express.Router();
const newsController = require('../controllers/newsController');
const apiKeyMiddleware = require('../middleware/apiKeyMiddleware');

router.get('/v1/news', newsController.getAll);
router.get('/v1/news/:id', newsController.getById);

router.post('/v1/news', apiKeyMiddleware, newsController.create);
router.put('/v1/news/:id', apiKeyMiddleware, newsController.update);
router.delete('/v1/news/:id', apiKeyMiddleware, newsController.delete);

module.exports = router;
