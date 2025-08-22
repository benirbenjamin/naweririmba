// Production Session Configuration
// 
// To use this in production:
// 1. Install session store: npm install express-mysql-session
// 2. Replace the session configuration in app.js with this code
// 3. Set proper environment variables

const MySQLStore = require('express-mysql-session')(session);

// Session store configuration for production
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        sameSite: 'strict'
    }
};

// Use MySQL session store in production to avoid memory leaks
if (process.env.NODE_ENV === 'production') {
    const sessionStore = new MySQLStore({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'nawe_ririmba',
        createDatabaseTable: true, // Create sessions table if it doesn't exist
        schema: {
            tableName: 'sessions',
            columnNames: {
                session_id: 'session_id',
                expires: 'expires',
                data: 'data'
            }
        }
    });
    sessionConfig.store = sessionStore;
}

// Replace this line in app.js:
// app.use(session(sessionConfig));

module.exports = sessionConfig;
