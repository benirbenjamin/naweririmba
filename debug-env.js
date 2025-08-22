// Debug environment variables
require('dotenv').config();

console.log('Environment Debug:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('FLW_PUBLIC_KEY:', process.env.FLW_PUBLIC_KEY ? process.env.FLW_PUBLIC_KEY.substring(0, 20) + '...' : 'Not set');
console.log('FLW_SECRET_KEY:', process.env.FLW_SECRET_KEY ? process.env.FLW_SECRET_KEY.substring(0, 20) + '...' : 'Not set');
console.log('FLW_ENVIRONMENT:', process.env.FLW_ENVIRONMENT);
console.log('FLW_ENCRYPTION_KEY:', process.env.FLW_ENCRYPTION_KEY ? process.env.FLW_ENCRYPTION_KEY.substring(0, 10) + '...' : 'Not set');
console.log('Current working directory:', process.cwd());
console.log('Looking for .env file at:', require('path').join(process.cwd(), '.env'));

// Check if .env file exists
const fs = require('fs');
const path = require('path');
const envPath = path.join(process.cwd(), '.env');
console.log('.env file exists:', fs.existsSync(envPath));

if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    console.log('FLW keys found in .env file:', envContent.includes('FLW_PUBLIC_KEY'));
}
