const mysql = require('mysql2/promise');
const initializeDatabase = require('./init-db');

let pool = null;

async function getPool() {
    if (!pool) {
        try {
            // Initialize the database first
            await initializeDatabase();

            // Create the connection pool
            pool = mysql.createPool({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0
            });

            // Test the connection
            const connection = await pool.getConnection();
            console.log('Database connected successfully');
            connection.release();
        } catch (err) {
            console.error('Error setting up database:', err);
            throw err;
        }
    }
    return pool;
}

// Initialize the pool
getPool().catch(err => {
    console.error('Failed to initialize database pool:', err);
    process.exit(1);
});

module.exports = {
    execute: async (...args) => {
        const pool = await getPool();
        return pool.execute(...args);
    },
    getConnection: async () => {
        const pool = await getPool();
        return pool.getConnection();
    },
    getPool: getPool
};
