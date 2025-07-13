const axios = require('axios');

class CurrencyService {
    constructor() {
        this.exchangeRates = {
            USD_to_RWF: 1450, // Fallback rate
            RWF_to_USD: 1/1450
        };
        this.lastUpdateTime = null;
        this.updateInterval = 30 * 60 * 1000; // 30 minutes
        this.isUpdating = false;
        
        // Start periodic updates
        this.updateRates();
        setInterval(() => this.updateRates(), this.updateInterval);
    }

    async updateRates() {
        if (this.isUpdating) return;
        this.isUpdating = true;

        try {
            // Skip API calls in production if we can't make external requests
            if (process.env.NODE_ENV === 'production' && process.env.SKIP_CURRENCY_API === 'true') {
                console.log('Skipping currency API calls in production - using fallback rates');
                this.lastUpdateTime = new Date();
                return;
            }

            // Try to fetch exchange rate with timeout and error handling
            const rate = await this.fetchExchangeRate();
            if (rate) {
                this.exchangeRates.USD_to_RWF = rate;
                this.exchangeRates.RWF_to_USD = 1 / rate;
                this.lastUpdateTime = new Date();
                console.log(`Currency rates updated: 1 USD = ${rate} RWF`);
            }
        } catch (error) {
            console.warn('Failed to update currency rates, using fallback:', error.message);
            // Set last update time even on failure to prevent constant retries
            this.lastUpdateTime = new Date();
        } finally {
            this.isUpdating = false;
        }
    }

    async fetchExchangeRate() {
        // Return null immediately if external requests are disabled
        if (process.env.NODE_ENV === 'production' && process.env.SKIP_CURRENCY_API === 'true') {
            return null;
        }

        // Use a more reliable, simpler API first
        const simpleApis = [
            // Free and reliable API
            {
                url: 'https://open.er-api.com/v6/latest/USD',
                extractRate: (data) => data.rates?.RWF
            }
        ];

        for (const api of simpleApis) {
            try {
                console.log(`Fetching exchange rate from: ${api.url}`);
                const response = await axios.get(api.url, { 
                    timeout: 10000, // Increased timeout
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; Nawe-Ririmba/1.0)',
                        'Accept': 'application/json'
                    },
                    // Add HTTPS agent configuration for better compatibility
                    httpsAgent: process.env.NODE_ENV === 'production' ? 
                        new (require('https').Agent)({ rejectUnauthorized: false }) : undefined
                });
                
                const rate = api.extractRate(response.data);
                if (rate && typeof rate === 'number' && rate > 0 && rate < 10000) {
                    console.log(`Successfully fetched rate: 1 USD = ${rate} RWF`);
                    return rate;
                }
            } catch (error) {
                console.warn(`Failed to fetch from ${api.url}:`, error.code || error.message);
                continue;
            }
        }

        console.log('All currency APIs failed, using fallback rate');
        return null;
    }

    getCurrentRates() {
        return {
            ...this.exchangeRates,
            lastUpdate: this.lastUpdateTime,
            isStale: this.lastUpdateTime && (Date.now() - this.lastUpdateTime.getTime()) > this.updateInterval * 2
        };
    }

    convertUSDToRWF(usdAmount) {
        return Math.round(usdAmount * this.exchangeRates.USD_to_RWF);
    }

    convertRWFToUSD(rwfAmount) {
        return Math.round((rwfAmount * this.exchangeRates.RWF_to_USD) * 100) / 100; // Round to 2 decimal places
    }

    formatCurrency(amount, currency) {
        if (currency === 'RWF') {
            return `${this.convertUSDToRWF(amount).toLocaleString()} RWF`;
        } else {
            return `$${parseFloat(amount).toFixed(2)}`;
        }
    }

    detectUserCurrency(req) {
        const acceptLanguage = req.headers['accept-language'] || '';
        const userAgent = req.headers['user-agent'] || '';
        const forwardedFor = req.headers['x-forwarded-for'] || '';
        const remoteAddr = req.connection?.remoteAddress || req.ip || '';
        
        // Check for Rwanda-related indicators
        const rwandaIndicators = [
            acceptLanguage.toLowerCase().includes('rw'),
            userAgent.toLowerCase().includes('rwanda'),
            forwardedFor.includes('rwanda'),
            remoteAddr.includes('rwanda'),
            // You can add more sophisticated IP geolocation here
        ];

        if (rwandaIndicators.some(indicator => indicator)) {
            return 'RWF';
        }

        return 'USD'; // Default to USD
    }

    getPaymentAmounts(baseUSDAmount) {
        const rwfAmount = this.convertUSDToRWF(baseUSDAmount);
        return {
            USD: {
                amount: parseFloat(baseUSDAmount).toFixed(2),
                currency: 'USD',
                display: `$${parseFloat(baseUSDAmount).toFixed(2)}`
            },
            RWF: {
                amount: rwfAmount,
                currency: 'RWF', 
                display: `${rwfAmount.toLocaleString()} RWF`
            }
        };
    }
}

// Create singleton instance
const currencyService = new CurrencyService();

module.exports = currencyService;
