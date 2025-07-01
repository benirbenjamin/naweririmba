const express = require('express');
const router = express.Router();
const db = require('../models/db');
const notificationService = require('../utils/notificationService');
const ExcelJS = require('exceljs');
const emailService = require('../utils/emailService');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
    if (!req.session.user || !req.session.user.is_admin) {
        return res.redirect('/auth/login?error=admin_required');
    }
    next();
};

// Admin Dashboard
router.get('/dashboard', isAdmin, async (req, res) => {
    try {
        const pool = await db.getPool();
        
        // Get dashboard statistics
        const [userStats] = await pool.execute('SELECT COUNT(*) as total_users FROM users WHERE is_admin = 0');
        const [songStats] = await pool.execute('SELECT COUNT(*) as total_songs, COUNT(CASE WHEN is_sold = 1 THEN 1 END) as sold_songs FROM songs');
        const [revenueStats] = await pool.execute('SELECT SUM(amount) as total_revenue, SUM(commission_amount) as total_commission FROM transactions WHERE status = "completed"');
        const [withdrawalStats] = await pool.execute('SELECT COUNT(*) as pending_withdrawals FROM withdrawals WHERE status = "pending"');
        
        // Get recent transactions
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
router.get('/users', isAdmin, async (req, res) => {
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
router.get('/users/:id', isAdmin, async (req, res) => {
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
router.post('/users/:id/reset-password', isAdmin, async (req, res) => {
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
router.get('/transactions', isAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const status = req.query.status || '';
        const currency = req.query.currency || '';

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
        
        if (currency) {
            whereConditions.push('t.currency = ?');
            queryParams.push(currency);
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
        
        // Get transactions
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
            currency
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
                   buyer.name as buyer_name, buyer.email as buyer_email, buyer.whatsapp as customer_phone
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
        
        await pool.execute(
            'UPDATE transactions SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, transactionId]
        );
        
        res.json({ success: true, message: 'Transaction status updated successfully' });
    } catch (error) {
        console.error('Transaction status update error:', error);
        res.status(500).json({ success: false, error: 'Error updating transaction status' });
    }
});

// User revenue details
router.get('/users/:id/revenue', isAdmin, async (req, res) => {
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
router.get('/withdrawals', isAdmin, async (req, res) => {
    try {
        const pool = await db.getPool();
        const [withdrawals] = await pool.execute(`
            SELECT withdrawals.*, users.name, users.email
            FROM withdrawals
            JOIN users ON withdrawals.user_id = users.id
            ORDER BY withdrawals.created_at DESC
        `);
        
        res.json(withdrawals);
    } catch (error) {
        console.error('Withdrawal fetch error:', error);
        res.status(500).json({ message: 'Error fetching withdrawals' });
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
router.get('/revenue', isAdmin, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        const pool = await db.getPool();
        const [revenue] = await pool.execute(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as transactions,
                SUM(amount) as total_amount,
                SUM(amount * commission_rate / 100) as commission_earned
            FROM purchases
            WHERE created_at BETWEEN ? AND ?
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `, [startDate || '1970-01-01', endDate || new Date()]);

        res.json(revenue);
    } catch (error) {
        console.error('Revenue report error:', error);
        res.status(500).json({ message: 'Error generating revenue report' });
    }
});

// View share commissions and referrals
router.get('/commissions', isAdmin, async (req, res) => {
    try {
        const pool = await db.getPool();
        
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
        
        res.render('admin/commissions', {
            title: 'Commission Management',
            user: req.session.user,
            shareCommissions,
            referralCommissions
        });
    } catch (error) {
        console.error('Error fetching commissions:', error);
        res.render('admin/commissions', {
            title: 'Commission Management',
            user: req.session.user,
            shareCommissions: [],
            referralCommissions: [],
            error: 'Error loading commission data'
        });
    }
});

// View platform statistics
router.get('/statistics', isAdmin, async (req, res) => {
    try {
        const pool = await db.getPool();
        
        // Get detailed statistics
        const [genreStats] = await pool.execute(`
            SELECT genre, COUNT(*) as song_count, 
                   COUNT(CASE WHEN is_sold = 1 THEN 1 END) as sold_count,
                   AVG(price) as avg_price
            FROM songs 
            GROUP BY genre 
            ORDER BY song_count DESC
        `);
        
        const [styleStats] = await pool.execute(`
            SELECT style, COUNT(*) as song_count,
                   COUNT(CASE WHEN is_sold = 1 THEN 1 END) as sold_count
            FROM songs 
            GROUP BY style
        `);
        
        const [monthlyRevenue] = await pool.execute(`
            SELECT DATE_FORMAT(created_at, '%Y-%m') as month,
                   COUNT(*) as transaction_count,
                   SUM(amount) as total_revenue,
                   SUM(admin_commission) as admin_earnings
            FROM transactions 
            WHERE status = 'completed' 
            GROUP BY month 
            ORDER BY month DESC 
            LIMIT 12
        `);
        
        const [topSellers] = await pool.execute(`
            SELECT u.name, u.email, COUNT(t.id) as sales_count, 
                   SUM(t.seller_amount) as total_earnings
            FROM users u
            JOIN songs s ON u.id = s.user_id
            JOIN transactions t ON s.id = t.song_id
            WHERE t.status = 'completed'
            GROUP BY u.id
            ORDER BY sales_count DESC
            LIMIT 10
        `);
        
        res.render('admin/statistics', {
            title: 'Platform Statistics',
            user: req.session.user,
            genreStats,
            styleStats,
            monthlyRevenue,
            topSellers
        });
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.render('admin/statistics', {
            title: 'Platform Statistics',
            user: req.session.user,
            genreStats: [],
            styleStats: [],
            monthlyRevenue: [],
            topSellers: [],
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

// Notifications Management Page
router.get('/notifications', isAdmin, async (req, res) => {
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
            users,
            recentNotifications,
            user: req.session.user
        });
    } catch (error) {
        console.error('Notifications page error:', error);
        res.render('admin/notifications', {
            title: 'Notifications Management',
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

// Platform Settings Management
router.get('/settings', isAdmin, async (req, res) => {
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
router.get('/songs', isAdmin, async (req, res) => {
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
