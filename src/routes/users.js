const express = require('express');
const router = express.Router();
const db = require('../models/db');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
};

// User dashboard
router.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const pool = await db.getPool();
        const userId = req.session.user.id;
        
        // Get user details with current balance
        const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
        const user = users[0];
        
        // Get user's songs
        const [userSongs] = await pool.execute(
            'SELECT * FROM songs WHERE user_id = ? ORDER BY created_at DESC LIMIT 6',
            [userId]
        );
        
        // Get user's recent purchases
        const [recentPurchases] = await pool.execute(`
            SELECT t.*, s.title as song_title, u.name as artist_name
            FROM transactions t
            JOIN songs s ON t.song_id = s.id
            JOIN users u ON s.user_id = u.id
            WHERE t.buyer_id = ? AND t.status = 'completed'
            ORDER BY t.created_at DESC
            LIMIT 5
        `, [userId]);
        
        // Get user's recent earnings
        const [recentEarnings] = await pool.execute(`
            SELECT t.*, s.title as song_title
            FROM transactions t
            JOIN songs s ON t.song_id = s.id
            WHERE t.seller_id = ? AND t.status = 'completed'
            ORDER BY t.created_at DESC
            LIMIT 5
        `, [userId]);
        
        // Get statistics
        const [songStats] = await pool.execute(
            'SELECT COUNT(*) as total_songs, SUM(CASE WHEN is_sold = 1 THEN 1 ELSE 0 END) as sold_songs FROM songs WHERE user_id = ?',
            [userId]
        );
        
        const [earningsStats] = await pool.execute(
            'SELECT SUM(seller_amount) as total_earnings FROM transactions WHERE seller_id = ? AND status = "completed"',
            [userId]
        );
        
        const [purchaseStats] = await pool.execute(
            'SELECT COUNT(*) as total_purchases, SUM(amount) as total_spent FROM transactions WHERE buyer_id = ? AND status = "completed"',
            [userId]
        );
        
        // Calculate referral earnings (sum of commission_amount where user is referrer)
        const [referralStats] = await pool.execute(
            'SELECT SUM(commission_amount) as referral_earnings FROM transactions WHERE referrer_id = ? AND status = "completed"',
            [userId]
        );
        
        // Fetch notifications for the user (and global notifications)
        const [notifications] = await pool.execute(
            'SELECT * FROM notifications WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT 10',
            [userId]
        );
        
        // Update user session with current balance
        req.session.user.balance = user.balance;
        
        res.render('users/dashboard', {
            title: 'Dashboard',
            user: user,
            userSongs: userSongs || [],
            recentPurchases: recentPurchases || [],
            recentEarnings: recentEarnings || [],
            notifications: notifications || [],
            stats: {
                totalSongs: songStats[0]?.total_songs || 0,
                soldSongs: songStats[0]?.sold_songs || 0,
                totalEarnings: earningsStats[0]?.total_earnings || 0,
                totalPurchases: purchaseStats[0]?.total_purchases || 0,
                totalSpent: purchaseStats[0]?.total_spent || 0,
                referralEarnings: referralStats[0]?.referral_earnings || 0
            }
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.render('error', { 
            title: 'Error',
            message: 'Unable to load dashboard'
        });
    }
});

// User profile
router.get('/profile', isAuthenticated, async (req, res) => {
    try {
        const pool = await db.getPool();
        const userId = req.session.user.id;
        
        // Get user details with current balance
        const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
        const user = users[0];
        
        // Get user's songs
        const [userSongs] = await pool.execute(
            'SELECT * FROM songs WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        
        // Count sold songs
        const soldSongs = userSongs.filter(song => song.is_sold).length;
        
        // Get user's purchases
        const [purchases] = await pool.execute(`
            SELECT t.*, s.title as song_title, u.name as artist_name
            FROM transactions t
            JOIN songs s ON t.song_id = s.id
            JOIN users u ON s.user_id = u.id
            WHERE t.buyer_id = ? AND t.status = 'completed'
            ORDER BY t.created_at DESC
        `, [userId]);
        
        // Get user's earnings
        const [earnings] = await pool.execute(`
            SELECT t.*, s.title as song_title
            FROM transactions t
            JOIN songs s ON t.song_id = s.id
            WHERE t.seller_id = ? AND t.status = 'completed'
            ORDER BY t.created_at DESC
        `, [userId]);
        
        // Get user's withdrawals
        const [withdrawals] = await pool.execute(
            'SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        
        res.render('users/profile', {
            title: 'My Profile',
            user,
            userSongs,
            soldSongs,
            purchases,
            earnings,
            withdrawals
        });
    } catch (error) {
        console.error('Error loading profile:', error);
        res.render('users/profile', {
            title: 'My Profile',
            user: req.session.user,
            userSongs: [],
            soldSongs: 0,
            purchases: [],
            earnings: [],
            withdrawals: [],
            error: 'Error loading profile data'
        });
    }
});

// Request withdrawal
router.post('/withdraw', isAuthenticated, async (req, res) => {
    try {
        const { amount, whatsapp_number } = req.body;
        const userId = req.session.user.id;
        
        if (!amount || !whatsapp_number) {
            return res.redirect('/users/profile?error=missing_fields');
        }
        
        const withdrawalAmount = parseFloat(amount);
        
        if (withdrawalAmount < 10) {
            return res.redirect('/users/profile?error=minimum_amount');
        }
        
        const pool = await db.getPool();
        
        // Check user balance
        const [users] = await pool.execute('SELECT balance FROM users WHERE id = ?', [userId]);
        const userBalance = users[0].balance;
        
        if (withdrawalAmount > userBalance) {
            return res.redirect('/users/profile?error=insufficient_balance');
        }
        
        // Create withdrawal request
        await pool.execute(
            'INSERT INTO withdrawals (user_id, amount, whatsapp_number) VALUES (?, ?, ?)',
            [userId, withdrawalAmount, whatsapp_number]
        );
        
        res.redirect('/users/profile?success=withdrawal_requested');
    } catch (error) {
        console.error('Error processing withdrawal:', error);
        res.redirect('/users/profile?error=withdrawal_failed');
    }
});

// Update profile
router.post('/profile/update', isAuthenticated, async (req, res) => {
    try {
        const { name, whatsapp } = req.body;
        const userId = req.session.user.id;
        
        if (!name || !whatsapp) {
            return res.redirect('/users/profile?error=missing_fields');
        }
        
        const pool = await db.getPool();
        await pool.execute(
            'UPDATE users SET name = ?, whatsapp = ? WHERE id = ?',
            [name, whatsapp, userId]
        );
        
        // Update session
        req.session.user.name = name;
        req.session.user.whatsapp = whatsapp;
        
        res.redirect('/users/profile?success=profile_updated');
    } catch (error) {
        console.error('Error updating profile:', error);
        res.redirect('/users/profile?error=update_failed');
    }
});

// Generate or get referral links for songs
router.get('/referrals', isAuthenticated, async (req, res) => {
    try {
        const pool = await db.getPool();
        const userId = req.session.user.id;
        
        // Get user's songs for referral link generation
        const [userSongs] = await pool.execute(
            'SELECT id, title, price, is_sold FROM songs WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        
        // Get referral earnings
        const [referralEarnings] = await pool.execute(`
            SELECT sc.*, s.title as song_title, t.created_at as earned_at
            FROM share_commissions sc
            JOIN songs s ON sc.song_id = s.id
            JOIN transactions t ON sc.transaction_id = t.id
            WHERE sc.sharer_id = ?
            ORDER BY sc.created_at DESC
        `, [userId]);
        
        // Calculate total referral earnings
        const [totalReferralEarnings] = await pool.execute(
            'SELECT SUM(commission_amount) as total FROM share_commissions WHERE sharer_id = ?',
            [userId]
        );
        
        const totalEarnings = totalReferralEarnings[0]?.total || 0;
        
        // Get settings for referral rate
        const [settings] = await pool.execute('SELECT share_commission_rate FROM settings WHERE id = 1');
        const referralRate = (settings[0]?.share_commission_rate || 0.15) * 100; // Convert to percentage
        
        res.render('users/referrals', {
            title: 'Referral System',
            user: req.session.user,
            userSongs,
            referralEarnings,
            totalEarnings,
            referralRate,
            baseUrl: process.env.BASE_URL || 'http://localhost:3000'
        });
    } catch (error) {
        console.error('Referrals page error:', error);
        res.render('error', {
            title: 'Error',
            message: 'Failed to load referrals page'
        });
    }
});

module.exports = router;
