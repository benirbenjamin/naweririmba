const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// GET routes for rendering forms
router.get('/register', authController.showRegister);
router.get('/login', authController.showLogin);
router.get('/logout', authController.logout);
router.post('/logout', authController.logout);

// Password reset routes
router.get('/reset-password', authController.showResetPassword);
router.post('/reset-password-verify', authController.resetPasswordVerify);
router.post('/reset-password', authController.resetPassword);

// Register route
router.post('/register', authController.register);

// Login route
router.post('/login', authController.login);

// Admin password reset routes
router.post('/admin/reset-password/:userId', authController.adminResetPassword);

module.exports = router;
