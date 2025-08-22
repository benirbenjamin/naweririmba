/**
 * Migration: Add security questions for password reset
 * Date: 2025-01-11
 */

const bcrypt = require('bcryptjs');

module.exports = {
    async up(db) {
        console.log('Adding security questions and password reset functionality...');
        
        // Check if users table exists first
        try {
            const [tables] = await db.execute(`SHOW TABLES LIKE 'users'`);
            if (tables.length === 0) {
                console.log('Users table does not exist yet, skipping security questions migration');
                return;
            }
        } catch (error) {
            console.log('Could not check for users table, skipping migration');
            return;
        }
        
        // Add security question columns to users table
        try {
            await db.execute(`ALTER TABLE users ADD COLUMN security_question_id INT NOT NULL DEFAULT 1`);
            console.log('Added security_question_id column to users table');
        } catch (error) {
            if (!error.message.includes('Duplicate column name')) {
                throw error;
            }
            console.log('security_question_id column already exists');
        }
        
        try {
            await db.execute(`ALTER TABLE users ADD COLUMN security_answer VARCHAR(255) NOT NULL DEFAULT ''`);
            console.log('Added security_answer column to users table');
        } catch (error) {
            if (!error.message.includes('Duplicate column name')) {
                throw error;
            }
            console.log('security_answer column already exists');
        }

        // Create security questions table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS security_questions (
                id INT PRIMARY KEY AUTO_INCREMENT,
                question TEXT NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Security questions table created');

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
            try {
                await db.execute(`
                    INSERT IGNORE INTO security_questions (id, question)
                    VALUES (?, ?)
                `, [i + 1, securityQuestions[i]]);
            } catch (error) {
                // If duplicate entry, ignore it
                if (error.code !== 'ER_DUP_ENTRY') {
                    throw error;
                }
            }
        }
        console.log('Default security questions inserted');

        // Update existing admin user with security question
        const defaultAnswer = await bcrypt.hash('admin', 10);
        await db.execute(`
            UPDATE users 
            SET security_question_id = 1, security_answer = ?
            WHERE email = 'admin@naweririmba.com' AND (security_answer = '' OR security_answer IS NULL)
        `, [defaultAnswer]);
        console.log('Updated admin user with default security answer');
    },

    async down(db) {
        console.log('Rolling back security questions migration...');
        
        // Remove columns from users table
        try {
            await db.execute(`ALTER TABLE users DROP COLUMN security_question_id`);
            await db.execute(`ALTER TABLE users DROP COLUMN security_answer`);
            console.log('Removed security question columns from users table');
        } catch (error) {
            console.log('Error removing columns (might not exist):', error.message);
        }

        // Drop security questions table
        await db.execute(`DROP TABLE IF EXISTS security_questions`);
        console.log('Dropped security questions table');
    }
};
