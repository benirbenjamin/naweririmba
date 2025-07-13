const axios = require('axios');

class FlutterwavePayment {
    constructor() {
        this.secretKey = process.env.FLW_SECRET_KEY;
        this.publicKey = process.env.FLW_PUBLIC_KEY;
        this.baseUrl = 'https://api.flutterwave.com/v3';
        this.encryptionKey = process.env.FLW_ENCRYPTION_KEY;
        this.environment = process.env.FLW_ENVIRONMENT || 'sandbox';
        
        // Debug logging
        console.log('Flutterwave Config:', {
            hasSecretKey: !!this.secretKey,
            hasPublicKey: !!this.publicKey,
            hasEncryptionKey: !!this.encryptionKey,
            environment: this.environment,
            secretKeyPrefix: this.secretKey?.substring(0, 10) + '...',
            publicKeyPrefix: this.publicKey?.substring(0, 10) + '...'
        });
    }

    async initializePayment(paymentData) {
        try {
            // Validate that we have the required keys
            if (!this.secretKey) {
                throw new Error('FLW_SECRET_KEY is not configured');
            }
            
            if (!this.publicKey) {
                throw new Error('FLW_PUBLIC_KEY is not configured');
            }

            const payload = {
                tx_ref: paymentData.tx_ref,
                amount: String(paymentData.amount), // Ensure amount is a string
                currency: paymentData.currency || 'USD',
                redirect_url: paymentData.redirect_url,
                payment_options: 'card,mobilemoney,ussd,banktransfer',
                customer: {
                    email: paymentData.customer.email,
                    phone_number: paymentData.customer.phone || '',
                    name: paymentData.customer.name
                },
                customizations: {
                    title: paymentData.title || 'Song Purchase',
                    description: paymentData.description || 'Purchase a song on Naweririmba',
                    logo: paymentData.logo || ''
                },
                meta: paymentData.meta || {}
            };

            console.log('Flutterwave payload:', JSON.stringify(payload, null, 2));
            console.log('Authorization header will use:', `Bearer ${this.secretKey.substring(0, 20)}...`);
            console.log('Making request to:', `${this.baseUrl}/payments`);

            const response = await axios.post(
                `${this.baseUrl}/payments`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.secretKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000 // 30 second timeout
                }
            );

            console.log('Flutterwave response:', response.data);

            return {
                success: true,
                data: response.data.data,
                payment_link: response.data.data.link
            };
        } catch (error) {
            console.error('Flutterwave initialization error details:', {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                message: error.message,
                code: error.code
            });
            
            // More specific error handling
            if (error.response?.status === 401) {
                console.error('Authentication failed - check your secret key');
            } else if (error.response?.status === 400) {
                console.error('Bad request - check payload format');
            }
            
            return {
                success: false,
                error: error.response?.data?.message || 'Payment initialization failed'
            };
        }
    }

    async verifyPayment(transactionId) {
        try {
            const response = await axios.get(
                `${this.baseUrl}/transactions/${transactionId}/verify`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.secretKey}`
                    }
                }
            );

            const { data } = response.data;
            
            return {
                success: true,
                status: data.status,
                amount: data.amount,
                currency: data.currency,
                tx_ref: data.tx_ref,
                flw_ref: data.flw_ref,
                customer: data.customer,
                meta: data.meta,
                raw_data: data
            };
        } catch (error) {
            console.error('Flutterwave verification error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || 'Payment verification failed'
            };
        }
    }

    async getAllTransactions(page = 1, limit = 100) {
        try {
            const response = await axios.get(
                `${this.baseUrl}/transactions?page=${page}&limit=${limit}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.secretKey}`
                    }
                }
            );

            return {
                success: true,
                data: response.data.data,
                meta: response.data.meta
            };
        } catch (error) {
            console.error('Flutterwave transactions fetch error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || 'Failed to fetch transactions'
            };
        }
    }

    async refundPayment(transactionId, amount) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/transactions/${transactionId}/refund`,
                { amount },
                {
                    headers: {
                        'Authorization': `Bearer ${this.secretKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return {
                success: true,
                data: response.data.data
            };
        } catch (error) {
            console.error('Flutterwave refund error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || 'Refund failed'
            };
        }
    }

    // Generate payment link for direct payment
    generatePaymentLink(paymentData) {
        const baseUrl = 'https://checkout.flutterwave.com/v3/hosted/pay';
        const params = new URLSearchParams({
            public_key: this.publicKey,
            tx_ref: paymentData.tx_ref,
            amount: paymentData.amount,
            currency: paymentData.currency || 'USD',
            payment_options: 'card,mobilemoney,ussd,banktransfer',
            redirect_url: paymentData.redirect_url,
            customer_email: paymentData.customer.email,
            customer_name: paymentData.customer.name,
            customer_phone: paymentData.customer.phone || '',
            customization_title: paymentData.title || 'Song Purchase',
            customization_description: paymentData.description || 'Purchase a song',
            customization_logo: paymentData.logo || ''
        });

        return `${baseUrl}?${params.toString()}`;
    }

    // Validate webhook signature
    validateWebhookSignature(payload, signature) {
        const crypto = require('crypto');
        const hash = crypto
            .createHmac('sha256', this.secretKey)
            .update(JSON.stringify(payload))
            .digest('hex');
        
        return hash === signature;
    }
}

module.exports = FlutterwavePayment;
