const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');

// POST /auth/login
router.post('/login', authController.login);

// GET /auth/me  (protected)
router.get('/me', authenticate, authController.getMe);
// POST /auth/register
router.post('/register', authController.register);
module.exports = router;
