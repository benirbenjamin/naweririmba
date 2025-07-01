const mysql = require('mysql2/promise');

async function initializeDatabase() {
    let connection;
    
    try {
        // First, connect without database to create it if it doesn't exist
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD
        });

        console.log('Checking database...');
        
        // Create database if it doesn't exist
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`);
        console.log(`Database '${process.env.DB_NAME}' ensured.`);
        
        // Switch to the database
        await connection.query(`USE ${process.env.DB_NAME}`);
        
        // Create tables
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(191) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                whatsapp VARCHAR(20) NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                balance DECIMAL(10,2) DEFAULT 0.00,
                referral_code VARCHAR(50) UNIQUE,
                referred_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (referred_by) REFERENCES users(id)
            );
        `);
        console.log('Users table ensured.');

        // Add missing columns to users table if they don't exist
        try {
            await connection.query(`ALTER TABLE users ADD COLUMN balance DECIMAL(10,2) DEFAULT 0.00`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE users ADD COLUMN referral_code VARCHAR(50) UNIQUE`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE users ADD COLUMN referred_by INT`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        // Add missing columns to users table if they don't exist
        try {
            await connection.query(`ALTER TABLE users ADD COLUMN onesignal_id VARCHAR(191) NULL`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE`);
        } catch (err) {
            // Column already exists, ignore error
        }

        try {
            await connection.query(`ALTER TABLE users ADD FOREIGN KEY (referred_by) REFERENCES users(id)`);
        } catch (err) {
            // Foreign key already exists, ignore error
        }

        await connection.query(`
            CREATE TABLE IF NOT EXISTS songs (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                style ENUM('gospel', 'secular') NOT NULL,
                genre VARCHAR(50) NOT NULL,
                lyrics TEXT NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                audio_path VARCHAR(191) NOT NULL,
                preview_path VARCHAR(191),
                preview_start_time DECIMAL(5,2) DEFAULT 0,
                preview_end_time DECIMAL(5,2) DEFAULT 45,
                tempo INT,
                time_signature VARCHAR(10),
                is_sold BOOLEAN DEFAULT FALSE,
                buyer_id INT,
                purchased_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (buyer_id) REFERENCES users(id)
            );
        `);
        console.log('Songs table ensured.');

        // Add missing columns to songs table if they don't exist
        try {
            await connection.query(`ALTER TABLE songs ADD COLUMN preview_path VARCHAR(191)`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE songs ADD COLUMN preview_start_time DECIMAL(5,2) DEFAULT 0`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE songs ADD COLUMN preview_end_time DECIMAL(5,2) DEFAULT 45`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE songs ADD COLUMN buyer_id INT`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE songs ADD COLUMN purchased_at TIMESTAMP NULL`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE songs ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE songs ADD FOREIGN KEY (buyer_id) REFERENCES users(id)`);
        } catch (err) {
            // Foreign key already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE songs MODIFY COLUMN style ENUM('gospel', 'secular') NOT NULL`);
        } catch (err) {
            // Column already correct, ignore error
        }

        // Add more missing columns to songs table
        try {
            await connection.query(`ALTER TABLE songs ADD COLUMN sold_at TIMESTAMP NULL`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE songs ADD COLUMN audio_format VARCHAR(10)`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE songs ADD COLUMN file_size INT`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE songs ADD COLUMN cover_image VARCHAR(191)`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE songs ADD COLUMN play_count INT DEFAULT 0`);
        } catch (err) {
            // Column already exists, ignore error
        }

        await connection.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INT PRIMARY KEY AUTO_INCREMENT,
                song_id INT NOT NULL,
                seller_id INT NOT NULL,
                buyer_id INT,
                buyer_email VARCHAR(191) NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                commission_amount DECIMAL(10,2) NOT NULL,
                seller_amount DECIMAL(10,2) NOT NULL,
                flutterwave_tx_ref VARCHAR(191) UNIQUE,
                flutterwave_tx_id VARCHAR(191),
                status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (song_id) REFERENCES songs(id),
                FOREIGN KEY (seller_id) REFERENCES users(id),
                FOREIGN KEY (buyer_id) REFERENCES users(id)
            );
        `);
        console.log('Transactions table ensured.');

        // Add usd_to_rwf_rate to transactions table if not exists
        try {
            await connection.query(`ALTER TABLE transactions ADD COLUMN usd_to_rwf_rate DECIMAL(10,2) NULL`);
        } catch (err) {
            // Column already exists, ignore error
        }

        // Add missing columns to transactions table if they don't exist
        try {
            await connection.query(`ALTER TABLE transactions ADD COLUMN seller_amount DECIMAL(10,2)`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE transactions ADD COLUMN admin_commission DECIMAL(10,2)`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE transactions ADD COLUMN payment_data TEXT`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE transactions ADD COLUMN completed_at TIMESTAMP NULL`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE transactions ADD COLUMN referrer_id INT`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE transactions ADD COLUMN customer_name VARCHAR(191)`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE transactions ADD COLUMN customer_email VARCHAR(191)`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE transactions ADD COLUMN customer_phone VARCHAR(191)`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE transactions ADD COLUMN currency VARCHAR(10) DEFAULT 'USD'`);
        } catch (err) {
            // Column already exists, ignore error
        }

        // Add download count columns to transactions table
        try {
            await connection.query(`ALTER TABLE transactions ADD COLUMN download_count INT DEFAULT 0`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE transactions ADD COLUMN lyrics_download_count INT DEFAULT 0`);
        } catch (err) {
            // Column already exists, ignore error
        }

        await connection.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id INT PRIMARY KEY AUTO_INCREMENT,
                commission_rate DECIMAL(5,2) NOT NULL DEFAULT 40.00,
                referral_rate DECIMAL(5,2) NOT NULL DEFAULT 5.00,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
        `);
        console.log('Settings table ensured.');

        // Add missing columns to settings table if they don't exist
        try {
            await connection.query(`ALTER TABLE settings ADD COLUMN seller_commission_rate DECIMAL(5,4) DEFAULT 0.6000`);
        } catch (err) {
            // Column already exists, ignore error
        }
        
        try {
            await connection.query(`ALTER TABLE settings ADD COLUMN share_commission_rate DECIMAL(5,4) DEFAULT 0.1500`);
        } catch (err) {
            // Column already exists, ignore error
        }

        await connection.query(`
            CREATE TABLE IF NOT EXISTS withdrawals (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                whatsapp_number VARCHAR(20) NOT NULL,
                status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
                admin_notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `);
        console.log('Withdrawals table ensured.');

        // Create remember_tokens table for persistent login
        await connection.query(`
            CREATE TABLE IF NOT EXISTS remember_tokens (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                token VARCHAR(191) NOT NULL UNIQUE,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);
        console.log('Remember tokens table ensured.');

        // Create notifications table for in-app notifications
        await connection.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT,
                type VARCHAR(50) DEFAULT 'info',
                message TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);
        console.log('Notifications table ensured.');

        // Create share_commissions table for referral tracking
        await connection.query(`
            CREATE TABLE IF NOT EXISTS share_commissions (
                id INT PRIMARY KEY AUTO_INCREMENT,
                transaction_id INT NOT NULL,
                sharer_id INT NOT NULL,
                song_id INT NOT NULL,
                commission_amount DECIMAL(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (transaction_id) REFERENCES transactions(id),
                FOREIGN KEY (sharer_id) REFERENCES users(id),
                FOREIGN KEY (song_id) REFERENCES songs(id)
            );
        `);
        console.log('Share commissions table ensured.');

        // Insert default settings if not exist
        await connection.query(`
            INSERT INTO settings (commission_rate, referral_rate)
            SELECT 40.00, 5.00
            WHERE NOT EXISTS (SELECT 1 FROM settings);
        `);
        console.log('Default settings ensured.');

        // Create default admin user if not exists
        const defaultAdminPassword = await require('bcryptjs').hash('admin123', 10);
        await connection.query(`
            INSERT INTO users (name, email, password, whatsapp, is_admin)
            SELECT 'Admin', 'admin@naweririmba.com', ?, '+250780000000', TRUE
            WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@naweririmba.com');
        `, [defaultAdminPassword]);
        console.log('Default admin user ensured.');

        console.log('Database initialization completed successfully.');
        
    } catch (error) {
        console.error('Database initialization error:', error);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

module.exports = initializeDatabase;
