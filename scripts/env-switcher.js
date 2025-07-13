#!/usr/bin/env node

/**
 * Environment Switcher Script
 * Helps switch between development and production configurations
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');

function switchToProduction() {
    console.log('Switching to production mode...');
    
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update environment variables for production
    envContent = envContent.replace(/NODE_ENV=development/g, 'NODE_ENV=production');
    envContent = envContent.replace(/FLW_ENVIRONMENT=sandbox/g, 'FLW_ENVIRONMENT=live');
    envContent = envContent.replace(/APP_URL=http:\/\/localhost:\d+/g, 'APP_URL=https://naweririmba.com');
    envContent = envContent.replace(/DEBUG=true/g, 'DEBUG=false');
    envContent = envContent.replace(/MOCK_PAYMENTS=true/g, 'MOCK_PAYMENTS=false');
    
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Switched to production mode');
    console.log('⚠️  Make sure to use production Flutterwave keys!');
}

function switchToDevelopment() {
    console.log('Switching to development mode...');
    
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update environment variables for development
    envContent = envContent.replace(/NODE_ENV=production/g, 'NODE_ENV=development');
    envContent = envContent.replace(/FLW_ENVIRONMENT=live/g, 'FLW_ENVIRONMENT=sandbox');
    envContent = envContent.replace(/APP_URL=https:\/\/naweririmba\.com/g, 'APP_URL=http://localhost:4004');
    envContent = envContent.replace(/DEBUG=false/g, 'DEBUG=true');
    envContent = envContent.replace(/MOCK_PAYMENTS=false/g, 'MOCK_PAYMENTS=true');
    
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Switched to development mode');
    console.log('💡 Using sandbox Flutterwave keys and local server');
}

function showCurrentMode() {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const nodeEnvMatch = envContent.match(/NODE_ENV=(.+)/);
    const currentMode = nodeEnvMatch ? nodeEnvMatch[1] : 'unknown';
    
    console.log(`Current mode: ${currentMode}`);
    
    if (currentMode === 'production') {
        console.log('🔴 Production mode active');
        console.log('   - Live Flutterwave keys');
        console.log('   - Secure cookies');
        console.log('   - Production URL');
    } else {
        console.log('🟢 Development mode active');
        console.log('   - Sandbox Flutterwave keys');
        console.log('   - Development cookies');
        console.log('   - Local server URL');
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
    case 'prod':
    case 'production':
        switchToProduction();
        break;
    case 'dev':
    case 'development':
        switchToDevelopment();
        break;
    case 'status':
    case 'show':
        showCurrentMode();
        break;
    default:
        console.log('Usage: node scripts/env-switcher.js [dev|prod|status]');
        console.log('Commands:');
        console.log('  dev, development - Switch to development mode');
        console.log('  prod, production - Switch to production mode');
        console.log('  status, show     - Show current mode');
        break;
}
