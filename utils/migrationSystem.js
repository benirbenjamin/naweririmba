/**
 * Migration System for Nawe Ririmba Space
 * Handles database schema updates and data migrations
 */

const fs = require('fs');
const path = require('path');

class MigrationSystem {
    constructor(db) {
        this.db = db;
        this.migrationsPath = path.join(__dirname, '../migrations');
    }

    async initialize() {
        // Create migrations table if it doesn't exist
        await this.db.execute(`
            CREATE TABLE IF NOT EXISTS migrations (
                id INT PRIMARY KEY AUTO_INCREMENT,
                filename VARCHAR(255) NOT NULL UNIQUE,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Migrations table ensured.');
    }

    async runMigrations() {
        try {
            await this.initialize();
            
            // Get all migration files
            const migrationFiles = fs.readdirSync(this.migrationsPath)
                .filter(file => file.endsWith('.js'))
                .sort();

            // Get executed migrations
            const [executedMigrations] = await this.db.execute('SELECT filename FROM migrations');
            const executedFiles = executedMigrations.map(m => m.filename);

            // Run pending migrations
            for (const file of migrationFiles) {
                if (!executedFiles.includes(file)) {
                    console.log(`Running migration: ${file}`);
                    
                    try {
                        const migration = require(path.join(this.migrationsPath, file));
                        await migration.up(this.db);
                        
                        // Mark migration as executed (use INSERT IGNORE to prevent duplicates)
                        await this.db.execute('INSERT IGNORE INTO migrations (filename) VALUES (?)', [file]);
                        console.log(`✅ Migration ${file} completed successfully`);
                    } catch (error) {
                        console.error(`❌ Migration ${file} failed:`, error);
                        
                        // If it's a duplicate entry error, the migration might have already been recorded
                        if (error.code === 'ER_DUP_ENTRY') {
                            console.log(`⚠️  Migration ${file} was already recorded as executed`);
                        } else {
                            throw error;
                        }
                    }
                }
            }
            
            console.log('All migrations completed successfully.');
        } catch (error) {
            console.error('Migration system error:', error);
            throw error;
        }
    }

    async rollback(filename) {
        try {
            console.log(`Rolling back migration: ${filename}`);
            
            const migration = require(path.join(this.migrationsPath, filename));
            if (migration.down) {
                await migration.down(this.db);
                await this.db.execute('DELETE FROM migrations WHERE filename = ?', [filename]);
                console.log(`✅ Migration ${filename} rolled back successfully`);
            } else {
                console.log(`⚠️  Migration ${filename} does not support rollback`);
            }
        } catch (error) {
            console.error(`❌ Rollback failed for ${filename}:`, error);
            throw error;
        }
    }

    async clearMigrationRecord(filename) {
        try {
            await this.db.execute('DELETE FROM migrations WHERE filename = ?', [filename]);
            console.log(`✅ Cleared migration record for: ${filename}`);
        } catch (error) {
            console.error(`❌ Failed to clear migration record for ${filename}:`, error);
            throw error;
        }
    }

    async resetMigrations() {
        try {
            await this.db.execute('DELETE FROM migrations');
            console.log('✅ All migration records cleared');
        } catch (error) {
            console.error('❌ Failed to reset migrations:', error);
            throw error;
        }
    }
}

module.exports = MigrationSystem;
