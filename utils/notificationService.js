const nodemailer = require('nodemailer');
const axios = require('axios');
const db = require('../models/db');

class NotificationService {
    constructor() {
        this.smtpTransporter = null;
        this.initSMTP();
    }

    // Initialize SMTP transporter
    initSMTP() {
        if (process.env.SMTP_HOST && process.env.SMTP_USER) {
            this.smtpTransporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT) || 587,
                secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                },
                tls: {
                    rejectUnauthorized: false
                }
            });
            console.log('SMTP transporter initialized');
        } else {
            console.warn('SMTP not configured - email notifications disabled');
        }
    }

    // Send in-app notification
    async sendInAppNotification(userId, type, message) {
        try {
            const pool = await db.getPool();
            await pool.execute(
                'INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
                [userId, type, message]
            );
            console.log(`In-app notification sent to user ${userId}`);
            return true;
        } catch (error) {
            console.error('In-app notification error:', error);
            return false;
        }
    }

    // Send email notification
    async sendEmail(to, subject, text, html = null) {
        if (!this.smtpTransporter) {
            console.warn('SMTP not configured - skipping email');
            return false;
        }

        try {
            const mailOptions = {
                from: `"${process.env.PLATFORM_NAME || 'Naweririmba'}" <${process.env.SMTP_USER}>`,
                to,
                subject,
                text,
                html: html || `<p>${text.replace(/\\n/g, '<br>')}</p>`
            };

            const result = await this.smtpTransporter.sendMail(mailOptions);
            console.log(`Email sent to ${to}: ${result.messageId}`);
            return true;
        } catch (error) {
            console.error('Email sending error:', error);
            return false;
        }
    }

    // Send mass email to all users or filtered users
    async sendMassEmail(subject, message, userFilter = {}) {
        try {
            const pool = await db.getPool();
            
            let query = 'SELECT email, name FROM users WHERE is_admin = 0';
            let params = [];
            
            if (userFilter.userIds && userFilter.userIds.length > 0) {
                query += ` AND id IN (${userFilter.userIds.map(() => '?').join(',')})`;
                params = userFilter.userIds;
            }
            
            const [users] = await pool.execute(query, params);
            
            const results = {
                sent: 0,
                failed: 0,
                total: users.length
            };
            
            for (const user of users) {
                const personalizedMessage = message.replace('{{name}}', user.name);
                const success = await this.sendEmail(user.email, subject, personalizedMessage);
                if (success) {
                    results.sent++;
                } else {
                    results.failed++;
                }
                
                // Add small delay to avoid overwhelming SMTP server
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            return results;
        } catch (error) {
            console.error('Mass email error:', error);
            throw error;
        }
    }

    // Send OneSignal push notification
    async sendPushNotification(userId, title, message, data = {}) {
        if (!process.env.ONESIGNAL_APP_ID || !process.env.ONESIGNAL_API_KEY) {
            console.warn('OneSignal not configured - skipping push notification');
            return false;
        }

        try {
            // Get user's OneSignal ID if stored
            const pool = await db.getPool();
            const [users] = await pool.execute(
                'SELECT onesignal_id FROM users WHERE id = ? AND onesignal_id IS NOT NULL',
                [userId]
            );

            if (!users.length || !users[0].onesignal_id) {
                console.log(`No OneSignal ID found for user ${userId}`);
                return false;
            }

            const notification = {
                app_id: process.env.ONESIGNAL_APP_ID,
                include_player_ids: [users[0].onesignal_id],
                headings: { en: title },
                contents: { en: message },
                data: data,
                web_url: data.url || process.env.BASE_URL || 'http://localhost:3000'
            };

            const response = await axios.post(
                'https://onesignal.com/api/v1/notifications',
                notification,
                {
                    headers: {
                        'Authorization': `Basic ${process.env.ONESIGNAL_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log(`Push notification sent to user ${userId}`);
            return true;
        } catch (error) {
            console.error('Push notification error:', error);
            return false;
        }
    }

    // Send notification using all available channels
    async sendNotification(userId, type, title, message, options = {}) {
        const results = {
            inApp: false,
            email: false,
            push: false
        };

        try {
            // Always send in-app notification
            results.inApp = await this.sendInAppNotification(userId, type, message);

            // Send email if enabled and user email available
            if (options.sendEmail !== false) {
                const pool = await db.getPool();
                const [users] = await pool.execute('SELECT email, name FROM users WHERE id = ?', [userId]);
                if (users.length > 0) {
                    const personalizedMessage = message.replace('{{name}}', users[0].name);
                    results.email = await this.sendEmail(users[0].email, title, personalizedMessage);
                }
            }

            // Send push notification if enabled
            if (options.sendPush !== false) {
                results.push = await this.sendPushNotification(userId, title, message, options.pushData);
            }

            return results;
        } catch (error) {
            console.error('Multi-channel notification error:', error);
            return results;
        }
    }

    // Get notifications for a user (both read and unread)
    async getAllNotifications(userId, limit = 20) {
        try {
            const pool = await db.getPool();
            const [notifications] = await pool.execute(
                'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
                [userId, limit]
            );
            return notifications;
        } catch (error) {
            console.error('Get all notifications error:', error);
            return [];
        }
    }

    // Get unread notifications for a user
    async getUnreadNotifications(userId) {
        try {
            const pool = await db.getPool();
            const [notifications] = await pool.execute(
                'SELECT * FROM notifications WHERE user_id = ? AND is_read = FALSE ORDER BY created_at DESC',
                [userId]
            );
            return notifications;
        } catch (error) {
            console.error('Get notifications error:', error);
            return [];
        }
    }

    // Mark notifications as read
    async markAsRead(notificationIds, userId = null) {
        try {
            const pool = await db.getPool();
            let query = 'UPDATE notifications SET is_read = TRUE WHERE id IN (';
            query += notificationIds.map(() => '?').join(',') + ')';
            let params = notificationIds;
            
            if (userId) {
                query += ' AND user_id = ?';
                params.push(userId);
            }
            
            await pool.execute(query, params);
            return true;
        } catch (error) {
            console.error('Mark as read error:', error);
            return false;
        }
    }

    // Mark all notifications as read for a user
    async markAllAsRead(userId) {
        try {
            const pool = await db.getPool();
            await pool.execute(
                'UPDATE notifications SET is_read = TRUE WHERE (user_id = ? OR user_id IS NULL) AND is_read = FALSE',
                [userId]
            );
            return true;
        } catch (error) {
            console.error('Mark all as read error:', error);
            return false;
        }
    }

    // Notification templates for common events
    templates = {
        songPurchased: {
            seller: {
                title: 'Song Sold! 🎉',
                message: 'Great news! Your song "{{songTitle}}" has been purchased. You earned ${{amount}}!'
            },
            buyer: {
                title: 'Purchase Successful! 🎵',
                message: 'You successfully purchased "{{songTitle}}". Download your song and lyrics now!'
            }
        },
        withdrawalRequested: {
            title: 'Withdrawal Requested',
            message: 'Your withdrawal request for ${{amount}} has been submitted and is pending approval.'
        },
        withdrawalApproved: {
            title: 'Withdrawal Approved! 💰',
            message: 'Your withdrawal of ${{amount}} has been approved and will be processed soon.'
        },
        withdrawalRejected: {
            title: 'Withdrawal Rejected',
            message: 'Your withdrawal request for ${{amount}} was rejected. Reason: {{reason}}'
        },
        referralEarning: {
            title: 'Referral Earning! 🤝',
            message: 'You earned ${{amount}} from a referral sale of "{{songTitle}}"!'
        },
        adminAnnouncement: {
            title: '📢 Platform Announcement',
            message: '{{message}}'
        }
    };

    // Send templated notification for song purchase
    async notifySongPurchase(songId, sellerId, buyerId, amount, songTitle) {
        const sellerTemplate = this.templates.songPurchased.seller;
        const buyerTemplate = this.templates.songPurchased.buyer;

        // Notify seller
        await this.sendNotification(
            sellerId,
            'success',
            sellerTemplate.title,
            sellerTemplate.message.replace('{{songTitle}}', songTitle).replace('{{amount}}', amount),
            { sendEmail: true, sendPush: true }
        );

        // Notify buyer (if they have an account)
        if (buyerId) {
            await this.sendNotification(
                buyerId,
                'success',
                buyerTemplate.title,
                buyerTemplate.message.replace('{{songTitle}}', songTitle),
                { sendEmail: true, sendPush: true }
            );
        }
    }

    // Send templated notification for withdrawal events
    async notifyWithdrawal(userId, amount, status, reason = null) {
        let template;
        
        switch (status) {
            case 'requested':
                template = this.templates.withdrawalRequested;
                break;
            case 'approved':
                template = this.templates.withdrawalApproved;
                break;
            case 'rejected':
                template = this.templates.withdrawalRejected;
                break;
            default:
                return;
        }

        let message = template.message.replace('{{amount}}', amount);
        if (reason) {
            message = message.replace('{{reason}}', reason);
        }

        await this.sendNotification(
            userId,
            status === 'approved' ? 'success' : status === 'rejected' ? 'error' : 'info',
            template.title,
            message,
            { sendEmail: true, sendPush: true }
        );
    }

    // Send referral earning notification
    async notifyReferralEarning(userId, amount, songTitle) {
        const template = this.templates.referralEarning;
        
        await this.sendNotification(
            userId,
            'success',
            template.title,
            template.message.replace('{{amount}}', amount).replace('{{songTitle}}', songTitle),
            { sendEmail: true, sendPush: true }
        );
    }
}

module.exports = new NotificationService();
