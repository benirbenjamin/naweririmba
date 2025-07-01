const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = null;
        this.initializeTransporter();
    }

    initializeTransporter() {
        try {
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: parseInt(process.env.SMTP_PORT) || 587,
                secure: false, // true for 465, false for other ports
                auth: {
                    user: process.env.SMTP_USER || process.env.EMAIL_USER,
                    pass: process.env.SMTP_PASS || process.env.EMAIL_PASS
                },
                tls: {
                    rejectUnauthorized: false
                }
            });

            console.log('SMTP transporter initialized');
        } catch (error) {
            console.error('Email service initialization failed:', error);
        }
    }

    async sendEmail(options) {
        if (!this.transporter) {
            throw new Error('Email service not properly initialized');
        }

        const mailOptions = {
            from: `"Nawe Ririmba Space" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
            to: options.to,
            subject: options.subject,
            text: options.text,
            html: options.html || this.generateHTML(options.text, options.subject)
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('Email sent successfully:', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Email sending failed:', error);
            throw error;
        }
    }

    async sendBulkEmail(recipients, subject, message) {
        const results = [];
        const batchSize = 10; // Send in batches to avoid overwhelming the server

        for (let i = 0; i < recipients.length; i += batchSize) {
            const batch = recipients.slice(i, i + batchSize);
            const promises = batch.map(async (recipient) => {
                try {
                    const personalizedMessage = this.personalizeMessage(message, recipient);
                    await this.sendEmail({
                        to: recipient.email,
                        subject: subject,
                        text: personalizedMessage
                    });
                    return { email: recipient.email, success: true };
                } catch (error) {
                    console.error(`Failed to send email to ${recipient.email}:`, error);
                    return { email: recipient.email, success: false, error: error.message };
                }
            });

            const batchResults = await Promise.allSettled(promises);
            results.push(...batchResults.map(result => result.value || result.reason));

            // Small delay between batches
            if (i + batchSize < recipients.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return results;
    }

    personalizeMessage(message, recipient) {
        return message
            .replace(/\{name\}/g, recipient.name || 'User')
            .replace(/\{email\}/g, recipient.email)
            .replace(/\{platform\}/g, 'Nawe Ririmba Space');
    }

    generateHTML(text, subject) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .btn { display: inline-block; padding: 12px 24px; background: #0d6efd; color: white; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        .social-links { margin: 20px 0; }
        .social-links a { margin: 0 10px; color: #667eea; text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Nawe Ririmba Space</h1>
            <p>Where unique songs find their perfect owners</p>
        </div>
        <div class="content">
            ${text.split('\n').map(line => `<p>${line}</p>`).join('')}
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:4004'}" class="btn">Visit Platform</a>
            </div>
        </div>
        <div class="footer">
            <div class="social-links">
                <a href="https://wa.me/250783987223">WhatsApp</a>
                <a href="mailto:benirabok@gmail.com">Email</a>
                <a href="https://facebook.com/benirbenjamin">Facebook</a>
                <a href="https://instagram.com/benirbenjamin">Instagram</a>
            </div>
            <p>&copy; 2025 NebeluRw. All rights reserved. Nawe Ririmba Space.</p>
            <p>Kigali, Rwanda | Made with ❤️ in Rwanda</p>
        </div>
    </div>
</body>
</html>`;
    }

    // Specific email templates
    async sendWelcomeEmail(user) {
        const subject = 'Welcome to Nawe Ririmba Space!';
        const message = `Hello ${user.name},

Welcome to Nawe Ririmba Space - where unique songs find their perfect owners!

We're excited to have you join our music community. Here you can discover exclusive songs that are sold only once, making each purchase truly special.

What you can do:
- Browse our collection of unique songs
- Purchase songs in USD or RWF
- Upload your own music to sell
- Connect with other music lovers

Your account is now ready to use. Start exploring and find your perfect song!

If you have any questions, feel free to contact us.

Best regards,
The Nawe Ririmba Space Team`;

        return await this.sendEmail({
            to: user.email,
            subject: subject,
            text: message
        });
    }

    async sendOrderCompletionEmail(user, song, transaction) {
        const subject = 'Your Order is Complete - Download Ready!';
        const message = `Hello ${user.name},

Great news! Your order has been completed successfully.

Order Details:
- Song: ${song.title}
- Artist: ${song.artist_name}
- Amount: ${transaction.currency === 'RWF' ? 
            Math.round(transaction.amount).toLocaleString() + ' RWF' : 
            '$' + parseFloat(transaction.amount).toFixed(2)}
- Transaction ID: #${transaction.id}

You can now download your purchased song and lyrics PDF from your dashboard. The song is now exclusively yours!

To access your downloads:
1. Visit ${process.env.FRONTEND_URL || 'http://localhost:4004'}
2. Go to your dashboard
3. Find your purchased song and click download

If you have any issues accessing your download, please contact us.

Thank you for choosing Nawe Ririmba Space!

Best regards,
The Nawe Ririmba Space Team`;

        return await this.sendEmail({
            to: user.email,
            subject: subject,
            text: message
        });
    }

    async sendPasswordResetEmail(user, resetToken) {
        const subject = 'Password Reset - Nawe Ririmba Space';
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:4004'}/auth/reset-password?token=${resetToken}`;
        
        const message = `Hello ${user.name},

You requested a password reset for your Nawe Ririmba Space account.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour for security reasons.

If you didn't request this reset, please ignore this email. Your password will remain unchanged.

If you have any concerns, please contact us immediately.

Best regards,
The Nawe Ririmba Space Team`;

        return await this.sendEmail({
            to: user.email,
            subject: subject,
            text: message
        });
    }

    async sendPaymentNotificationEmail(user, song, transaction) {
        const subject = 'Payment Received - Processing Your Order';
        const message = `Hello ${user.name},

We've received your payment for "${song.title}" by ${song.artist_name}.

Payment Details:
- Amount: ${transaction.currency === 'RWF' ? 
            Math.round(transaction.amount).toLocaleString() + ' RWF' : 
            '$' + parseFloat(transaction.amount).toFixed(2)}
- Payment Method: ${transaction.payment_method || 'Flutterwave'}
- Transaction Reference: ${transaction.flutterwave_tx_ref}

Your order is being processed and you'll receive another email once it's ready for download.

Thank you for your purchase!

Best regards,
The Nawe Ririmba Space Team`;

        return await this.sendEmail({
            to: user.email,
            subject: subject,
            text: message
        });
    }

    async sendArtistSaleNotificationEmail(artist, song, transaction) {
        const subject = 'Congratulations! Your Song Has Been Sold';
        const commission = parseFloat(transaction.original_amount_usd || transaction.amount) * 0.7; // 70% to artist
        
        const message = `Hello ${artist.name},

Congratulations! Your song "${song.title}" has been sold!

Sale Details:
- Buyer: ${transaction.buyer_name}
- Sale Price: ${transaction.currency === 'RWF' ? 
            Math.round(transaction.amount).toLocaleString() + ' RWF' : 
            '$' + parseFloat(transaction.amount).toFixed(2)}
- Your Commission (70%): $${commission.toFixed(2)}
- Transaction Date: ${new Date(transaction.created_at).toLocaleDateString()}

Your commission will be added to your account balance and you can request a withdrawal anytime.

Keep creating amazing music!

Best regards,
The Nawe Ririmba Space Team`;

        return await this.sendEmail({
            to: artist.email,
            subject: subject,
            text: message
        });
    }
}

module.exports = new EmailService();
