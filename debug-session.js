#!/usr/bin/env node

/**
 * Session Debug Helper
 * 
 * This script helps debug session issues in production.
 * Run with: node debug-session.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('=== SESSION CONFIGURATION DEBUG ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('USE_HTTPS:', process.env.USE_HTTPS);
console.log('SESSION_SECRET:', process.env.SESSION_SECRET ? 'SET' : 'NOT SET');

// Session configuration that would be used
const sessionConfig = {
    key: 'session_cookie_name',
    secret: process.env.SESSION_SECRET || 'default_secret_key_change_in_production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.USE_HTTPS === 'true',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'lax'
    }
};

console.log('\n=== EFFECTIVE SESSION CONFIGURATION ===');
console.log('Cookie secure:', sessionConfig.cookie.secure);
console.log('Cookie httpOnly:', sessionConfig.cookie.httpOnly);
console.log('Cookie sameSite:', sessionConfig.cookie.sameSite);
console.log('Cookie maxAge:', sessionConfig.cookie.maxAge, 'ms');

console.log('\n=== RECOMMENDATIONS ===');
if (process.env.NODE_ENV === 'production' && process.env.USE_HTTPS !== 'true') {
    console.log('⚠️  Production environment detected but USE_HTTPS=false');
    console.log('   If your production server uses HTTPS, set USE_HTTPS=true in .env');
    console.log('   If not using HTTPS, current configuration should work');
}

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'nawe_ririmba_secret_12022010') {
    console.log('⚠️  Using default/weak session secret');
    console.log('   Generate a strong random secret for production');
}

console.log('\n=== TROUBLESHOOTING STEPS ===');
console.log('1. Check browser developer tools > Application > Cookies');
console.log('2. Verify session cookie is being set');
console.log('3. Check if HTTPS is properly configured if USE_HTTPS=true');
console.log('4. Review server logs for session-related errors');
console.log('5. Ensure database connection is working for session store');

console.log('\n=== DATABASE CONNECTION TEST ===');
const db = require('./models/db');

async function testDatabase() {
    try {
        await db.execute('SELECT 1 as test');
        console.log('✅ Database connection successful');
        
        // Test session store table
        await db.execute('SELECT COUNT(*) as count FROM sessions');
        console.log('✅ Session store table accessible');
        
    } catch (error) {
        console.log('❌ Database connection failed:', error.message);
        console.log('   This could be why sessions are not persisting');
    }
}

testDatabase().then(() => {
    console.log('\n=== DEBUG COMPLETE ===');
    process.exit(0);
}).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
