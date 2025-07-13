const express = require('express');
const router = express.Router();
const notificationService = require('../utils/notificationService');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
};

// Get user's notifications
router.get('/notifications', isAuthenticated, async (req, res) => {
    try {
        const notifications = await notificationService.getAllNotifications(req.session.user.id, 10);
        res.json({
            success: true,
            notifications
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load notifications'
        });
    }
});

// Mark notification as read
router.post('/notifications/:id/read', isAuthenticated, async (req, res) => {
    try {
        const success = await notificationService.markAsRead([req.params.id], req.session.user.id);
        res.json({ success });
    } catch (error) {
        console.error('Mark notification read error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to mark notification as read'
        });
    }
});

// Mark all notifications as read
router.post('/notifications/mark-all-read', isAuthenticated, async (req, res) => {
    try {
        const success = await notificationService.markAllAsRead(req.session.user.id);
        res.json({ success });
    } catch (error) {
        console.error('Mark all notifications read error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to mark all notifications as read'
        });
    }
});

module.exports = router;
