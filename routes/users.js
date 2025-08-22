const express = require('express');
const router = express.Router();
const db = require('../models/db');
const bcrypt = require('bcryptjs');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    console.log('=== AUTHENTICATION CHECK ===');
    console.log('Session ID:', req.sessionID);
    console.log('Session data:', req.session);
    console.log('User in session:', req.session.user);
    console.log('Request cookies:', req.cookies);
    console.log('Request headers (cookie):', req.headers.cookie);
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('USE_HTTPS:', process.env.USE_HTTPS);
    console.log('================================');
    
    if (!req.session.user) {
        console.log('No user in session, redirecting to login');
        return res.redirect('/login');
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
        
        // Get user's recent earnings - amounts are already in USD
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
        
        // Get user's earnings - amounts are already in USD
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
        const { 
            amount, 
            whatsapp_number, 
            account_type, 
            account_name, 
            account_number, 
            bank_name, 
            momo_operator,
            save_account 
        } = req.body;
        const userId = req.session.user.id;
        
        // Validate required fields
        if (!amount || !whatsapp_number || !account_type || !account_name || !account_number) {
            return res.redirect('/users/profile?error=missing_fields');
        }
        
        // Validate account type specific fields
        if (account_type === 'bank' && !bank_name) {
            return res.redirect('/users/profile?error=bank_name_required');
        }
        if (account_type === 'mobile_money' && !momo_operator) {
            return res.redirect('/users/profile?error=momo_operator_required');
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
        
        // Save account details if requested
        if (save_account === 'on') {
            try {
                // Check if account already exists
                const [existingAccounts] = await pool.execute(
                    'SELECT id FROM user_payment_accounts WHERE user_id = ? AND account_number = ? AND account_type = ?',
                    [userId, account_number, account_type]
                );
                
                if (existingAccounts.length === 0) {
                    await pool.execute(
                        `INSERT INTO user_payment_accounts 
                        (user_id, account_type, account_name, account_number, bank_name, momo_operator) 
                        VALUES (?, ?, ?, ?, ?, ?)`,
                        [userId, account_type, account_name, account_number, bank_name || null, momo_operator || null]
                    );
                }
            } catch (error) {
                console.error('Error saving account details:', error);
                // Continue with withdrawal even if account saving fails
            }
        }
        
        // Create withdrawal request with account details
        await pool.execute(
            `INSERT INTO withdrawals 
            (user_id, amount, whatsapp_number, account_type, account_name, account_number, bank_name, momo_operator) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, withdrawalAmount, whatsapp_number, account_type, account_name, account_number, bank_name || null, momo_operator || null]
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

// User's purchased songs
router.get('/purchased', isAuthenticated, async (req, res) => {
    try {
        const pool = await db.getPool();
        const userId = req.session.user.id;
        
        // Get all purchased songs with transaction details
        const [purchasedSongs] = await pool.execute(`
            SELECT 
                t.id as transaction_id,
                t.amount,
                t.created_at as purchase_date,
                t.download_count,
                t.lyrics_download_count,
                s.id as song_id,
                s.title,
                s.genre,
                s.style,
                s.lyrics,
                s.audio_format,
                s.cover_image,
                s.tempo,
                s.time_signature,
                u.name as artist_name,
                u.whatsapp as artist_whatsapp
            FROM transactions t
            JOIN songs s ON t.song_id = s.id
            JOIN users u ON s.user_id = u.id
            WHERE t.buyer_id = ? AND t.status = 'completed'
            ORDER BY t.created_at DESC
        `, [userId]);
        
        res.render('users/purchased', {
            title: 'My Purchased Songs',
            purchasedSongs,
            user: req.session.user,
            success: req.query.success,
            newPurchase: req.query.new
        });
    } catch (error) {
        console.error('Error loading purchased songs:', error);
        res.render('users/purchased', {
            title: 'My Purchased Songs',
            purchasedSongs: [],
            user: req.session.user,
            error: 'Failed to load purchased songs'
        });
    }
});

// User notifications page
router.get('/notifications', isAuthenticated, async (req, res) => {
    try {
        const pool = await db.getPool();
        const userId = req.session.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;
        
        // Get total notification count
        const [countResult] = await pool.execute(
            'SELECT COUNT(*) as total FROM notifications WHERE user_id = ? OR user_id IS NULL',
            [userId]
        );
        
        // Get notifications with pagination
        const [notifications] = await pool.execute(`
            SELECT * FROM notifications 
            WHERE user_id = ? OR user_id IS NULL 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `, [userId, limit, offset]);
        
        // Get unread count
        const [unreadResult] = await pool.execute(
            'SELECT COUNT(*) as unread FROM notifications WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0',
            [userId]
        );
        
        const totalNotifications = countResult[0].total;
        const totalPages = Math.ceil(totalNotifications / limit);
        const unreadCount = unreadResult[0].unread;
        
        res.render('users/notifications', {
            title: 'Notifications',
            user: req.session.user,
            notifications,
            currentPage: page,
            totalPages,
            unreadCount,
            totalNotifications
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.render('users/notifications', {
            title: 'Notifications',
            user: req.session.user,
            notifications: [],
            currentPage: 1,
            totalPages: 1,
            unreadCount: 0,
            totalNotifications: 0,
            error: 'Error loading notifications'
        });
    }
});

// Edit Profile - GET (show edit form)
router.get('/profile/edit', isAuthenticated, async (req, res) => {
    try {
        const pool = await db.getPool();
        const userId = req.session.user.id;
        
        // Get user details
        const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
        const user = users[0];
        
        // Get security questions
        const [securityQuestions] = await pool.execute(
            'SELECT * FROM security_questions WHERE is_active = TRUE ORDER BY id'
        );
        
        res.render('users/edit-profile', {
            title: 'Edit Profile',
            user: user,
            securityQuestions: securityQuestions,
            success: req.query.success,
            error: req.query.error
        });
    } catch (error) {
        console.error('Error loading edit profile:', error);
        res.redirect('/users/profile?error=load_failed');
    }
});

// Edit Profile - POST (update profile)
router.post('/profile/edit', isAuthenticated, async (req, res) => {
    try {
        const pool = await db.getPool();
        const userId = req.session.user.id;
        const { name, email, whatsapp, security_question_id, security_answer } = req.body;
        
        // Validation
        if (!name || !email || !whatsapp || !security_question_id || !security_answer) {
            return res.redirect('/users/profile/edit?error=missing_fields');
        }
        
        // Check if email is already taken by another user
        const [existingUser] = await pool.execute(
            'SELECT id FROM users WHERE email = ? AND id != ?',
            [email, userId]
        );
        
        if (existingUser.length > 0) {
            return res.redirect('/users/profile/edit?error=email_taken');
        }
        
        // Hash security answer
        const hashedAnswer = await bcrypt.hash(security_answer.toLowerCase().trim(), 12);
        
        // Update user profile
        await pool.execute(`
            UPDATE users 
            SET name = ?, email = ?, whatsapp = ?, security_question_id = ?, security_answer = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [name, email, whatsapp, security_question_id, hashedAnswer, userId]);
        
        // Update session with new user data
        req.session.user.name = name;
        req.session.user.email = email;
        req.session.user.whatsapp = whatsapp;
        
        res.redirect('/users/profile?success=profile_updated');
    } catch (error) {
        console.error('Error updating profile:', error);
        res.redirect('/users/profile/edit?error=update_failed');
    }
});

// Change Password - GET (show form)
router.get('/profile/change-password', isAuthenticated, async (req, res) => {
    res.render('users/change-password', {
        title: 'Change Password',
        success: req.query.success,
        error: req.query.error
    });
});

// Change Password - POST
router.post('/profile/change-password', isAuthenticated, async (req, res) => {
    try {
        const pool = await db.getPool();
        const userId = req.session.user.id;
        const { current_password, new_password, confirm_password } = req.body;
        
        // Validation
        if (!current_password || !new_password || !confirm_password) {
            return res.redirect('/users/profile/change-password?error=missing_fields');
        }
        
        if (new_password !== confirm_password) {
            return res.redirect('/users/profile/change-password?error=password_mismatch');
        }
        
        if (new_password.length < 6) {
            return res.redirect('/users/profile/change-password?error=password_short');
        }
        
        // Get current user
        const [users] = await pool.execute('SELECT password FROM users WHERE id = ?', [userId]);
        const user = users[0];
        
        // Verify current password
        const isValidPassword = await bcrypt.compare(current_password, user.password);
        if (!isValidPassword) {
            return res.redirect('/users/profile/change-password?error=invalid_current_password');
        }
        
        // Hash new password
        const hashedPassword = await bcrypt.hash(new_password, 12);
        
        // Update password
        await pool.execute('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hashedPassword, userId]);
        
        res.redirect('/users/profile/change-password?success=password_changed');
    } catch (error) {
        console.error('Error changing password:', error);
        res.redirect('/users/profile/change-password?error=change_failed');
    }
});

// User payment accounts management
router.get('/payment-accounts', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const pool = await db.getPool();
        
        const [accounts] = await pool.execute(
            'SELECT * FROM user_payment_accounts WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
            [userId]
        );
        
        res.json(accounts);
    } catch (error) {
        console.error('Error fetching payment accounts:', error);
        res.status(500).json({ error: 'Failed to fetch payment accounts' });
    }
});

module.exports = router;
