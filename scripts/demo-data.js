require('dotenv').config();
const db = require('../models/db');
const bcrypt = require('bcryptjs');

async function insertDemoData() {
    try {
        console.log('Inserting demo data...');
        
        // Create demo users
        const hashedPassword = await bcrypt.hash('demo123', 10);
        
        // Demo artist
        await db.execute(`
            INSERT INTO users (name, email, whatsapp, password, is_admin, referral_code, balance)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE name = VALUES(name)
        `, [
            'Demo Artist',
            'artist@demo.com',
            '+250788123456',
            hashedPassword,
            0,
            'DEMO123',
            150.75
        ]);

        // Demo admin
        await db.execute(`
            INSERT INTO users (name, email, whatsapp, password, is_admin, referral_code, balance)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE name = VALUES(name)
        `, [
            'Demo Admin',
            'admin@demo.com',
            '+250788654321',
            hashedPassword,
            1,
            'ADMIN123',
            0
        ]);

        // Get user IDs
        const [artistRows] = await db.execute('SELECT id FROM users WHERE email = ?', ['artist@demo.com']);
        const artistId = artistRows[0].id;

        // Create demo songs
        const demoSongs = [
            {
                title: 'Heavenly Praise',
                style: 'gospel',
                genre: 'igisirimba',
                lyrics: `Verse 1:
In the morning light I rise
With thanksgiving in my eyes
Every breath You've given me
Is a gift from eternity

Chorus:
Heavenly praise, heavenly praise
Lifting my voice through all my days
In Your presence I will stay
Singing heavenly praise

Verse 2:
When the storms of life appear
I will trust and have no fear
For Your love will see me through
My heart belongs to You

(Repeat Chorus)

Bridge:
Holy, holy, holy Lord
You are worthy to be adored
Forever I will sing Your name
Your love will never change`,
                price: 15.99,
                audio_path: '/uploads/demo_heavenly_praise.mp3',
                preview_path: '/uploads/previews/demo_heavenly_praise_preview.mp3',
                preview_start_time: 0,
                preview_end_time: 45,
                tempo: 120,
                time_signature: '4/4'
            },
            {
                title: 'Rwandan Soul',
                style: 'traditional',
                genre: 'zouke',
                lyrics: `Verse 1:
From the hills of thousand dreams
Where the morning coffee steams
Rwanda's heart beats strong and true
In every soul, in me and you

Chorus:
We are the children of this land
Standing together, hand in hand
Through joy and sorrow, we will rise
Under African skies

Verse 2:
Grandmothers singing ancient songs
Teaching us where we belong
Unity and peace we share
Love is always in the air

(Repeat Chorus)

Bridge:
Urwanda rwange (My Rwanda)
Urugamba twatsinze (The struggle we won)
Ubwiyunge nubwenge (Reconciliation and wisdom)
Turagenda imbere (We move forward)`,
                price: 12.50,
                audio_path: '/uploads/demo_rwandan_soul.mp3',
                preview_path: '/uploads/previews/demo_rwandan_soul_preview.mp3',
                preview_start_time: 15,
                preview_end_time: 60,
                tempo: 95,
                time_signature: '4/4'
            },
            {
                title: 'Digital Dreams',
                style: 'contemporary',
                genre: 'techno',
                lyrics: `Verse 1:
In the realm of ones and zeros
Where the digital light glows
We create what we believe
In this world we can achieve

Chorus:
Digital dreams, electric beams
Nothing is quite what it seems
In the matrix of our minds
We leave the old world behind

Verse 2:
Synthesizers sing the truth
Technology keeps us in tune
Beats that pulse through circuit boards
Creating worlds with silent words

(Repeat Chorus)

Bridge:
Upload, download, connect
Virtual reality's effect
In the cloud we store our souls
Reaching for digital goals`,
                price: 18.99,
                audio_path: '/uploads/demo_digital_dreams.mp3',
                preview_path: '/uploads/previews/demo_digital_dreams_preview.mp3',
                preview_start_time: 30,
                preview_end_time: 75,
                tempo: 128,
                time_signature: '4/4'
            }
        ];

        // Insert demo songs
        for (const song of demoSongs) {
            await db.execute(`
                INSERT INTO songs (
                    user_id, title, style, genre, lyrics, price,
                    audio_path, preview_path, preview_start_time, preview_end_time,
                    tempo, time_signature, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE title = VALUES(title)
            `, [
                artistId,
                song.title,
                song.style,
                song.genre,
                song.lyrics,
                song.price,
                song.audio_path,
                song.preview_path,
                song.preview_start_time,
                song.preview_end_time,
                song.tempo,
                song.time_signature
            ]);
        }

        // Insert platform settings
        await db.execute(`
            INSERT INTO settings (setting_key, setting_value, updated_at)
            VALUES 
                ('commission_rate', '15', NOW()),
                ('referral_rate', '5', NOW())
            ON DUPLICATE KEY UPDATE 
                setting_value = VALUES(setting_value),
                updated_at = VALUES(updated_at)
        `);

        console.log('Demo data inserted successfully!');
        console.log('');
        console.log('Demo Login Credentials:');
        console.log('📧 Artist Account: artist@demo.com');
        console.log('🔐 Password: demo123');
        console.log('');
        console.log('📧 Admin Account: admin@demo.com');
        console.log('🔐 Password: demo123');
        console.log('');
        console.log('🎵 Demo songs have been created with preview snippets');
        console.log('💰 Platform commission set to 15%');
        console.log('🎁 Referral bonus set to 5%');

    } catch (error) {
        console.error('Error inserting demo data:', error);
    } finally {
        process.exit(0);
    }
}

// Run if called directly
if (require.main === module) {
    insertDemoData();
}

module.exports = { insertDemoData };
