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
            // Try multiple free APIs for exchange rates
            const rate = await this.fetchExchangeRate();
            if (rate) {
                this.exchangeRates.USD_to_RWF = rate;
                this.exchangeRates.RWF_to_USD = 1 / rate;
                this.lastUpdateTime = new Date();
                console.log(`Currency rates updated: 1 USD = ${rate} RWF`);
            }
        } catch (error) {
            console.warn('Failed to update currency rates, using fallback:', error.message);
        } finally {
            this.isUpdating = false;
        }
    }

    async fetchExchangeRate() {
        const apis = [
            // ExchangeRate-API (Free tier: 1500 requests/month)
            {
                url: 'https://api.exchangerate-api.com/v4/latest/USD',
                extractRate: (data) => data.rates?.RWF
            },
            // Fixer.io (Free tier: 100 requests/month)
            {
                url: 'http://data.fixer.io/api/latest?access_key=YOUR_FREE_KEY&base=USD&symbols=RWF',
                extractRate: (data) => data.success ? data.rates?.RWF : null
            },
            // CurrencyAPI (Free tier: 300 requests/month)
            {
                url: 'https://api.currencyapi.com/v3/latest?apikey=YOUR_FREE_KEY&base_currency=USD&currencies=RWF',
                extractRate: (data) => data.data?.RWF?.value
            },
            // Free alternative - ExchangeRatesAPI
            {
                url: 'https://api.exchangeratesapi.io/v1/latest?access_key=YOUR_FREE_KEY&base=USD&symbols=RWF',
                extractRate: (data) => data.success ? data.rates?.RWF : null
            }
        ];

        for (const api of apis) {
            try {
                console.log(`Fetching exchange rate from: ${api.url.split('?')[0]}`);
                const response = await axios.get(api.url, { 
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'Nawe-Ririmba-Currency-Service/1.0'
                    }
                });
                
                const rate = api.extractRate(response.data);
                if (rate && typeof rate === 'number' && rate > 0) {
                    return rate;
                }
            } catch (error) {
                console.warn(`Failed to fetch from ${api.url.split('?')[0]}:`, error.message);
                continue;
            }
        }

        // Fallback to a simple static API
        try {
            const response = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 5000 });
            const rate = response.data?.rates?.RWF;
            if (rate && typeof rate === 'number' && rate > 0) {
                return rate;
            }
        } catch (error) {
            console.warn('Fallback API also failed:', error.message);
        }

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
