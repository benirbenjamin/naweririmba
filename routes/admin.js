const express = require('express');
const router = express.Router();
const db = require('../models/db');
const notificationService = require('../utils/notificationService');
const ExcelJS = require('exceljs');
const emailService = require('../utils/emailService');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Middleware to ensure currency is available
const ensureCurrency = (req, res, next) => {
    if (!res.locals.currency) {
        res.locals.currency = {
            current: 'USD',
            rates: { USD_to_RWF: 1450, RWF_to_USD: 1/1450 },
            convert: (amount, from, to) => amount,
            getPaymentOptions: (amount) => ({ USD: amount, RWF: amount * 1450 })
        };
    }
    next();
};

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
    if (!req.session.user || !req.session.user.is_admin) {
        return res.redirect('/login?error=admin_required');
    }
    next();
};

// Admin Dashboard
router.get('/dashboard', ensureCurrency, isAdmin, async (req, res) => {
    try {
        const pool = await db.getPool();
        
        // Get dashboard statistics
        const [userStats] = await pool.execute('SELECT COUNT(*) as total_users FROM users WHERE is_admin = 0');
        const [songStats] = await pool.execute('SELECT COUNT(*) as total_songs, COUNT(CASE WHEN is_sold = 1 THEN 1 END) as sold_songs FROM songs');
        
        // Calculate revenue properly - amounts are already in USD
        const [revenueStats] = await pool.execute(`
            SELECT 
                SUM(amount) as total_revenue,
                SUM(commission_amount) as total_commission
            FROM transactions 
            WHERE status = "completed"
        `);
        
        const [withdrawalStats] = await pool.execute('SELECT COUNT(*) as pending_withdrawals FROM withdrawals WHERE status = "pending"');
        
        // Get recent transactions - amounts are already in USD
        const [recentTransactions] = await pool.execute(`
            SELECT t.*, s.title as song_title, u.name as seller_name
            FROM transactions t
            JOIN songs s ON t.song_id = s.id
            JOIN users u ON t.seller_id = u.id
            WHERE t.status = 'completed'
            ORDER BY t.created_at DESC
            LIMIT 10
        `);
        
        // Get pending withdrawals
        const [pendingWithdrawals] = await pool.execute(`
            SELECT w.*, u.name as user_name, u.email
            FROM withdrawals w
            JOIN users u ON w.user_id = u.id
            WHERE w.status = 'pending'
            ORDER BY w.created_at ASC
        `);
        
        // Get settings
        const [settings] = await pool.execute('SELECT * FROM settings WHERE id = 1');
        const currentSettings = settings[0] || {
            seller_commission_rate: 0.6,
            share_commission_rate: 0.15,
            referral_commission_rate: 0.05,
            min_withdrawal_amount: 10,
            platform_name: 'Naweririmba',
            support_whatsapp: ''
        };
        
        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            currentPage: 'dashboard',
            user: req.session.user,
            stats: {
                total_users: userStats[0].total_users,
                total_songs: songStats[0].total_songs,
                sold_songs: songStats[0].sold_songs,
                total_revenue: revenueStats[0].total_revenue || 0,
                total_commission: revenueStats[0].total_commission || 0,
                pending_withdrawals: withdrawalStats[0].pending_withdrawals
            },
            recentTransactions,
            pendingWithdrawals,
            settings: currentSettings
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            currentPage: 'dashboard',
            user: req.session.user,
            error: 'Error loading dashboard data',
            stats: {},
            recentTransactions: [],
            pendingWithdrawals: [],
            settings: { commission_rate: 40, referral_rate: 5 }
        });
    }
});

// Update settings
router.post('/settings', isAdmin, async (req, res) => {
    try {
        const { 
            seller_commission_rate, 
            share_commission_rate, 
            referral_commission_rate,
            min_withdrawal_amount,
            platform_name,
            support_whatsapp 
        } = req.body;
        
        if (!seller_commission_rate || !share_commission_rate || !referral_commission_rate) {
            return res.redirect('/admin/dashboard?error=missing_fields');
        }
        
        const pool = await db.getPool();
        
        // Check if settings exist
        const [existing] = await pool.execute('SELECT id FROM settings WHERE id = 1');
        
        if (existing.length > 0) {
            // Update existing settings
            await pool.execute(
                `UPDATE settings SET 
                 seller_commission_rate = ?, 
                 share_commission_rate = ?, 
                 referral_commission_rate = ?,
                 min_withdrawal_amount = ?,
                 platform_name = ?,
                 support_whatsapp = ?,
                 updated_at = NOW()
                 WHERE id = 1`,
                [
                    parseFloat(seller_commission_rate), 
                    parseFloat(share_commission_rate), 
                    parseFloat(referral_commission_rate),
                    parseFloat(min_withdrawal_amount) || 10,
                    platform_name || 'Naweririmba',
                    support_whatsapp || ''
                ]
            );
        } else {
            // Insert new settings
            await pool.execute(
                `INSERT INTO settings (
                    seller_commission_rate, 
                    share_commission_rate, 
                    referral_commission_rate,
                    min_withdrawal_amount,
                    platform_name,
                    support_whatsapp
                ) VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    parseFloat(seller_commission_rate), 
                    parseFloat(share_commission_rate), 
                    parseFloat(referral_commission_rate),
                    parseFloat(min_withdrawal_amount) || 10,
                    platform_name || 'Naweririmba',
                    support_whatsapp || ''
                ]
            );
        }
        
        res.redirect('/admin/dashboard?success=settings_updated');
    } catch (error) {
        console.error('Error updating settings:', error);
        res.redirect('/admin/dashboard?error=update_failed');
    }
});

// Manage users
router.get('/users', ensureCurrency, isAdmin, async (req, res) => {
    try {
        const { type, status, search, page = 1 } = req.query;
        const limit = 20;
        const offset = (parseInt(page) - 1) * limit;
        
        const pool = await db.getPool();
        
        let whereConditions = ['1=1'];
        let queryParams = [];
        
        if (type === 'admin') {
            whereConditions.push('u.is_admin = 1');
        } else if (type === 'artist') {
            whereConditions.push('u.id IN (SELECT DISTINCT user_id FROM songs)');
        } else if (type === 'buyer') {
            whereConditions.push('u.id IN (SELECT DISTINCT buyer_id FROM transactions WHERE status = "completed") AND u.id NOT IN (SELECT DISTINCT user_id FROM songs)');
        }
        
        if (search) {
            whereConditions.push('(u.name LIKE ? OR u.email LIKE ? OR u.whatsapp LIKE ?)');
            queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        // Get total count
        const [countResult] = await pool.execute(
            `SELECT COUNT(*) as total FROM users u WHERE ${whereClause}`,
            queryParams
        );
        
        // Get users with stats
        const [users] = await pool.execute(`
            SELECT u.*,
                   COUNT(DISTINCT s.id) as songs_count,
                   COUNT(DISTINCT CASE WHEN s.is_sold = 1 THEN s.id END) as sold_songs_count,
                   COUNT(DISTINCT t.id) as purchases_count
            FROM users u
            LEFT JOIN songs s ON u.id = s.user_id
            LEFT JOIN transactions t ON u.id = t.buyer_id AND t.status = 'completed'
            WHERE ${whereClause}
            GROUP BY u.id
            ORDER BY u.created_at DESC
            LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
        `, queryParams);
        
        const totalUsers = countResult[0].total;
        const totalPages = Math.ceil(totalUsers / limit);
        
        res.render('admin/users', {
            title: 'User Management',
            currentUser: req.session.user,
            users,
            currentPage: parseInt(page),
            totalPages,
            totalUsers,
            type,
            status,
            search
        });
    } catch (error) {
        console.error('Users management error:', error);
        res.render('admin/users', {
            title: 'User Management',
            currentUser: req.session.user,
            users: [],
            currentPage: 1,
            totalPages: 1,
            totalUsers: 0,
            type: req.query.type || '',
            status: req.query.status || '',
            search: req.query.search || '',
            error: 'Error loading users'
        });
    }
});

// Get user details
router.get('/users/:id', ensureCurrency, isAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const pool = await db.getPool();
        
        const [users] = await pool.execute(`
            SELECT u.*,
                   COUNT(DISTINCT s.id) as songs_count,
                   COUNT(DISTINCT CASE WHEN s.is_sold = 1 THEN s.id END) as sold_songs_count,
                   COUNT(DISTINCT t.id) as purchases_count,
                   COALESCE(SUM(w.amount), 0) as total_withdrawals
            FROM users u
            LEFT JOIN songs s ON u.id = s.user_id
            LEFT JOIN transactions t ON u.id = t.buyer_id AND t.status = 'completed'
            LEFT JOIN withdrawals w ON u.id = w.user_id AND w.status = 'approved'
            WHERE u.id = ?
            GROUP BY u.id
        `, [userId]);
        
        if (!users.length) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ success: true, user: users[0] });
    } catch (error) {
        console.error('User details error:', error);
        res.status(500).json({ error: 'Error loading user details' });
    }
});

// Send email to users
router.post('/send-email', isAdmin, async (req, res) => {
    try {
        const { recipient_type, recipients, subject, message } = req.body;
        
        const pool = await db.getPool();
        let emailList = [];
        
        if (recipient_type === 'all') {
            const [users] = await pool.execute('SELECT name, email FROM users WHERE is_admin = 0');
            emailList = users;
        } else if (recipient_type === 'selected' && recipients) {
            const placeholders = recipients.map(() => '?').join(',');
            const [users] = await pool.execute(
                `SELECT name, email FROM users WHERE email IN (${placeholders})`,
                recipients
            );
            emailList = users;
        } else if (recipient_type === 'custom' && recipients) {
            emailList = recipients.map(email => ({ email, name: 'User' }));
        }
        
        if (emailList.length === 0) {
            return res.status(400).json({ error: 'No recipients found' });
        }
        
        const results = await emailService.sendBulkEmail(emailList, subject, message);
        const successCount = results.filter(r => r.success).length;
        
        res.json({ 
            success: true, 
            count: successCount,
            total: results.length,
            failures: results.filter(r => !r.success)
        });
    } catch (error) {
        console.error('Send email error:', error);
        res.status(500).json({ error: 'Error sending email' });
    }
});

// Reset user password
router.post('/users/:id/auth/reset-password', isAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const pool = await db.getPool();
        
        // Get user
        const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
        if (!users.length) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = users[0];
        
        // Generate temporary password
        const tempPassword = crypto.randomBytes(8).toString('hex');
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        
        // Update password
        await pool.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
        
        // Send email with new password
        const subject = 'Password Reset - Nawe Ririmba Space';
        const message = `Hello ${user.name},

Your password has been reset by an administrator.

Your new temporary password is: ${tempPassword}

Please log in and change your password immediately for security reasons.

If you didn't request this change, please contact us immediately.

Best regards,
The Nawe Ririmba Space Team`;
        
        await emailService.sendEmail({
            to: user.email,
            subject: subject,
            text: message
        });
        
        res.json({ success: true, message: 'Password reset email sent' });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ error: 'Error resetting password' });
    }
});

// Edit User - GET (show edit form)
router.get('/users/:id/edit', isAdmin, async (req, res) => {
    try {
        const pool = await db.getPool();
        const userId = req.params.id;
        
        // Get user details
        const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.redirect('/admin/users?error=user_not_found');
        }
        
        const user = users[0];
        
        // Get security questions
        const [securityQuestions] = await pool.execute(
            'SELECT * FROM security_questions WHERE is_active = TRUE ORDER BY id'
        );
        
        // Get user statistics
        const [songStats] = await pool.execute(
            'SELECT COUNT(*) as total_songs, COUNT(CASE WHEN is_sold = 1 THEN 1 END) as sold_songs FROM songs WHERE user_id = ?',
            [userId]
        );
        
        const [transactionStats] = await pool.execute(
            'SELECT COUNT(*) as total_purchases, SUM(amount) as total_spent FROM transactions WHERE buyer_id = ? AND status = "completed"',
            [userId]
        );
        
        const [earningStats] = await pool.execute(
            'SELECT SUM(seller_amount) as total_earned FROM transactions WHERE seller_id = ? AND status = "completed"',
            [userId]
        );
        
        res.render('admin/edit-user', {
            title: `Edit User - ${user.name}`,
            user: user,
            securityQuestions: securityQuestions,
            stats: {
                songs: songStats[0] || { total_songs: 0, sold_songs: 0 },
                purchases: transactionStats[0] || { total_purchases: 0, total_spent: 0 },
                earnings: earningStats[0] || { total_earned: 0 }
            },
            success: req.query.success,
            error: req.query.error
        });
    } catch (error) {
        console.error('Error loading user edit page:', error);
        res.redirect('/admin/users?error=load_failed');
    }
});

// Edit User - POST (update user)
router.post('/users/:id/edit', isAdmin, async (req, res) => {
    try {
        const pool = await db.getPool();
        const userId = req.params.id;
        const { name, email, whatsapp, is_admin, balance, security_question_id, security_answer } = req.body;
        
        // Validation
        if (!name || !email || !whatsapp || !security_question_id) {
            return res.redirect(`/admin/users/${userId}/edit?error=missing_fields`);
        }
        
        // Check if email is already taken by another user
        const [existingUser] = await pool.execute(
            'SELECT id FROM users WHERE email = ? AND id != ?',
            [email, userId]
        );
        
        if (existingUser.length > 0) {
            return res.redirect(`/admin/users/${userId}/edit?error=email_taken`);
        }
        
        // Prepare update query
        let updateQuery = `
            UPDATE users 
            SET name = ?, email = ?, whatsapp = ?, is_admin = ?, balance = ?, security_question_id = ?, updated_at = CURRENT_TIMESTAMP
        `;
        let updateParams = [name, email, whatsapp, is_admin === 'true' ? 1 : 0, parseFloat(balance) || 0, security_question_id];
        
        // If security answer is provided, hash and update it
        if (security_answer && security_answer.trim()) {
            const hashedAnswer = await bcrypt.hash(security_answer.toLowerCase().trim(), 12);
            updateQuery += `, security_answer = ?`;
            updateParams.push(hashedAnswer);
        }
        
        updateQuery += ` WHERE id = ?`;
        updateParams.push(userId);
        
        // Update user
        await pool.execute(updateQuery, updateParams);
        
        res.redirect(`/admin/users/${userId}/edit?success=user_updated`);
    } catch (error) {
        console.error('Error updating user:', error);
        res.redirect(`/admin/users/${req.params.id}/edit?error=update_failed`);
    }
});

// View User Details - GET
router.get('/users/:id/view', isAdmin, async (req, res) => {
    try {
        const pool = await db.getPool();
        const userId = req.params.id;
        
        // Get user details
        const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.redirect('/admin/users?error=user_not_found');
        }
        
        const user = users[0];
        
        // Get user's songs
        const [songs] = await pool.execute(
            'SELECT * FROM songs WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        
        // Get user's purchases
        const [purchases] = await pool.execute(`
            SELECT t.*, s.title as song_title, u.name as artist_name
            FROM transactions t
            JOIN songs s ON t.song_id = s.id
            JOIN users u ON s.user_id = u.id
            WHERE t.buyer_id = ? AND t.status = 'completed'
            ORDER BY t.created_at DESC
        `, [userId]);
        
        // Get user's sales
        const [sales] = await pool.execute(`
            SELECT t.*, s.title as song_title, u.name as buyer_name
            FROM transactions t
            JOIN songs s ON t.song_id = s.id
            LEFT JOIN users u ON t.buyer_id = u.id
            WHERE t.seller_id = ? AND t.status = 'completed'
            ORDER BY t.created_at DESC
        `, [userId]);
        
        // Get user's withdrawals
        const [withdrawals] = await pool.execute(
            'SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        
        // Get security question
        const [securityQuestion] = await pool.execute(
            'SELECT question FROM security_questions WHERE id = ?',
            [user.security_question_id]
        );
        
        // Calculate statistics
        const totalEarned = sales.reduce((sum, sale) => sum + parseFloat(sale.seller_amount), 0);
        const totalSpent = purchases.reduce((sum, purchase) => sum + parseFloat(purchase.amount), 0);
        
        res.render('admin/view-user', {
            title: `User Details - ${user.name}`,
            user: user,
            songs: songs,
            purchases: purchases,
            sales: sales,
            withdrawals: withdrawals,
            securityQuestion: securityQuestion[0]?.question || 'N/A',
            stats: {
                totalSongs: songs.length,
                soldSongs: songs.filter(s => s.is_sold).length,
                totalEarned: totalEarned,
                totalSpent: totalSpent,
                totalPurchases: purchases.length,
                totalWithdrawals: withdrawals.length
            }
        });
    } catch (error) {
        console.error('Error loading user details:', error);
        res.redirect('/admin/users?error=load_failed');
    }
});

// Process withdrawal
router.post('/withdrawals/:id/process', isAdmin, async (req, res) => {
    try {
        const { action, admin_notes } = req.body;
        const withdrawalId = req.params.id;
        
        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ error: 'Invalid action' });
        }
        
        const pool = await db.getPool();
        
        // Get withdrawal details
        const [withdrawals] = await pool.execute(
            'SELECT * FROM withdrawals WHERE id = ? AND status = "pending"',
            [withdrawalId]
        );
        
        if (withdrawals.length === 0) {
            return res.status(404).json({ error: 'Withdrawal not found or already processed' });
        }
        
        const withdrawal = withdrawals[0];
        const newStatus = action === 'approve' ? 'approved' : 'rejected';
        
        // Update withdrawal status
        await pool.execute(
            'UPDATE withdrawals SET status = ?, admin_notes = ?, updated_at = NOW() WHERE id = ?',
            [newStatus, admin_notes || '', withdrawalId]
        );
        
        // If approved, deduct from user balance
        if (action === 'approve') {
            await pool.execute(
                'UPDATE users SET balance = balance - ? WHERE id = ?',
                [withdrawal.amount, withdrawal.user_id]
            );
        }
        
        res.json({ success: true, message: `Withdrawal ${action}d successfully` });
    } catch (error) {
        console.error('Error processing withdrawal:', error);
        res.status(500).json({ error: 'Error processing withdrawal' });
    }
});

// View all transactions
router.get('/transactions', ensureCurrency, isAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const status = req.query.status || '';
        const payment_method = req.query.payment_method || '';

        const pool = await db.getPool();
        
        // Build where conditions
        let whereConditions = [];
        let queryParams = [];
        
        if (search) {
            whereConditions.push('(s.title LIKE ? OR buyer.name LIKE ? OR buyer.email LIKE ?)');
            queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        
        if (status) {
            whereConditions.push('t.status = ?');
            queryParams.push(status);
        }
        
        if (payment_method) {
            if (payment_method === 'momo') {
                whereConditions.push('t.payment_data IS NOT NULL AND JSON_EXTRACT(t.payment_data, "$.payment_method") = "momo"');
            } else if (payment_method === 'flutterwave') {
                whereConditions.push('(t.payment_data IS NULL OR JSON_EXTRACT(t.payment_data, "$.payment_method") != "momo")');
            }
        }
        
        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
        
        // Get total count
        const [countResult] = await pool.execute(
            `SELECT COUNT(*) as total FROM transactions t 
             JOIN songs s ON t.song_id = s.id 
             LEFT JOIN users buyer ON t.buyer_id = buyer.id 
             ${whereClause}`,
            queryParams
        );
        
        // Get total revenue
        const [revenueResult] = await pool.execute(
            `SELECT SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue 
             FROM transactions t 
             JOIN songs s ON t.song_id = s.id 
             LEFT JOIN users buyer ON t.buyer_id = buyer.id 
             ${whereClause}`,
            queryParams
        );
        
        // Get transactions - amounts are already in USD
        const [transactions] = await pool.execute(`
            SELECT t.*, s.title as song_title, s.cover_image, 
                   seller.name as artist_name, seller.email as artist_email,
                   buyer.name as buyer_name, buyer.email as buyer_email
            FROM transactions t
            JOIN songs s ON t.song_id = s.id
            JOIN users seller ON t.seller_id = seller.id
            LEFT JOIN users buyer ON t.buyer_id = buyer.id
            ${whereClause}
            ORDER BY t.created_at DESC
            LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
        `, queryParams);
        
        const totalTransactions = countResult[0].total;
        const totalPages = Math.ceil(totalTransactions / limit);
        const totalRevenue = revenueResult[0].total_revenue || 0;
        
        res.render('admin/transactions', {
            title: 'Transaction Management',
            user: req.session.user,
            transactions,
            totalRevenue,
            currentPage: page,
            totalPages,
            search,
            status,
            payment_method
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.render('admin/transactions', {
            title: 'Transaction Management',
            user: req.session.user,
            transactions: [],
            totalRevenue: 0,
            currentPage: 1,
            totalPages: 1,
            search: '',
            status: '',
            currency: '',
            error: 'Error loading transactions'
        });
    }
});

// Get transaction details
router.get('/transactions/:id', isAdmin, async (req, res) => {
    try {
        const transactionId = parseInt(req.params.id);
        const pool = await db.getPool();
        
        const [transactions] = await pool.execute(`
            SELECT t.*, s.title as song_title, s.cover_image,
                   seller.name as artist_name, seller.email as artist_email,
                   buyer.name as buyer_name, buyer.email as buyer_email, buyer.whatsapp as customer_phone,
                   CASE 
                       WHEN t.currency = 'USD' THEN t.amount
                       WHEN t.currency = 'RWF' AND t.usd_to_rwf_rate IS NOT NULL AND t.usd_to_rwf_rate > 0 THEN t.amount / t.usd_to_rwf_rate
                       ELSE 0
                   END as usd_equivalent_amount
            FROM transactions t
            JOIN songs s ON t.song_id = s.id
            JOIN users seller ON t.seller_id = seller.id
            LEFT JOIN users buyer ON t.buyer_id = buyer.id
            WHERE t.id = ?
        `, [transactionId]);
        
        if (!transactions.length) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }
        
        res.json({ success: true, transaction: transactions[0] });
    } catch (error) {
        console.error('Transaction details error:', error);
        res.status(500).json({ success: false, error: 'Error loading transaction details' });
    }
});

// Update transaction status
router.put('/transactions/:id/status', isAdmin, async (req, res) => {
    try {
        const transactionId = parseInt(req.params.id);
        const { status } = req.body;
        
        if (!['pending', 'completed', 'failed', 'cancelled'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }
        
        const pool = await db.getPool();
        
        // If status is being set to completed, process the full transaction logic
        if (status === 'completed') {
            // Get the transaction details
            const [transactions] = await pool.execute(
                'SELECT * FROM transactions WHERE id = ? AND status = "pending"',
                [transactionId]
            );
            
            if (transactions.length === 0) {
                return res.status(404).json({ success: false, error: 'Transaction not found or already processed' });
            }
            
            const transaction = transactions[0];
            
            // Process the completion with full business logic
            await processTransactionCompletion(transaction);
            
        } else {
            // For other status updates, just update the status
            await pool.execute(
                'UPDATE transactions SET status = ?, updated_at = NOW() WHERE id = ?',
                [status, transactionId]
            );
        }
        
        res.json({ success: true, message: 'Transaction status updated successfully' });
    } catch (error) {
        console.error('Transaction status update error:', error);
        res.status(500).json({ success: false, error: 'Error updating transaction status' });
    }
});

// Helper function to process transaction completion (extracted from payment processing)
async function processTransactionCompletion(transaction) {
    const pool = await db.getPool();
    const emailService = require('../utils/emailService');
    
    try {
        // Get transaction details with user and song info
        const [transactionDetails] = await pool.execute(`
            SELECT t.*, 
                   s.title as song_title, s.user_id as artist_id,
                   u_buyer.name as buyer_name, u_buyer.email as buyer_email,
                   u_artist.name as artist_name, u_artist.email as artist_email
            FROM transactions t
            JOIN songs s ON t.song_id = s.id
            LEFT JOIN users u_buyer ON t.buyer_id = u_buyer.id
            JOIN users u_artist ON s.user_id = u_artist.id
            WHERE t.id = ?
        `, [transaction.id]);
        
        if (!transactionDetails.length) {
            throw new Error('Transaction details not found');
        }
        
        const details = transactionDetails[0];
        
        // Get settings for commission calculation
        const [settings] = await pool.execute('SELECT * FROM settings WHERE id = 1');
        const sellerCommissionRate = settings[0]?.seller_commission_rate || 0.6; // Seller gets 60%
        const shareCommissionRate = settings[0]?.share_commission_rate || 0.15; // Share commission 15%
        
        // All amounts are already stored in USD, so no conversion needed
        const usdAmount = parseFloat(transaction.amount);
        
        // Calculate amounts based on USD amount: seller gets seller_commission_rate, admin gets the rest
        const sellerAmount = usdAmount * sellerCommissionRate;
        const adminCommission = usdAmount - sellerAmount;
        
        console.log(`Transaction ${transaction.id} commission calculation:`);
        console.log(`- Transaction amount: $${usdAmount} USD`);
        console.log(`- Seller commission rate: ${sellerCommissionRate * 100}%`);
        console.log(`- Seller amount: $${sellerAmount} USD`);
        console.log(`- Admin commission: $${adminCommission} USD`);
        
        // Start database transaction
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Update transaction status and amounts
        await connection.execute(
            `UPDATE transactions SET 
             status = 'completed', 
             seller_amount = ?, 
             commission_amount = ?, 
             completed_at = NOW()
             WHERE id = ?`,
            [sellerAmount, adminCommission, transaction.id]
        );

        // Update seller's balance
        await connection.execute(
            'UPDATE users SET balance = balance + ? WHERE id = ?',
            [sellerAmount, transaction.seller_id]
        );

        // Mark song as sold
        await connection.execute(
            'UPDATE songs SET is_sold = TRUE, sold_at = NOW() WHERE id = ?',
            [transaction.song_id]
        );

        // Handle referrer commission if applicable
        if (transaction.referrer_id) {
            const shareCommission = usdAmount * shareCommissionRate;
            
            // Update referrer's balance
            await connection.execute(
                'UPDATE users SET balance = balance + ? WHERE id = ?',
                [shareCommission, transaction.referrer_id]
            );
            
            // Record share commission
            await connection.execute(
                `INSERT INTO share_commissions (
                    transaction_id, sharer_id, song_id, commission_amount
                ) VALUES (?, ?, ?, ?)`,
                [transaction.id, transaction.referrer_id, transaction.song_id, shareCommission]
            );
            
            // Adjust seller amount (deduct share commission from seller)
            const adjustedSellerAmount = sellerAmount - shareCommission;
            await connection.execute(
                'UPDATE transactions SET seller_amount = ? WHERE id = ?',
                [adjustedSellerAmount, transaction.id]
            );
            
            await connection.execute(
                'UPDATE users SET balance = balance - ? WHERE id = ?',
                [shareCommission, transaction.seller_id]
            );
        }

        // Commit database transaction
        await connection.commit();
        connection.release();
        
        // Send email notifications
        try {
            // Use customer_email if buyer_email is not available
            const buyerEmail = details.buyer_email || transaction.customer_email;
            const buyerName = details.buyer_name || transaction.customer_name;
            
            // Send order completion email to buyer
            if (buyerEmail) {
                await emailService.sendOrderCompletionEmail(
                    { name: buyerName, email: buyerEmail },
                    { title: details.song_title, artist_name: details.artist_name },
                    { ...transaction, status: 'completed' }
                );
                console.log('Order completion email sent to buyer:', buyerEmail);
            }
            
            // Send sale notification email to artist
            if (details.artist_email) {
                await emailService.sendArtistSaleNotificationEmail(
                    { name: details.artist_name, email: details.artist_email },
                    { title: details.song_title },
                    { ...transaction, buyer_name: buyerName, status: 'completed' }
                );
                console.log('Sale notification email sent to artist:', details.artist_email);
            }
        } catch (emailError) {
            console.error('Email notification error:', emailError);
            // Don't fail the transaction if emails fail
        }
        
        console.log('Transaction completed successfully by admin:', transaction.id);
    } catch (error) {
        // Rollback on error
        if (typeof connection !== 'undefined') {
            await connection.rollback();
            connection.release();
        }
        console.error('Transaction completion error:', error);
        throw error;
    }
}

// User revenue details
router.get('/users/:id/revenue', ensureCurrency, isAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const pool = await db.getPool();
        
        // Get user details
        const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).render('error', { message: 'User not found' });
        }
        
        // Get user's transactions
        const [transactions] = await pool.execute(`
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
        
        res.render('admin/user-revenue', {
            title: `Revenue for ${users[0].name}`,
            user: req.session.user,
            targetUser: users[0],
            transactions,
            withdrawals
        });
    } catch (error) {
        console.error('Error fetching user revenue:', error);
        res.status(500).render('error', { message: 'Error loading user revenue' });
    }
});

// Get withdrawal requests
router.get('/withdrawals', ensureCurrency, isAdmin, async (req, res) => {
    try {
        const pool = await db.getPool();
        
        // Get all withdrawals with user details and account information
        const [withdrawals] = await pool.execute(`
            SELECT 
                w.*,
                u.name, 
                u.email,
                CASE 
                    WHEN w.account_type = 'mobile_money' THEN CONCAT(w.momo_operator, ' - ', w.account_number)
                    WHEN w.account_type = 'bank' THEN CONCAT(w.bank_name, ' - ', w.account_number)
                    ELSE 'Account details not provided'
                END as account_details
            FROM withdrawals w
            JOIN users u ON w.user_id = u.id
            ORDER BY w.created_at DESC
        `);
        
        // Get withdrawal statistics
        const [stats] = await pool.execute(`
            SELECT 
                COUNT(*) as total_withdrawals,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_withdrawals,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_withdrawals,
                COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_withdrawals,
                COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as total_approved_amount,
                COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as total_pending_amount
            FROM withdrawals
        `);

        res.render('admin/withdrawals', {
            title: 'Withdrawal Management',
            user: req.session.user,
            withdrawals,
            stats: stats[0] || {
                total_withdrawals: 0,
                pending_withdrawals: 0,
                approved_withdrawals: 0,
                rejected_withdrawals: 0,
                total_approved_amount: 0,
                total_pending_amount: 0
            }
        });
    } catch (error) {
        console.error('Withdrawal fetch error:', error);
        res.status(500).render('error', { 
            message: 'Error loading withdrawals page',
            error: error.message 
        });
    }
});

// Update withdrawal status
router.put('/withdrawals/:id', isAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const pool = await db.getPool();
        await pool.execute(
            'UPDATE withdrawals SET status = ? WHERE id = ?',
            [status, req.params.id]
        );

        res.json({ message: 'Withdrawal status updated successfully' });
    } catch (error) {
        console.error('Withdrawal update error:', error);
        res.status(500).json({ message: 'Error updating withdrawal' });
    }
});

// Get revenue reports
router.get('/revenue', ensureCurrency, isAdmin, async (req, res) => {
    try {
        const { startDate, endDate, format } = req.query;
        
        const pool = await db.getPool();
        
        // Set default date range if not provided
        const defaultStartDate = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 30 days ago
        const defaultEndDate = endDate || new Date().toISOString().split('T')[0]; // today
        
        // If format is JSON (for API calls), return just the data
        if (format === 'json') {
            const [revenue] = await pool.execute(`
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as transactions,
                    SUM(amount) as total_amount,
                    SUM(commission_amount) as commission_earned
                FROM transactions
                WHERE created_at BETWEEN ? AND ?
                AND status = 'completed'
                GROUP BY DATE(created_at)
                ORDER BY date DESC
            `, [defaultStartDate, defaultEndDate]);

            return res.json(revenue);
        }
        
        // Get overall revenue statistics
        const [totalStats] = await pool.execute(`
            SELECT 
                COUNT(*) as total_transactions,
                SUM(amount) as total_revenue,
                SUM(commission_amount) as total_commission,
                AVG(amount) as avg_transaction_amount
            FROM transactions
            WHERE created_at BETWEEN ? AND ?
            AND status = 'completed'
        `, [defaultStartDate, defaultEndDate]);
        
        // Get daily revenue breakdown
        const [dailyRevenue] = await pool.execute(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as transactions,
                SUM(amount) as total_amount,
                SUM(commission_amount) as commission_earned
            FROM transactions
            WHERE created_at BETWEEN ? AND ?
            AND status = 'completed'
            GROUP BY DATE(created_at)
            ORDER BY date DESC
            LIMIT 30
        `, [defaultStartDate, defaultEndDate]);
        
        // Get top selling songs in the period
        const [topSongs] = await pool.execute(`
            SELECT 
                s.title,
                s.genre,
                s.style,
                COUNT(t.id) as sales_count,
                SUM(t.amount) as total_revenue,
                u.name as seller_name
            FROM transactions t
            JOIN songs s ON t.song_id = s.id
            JOIN users u ON t.seller_id = u.id
            WHERE t.created_at BETWEEN ? AND ?
            AND t.status = 'completed'
            GROUP BY s.id
            ORDER BY total_revenue DESC
            LIMIT 10
        `, [defaultStartDate, defaultEndDate]);
        
        // Get top earning sellers
        const [topSellers] = await pool.execute(`
            SELECT 
                u.name as seller_name,
                COUNT(t.id) as sales_count,
                SUM(t.amount) as total_revenue,
                SUM(t.amount - t.commission_amount) as seller_earnings
            FROM transactions t
            JOIN users u ON t.seller_id = u.id
            WHERE t.created_at BETWEEN ? AND ?
            AND t.status = 'completed'
            GROUP BY u.id
            ORDER BY total_revenue DESC
            LIMIT 10
        `, [defaultStartDate, defaultEndDate]);

        res.render('admin/revenue', {
            title: 'Revenue Report',
            user: req.session.user,
            stats: totalStats[0] || {
                total_transactions: 0,
                total_revenue: 0,
                total_commission: 0,
                avg_transaction_amount: 0
            },
            dailyRevenue,
            topSongs,
            topSellers,
            startDate: defaultStartDate,
            endDate: defaultEndDate
        });
    } catch (error) {
        console.error('Revenue report error:', error);
        res.status(500).render('error', { 
            message: 'Error generating revenue report',
            error: error.message 
        });
    }
});

// View share commissions and referrals
router.get('/commissions', ensureCurrency, isAdmin, async (req, res) => {
    try {
        const pool = await db.getPool();
        
        // Get commission statistics - amounts are already in USD
        const [commissionStats] = await pool.execute(`
            SELECT 
                SUM(commission_amount) as total_commission,
                COUNT(*) as total_transactions
            FROM transactions 
            WHERE status = 'completed'
        `);
        
        // Get monthly commission - amounts are already in USD
        const [monthlyCommission] = await pool.execute(`
            SELECT SUM(commission_amount) as monthly_commission
            FROM transactions 
            WHERE status = 'completed' AND MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW())
        `);
        
        // Get settings
        const [settings] = await pool.execute('SELECT * FROM settings WHERE id = 1');
        const setting = settings[0] || {};
        
        // Get recent commission transactions - amounts are already in USD
        const [commissionTransactions] = await pool.execute(`
            SELECT t.*, s.title as song_title, u.name as artist_name
            FROM transactions t
            JOIN songs s ON t.song_id = s.id
            JOIN users u ON s.user_id = u.id
            WHERE t.status = 'completed'
            ORDER BY t.created_at DESC
            LIMIT 50
        `);
        
        // Get share commissions
        const [shareCommissions] = await pool.execute(`
            SELECT sc.*, u.name as sharer_name, s.title as song_title, seller.name as seller_name
            FROM share_commissions sc
            JOIN users u ON sc.sharer_id = u.id
            JOIN songs s ON sc.song_id = s.id
            JOIN users seller ON s.user_id = seller.id
            ORDER BY sc.created_at DESC
            LIMIT 100
        `);
        
        // Get referral commissions
        const [referralCommissions] = await pool.execute(`
            SELECT rc.*, referrer.name as referrer_name, referred.name as referred_name
            FROM referral_commissions rc
            JOIN users referrer ON rc.referrer_id = referrer.id
            JOIN users referred ON rc.referred_id = referred.id
            ORDER BY rc.created_at DESC
            LIMIT 100
        `);
        
        const stats = {
            totalCommission: parseFloat(commissionStats[0].total_commission) || 0,
            monthlyCommission: parseFloat(monthlyCommission[0].monthly_commission) || 0,
            totalTransactions: commissionStats[0].total_transactions || 0,
            commissionRate: setting.commission_rate || 40,
            referralRate: setting.referral_rate || 5,
            shareCommissionRate: setting.share_commission_rate || 15,
            platformCommission: parseFloat(commissionStats[0].total_commission) || 0,
            artistEarnings: 0, // Calculate if needed
            referralCommission: 0, // Calculate if needed
            shareCommission: 0 // Calculate if needed
        };
        
        res.render('admin/commissions', {
            title: 'Commission Management',
            currentPage: 'commissions',
            user: req.session.user,
            stats,
            commissionTransactions,
            shareCommissions,
            referralCommissions
        });
    } catch (error) {
        console.error('Error fetching commissions:', error);
        res.render('admin/commissions', {
            title: 'Commission Management',
            currentPage: 'commissions',
            user: req.session.user,
            stats: {
                totalCommission: 0,
                monthlyCommission: 0,
                totalTransactions: 0,
                commissionRate: 40,
                referralRate: 5,
                shareCommissionRate: 15,
                platformCommission: 0,
                artistEarnings: 0,
                referralCommission: 0,
                shareCommission: 0
            },
            commissionTransactions: [],
            shareCommissions: [],
            referralCommissions: [],
            error: 'Error loading commission data'
        });
    }
});

// Update commission settings
router.post('/settings/commission', isAdmin, async (req, res) => {
    try {
        const { commission_rate, referral_rate, share_commission_rate } = req.body;
        
        // Validate input
        if (!commission_rate || !referral_rate || !share_commission_rate) {
            return res.status(400).json({ success: false, error: 'All commission rates are required' });
        }
        
        // Validate ranges
        if (commission_rate < 0 || commission_rate > 100 || 
            referral_rate < 0 || referral_rate > 100 || 
            share_commission_rate < 0 || share_commission_rate > 100) {
            return res.status(400).json({ success: false, error: 'Commission rates must be between 0 and 100' });
        }
        
        const pool = await db.getPool();
        
        // Update settings
        await pool.execute(`
            UPDATE settings 
            SET commission_rate = ?, referral_rate = ?, share_commission_rate = ?, updated_at = NOW()
            WHERE id = 1
        `, [commission_rate, referral_rate, share_commission_rate]);
        
        res.json({ success: true, message: 'Commission settings updated successfully' });
    } catch (error) {
        console.error('Error updating commission settings:', error);
        res.status(500).json({ success: false, error: 'Failed to update commission settings' });
    }
});

// View platform statistics
router.get('/statistics', ensureCurrency, isAdmin, async (req, res) => {
    try {
        const pool = await db.getPool();
        
        // Get basic statistics
        const [userStats] = await pool.execute('SELECT COUNT(*) as total_users FROM users WHERE is_admin = 0');
        const [songStats] = await pool.execute('SELECT COUNT(*) as total_songs FROM songs');
        const [revenueStats] = await pool.execute(`
            SELECT SUM(
                CASE 
                    WHEN currency = 'USD' THEN amount
                    WHEN currency = 'RWF' AND usd_to_rwf_rate IS NOT NULL AND usd_to_rwf_rate > 0 THEN amount / usd_to_rwf_rate
                    ELSE amount
                END
            ) as total_revenue, COUNT(*) as total_sales 
            FROM transactions 
            WHERE status = "completed"
        `);
        
        // Get top performing songs
        const [topSongs] = await pool.execute(`
            SELECT s.title, u.name as artist_name, COUNT(t.id) as sales_count, 
                   SUM(
                       CASE 
                           WHEN t.currency = 'USD' THEN t.amount
                           WHEN t.currency = 'RWF' AND t.usd_to_rwf_rate IS NOT NULL AND t.usd_to_rwf_rate > 0 THEN t.amount / t.usd_to_rwf_rate
                           ELSE t.amount
                       END
                   ) as total_revenue
            FROM songs s
            JOIN users u ON s.user_id = u.id
            JOIN transactions t ON s.id = t.song_id
            WHERE t.status = 'completed'
            GROUP BY s.id
            ORDER BY total_revenue DESC
            LIMIT 5
        `);
        
        // Get revenue trend data (last 30 days)
        const [revenueData] = await pool.execute(`
            SELECT DATE(created_at) as date, SUM(
                CASE 
                    WHEN currency = 'USD' THEN amount
                    WHEN currency = 'RWF' AND usd_to_rwf_rate IS NOT NULL AND usd_to_rwf_rate > 0 THEN amount / usd_to_rwf_rate
                    ELSE amount
                END
            ) as daily_revenue
            FROM transactions 
            WHERE status = 'completed' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `);
        
        // Get currency breakdown
        const [currencyStats] = await pool.execute(`
            SELECT currency, COUNT(*) as sales_count
            FROM transactions 
            WHERE status = 'completed'
            GROUP BY currency
        `);
        
        // Get monthly data
        const [monthlyData] = await pool.execute(`
            SELECT SUM(
                CASE 
                    WHEN currency = 'USD' THEN amount
                    WHEN currency = 'RWF' AND usd_to_rwf_rate IS NOT NULL AND usd_to_rwf_rate > 0 THEN amount / usd_to_rwf_rate
                    ELSE amount
                END
            ) as monthly_revenue, COUNT(*) as monthly_sales
            FROM transactions 
            WHERE status = 'completed' AND MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW())
        `);
        
        const [monthlyUsers] = await pool.execute(`
            SELECT COUNT(*) as monthly_new_users
            FROM users 
            WHERE MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW())
        `);
        
        // Get recent activity
        const [recentActivity] = await pool.execute(`
            SELECT 'Purchase' as type, CONCAT('User purchased "', s.title, '"') as description, t.created_at
            FROM transactions t
            JOIN songs s ON t.song_id = s.id
            WHERE t.status = 'completed'
            ORDER BY t.created_at DESC
            LIMIT 10
        `);
        
        // Prepare chart data
        const revenueLabels = revenueData.map(d => d.date);
        const revenueValues = revenueData.map(d => parseFloat(d.daily_revenue) || 0);
        
        const usdSales = currencyStats.find(c => c.currency === 'USD')?.sales_count || 0;
        const rwfSales = currencyStats.find(c => c.currency === 'RWF')?.sales_count || 0;
        
        const stats = {
            totalRevenue: parseFloat(revenueStats[0].total_revenue) || 0,
            totalSales: revenueStats[0].total_sales || 0,
            totalUsers: userStats[0].total_users || 0,
            totalSongs: songStats[0].total_songs || 0,
            topSongs: topSongs,
            revenueLabels: revenueLabels,
            revenueData: revenueValues,
            usdSales: usdSales,
            rwfSales: rwfSales,
            monthlyRevenue: parseFloat(monthlyData[0].monthly_revenue) || 0,
            monthlySales: monthlyData[0].monthly_sales || 0,
            monthlyNewUsers: monthlyUsers[0].monthly_new_users || 0,
            monthlyGrowth: 0, // Calculate if needed
            userGrowth: 0, // Calculate if needed
            recentActivity: recentActivity
        };
        
        res.render('admin/statistics', {
            title: 'Platform Statistics',
            currentPage: 'statistics',
            user: req.session.user,
            stats
        });
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.render('admin/statistics', {
            title: 'Platform Statistics',
            currentPage: 'statistics',
            user: req.session.user,
            stats: {
                totalRevenue: 0,
                totalSales: 0,
                totalUsers: 0,
                totalSongs: 0,
                topSongs: [],
                revenueLabels: [],
                revenueData: [],
                usdSales: 0,
                rwfSales: 0,
                monthlyRevenue: 0,
                monthlySales: 0,
                monthlyNewUsers: 0,
                monthlyGrowth: 0,
                userGrowth: 0,
                recentActivity: []
            },
            error: 'Error loading statistics'
        });
    }
});

// Export data for reporting
router.get('/export/:type', isAdmin, async (req, res) => {
    try {
        const { type } = req.params;
        const pool = await db.getPool();
        
        let data = [];
        let filename = '';
        
        switch (type) {
            case 'users':
                [data] = await pool.execute(`
                    SELECT u.id, u.name, u.email, u.whatsapp, u.balance, u.created_at,
                           COUNT(DISTINCT s.id) as total_songs,
                           COUNT(DISTINCT CASE WHEN s.is_sold = 1 THEN s.id END) as sold_songs
                    FROM users u
                    LEFT JOIN songs s ON u.id = s.user_id
                    WHERE u.is_admin = 0
                    GROUP BY u.id
                `);
                filename = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
                break;
                
            case 'transactions':
                [data] = await pool.execute(`
                    SELECT t.*, s.title as song_title, seller.name as seller_name, 
                           buyer.name as buyer_name
                    FROM transactions t
                    JOIN songs s ON t.song_id = s.id
                    JOIN users seller ON t.seller_id = seller.id
                    LEFT JOIN users buyer ON t.buyer_id = buyer.id
                    ORDER BY t.created_at DESC
                `);
                filename = `transactions_export_${new Date().toISOString().split('T')[0]}.csv`;
                break;
                
            case 'songs':
                [data] = await pool.execute(`
                    SELECT s.*, u.name as artist_name
                    FROM songs s
                    JOIN users u ON s.user_id = u.id
                    ORDER BY s.created_at DESC
                `);
                filename = `songs_export_${new Date().toISOString().split('T')[0]}.csv`;
                break;
                
            case 'withdrawals':
                [data] = await pool.execute(`
                    SELECT 
                        w.id,
                        w.amount,
                        w.status,
                        w.account_type,
                        w.account_number,
                        w.account_name,
                        w.bank_name,
                        w.momo_operator,
                        w.whatsapp_number,
                        w.created_at,
                        w.updated_at,
                        w.admin_notes,
                        u.name as user_name,
                        u.email as user_email
                    FROM withdrawals w
                    JOIN users u ON w.user_id = u.id
                    ORDER BY w.created_at DESC
                `);
                filename = `withdrawals_export_${new Date().toISOString().split('T')[0]}.csv`;
                break;
                
            default:
                return res.status(400).json({ error: 'Invalid export type' });
        }
        
        // Convert to CSV
        if (data.length === 0) {
            return res.status(404).json({ error: 'No data to export' });
        }
        
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => {
                const value = row[header];
                // Escape commas and quotes in CSV
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value || '';
            }).join(','))
        ].join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvContent);
        
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Export failed' });
    }
});

// Export withdrawals to Excel
router.get('/export-withdrawals', isAdmin, async (req, res) => {
    try {
        const pool = await db.getPool();
        
        const [withdrawals] = await pool.execute(`
            SELECT 
                w.id,
                w.amount,
                w.status,
                w.account_type,
                w.account_number,
                w.account_name,
                w.bank_name,
                w.momo_operator,
                w.whatsapp_number,
                w.created_at,
                w.updated_at,
                w.admin_notes,
                u.name as user_name,
                u.email as user_email,
                u.whatsapp as user_whatsapp
            FROM withdrawals w
            JOIN users u ON w.user_id = u.id
            ORDER BY w.created_at DESC
        `);
        
        // Create Excel workbook
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Withdrawals');
        
        // Add headers
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Amount', key: 'amount', width: 15 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Account Type', key: 'account_type', width: 20 },
            { header: 'Account Number', key: 'account_number', width: 20 },
            { header: 'Account Name', key: 'account_name', width: 25 },
            { header: 'Bank Name', key: 'bank_name', width: 20 },
            { header: 'Mobile Money Operator', key: 'momo_operator', width: 25 },
            { header: 'WhatsApp Number', key: 'whatsapp_number', width: 20 },
            { header: 'User Name', key: 'user_name', width: 25 },
            { header: 'User Email', key: 'user_email', width: 30 },
            { header: 'User WhatsApp', key: 'user_whatsapp', width: 20 },
            { header: 'Created Date', key: 'created_at', width: 20 },
            { header: 'Updated Date', key: 'updated_at', width: 20 },
            { header: 'Admin Notes', key: 'admin_notes', width: 40 }
        ];
        
        // Add data
        withdrawals.forEach(withdrawal => {
            worksheet.addRow({
                ...withdrawal,
                amount: parseFloat(withdrawal.amount || 0).toFixed(2),
                created_at: new Date(withdrawal.created_at).toLocaleDateString(),
                updated_at: withdrawal.updated_at ? new Date(withdrawal.updated_at).toLocaleDateString() : ''
            });
        });
        
        // Style headers
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6F3FF' }
        };
        
        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=withdrawals_export_${new Date().toISOString().split('T')[0]}.xlsx`);
        
        // Send file
        await workbook.xlsx.write(res);
        res.end();
        
    } catch (error) {
        console.error('Export withdrawals error:', error);
        res.status(500).json({ error: 'Failed to export withdrawals' });
    }
});

// Notifications Management Page
router.get('/notifications', ensureCurrency, isAdmin, async (req, res) => {
    try {
        const pool = await db.getPool();
        
        // Get all users for targeting
        const [users] = await pool.execute('SELECT id, name, email FROM users WHERE is_admin = 0 ORDER BY name');
        
        // Get recent notifications
        const [recentNotifications] = await pool.execute(`
            SELECT n.*, u.name as user_name 
            FROM notifications n 
            LEFT JOIN users u ON n.user_id = u.id 
            ORDER BY n.created_at DESC 
            LIMIT 50
        `);
        
        res.render('admin/notifications', {
            title: 'Notifications Management',
            currentPage: 'notifications',
            users,
            recentNotifications,
            user: req.session.user
        });
    } catch (error) {
        console.error('Notifications page error:', error);
        res.render('admin/notifications', {
            title: 'Notifications Management',
            currentPage: 'notifications',
            users: [],
            recentNotifications: [],
            user: req.session.user,
            error: 'Error loading notifications data'
        });
    }
});

// Send Mass Email
router.post('/send-mass-email', isAdmin, async (req, res) => {
    try {
        const { subject, message, targetUsers } = req.body;
        
        if (!subject || !message) {
            return res.json({ success: false, error: 'Subject and message are required' });
        }
        
        let userFilter = {};
        if (targetUsers && targetUsers !== 'all') {
            userFilter.userIds = Array.isArray(targetUsers) ? targetUsers : [targetUsers];
        }
        
        const results = await notificationService.sendMassEmail(subject, message, userFilter);
        
        res.json({
            success: true,
            message: `Email sent successfully! Sent: ${results.sent}, Failed: ${results.failed}, Total: ${results.total}`
        });
        
    } catch (error) {
        console.error('Mass email error:', error);
        res.json({ success: false, error: 'Failed to send mass email' });
    }
});

// Send Admin Announcement
router.post('/send-announcement', isAdmin, async (req, res) => {
    try {
        const { title, message, channels, targetUsers } = req.body;
        
        if (!title || !message) {
            return res.json({ success: false, error: 'Title and message are required' });
        }
        
        const pool = await db.getPool();
        let users = [];
        
        if (targetUsers === 'all') {
            const [allUsers] = await pool.execute('SELECT id FROM users WHERE is_admin = 0');
            users = allUsers;
        } else {
            const userIds = Array.isArray(targetUsers) ? targetUsers : [targetUsers];
            if (userIds.length > 0) {
                const placeholders = userIds.map(() => '?').join(',');
                const [selectedUsers] = await pool.execute(
                    `SELECT id FROM users WHERE id IN (${placeholders})`,
                    userIds
                );
                users = selectedUsers;
            }
        }
        
        let results = { sent: 0, failed: 0 };
        
        for (const user of users) {
            const options = {
                sendEmail: channels.includes('email'),
                sendPush: channels.includes('push')
            };
            
            const result = await notificationService.sendNotification(
                user.id,
                'info',
                title,
                message,
                options
            );
            
            if (result.inApp || result.email || result.push) {
                results.sent++;
            } else {
                results.failed++;
            }
        }
        
        res.json({
            success: true,
            message: `Announcement sent! Reached: ${results.sent} users, Failed: ${results.failed}`
        });
        
    } catch (error) {
        console.error('Announcement error:', error);
        res.json({ success: false, error: 'Failed to send announcement' });
    }
});

// Export Users to Excel
router.get('/export-users', isAdmin, async (req, res) => {
    try {
        const pool = await db.getPool();
        
        const [users] = await pool.execute(`
            SELECT 
                u.id,
                u.name,
                u.email,
                u.whatsapp,
                u.balance,
                u.referral_code,
                u.created_at,
                referred_by_user.name as referred_by_name,
                (SELECT COUNT(*) FROM songs WHERE user_id = u.id) as total_songs,
                (SELECT COUNT(*) FROM songs WHERE user_id = u.id AND is_sold = 1) as sold_songs,
                (SELECT SUM(seller_amount) FROM transactions WHERE seller_id = u.id AND status = 'completed') as total_earnings
            FROM users u
            LEFT JOIN users referred_by_user ON u.referred_by = referred_by_user.id
            WHERE u.is_admin = 0
            ORDER BY u.created_at DESC
        `);
        
        // Create Excel workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Users');
        
        // Add headers
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Name', key: 'name', width: 20 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'WhatsApp', key: 'whatsapp', width: 15 },
            { header: 'Balance', key: 'balance', width: 15 },
            { header: 'Referral Code', key: 'referral_code', width: 20 },
            { header: 'Referred By', key: 'referred_by_name', width: 20 },
            { header: 'Total Songs', key: 'total_songs', width: 15 },
            { header: 'Sold Songs', key: 'sold_songs', width: 15 },
            { header: 'Total Earnings', key: 'total_earnings', width: 15 },
            { header: 'Joined Date', key: 'created_at', width: 20 }
        ];
        
        // Add data
        users.forEach(user => {
            worksheet.addRow({
                ...user,
                balance: parseFloat(user.balance || 0).toFixed(2),
                total_earnings: parseFloat(user.total_earnings || 0).toFixed(2),
                created_at: new Date(user.created_at).toLocaleDateString()
            });
        });
        
        // Style headers
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6F3FF' }
        };
        
        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=users_export_${new Date().toISOString().split('T')[0]}.xlsx`);
        
        // Send file
        await workbook.xlsx.write(res);
        res.end();
        
    } catch (error) {
        console.error('Export users error:', error);
        res.status(500).json({ error: 'Failed to export users' });
    }
});

// Main Export Page
router.get('/export', ensureCurrency, isAdmin, async (req, res) => {
    try {
        const pool = await db.getPool();
        
        // Get export statistics
        const [userCount] = await pool.execute('SELECT COUNT(*) as count FROM users WHERE is_admin = 0');
        const [songCount] = await pool.execute('SELECT COUNT(*) as count FROM songs');
        const [transactionCount] = await pool.execute('SELECT COUNT(*) as count FROM transactions');
        const [withdrawalCount] = await pool.execute('SELECT COUNT(*) as count FROM withdrawals');
        const [notificationCount] = await pool.execute('SELECT COUNT(*) as count FROM notifications');
        
        const stats = {
            users: userCount[0].count,
            songs: songCount[0].count,
            transactions: transactionCount[0].count,
            withdrawals: withdrawalCount[0].count,
            notifications: notificationCount[0].count
        };
        
        res.render('admin/export', {
            title: 'Data Export',
            currentPage: 'export',
            user: req.session.user,
            stats
        });
    } catch (error) {
        console.error('Export page error:', error);
        res.render('admin/export', {
            title: 'Data Export',
            currentPage: 'export',
            user: req.session.user,
            stats: {
                users: 0,
                songs: 0,
                transactions: 0,
                withdrawals: 0,
                notifications: 0
            },
            error: 'Error loading export data'
        });
    }
});

// Platform Settings Management
router.get('/settings', ensureCurrency, isAdmin, async (req, res) => {
    try {
        const pool = await db.getPool();
        const [settings] = await pool.execute('SELECT * FROM settings WHERE id = 1');
        
        const currentSettings = settings[0] || {
            seller_commission_rate: 0.6,
            share_commission_rate: 0.15,
            referral_commission_rate: 0.05,
            min_withdrawal_amount: 10,
            platform_name: 'Naweririmba',
            support_whatsapp: '',
            max_song_duration: 600,
            max_file_size: 50,
            allowed_formats: 'mp3,wav,aac,m4a'
        };
        
        res.render('admin/settings', {
            title: 'Platform Settings',
            settings: currentSettings,
            user: req.session.user
        });
    } catch (error) {
        console.error('Settings page error:', error);
        res.render('admin/settings', {
            title: 'Platform Settings',
            settings: {},
            user: req.session.user,
            error: 'Error loading settings'
        });
    }
});

// Update Platform Settings
router.post('/settings', isAdmin, async (req, res) => {
    try {
        const {
            seller_commission_rate,
            share_commission_rate,
            referral_commission_rate,
            min_withdrawal_amount,
            platform_name,
            support_whatsapp,
            max_song_duration,
            max_file_size,
            allowed_formats,
            smtp_host,
            smtp_port,
            smtp_user,
            smtp_pass,
            onesignal_app_id,
            onesignal_api_key
        } = req.body;
        
        const pool = await db.getPool();
        
        // Update or insert settings
        await pool.execute(`
            INSERT INTO settings (
                id, seller_commission_rate, share_commission_rate, referral_commission_rate,
                min_withdrawal_amount, platform_name, support_whatsapp, max_song_duration,
                max_file_size, allowed_formats
            ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                seller_commission_rate = VALUES(seller_commission_rate),
                share_commission_rate = VALUES(share_commission_rate),
                referral_commission_rate = VALUES(referral_commission_rate),
                min_withdrawal_amount = VALUES(min_withdrawal_amount),
                platform_name = VALUES(platform_name),
                support_whatsapp = VALUES(support_whatsapp),
                max_song_duration = VALUES(max_song_duration),
                max_file_size = VALUES(max_file_size),
                allowed_formats = VALUES(allowed_formats)
        `, [
            seller_commission_rate, share_commission_rate, referral_commission_rate,
            min_withdrawal_amount, platform_name, support_whatsapp, max_song_duration,
            max_file_size, allowed_formats
        ]);
        
        // Update environment variables (this would typically require a restart)
        if (smtp_host || smtp_user || onesignal_app_id) {
            // In a production environment, you might want to store these in the database
            // or update the .env file and restart the application
            console.log('External service settings updated - restart may be required');
        }
        
        res.json({ success: true, message: 'Settings updated successfully' });
        
    } catch (error) {
        console.error('Settings update error:', error);
        res.json({ success: false, error: 'Failed to update settings' });
    }
});

// Get Notification Statistics
router.get('/api/notification-stats', isAdmin, async (req, res) => {
    try {
        const pool = await db.getPool();
        
        const [stats] = await pool.execute(`
            SELECT 
                COUNT(*) as total_notifications,
                COUNT(CASE WHEN is_read = 0 THEN 1 END) as unread_notifications,
                COUNT(CASE WHEN type = 'success' THEN 1 END) as success_notifications,
                COUNT(CASE WHEN type = 'error' THEN 1 END) as error_notifications,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as last_24h_notifications
            FROM notifications
        `);
        
        res.json({ success: true, stats: stats[0] });
        
    } catch (error) {
        console.error('Notification stats error:', error);
        res.json({ success: false, error: 'Failed to get notification statistics' });
    }
});

// Admin Songs Management
router.get('/songs', ensureCurrency, isAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const status = req.query.status || '';
        const genre = req.query.genre || '';

        const pool = await db.getPool();
        
        // Build where conditions
        let whereConditions = [];
        let queryParams = [];
        
        if (search) {
            whereConditions.push('(s.title LIKE ? OR u.name LIKE ?)');
            queryParams.push(`%${search}%`, `%${search}%`);
        }
        
        if (status) {
            if (status === 'sold') {
                whereConditions.push('s.is_sold = 1');
            } else if (status === 'unsold') {
                whereConditions.push('s.is_sold = 0');
            }
        }
        
        if (genre) {
            whereConditions.push('s.genre = ?');
            queryParams.push(genre);
        }
        
        const whereClause = whereConditions.length > 0 ? whereConditions.join(' AND ') : '1=1';
        
        // Get total count
        const [countResult] = await pool.execute(
            `SELECT COUNT(*) as total FROM songs s 
             JOIN users u ON s.user_id = u.id 
             WHERE ${whereClause}`,
            queryParams
        );
        
        // Get songs with stats
        const [songs] = await pool.execute(`
            SELECT s.*, u.name as artist_name, u.email as artist_email,
                   COUNT(DISTINCT t.id) as total_sales,
                   SUM(CASE WHEN t.status = 'completed' THEN t.amount ELSE 0 END) as total_revenue
            FROM songs s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN transactions t ON s.id = t.song_id
            WHERE ${whereClause}
            GROUP BY s.id, u.id
            ORDER BY s.created_at DESC
            LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
        `, queryParams);
        
        const totalSongs = countResult[0].total;
        const totalPages = Math.ceil(totalSongs / limit);
        
        // Get unique genres for filter
        const [genres] = await pool.execute('SELECT DISTINCT genre FROM songs WHERE genre IS NOT NULL ORDER BY genre');
        
        res.render('admin/songs', {
            title: 'Songs Management',
            user: req.session.user,
            songs,
            genres: genres.map(g => g.genre),
            currentPage: page,
            totalPages,
            totalSongs,
            search,
            status,
            genre
        });
    } catch (error) {
        console.error('Admin songs page error:', error);
        res.status(500).render('error', { 
            message: 'Error loading songs management page' 
        });
    }
});

// Get song details for admin
router.get('/songs/:id', isAdmin, async (req, res) => {
    try {
        const songId = parseInt(req.params.id);
        const pool = await db.getPool();
        
        const [songs] = await pool.execute(`
            SELECT s.*, u.name as artist_name, u.email as artist_email, u.whatsapp as artist_phone
            FROM songs s
            JOIN users u ON s.user_id = u.id
            WHERE s.id = ?
        `, [songId]);
        
        if (!songs.length) {
            return res.status(404).json({ success: false, error: 'Song not found' });
        }
        
        const song = songs[0];
        
        // Get transaction history for this song
        const [transactions] = await pool.execute(`
            SELECT t.*, u.name as buyer_name, u.email as buyer_email
            FROM transactions t
            JOIN users u ON t.buyer_id = u.id
            WHERE t.song_id = ?
            ORDER BY t.created_at DESC
        `, [songId]);
        
        res.json({ success: true, song, transactions });
    } catch (error) {
        console.error('Admin song details error:', error);
        res.status(500).json({ success: false, error: 'Error loading song details' });
    }
});

// Delete song (admin only)
router.delete('/songs/:id', isAdmin, async (req, res) => {
    try {
        const songId = parseInt(req.params.id);
        const pool = await db.getPool();
        
        // Get song details first
        const [songs] = await pool.execute('SELECT * FROM songs WHERE id = ?', [songId]);
        if (!songs.length) {
            return res.status(404).json({ success: false, error: 'Song not found' });
        }
        
        const song = songs[0];
        
        // Check if song has any completed transactions
        const [transactions] = await pool.execute(
            'SELECT COUNT(*) as count FROM transactions WHERE song_id = ? AND status = "completed"',
            [songId]
        );
        
        if (transactions[0].count > 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Cannot delete song with completed transactions' 
            });
        }
        
        // Delete the song
        await pool.execute('DELETE FROM songs WHERE id = ?', [songId]);
        
        // Try to delete physical files (non-blocking)
        try {
            const fs = require('fs').promises;
            const path = require('path');
            
            if (song.file_path) {
                await fs.unlink(path.join(__dirname, '../public', song.file_path));
            }
            if (song.cover_image) {
                await fs.unlink(path.join(__dirname, '../public/uploads/covers', song.cover_image));
            }
        } catch (fileError) {
            console.error('Error deleting song files:', fileError);
        }
        
        res.json({ success: true, message: 'Song deleted successfully' });
    } catch (error) {
        console.error('Admin delete song error:', error);
        res.status(500).json({ success: false, error: 'Error deleting song' });
    }
});

module.exports = router;
