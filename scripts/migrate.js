#!/usr/bin/env node

/**
 * Migration Runner Script
 * Usage: node scripts/migrate.js [up|down|status]
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const MigrationSystem = require('../utils/migrationSystem');

async function main() {
    const action = process.argv[2] || 'up';
    const migrationFile = process.argv[3];
    
    let connection;
    
    try {
        // Connect to database
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });
        
        console.log('Connected to database');
        
        const migrationSystem = new MigrationSystem(connection);
        
        switch (action) {
            case 'up':
                await migrationSystem.runMigrations();
                break;
                
            case 'down':
                if (!migrationFile) {
                    console.error('Please specify a migration file to rollback');
                    process.exit(1);
                }
                await migrationSystem.rollback(migrationFile);
                break;
                
            case 'clear':
                if (!migrationFile) {
                    console.error('Please specify a migration file to clear');
                    process.exit(1);
                }
                await migrationSystem.clearMigrationRecord(migrationFile);
                break;
                
            case 'reset':
                console.log('⚠️  This will clear all migration records. Are you sure? (This action cannot be undone)');
                // In a real scenario, you'd want to add a confirmation prompt
                await migrationSystem.resetMigrations();
                break;
                
            case 'status':
                await migrationSystem.initialize();
                const [executedMigrations] = await connection.execute('SELECT filename, executed_at FROM migrations ORDER BY executed_at DESC');
                
                console.log('\n📊 Migration Status:');
                console.log('==================');
                
                if (executedMigrations.length === 0) {
                    console.log('No migrations have been executed yet.');
                } else {
                    executedMigrations.forEach(migration => {
                        console.log(`✅ ${migration.filename} - ${migration.executed_at}`);
                    });
                }
                break;
                
            default:
                console.log('Usage: node scripts/migrate.js [up|down|clear|reset|status]');
                console.log('Commands:');
                console.log('  up               - Run all pending migrations');
                console.log('  down <file>      - Rollback a specific migration');
                console.log('  clear <file>     - Clear migration record for a specific file');
                console.log('  reset            - Clear all migration records (DANGER!)');
                console.log('  status           - Show migration status');
                break;
        }
        
    } catch (error) {
        console.error('Migration error:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

main();
