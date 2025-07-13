const mysql = require('mysql2/promise');
const MigrationSystem = require('../utils/migrationSystem');

async function initializeDatabase() {
    let connection;
    
    try {
        // First, connect without database to create it if it doesn't exist
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || ''
        });

        console.log('Checking database...');
        
        // Create database if it doesn't exist
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'nawe_ririmba'}`);
        console.log(`Database '${process.env.DB_NAME || 'nawe_ririmba'}' ensured.`);
        
        // Switch to the database
        await connection.query(`USE ${process.env.DB_NAME || 'nawe_ririmba'}`);
        
        // Create base tables first before running migrations
        console.log('Creating base tables...');
        
        // Create users table first
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
                onesignal_id VARCHAR(191) NULL,
                email_verified BOOLEAN DEFAULT FALSE,
                security_question_id INT NOT NULL DEFAULT 1,
                security_answer VARCHAR(255) NOT NULL DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (referred_by) REFERENCES users(id)
            );
        `);
        console.log('Users table ensured.');

        // Run migrations after base tables are created
        const migrationSystem = new MigrationSystem(connection);
        await migrationSystem.runMigrations();
        
        // Continue with existing table creation for backwards compatibility
        console.log('Running additional table setup...');
        
        // Add missing columns to users table if they don't exist (after base table exists)
        // Most columns are now included in the initial table creation above
        
        // Only add columns that might be missing from older installations
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
                sold_at TIMESTAMP NULL,
                audio_format VARCHAR(10),
                file_size INT,
                cover_image VARCHAR(191),
                play_count INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (buyer_id) REFERENCES users(id)
            );
        `);
        console.log('Songs table ensured.');

        // Songs table columns are now included in the initial table creation above
        // Only add foreign keys if needed
        try {
            await connection.query(`ALTER TABLE songs ADD FOREIGN KEY (buyer_id) REFERENCES users(id)`);
        } catch (err) {
            // Foreign key already exists, ignore error
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
                seller_amount DECIMAL(10,2),
                admin_commission DECIMAL(10,2),
                flutterwave_tx_ref VARCHAR(191) UNIQUE,
                flutterwave_tx_id VARCHAR(191),
                payment_reference VARCHAR(191),
                status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
                usd_to_rwf_rate DECIMAL(10,2) NULL,
                payment_data TEXT,
                completed_at TIMESTAMP NULL,
                referrer_id INT,
                customer_name VARCHAR(191),
                customer_email VARCHAR(191),
                customer_phone VARCHAR(191),
                currency VARCHAR(10) DEFAULT 'USD',
                download_count INT DEFAULT 0,
                lyrics_download_count INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (song_id) REFERENCES songs(id),
                FOREIGN KEY (seller_id) REFERENCES users(id),
                FOREIGN KEY (buyer_id) REFERENCES users(id)
            );
        `);
        console.log('Transactions table ensured.');

        // Add payment_reference column if it doesn't exist (for existing databases)
        try {
            await connection.query(`ALTER TABLE transactions ADD COLUMN payment_reference VARCHAR(191)`);
            console.log('Added payment_reference column to transactions table.');
        } catch (error) {
            if (!error.message.includes('Duplicate column name')) {
                console.error('Error adding payment_reference column:', error);
            }
        }

        // Transactions table already created with all columns

        await connection.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id INT PRIMARY KEY AUTO_INCREMENT,
                commission_rate DECIMAL(5,2) NOT NULL DEFAULT 40.00,
                referral_rate DECIMAL(5,2) NOT NULL DEFAULT 5.00,
                key_name VARCHAR(191) UNIQUE,
                value TEXT,
                seller_commission_rate DECIMAL(5,4) DEFAULT 0.6000,
                share_commission_rate DECIMAL(5,4) DEFAULT 0.1500,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
        `);
        console.log('Settings table ensured.');

        // Insert default settings
        const [settingsExists] = await connection.execute('SELECT id FROM settings LIMIT 1');
        
        if (settingsExists.length === 0) {
            await connection.execute(`
                INSERT INTO settings (commission_rate, referral_rate) VALUES (?, ?)
            `, [40.00, 5.00]);
            console.log('Default settings created.');
        } else {
            console.log('Default settings already exist.');
        }

        await connection.query(`
            CREATE TABLE IF NOT EXISTS withdrawals (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                whatsapp_number VARCHAR(20) NOT NULL,
                account_type ENUM('mobile_money', 'bank_account'),
                account_name VARCHAR(255),
                account_number VARCHAR(100),
                bank_name VARCHAR(255),
                momo_operator VARCHAR(50),
                status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
                admin_notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `);
        console.log('Withdrawals table ensured.');

        // Withdrawals table already created with all columns
        console.log('Enhanced withdrawal columns ensured.');

        // Create user payment accounts table for saving payment methods
        await connection.query(`
            CREATE TABLE IF NOT EXISTS user_payment_accounts (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                account_type ENUM('mobile_money', 'bank_account') NOT NULL,
                account_name VARCHAR(255) NOT NULL,
                account_number VARCHAR(100) NOT NULL,
                bank_name VARCHAR(255) NULL,
                momo_operator VARCHAR(50) NULL,
                is_default BOOLEAN DEFAULT FALSE,
                usage_count INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);
        console.log('User payment accounts table ensured.');

        // Create notifications table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT,
                type ENUM('info', 'success', 'warning', 'error') DEFAULT 'info',
                message TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);
        console.log('Notifications table ensured.');

        // Create share_commissions table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS share_commissions (
                id INT PRIMARY KEY AUTO_INCREMENT,
                transaction_id INT NOT NULL,
                sharer_id INT NOT NULL,
                song_id INT NOT NULL,
                commission_amount DECIMAL(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
                FOREIGN KEY (sharer_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
            );
        `);
        console.log('Share commissions table ensured.');

        // Create referral_commissions table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS referral_commissions (
                id INT PRIMARY KEY AUTO_INCREMENT,
                referrer_id INT NOT NULL,
                referred_id INT NOT NULL,
                commission_amount DECIMAL(10,2) NOT NULL,
                transaction_id INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (referred_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
            );
        `);
        console.log('Referral commissions table ensured.');

        // Create security_questions table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS security_questions (
                id INT PRIMARY KEY AUTO_INCREMENT,
                question TEXT NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
        `);
        console.log('Security questions table ensured.');

        // Settings insertion handled above

        // Create default admin user if not exists
        const defaultAdminPassword = await require('bcryptjs').hash('admin123', 10);
        
        try {
            // Check if admin user exists first
            const [adminExists] = await connection.execute(
                'SELECT id FROM users WHERE email = ?',
                ['admin@naweririmba.com']
            );
            
            console.log('Admin user check result:', adminExists.length);
            
            if (adminExists.length === 0) {
                await connection.execute(`
                    INSERT INTO users (name, email, password, whatsapp, is_admin, security_question_id, security_answer)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, ['Admin', 'admin@naweririmba.com', defaultAdminPassword, '+250780000000', true, 1, 'admin']);
                console.log('Default admin user created.');
            } else {
                console.log('Default admin user already exists.');
            }
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                console.log('Admin user already exists (duplicate entry error caught).');
            } else {
                throw error;
            }
        }

        // Insert default security questions
        const securityQuestions = [
            "What is your mother's maiden name?",
            "What was the name of your first pet?",
            "What city were you born in?",
            "What is the name of your favorite teacher?",
            "What was your childhood nickname?",
            "What is the name of the street you grew up on?",
            "What is your favorite food?",
            "What was the make of your first car?",
            "What is the name of your best friend from childhood?",
            "What is your favorite movie?"
        ];

        for (let i = 0; i < securityQuestions.length; i++) {
            const questionId = i + 1;
            const [questionExists] = await connection.execute(
                'SELECT id FROM security_questions WHERE id = ?',
                [questionId]
            );
            
            if (questionExists.length === 0) {
                await connection.execute(`
                    INSERT INTO security_questions (id, question) VALUES (?, ?)
                `, [questionId, securityQuestions[i]]);
            }
        }
        console.log('Default security questions ensured.');

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
