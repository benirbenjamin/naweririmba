const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// GET routes for rendering forms
router.get('/register', authController.showRegister);
router.get('/login', authController.showLogin);
router.get('/logout', authController.logout);

// Register route
router.post('/register', authController.register);

// Login route
router.post('/login', authController.login);

module.exports = router;
