/**
 * Environment Configuration Helper
 * Helps manage different settings between development and production
 */

const envConfig = {
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    
    // Session configuration
    getSessionConfig: () => ({
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }),
    
    // Cookie configuration
    getCookieConfig: () => ({
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        httpOnly: true
    }),
    
    // Flutterwave configuration
    getFlutterwaveConfig: () => ({
        environment: process.env.NODE_ENV === 'production' ? 'live' : 'sandbox',
        public_key: process.env.FLW_PUBLIC_KEY,
        secret_key: process.env.FLW_SECRET_KEY,
        encryption_key: process.env.FLW_ENCRYPTION_KEY
    }),
    
    // App URL configuration
    getAppUrl: () => {
        if (process.env.NODE_ENV === 'production') {
            return process.env.APP_URL || 'https://naweririmba.com';
        } else {
            return `http://localhost:${process.env.PORT || 3000}`;
        }
    },
    
    // Database configuration
    getDatabaseConfig: () => ({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'nawe_ririmba'
    }),
    
    // Logging configuration
    getLogLevel: () => {
        if (process.env.NODE_ENV === 'production') {
            return 'combined';
        } else {
            return 'dev';
        }
    }
};

module.exports = envConfig;
