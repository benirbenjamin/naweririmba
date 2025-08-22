const express = require('express');
const router = express.Router();
const db = require('../models/db');
const FlutterwavePayment = require('../utils/flutterwavePayment');
const notificationService = require('../utils/notificationService');
const currencyService = require('../utils/currencyService');
const { v4: uuidv4 } = require('uuid');

const flutterwave = new FlutterwavePayment();

// Initialize MOMO payment for song purchase
router.post('/momo/initialize', async (req, res) => {
    try {
        const { songId, customerEmail, customerName, senderPhone, senderName } = req.body;
        
        console.log('MOMO payment request:', req.body); // Debug log
        
        if (!songId || !customerEmail || !customerName || !senderPhone || !senderName) {
            console.log('Missing fields:', { songId, customerEmail, customerName, senderPhone, senderName });
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: songId, customerEmail, customerName, senderPhone, senderName'
            });
        }

        // Ensure songId is a number
        const parsedSongId = parseInt(songId);
        if (isNaN(parsedSongId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid song ID'
            });
        }

        const pool = await db.getPool();
        
        // Get song details
        const [songs] = await pool.execute(
            'SELECT * FROM songs WHERE id = ? AND is_sold = FALSE',
            [parsedSongId]
        );

        if (!songs.length) {
            return res.status(404).json({
                success: false,
                error: 'Song not found or already sold'
            });
        }

        const song = songs[0];
        const txRef = `momo_${parsedSongId}_${Date.now()}_${uuidv4().slice(0, 8)}`;
        
        // Convert USD price to RWF
        const rates = currencyService.getCurrentRates();
        const rwfAmount = Math.round(song.price * rates.USD_to_RWF);
        
        // Get buyer_id if user is logged in
        const buyerId = req.session.user ? req.session.user.id : null;
        
        // Calculate commission (default 40% platform commission)
        const commissionAmount = song.price * 0.4;
        
        // Store pending MOMO transaction
        await pool.execute(
            `INSERT INTO transactions (
                song_id, seller_id, buyer_id, buyer_email, amount, commission_amount, status, payment_reference, 
                customer_email, customer_name, customer_phone, currency, usd_to_rwf_rate,
                payment_data
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, 'RWF', ?, ?)`,
            [
                parsedSongId, 
                song.user_id, 
                buyerId,
                customerEmail, // buyer_email is required
                song.price, // Store original USD price
                commissionAmount, // commission_amount is required
                txRef,
                customerEmail,
                customerName,
                senderPhone,
                rates.USD_to_RWF,
                JSON.stringify({
                    payment_method: 'momo',
                    sender_phone: senderPhone,
                    sender_name: senderName,
                    recipient_code: '672747',
                    recipient_name: 'Benjamin',
                    rwf_amount: rwfAmount
                })
            ]
        );

        res.json({
            success: true,
            transactionRef: txRef,
            rwfAmount: `${rwfAmount.toLocaleString()} RWF`,
            message: 'Transaction created successfully'
        });
        
    } catch (error) {
        console.error('MOMO payment initialization error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create MOMO transaction: ' + error.message
        });
    }
});

// Initialize payment for song purchase (Flutterwave - kept for future use)
router.post('/initialize', async (req, res) => {
    try {
        const { songId, customerEmail, customerName, customerPhone, returnUrl, currency = 'USD' } = req.body;
        
        if (!songId || !customerEmail || !customerName) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        // Validate currency
        if (!['USD', 'RWF'].includes(currency)) {
            return res.status(400).json({
                success: false,
                error: 'Unsupported currency. Only USD and RWF are supported.'
            });
        }

        const pool = await db.getPool();
        
        // Get song details
        const [songs] = await pool.execute(
            'SELECT * FROM songs WHERE id = ? AND is_sold = FALSE',
            [songId]
        );

        if (!songs.length) {
            return res.status(404).json({
                success: false,
                error: 'Song not found or already sold'
            });
        }

        const song = songs[0];
        const txRef = `song_${songId}_${Date.now()}_${uuidv4().slice(0, 8)}`;
        
        // Check if this is a shared link purchase
        const referrerId = req.query.ref || req.body.ref;

        // Get payment amounts using currency service
        const paymentOptions = currencyService.getPaymentAmounts(song.price);
        const selectedPayment = paymentOptions[currency];
        
        if (!selectedPayment) {
            return res.status(400).json({
                success: false,
                error: 'Invalid currency option'
            });
        }

        const rates = currencyService.getCurrentRates();
        
        // Always store amounts in USD in the database regardless of payment currency
        // This ensures consistent calculations and display across the platform
        const amountInUSD = currency === 'USD' ? selectedPayment.amount : selectedPayment.amount / rates.USD_to_RWF;
        
        const paymentData = {
            tx_ref: txRef,
            amount: selectedPayment.amount, // This is what we send to payment gateway (in selected currency)
            currency: selectedPayment.currency,
            redirect_url: returnUrl || `${req.protocol}://${req.get('host')}/payment/callback`,
            customer: {
                email: customerEmail,
                name: customerName,
                phone: customerPhone || ''
            },
            title: `Purchase: ${song.title}`,
            description: `Buy "${song.title}" on Naweririmba`,
            meta: {
                song_id: songId,
                referrer_id: referrerId || null,
                purchase_type: 'song'
            }
        };

        const result = await flutterwave.initializePayment(paymentData);
        
        if (result.success) {
            // Get buyer_id if user is logged in
            const buyerId = req.session.user ? req.session.user.id : null;
            
            // Calculate commission (default 40% platform commission)
            const commissionAmount = amountInUSD * 0.4;
            
            // Store pending transaction with amount always in USD
            await pool.execute(
                `INSERT INTO transactions (
                    song_id, seller_id, buyer_id, buyer_email, amount, commission_amount, status, payment_reference, 
                    customer_email, customer_name, customer_phone, referrer_id, currency, usd_to_rwf_rate
                ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
                [
                    songId, 
                    song.user_id, 
                    buyerId,
                    customerEmail, // buyer_email is required
                    amountInUSD, // Always store in USD
                    commissionAmount, // commission_amount is required
                    txRef,
                    customerEmail,
                    customerName,
                    customerPhone || null,
                    referrerId || null,
                    selectedPayment.currency, // Keep track of what currency was used for payment
                    rates.USD_to_RWF
                ]
            );

            res.json({
                success: true,
                payment_link: result.payment_link,
                tx_ref: txRef
            });
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Payment initialization error:', error);
        res.status(500).json({
            success: false,
            error: 'Payment initialization failed'
        });
    }
});

// Handle payment callback
router.get('/callback', async (req, res) => {
    try {
        const { transaction_id, tx_ref, status } = req.query;
        
        if (status === 'successful' && transaction_id) {
            // Verify payment with Flutterwave
            const verification = await flutterwave.verifyPayment(transaction_id);
            
            if (verification.success && verification.status === 'successful') {
                await processSuccessfulPayment(verification);
                res.redirect(`/users/purchased?success=true&tx_ref=${tx_ref}`);
            } else {
                res.redirect(`/payment/failed?tx_ref=${tx_ref}&reason=verification_failed`);
            }
        } else {
            res.redirect(`/payment/failed?tx_ref=${tx_ref}&reason=payment_failed`);
        }
    } catch (error) {
        console.error('Payment callback error:', error);
        res.redirect('/payment/failed?reason=system_error');
    }
});

// Webhook endpoint for Flutterwave
router.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    try {
        const signature = req.headers['verif-hash'];
        
        if (!signature) {
            return res.status(400).json({ error: 'No signature provided' });
        }

        const payload = JSON.parse(req.body);
        
        // Validate webhook signature
        if (!flutterwave.validateWebhookSignature(payload, signature)) {
            return res.status(400).json({ error: 'Invalid signature' });
        }

        if (payload.event === 'charge.completed' && payload.data.status === 'successful') {
            await processSuccessfulPayment(payload.data);
        }

        res.status(200).json({ message: 'Webhook received' });
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// Payment success page
router.get('/success', async (req, res) => {
    try {
        const { tx_ref } = req.query;
        
        if (!tx_ref) {
            return res.redirect('/');
        }

        const pool = await db.getPool();
        const [transactions] = await pool.execute(
            `SELECT t.*, s.title as song_title, s.audio_path, u.name as artist_name
             FROM transactions t
             JOIN songs s ON t.song_id = s.id
             JOIN users u ON s.user_id = u.id
             WHERE t.payment_reference = ? AND t.status = 'completed'`,
            [tx_ref]
        );

        if (transactions.length === 0) {
            return res.redirect('/payment/failed?reason=transaction_not_found');
        }

        const transaction = transactions[0];
        
        res.render('payment/success', {
            title: 'Payment Successful',
            transaction,
            downloadUrl: `/songs/${transaction.song_id}/download?token=${transaction.id}`
        });
    } catch (error) {
        console.error('Payment success page error:', error);
        res.redirect('/payment/failed?reason=system_error');
    }
});

// Payment failed page
router.get('/failed', (req, res) => {
    const { reason, tx_ref } = req.query;
    
    res.render('payment/failed', {
        title: 'Payment Failed',
        reason: reason || 'unknown',
        tx_ref
    });
});

// Process successful payment
async function processSuccessfulPayment(paymentData) {
    const pool = await db.getPool();
    const emailService = require('../utils/emailService');
    
    try {
        // Get transaction by reference
        const [transactions] = await pool.execute(
            'SELECT * FROM transactions WHERE payment_reference = ? AND status = "pending"',
            [paymentData.tx_ref]
        );

        if (transactions.length === 0) {
            console.log('Transaction not found or already processed:', paymentData.tx_ref);
            return;
        }

        const transaction = transactions[0];
        
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
            console.error('Transaction details not found');
            return;
        }
        
        const details = transactionDetails[0];
        
        // Get settings for commission calculation
        const [settings] = await pool.execute('SELECT * FROM settings WHERE id = 1');
        const sellerCommissionRate = settings[0]?.seller_commission_rate || 0.6;
        const shareCommissionRate = settings[0]?.share_commission_rate || 0.15;
        
        const sellerAmount = transaction.amount * sellerCommissionRate;
        const adminCommission = transaction.amount * (1 - sellerCommissionRate);
        
        // Start database transaction
        await pool.execute('START TRANSACTION');
        
        // Update transaction status
        await pool.execute(
            `UPDATE transactions SET 
             status = 'completed', 
             seller_amount = ?, 
             commission_amount = ?, 
             payment_data = ?,
             completed_at = NOW()
             WHERE id = ?`,
            [sellerAmount, adminCommission, JSON.stringify(paymentData), transaction.id]
        );

        // Update seller's balance
        await pool.execute(
            'UPDATE users SET balance = balance + ? WHERE id = ?',
            [sellerAmount, transaction.seller_id]
        );

        // Mark song as sold
        await pool.execute(
            'UPDATE songs SET is_sold = TRUE, sold_at = NOW() WHERE id = ?',
            [transaction.song_id]
        );

        // Handle referrer commission if applicable
        if (transaction.referrer_id) {
            const shareCommission = transaction.amount * shareCommissionRate;
            
            // Update referrer's balance
            await pool.execute(
                'UPDATE users SET balance = balance + ? WHERE id = ?',
                [shareCommission, transaction.referrer_id]
            );
            
            // Record share commission
            await pool.execute(
                `INSERT INTO share_commissions (
                    transaction_id, sharer_id, song_id, commission_amount
                ) VALUES (?, ?, ?, ?)`,
                [transaction.id, transaction.referrer_id, transaction.song_id, shareCommission]
            );
            
            // Adjust seller amount
            await pool.execute(
                'UPDATE transactions SET seller_amount = seller_amount - ? WHERE id = ?',
                [shareCommission, transaction.id]
            );
            
            await pool.execute(
                'UPDATE users SET balance = balance - ? WHERE id = ?',
                [shareCommission, transaction.seller_id]
            );
        }

        // Commit database transaction
        await pool.execute('COMMIT');
        
        // Send email notifications
        try {
            // Send order completion email to buyer
            if (details.buyer_email) {
                await emailService.sendOrderCompletionEmail(
                    { name: details.buyer_name, email: details.buyer_email },
                    { title: details.song_title, artist_name: details.artist_name },
                    { ...transaction, status: 'completed' }
                );
                console.log('Order completion email sent to buyer:', details.buyer_email);
            }
            
            // Send sale notification email to artist
            if (details.artist_email) {
                await emailService.sendArtistSaleNotificationEmail(
                    { name: details.artist_name, email: details.artist_email },
                    { title: details.song_title },
                    { ...transaction, buyer_name: details.buyer_name, status: 'completed' }
                );
                console.log('Sale notification email sent to artist:', details.artist_email);
            }
        } catch (emailError) {
            console.error('Email notification error:', emailError);
            // Don't fail the transaction if emails fail
        }
        
        console.log('Payment processed successfully:', paymentData.tx_ref);
    } catch (error) {
        // Rollback on error
        await pool.execute('ROLLBACK');
        console.error('Payment processing error:', error);
        throw error;
    }
}

// Get transaction status
router.get('/status/:tx_ref', async (req, res) => {
    try {
        const { tx_ref } = req.params;
        
        const pool = await db.getPool();
        const [transactions] = await pool.execute(
            'SELECT status, amount, completed_at FROM transactions WHERE payment_reference = ?',
            [tx_ref]
        );

        if (transactions.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }

        res.json({
            success: true,
            transaction: transactions[0]
        });
    } catch (error) {
        console.error('Transaction status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get transaction status'
        });
    }
});

// Admin route to confirm MOMO payment
router.post('/momo/confirm/:tx_ref', async (req, res) => {
    try {
        const { tx_ref } = req.params;
        
        // Only admin can confirm payments
        if (!req.session.user || !req.session.user.is_admin) {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized access'
            });
        }

        const pool = await db.getPool();
        
        // Get transaction details
        const [transactions] = await pool.execute(
            'SELECT * FROM transactions WHERE payment_reference = ? AND status = "pending"',
            [tx_ref]
        );

        if (!transactions.length) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found or already processed'
            });
        }

        const transaction = transactions[0];
        
        // Process the successful payment (same logic as Flutterwave callback)
        await processSuccessfulPayment({
            data: {
                id: tx_ref,
                tx_ref: tx_ref,
                amount: transaction.amount * currencyService.getCurrentRates().USD_to_RWF, // Convert to RWF for display
                currency: 'RWF',
                status: 'successful',
                customer: {
                    email: transaction.customer_email,
                    name: transaction.customer_name
                }
            }
        });

        res.json({
            success: true,
            message: 'Payment confirmed successfully'
        });
        
    } catch (error) {
        console.error('MOMO confirmation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to confirm payment'
        });
    }
});

module.exports = router;
