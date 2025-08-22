const express = require('express');
const router = express.Router();
const db = require('../models/db');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const CoverGenerator = require('../utils/coverGenerator');
const { execFile } = require('child_process');

// Function to get proper MIME type for audio formats
function getAudioMimeType(format) {
    const mimeTypes = {
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'aac': 'audio/aac',
        'm4a': 'audio/mp4',
        'flac': 'audio/flac',
        'ogg': 'audio/ogg',
        'webm': 'audio/webm'
    };
    
    return mimeTypes[format.toLowerCase()] || 'audio/mpeg';
}

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

// Configure multer for audio file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../public/uploads');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
        } catch (error) {
            console.error('Error creating upload directory:', error);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/aac', 
        'audio/flac', 'audio/ogg', 'audio/mp4', 'audio/m4a', 'audio/webm'
    ];
    
    // Get file extension
    const fileExtension = path.extname(file.originalname).toLowerCase().slice(1);
    const allowedExtensions = ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'webm'];
    
    // Check extension first (more reliable than MIME type)
    if (allowedExtensions.includes(fileExtension)) {
        cb(null, true);
    } else if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only MP3, WAV, AAC, M4A, FLAC, OGG, and WEBM files are allowed.'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// Genre options based on requirements
const genreOptions = {
    gospel: ['igisirimba', 'zouke', 'zulu', 'reggae', 'zulu_reggae', 'techno', 'seben', 'ikinimba', 'country', 'slow', 'rnb', 'pop', 'igisope_style', 'injyaruwa', 'igisope', 'other_style', 'other'],
    secular: ['afrobeat', 'hip_hop', 'jazz', 'rock', 'blues', 'folk', 'electronic', 'reggae', 'rnb', 'pop', 'country', 'techno', 'injyaruwa', 'igisope', 'other_style', 'other']
};

// Browse all songs
router.get('/', async (req, res) => {
    try {
        const { style, genre, search, sort = 'newest' } = req.query;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.max(1, Math.min(50, parseInt(req.query.limit) || 12)); // Ensure between 1-50
        const offset = Math.max(0, (page - 1) * limit);

        let whereConditions = ['songs.is_sold = FALSE', 'songs.title NOT LIKE "[INACTIVE]%"'];
        let queryParams = [];

        if (style) {
            whereConditions.push('songs.style = ?');
            queryParams.push(style);
        }

        if (genre) {
            whereConditions.push('songs.genre = ?');
            queryParams.push(genre);
        }

        if (search) {
            whereConditions.push('(songs.title LIKE ? OR users.name LIKE ?)');
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        let orderBy = 'songs.created_at DESC';
        if (sort === 'price_low') orderBy = 'songs.price ASC';
        if (sort === 'price_high') orderBy = 'songs.price DESC';
        if (sort === 'popular') orderBy = 'songs.play_count DESC';

        const whereClause = whereConditions.join(' AND ');
        
        const pool = await db.getPool();
        
        // Get total count for pagination
        const [countResult] = await pool.execute(
            `SELECT COUNT(*) as total FROM songs 
             JOIN users ON songs.user_id = users.id 
             WHERE ${whereClause}`,
            queryParams
        );
        
        const totalSongs = countResult[0].total;
        const totalPages = Math.ceil(totalSongs / limit);

        // Ensure limit and offset are valid integers
        const finalLimit = Number.isInteger(limit) && limit > 0 ? limit : 12;
        const finalOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;

        // Prepare parameters for the main query (only WHERE params, not LIMIT/OFFSET)
        const mainQueryParams = [...queryParams];

        // Get songs - use direct interpolation for LIMIT/OFFSET since they are validated integers
        const [songs] = await pool.execute(
            `SELECT songs.*, users.name as artist_name, users.whatsapp as artist_whatsapp
             FROM songs 
             JOIN users ON songs.user_id = users.id 
             WHERE ${whereClause}
             ORDER BY ${orderBy}
             LIMIT ${finalLimit} OFFSET ${finalOffset}`,
            mainQueryParams
        );

        res.render('songs/browse', {
            title: 'Browse Songs',
            songs,
            genreOptions,
            currentFilters: { style, genre, search, sort },
            pagination: {
                current: page,
                total: Math.ceil(totalSongs / finalLimit),
                hasNext: page < Math.ceil(totalSongs / finalLimit),
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('Browse songs error:', error);
        res.render('songs/browse', {
            title: 'Browse Songs',
            songs: [],
            genreOptions,
            currentFilters: {},
            pagination: { current: 1, total: 1, hasNext: false, hasPrev: false },
            error: 'Failed to load songs'
        });
    }
});

// Show upload form
router.get('/upload', isAuthenticated, (req, res) => {
    res.render('songs/upload', {
        title: 'Upload Your Song',
        genreOptions
    });
});

// Handle song upload from main route
router.post('/', isAuthenticated, upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.render('songs/upload', {
                title: 'Upload Your Song',
                genreOptions,
                error: 'Please select an audio file to upload'
            });
        }

        const { title, style, genre, lyrics, price, tempo = 120, time_signature = '4/4', preview_start_time, preview_end_time } = req.body;

        if (!title || !style || !genre || !lyrics || !price) {
            await fs.unlink(req.file.path);
            return res.render('songs/upload', {
                title: 'Upload Your Song',
                genreOptions,
                error: 'All fields are required'
            });
        }

        if (!genreOptions[style] || !genreOptions[style].includes(genre)) {
            await fs.unlink(req.file.path);
            return res.render('songs/upload', {
                title: 'Upload Your Song',
                genreOptions,
                error: 'Invalid genre selection'
            });
        }

        const songPrice = parseFloat(price);
        if (isNaN(songPrice) || songPrice <= 0) {
            await fs.unlink(req.file.path);
            return res.render('songs/upload', {
                title: 'Upload Your Song',
                genreOptions,
                error: 'Please enter a valid price'
            });
        }

        // Get file info
        const audioFormat = path.extname(req.file.originalname).slice(1).toLowerCase();
        const fileSize = req.file.size;

        // Generate cover image using coverGenerator
        const coverFilename = await CoverGenerator.generateCover(title, genre, style);

        const pool = await db.getPool();
        const userId = req.session.user.id;

        // --- Automatic preview generation (first 45 seconds) ---
        const previewsDir = path.join(__dirname, '../public/uploads/previews');
        await fs.mkdir(previewsDir, { recursive: true });
        const previewFilename = `${path.parse(req.file.filename).name}_preview.${audioFormat}`;
        const previewFilePath = path.join(previewsDir, previewFilename);
        let previewPath = null;
        
        // Use user-defined preview times or default to first 45 seconds
        let previewStart = parseFloat(preview_start_time) || 0;
        let previewEnd = parseFloat(preview_end_time) || 45;
        
        // Validate preview duration (max 60 seconds, min 30 seconds)
        if (isNaN(previewStart) || isNaN(previewEnd) || previewStart >= previewEnd) {
            previewStart = 0;
            previewEnd = 45;
        }
        
        if ((previewEnd - previewStart) > 60) {
            previewEnd = previewStart + 45;
        }
        
        if ((previewEnd - previewStart) < 30) {
            previewEnd = previewStart + 45;
        }

        // Generate preview using ffmpeg (more reliable than audiowaveform)
        try {
            await new Promise((resolve, reject) => {
                const { spawn } = require('child_process');
                const ffmpeg = spawn('ffmpeg', [
                    '-i', req.file.path,
                    '-ss', previewStart.toString(),
                    '-t', (previewEnd - previewStart).toString(),
                    '-c', 'copy',
                    '-avoid_negative_ts', 'make_zero',
                    previewFilePath
                ], { stdio: 'pipe' });

                ffmpeg.on('close', (code) => {
                    if (code === 0) {
                        previewPath = `/uploads/previews/${previewFilename}`;
                        console.log(`Preview created: ${previewPath}`);
                        resolve();
                    } else {
                        console.warn('FFmpeg failed, using original file for preview');
                        previewPath = `/uploads/${req.file.filename}`;
                        resolve();
                    }
                });

                ffmpeg.on('error', (error) => {
                    console.warn('FFmpeg error, using original file for preview:', error.message);
                    previewPath = `/uploads/${req.file.filename}`;
                    resolve();
                });
            });
        } catch (error) {
            console.warn('Preview generation failed, using original file:', error.message);
            previewPath = `/uploads/${req.file.filename}`;
        }

        // Insert song into database
        const [result] = await pool.execute(
            `INSERT INTO songs (
                user_id, title, style, genre, lyrics, price, 
                audio_path, preview_path, audio_format, file_size, cover_image,
                tempo, time_signature, preview_start_time, preview_end_time,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                userId, title, style, genre, lyrics, songPrice,
                req.file.filename, previewPath, audioFormat, fileSize, coverFilename,
                tempo, time_signature, previewStart, previewEnd
            ]
        );

        const songId = result.insertId;
        console.log(`Song uploaded successfully - ID: ${songId}, File: ${req.file.filename}, Preview: ${previewPath}, Cover: ${coverFilename}`);

        // Redirect to the song page
        res.redirect(`/songs/${songId}?success=uploaded`);

    } catch (error) {
        console.error('Upload error:', error);
        
        // Clean up uploaded file if it exists
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Error cleaning up file:', unlinkError);
            }
        }

        res.render('songs/upload', {
            title: 'Upload Your Song',
            genreOptions,
            error: 'Upload failed. Please try again.'
        });
    }
});

// Handle song upload
router.post('/upload', isAuthenticated, upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.render('songs/upload', {
                title: 'Upload Your Song',
                genreOptions,
                error: 'Please select an audio file to upload'
            });
        }

        const { title, style, genre, lyrics, price, tempo = 120, time_signature = '4/4', preview_start_time, preview_end_time } = req.body;

        if (!title || !style || !genre || !lyrics || !price) {
            await fs.unlink(req.file.path);
            return res.render('songs/upload', {
                title: 'Upload Your Song',
                genreOptions,
                error: 'All fields are required'
            });
        }

        if (!genreOptions[style] || !genreOptions[style].includes(genre)) {
            await fs.unlink(req.file.path);
            return res.render('songs/upload', {
                title: 'Upload Your Song',
                genreOptions,
                error: 'Invalid genre selection'
            });
        }

        const songPrice = parseFloat(price);
        if (isNaN(songPrice) || songPrice <= 0) {
            await fs.unlink(req.file.path);
            return res.render('songs/upload', {
                title: 'Upload Your Song',
                genreOptions,
                error: 'Please enter a valid price'
            });
        }

        // Get file info
        const audioFormat = path.extname(req.file.originalname).slice(1).toLowerCase();
        const fileSize = req.file.size;

        // Generate cover image using coverGenerator
        const coverFilename = await CoverGenerator.generateCover(title, genre, style);

        const pool = await db.getPool();
        const userId = req.session.user.id;

        // --- Automatic preview generation (first 45 seconds) ---
        const previewsDir = path.join(__dirname, '../public/uploads/previews');
        await fs.mkdir(previewsDir, { recursive: true });
        const previewFilename = `${path.parse(req.file.filename).name}_preview.${audioFormat}`;
        const previewFilePath = path.join(previewsDir, previewFilename);
        let previewPath = null;
        
        // Use user-defined preview times or default to first 45 seconds
        let previewStart = parseFloat(preview_start_time) || 0;
        let previewEnd = parseFloat(preview_end_time) || 45;
        
        // Validate preview duration (max 60 seconds, min 30 seconds)
        if (isNaN(previewStart) || isNaN(previewEnd) || previewStart >= previewEnd) {
            previewStart = 0;
            previewEnd = 45;
        }
        
        if ((previewEnd - previewStart) > 60) {
            previewEnd = previewStart + 45;
        }
        
        if ((previewEnd - previewStart) < 30) {
            previewEnd = previewStart + 45;
        }

        // Generate preview using ffmpeg (more reliable than audiowaveform)
        try {
            await new Promise((resolve, reject) => {
                const { spawn } = require('child_process');
                const ffmpeg = spawn('ffmpeg', [
                    '-i', req.file.path,
                    '-ss', previewStart.toString(),
                    '-t', (previewEnd - previewStart).toString(),
                    '-c', 'copy',
                    '-avoid_negative_ts', 'make_zero',
                    previewFilePath
                ], { stdio: 'pipe' });

                ffmpeg.on('close', (code) => {
                    if (code === 0) {
                        previewPath = `/uploads/previews/${previewFilename}`;
                        console.log(`Preview created: ${previewPath}`);
                        resolve();
                    } else {
                        console.warn('FFmpeg failed, using original file for preview');
                        previewPath = `/uploads/${req.file.filename}`;
                        resolve();
                    }
                });

                ffmpeg.on('error', (error) => {
                    console.warn('FFmpeg error, using original file for preview:', error.message);
                    previewPath = `/uploads/${req.file.filename}`;
                    resolve();
                });
            });
        } catch (error) {
            console.warn('Preview generation failed, using original file:', error.message);
            previewPath = `/uploads/${req.file.filename}`;
        }

        // Insert song into database with cover image and preview info
        const [result] = await pool.execute(
            `INSERT INTO songs (user_id, title, style, genre, lyrics, price, audio_path, preview_path, audio_format, tempo, time_signature, file_size, cover_image, preview_start_time, preview_end_time) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, title, style, genre, lyrics, songPrice, req.file.filename, previewPath, audioFormat, tempo, time_signature, fileSize, coverFilename, previewStart, previewEnd]
        );

        // Check if request expects JSON response (AJAX)
        if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data') && 
            req.headers['x-requested-with'] === 'XMLHttpRequest') {
            res.json({
                success: true,
                message: 'Song uploaded successfully!',
                songId: result.insertId,
                redirect: `/songs/${result.insertId}?success=uploaded`,
                audioPath: `/uploads/${req.file.filename}`,
                previewPath: previewPath,
                coverPath: `/uploads/covers/${coverFilename}`,
                streamPath: `/songs/${result.insertId}/stream`
            });
        } else {
            res.redirect(`/songs/${result.insertId}?success=uploaded`);
        }
    } catch (error) {
        console.error('Song upload error:', error);
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Error deleting file:', unlinkError);
            }
        }
        res.render('songs/upload', {
            title: 'Upload Your Song',
            genreOptions,
            error: error.message || 'Failed to upload song. Please try again.'
        });
    }
});

// Show single song
router.get('/:id', async (req, res) => {
    try {
        const songId = parseInt(req.params.id);
        const pool = await db.getPool();

        // Get song details
        const [songs] = await pool.execute(
            `SELECT songs.*, users.name as artist_name, users.whatsapp as artist_whatsapp, users.id as artist_id
             FROM songs 
             JOIN users ON songs.user_id = users.id 
             WHERE songs.id = ?`,
            [songId]
        );

        if (!songs.length) {
            return res.render('error', {
                title: 'Song Not Found',
                message: 'The requested song could not be found.'
            });
        }

        const song = songs[0];

        // Increment play count
        await pool.execute('UPDATE songs SET play_count = play_count + 1 WHERE id = ?', [songId]);

        // Check if current user can see full lyrics (if they're the owner or have purchased)
        let canViewFullLyrics = false;
        let hasPurchased = false;
        let transactionId = null;

        if (req.session.user) {
            if (req.session.user.id === song.artist_id) {
                canViewFullLyrics = true;
            } else {
                // Check if user has purchased this song
                const [purchases] = await pool.execute(
                    'SELECT id FROM transactions WHERE song_id = ? AND buyer_id = ? AND status = "completed"',
                    [songId, req.session.user.id]
                );
                if (purchases.length > 0) {
                    canViewFullLyrics = true;
                    hasPurchased = true;
                    transactionId = purchases[0].id;
                }
            }
        }

        // Generate share URL for current user
        let shareUrl = null;
        if (req.session.user && req.session.user.id !== song.artist_id) {
            shareUrl = `/songs/${songId}?ref=${req.session.user.id}`;
        }

        res.render('songs/show', {
            title: song.title,
            song,
            canViewFullLyrics,
            hasPurchased,
            transactionId,
            shareUrl,
            success: req.query.success,
            error: req.query.error
        });
    } catch (error) {
        console.error('Show song error:', error);
        res.render('error', {
            title: 'Error',
            message: 'Failed to load song details'
        });
    }
});

// Edit song page (GET)
router.get('/:id/edit', isAuthenticated, async (req, res) => {
    try {
        const songId = parseInt(req.params.id);
        const pool = await db.getPool();
        
        const [songs] = await pool.execute(`
            SELECT songs.*, users.name as artist_name 
            FROM songs 
            JOIN users ON songs.user_id = users.id 
            WHERE songs.id = ?
        `, [songId]);
        
        if (!songs.length) {
            return res.status(404).render('error', { 
                message: 'Song not found' 
            });
        }
        
        const song = songs[0];
        
        // Check if user owns this song or is admin
        if (song.user_id !== req.session.user.id && !req.session.user.is_admin) {
            return res.status(403).render('error', { 
                message: 'Access denied. You can only edit your own songs.' 
            });
        }
        
        res.render('songs/edit', { 
            song, 
            genreOptions,
            title: `Edit ${song.title}`
        });
    } catch (error) {
        console.error('Song edit page error:', error);
        res.status(500).render('error', { 
            message: 'Error loading song for editing' 
        });
    }
});

// Update song (PUT/POST)
router.post('/:id/edit', isAuthenticated, async (req, res) => {
    try {
        const songId = parseInt(req.params.id);
        const { title, style, genre, lyrics, price, tempo, time_signature } = req.body;
        
        // Debug logging
        console.log('Edit song request body:', req.body);
        console.log('Price value received:', price, 'Type:', typeof price);
        
        const pool = await db.getPool();
        
        // Get current song
        const [songs] = await pool.execute('SELECT * FROM songs WHERE id = ?', [songId]);
        if (!songs.length) {
            return res.status(404).json({ error: 'Song not found' });
        }
        
        const song = songs[0];
        
        // Check ownership
        if (song.user_id !== req.session.user.id && !req.session.user.is_admin) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // Validate price
        const songPrice = parseFloat(price);
        
        if (!price || price === '' || isNaN(songPrice) || songPrice < 0.99 || songPrice > 999.99) {
            return res.status(400).json({ 
                error: 'Price must be between $0.99 and $999.99'
            });
        }
        
        // Update song
        await pool.execute(`
            UPDATE songs 
            SET title = ?, style = ?, genre = ?, lyrics = ?, price = ?, tempo = ?, time_signature = ?, updated_at = NOW()
            WHERE id = ?
        `, [title, style, genre, lyrics, songPrice, tempo || 120, time_signature || '4/4', songId]);
        
        // Always return JSON for AJAX requests
        res.json({ success: true, message: 'Song updated successfully!' });
    } catch (error) {
        console.error('Song update error:', error);
        if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
            res.status(500).json({ error: 'Error updating song' });
        } else {
            res.status(500).render('error', { message: 'Error updating song' });
        }
    }
});

// Create preview for song
router.post('/:id/create-preview', isAuthenticated, async (req, res) => {
    try {
        const songId = parseInt(req.params.id);
        const { startTime, endTime } = req.body;
        
        const pool = await db.getPool();
        
        // Verify song ownership
        const [songs] = await pool.execute(
            'SELECT * FROM songs WHERE id = ? AND user_id = ?',
            [songId, req.session.user.id]
        );

        if (!songs.length) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const start = parseFloat(startTime);
        const end = parseFloat(endTime);

        if (isNaN(start) || isNaN(end) || start >= end || (end - start) > 60) {
            return res.status(400).json({ error: 'Invalid preview duration' });
        }

        // Update preview times in database
        await pool.execute(
            'UPDATE songs SET preview_start_time = ?, preview_end_time = ? WHERE id = ?',
            [start, end, songId]
        );

        res.json({ success: true, message: 'Preview updated successfully' });
    } catch (error) {
        console.error('Create preview error:', error);
        res.status(500).json({ error: 'Failed to create preview' });
    }
});

// Share song (for commission tracking)
router.get('/:id/share', async (req, res) => {
    try {
        const songId = parseInt(req.params.id);
        const sharerId = req.query.ref ? parseInt(req.query.ref) : null;

        if (sharerId) {
            const pool = await db.getPool();
            
            // Record or update the share
            await pool.execute(
                `INSERT INTO song_shares (song_id, sharer_id, share_url, clicks) 
                 VALUES (?, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE clicks = clicks + 1`,
                [songId, sharerId, req.originalUrl]
            );
        }

        // Redirect to the song page
        res.redirect(`/songs/${songId}`);
    } catch (error) {
        console.error('Share tracking error:', error);
        res.redirect(`/songs/${songId}`);
    }
});

// Show recording page
router.get('/record', isAuthenticated, (req, res) => {
    res.render('songs/record', {
        title: 'Record Your Song',
        genreOptions
    });
});

// Handle recorded song upload
router.post('/record/upload', isAuthenticated, async (req, res) => {
    try {
        const { title, style, genre, lyrics, price, tempo = 120, time_signature = '4/4', audioData } = req.body;

        if (!title || !style || !genre || !lyrics || !price || !audioData) {
            return res.status(400).json({
                error: 'All fields are required including recorded audio'
            });
        }

        if (!genreOptions[style] || !genreOptions[style].includes(genre)) {
            return res.status(400).json({
                error: 'Invalid genre selection'
            });
        }

        const songPrice = parseFloat(price);
        if (isNaN(songPrice) || songPrice <= 0) {
            return res.status(400).json({
                error: 'Please enter a valid price'
            });
        }

        // Process base64 audio data
        const base64Data = audioData.replace(/^data:audio\/[a-z]+;base64,/, '');
        const audioBuffer = Buffer.from(base64Data, 'base64');
        
        // Generate unique filename
        const filename = `${uuidv4()}-${Date.now()}.wav`;
        const uploadDir = path.join(__dirname, '../public/uploads');
        const filePath = path.join(uploadDir, filename);
        
        // Ensure upload directory exists
        await fs.mkdir(uploadDir, { recursive: true });
        
        // Save audio file
        await fs.writeFile(filePath, audioBuffer);

        const pool = await db.getPool();
        const userId = req.session.user.id;

        // Insert song into database
        const [result] = await pool.execute(
            `INSERT INTO songs (user_id, title, style, genre, lyrics, price, audio_path, audio_format, tempo, time_signature, file_size, is_recorded) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'wav', ?, ?, ?, TRUE)`,

            [userId, title, style, genre, lyrics, songPrice, filename, tempo, time_signature, audioBuffer.length]
        );

        res.json({ 
            success: true, 
            songId: result.insertId,
            message: 'Song recorded and uploaded successfully!' 
        });
    } catch (error) {
        console.error('Record upload error:', error);
        res.status(500).json({
            error: 'Failed to save recorded song. Please try again.'
        });
    }
});

// Handle upload from recording
router.post('/upload-recording', isAuthenticated, upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'No audio file received'
            });
        }

        const { title, style, genre, lyrics, price, tempo = 120, time_signature = '4/4', preview_start_time = 0, preview_end_time = 45 } = req.body;

        if (!title || !style || !genre || !lyrics || !price) {
            await fs.unlink(req.file.path);
            return res.status(400).json({
                error: 'All fields are required'
            });
        }

        if (!genreOptions[style] || !genreOptions[style].includes(genre)) {
            await fs.unlink(req.file.path);
            return res.status(400).json({
                error: 'Invalid genre selection'
            });
        }

        const songPrice = parseFloat(price);
        if (isNaN(songPrice) || songPrice <= 0) {
            await fs.unlink(req.file.path);
            return res.status(400).json({
                error: 'Please enter a valid price'
            });
        }

        const audioFormat = path.extname(req.file.originalname).slice(1).toLowerCase();
        const fileSize = req.file.size;

        const pool = await db.getPool();
        const userId = req.session.user.id;

        // Insert song into database
        const [result] = await pool.execute(
            `INSERT INTO songs (user_id, title, style, genre, lyrics, price, audio_path, audio_format, tempo, time_signature, file_size, is_recorded, preview_start_time, preview_end_time) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)`,
            [userId, title, style, genre, lyrics, songPrice, req.file.filename, audioFormat, tempo, time_signature, fileSize, parseFloat(preview_start_time), parseFloat(preview_end_time)]
        );

        res.json({ 
            success: true, 
            songId: result.insertId,
            message: 'Song uploaded successfully!' 
        });
    } catch (error) {
        console.error('Upload recording error:', error);
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Error deleting file:', unlinkError);
            }
        }
        res.status(500).json({
            error: 'Failed to upload recording. Please try again.'
        });
    }
});

// Purchase song
router.post('/:id/purchase', isAuthenticated, async (req, res) => {
    try {
        const songId = parseInt(req.params.id);
        const { paymentData } = req.body;
        const buyerId = req.session.user.id; // Get buyer ID from session
        
        const pool = await db.getPool();
        
        // Get song details
        const [songs] = await pool.execute(
            'SELECT * FROM songs WHERE id = ? AND is_sold = FALSE',
            [songId]
        );

        if (!songs.length) {
            return res.status(404).json({ error: 'Song not found or already sold' });
        }

        const song = songs[0];
        
        // Prevent users from buying their own songs
        if (song.user_id === buyerId) {
            return res.status(400).json({ error: 'You cannot purchase your own song' });
        }
        
        // Get commission settings
        const [settings] = await pool.execute('SELECT * FROM settings WHERE id = 1');
        const commissionRate = settings[0]?.seller_commission_rate || 0.6; // Default 60% to seller
        const shareCommissionRate = settings[0]?.share_commission_rate || 0.15; // Default 15% for sharing
        
        const sellerAmount = song.price * commissionRate;
        const adminCommission = song.price * (1 - commissionRate);
        
        // Check if this purchase came from a share
        const referrerId = req.query.ref ? parseInt(req.query.ref) : null;
        let shareCommission = 0;
        let adjustedSellerAmount = sellerAmount;
        
        if (referrerId && referrerId !== song.user_id) {
            shareCommission = song.price * shareCommissionRate;
            adjustedSellerAmount = sellerAmount - shareCommission;
        }

        // Create transaction record
        const [transactionResult] = await pool.execute(
            `INSERT INTO transactions (song_id, buyer_id, seller_id, buyer_email, amount, commission_amount, seller_amount, admin_commission, payment_reference, payment_data) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [songId, buyerId, song.user_id, req.session.user.email, song.price, adminCommission, adjustedSellerAmount, adminCommission, paymentData.tx_ref || paymentData.transaction_id, JSON.stringify(paymentData)]
        );

        const transactionId = transactionResult.insertId;

        // If there's a share commission, record it
        if (shareCommission > 0 && referrerId) {
            await pool.execute(
                `INSERT INTO share_commissions (transaction_id, sharer_id, song_id, commission_amount) 
                 VALUES (?, ?, ?, ?)`,
                [transactionId, referrerId, songId, shareCommission]
            );
            
            // Update sharer's balance
            await pool.execute(
                'UPDATE users SET balance = balance + ? WHERE id = ?',
                [shareCommission, referrerId]
            );
        }

        // Update seller's balance and mark song as sold
        await pool.execute('UPDATE users SET balance = balance + ? WHERE id = ?', [adjustedSellerAmount, song.user_id]);
        await pool.execute('UPDATE songs SET is_sold = TRUE WHERE id = ?', [songId]);
        
        // Mark transaction as completed
        await pool.execute('UPDATE transactions SET status = "completed" WHERE id = ?', [transactionId]);

        res.json({ 
            success: true, 
            transactionId,
            message: 'Purchase completed successfully!',
            downloadUrl: `/songs/${songId}/download?token=${transactionId}`
        });
    } catch (error) {
        console.error('Purchase error:', error);
        res.status(500).json({ error: 'Purchase failed. Please try again.' });
    }
});

// Download purchased song
router.get('/:id/download', isAuthenticated, async (req, res) => {
    try {
        const songId = parseInt(req.params.id);
        const token = req.query.token;
        
        const pool = await db.getPool();
        
        // Verify purchase token and ownership
        const [transactions] = await pool.execute(
            'SELECT * FROM transactions WHERE id = ? AND song_id = ? AND buyer_id = ? AND status = "completed"',
            [token, songId, req.session.user.id]
        );

        if (!transactions.length) {
            return res.status(403).json({ error: 'Invalid download token or unauthorized access' });
        }

        // Get song details
        const [songs] = await pool.execute('SELECT * FROM songs WHERE id = ?', [songId]);
        if (!songs.length) {
            return res.status(404).json({ error: 'Song not found' });
        }

        const song = songs[0];
        const filePath = path.join(__dirname, '../public/uploads', song.audio_path);
        
        // Check if file exists
        try {
            await fs.access(filePath);
        } catch {
            return res.status(404).json({ error: 'Audio file not found' });
        }

        // Set download headers
        res.setHeader('Content-Disposition', `attachment; filename="${song.title}.${song.audio_format}"`);
        res.setHeader('Content-Type', getAudioMimeType(song.audio_format));
        
        // Send file
        res.sendFile(filePath);
        
        // Log download
        await pool.execute(
            'UPDATE transactions SET download_count = download_count + 1 WHERE id = ?',
            [token]
        );
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Stream audio for preview
router.get('/:id/stream', async (req, res) => {
    try {
        const songId = parseInt(req.params.id);
        const pool = await db.getPool();
        
        const [songs] = await pool.execute('SELECT * FROM songs WHERE id = ?', [songId]);
        if (!songs.length) {
            return res.status(404).json({ error: 'Song not found' });
        }

        const song = songs[0];
        const filePath = path.join(__dirname, '../public/uploads', song.audio_path);
        
        try {
            await fs.access(filePath);
        } catch {
            return res.status(404).json({ error: 'Audio file not found' });
        }

        const stat = await fs.stat(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Length', chunksize);
            res.setHeader('Content-Type', getAudioMimeType(song.audio_format));
            
            const stream = require('fs').createReadStream(filePath, { start, end });
            stream.pipe(res);
        } else {
            res.setHeader('Content-Length', fileSize);
            res.setHeader('Content-Type', getAudioMimeType(song.audio_format));
            require('fs').createReadStream(filePath).pipe(res);
        }
    } catch (error) {
        console.error('Stream error:', error);
        res.status(500).json({ error: 'Streaming failed' });
    }
});

// Stream preview audio (for homepage and browse page) - STRICTLY LIMITED TO 40 SECONDS
router.get('/:id/preview', async (req, res) => {
    try {
        const songId = parseInt(req.params.id);
        const pool = await db.getPool();
        
        const [songs] = await pool.execute('SELECT * FROM songs WHERE id = ?', [songId]);
        if (!songs.length) {
            return res.status(404).json({ error: 'Song not found' });
        }

        const song = songs[0];
        
        // Check if user has purchased this song
        let hasPurchased = false;
        if (req.session?.user) {
            const [purchases] = await pool.execute(
                'SELECT id FROM transactions WHERE song_id = ? AND buyer_id = ? AND status = "completed"',
                [songId, req.session.user.id]
            );
            hasPurchased = purchases.length > 0 || song.user_id === req.session.user.id; // Owner can also hear full
        }
        
        // STRICT: If user hasn't purchased, always limit to 40 seconds regardless of preview file
        const PREVIEW_DURATION_SECONDS = 40;
        let filePath;
        
        if (song.preview_path && song.preview_path.startsWith('/uploads/previews/') && hasPurchased) {
            // Only use preview file for purchased users (to avoid quality loss)
            const previewFileName = song.preview_path.replace('/uploads/previews/', '');
            filePath = path.join(__dirname, '../public/uploads/previews', previewFileName);
        } else {
            // Use original file but with strict time/size limits for non-purchased users
            filePath = path.join(__dirname, '../public/uploads', song.audio_path);
        }
        
        try {
            await fs.access(filePath);
        } catch {
            return res.status(404).json({ error: 'Audio file not found' });
        }

        const stat = await fs.stat(filePath);
        let fileSize = stat.size;
        let maxSize = fileSize;
        
        // STRICT: Calculate maximum bytes for 40-second preview (non-purchased users only)
        if (!hasPurchased) {
            // Conservative calculation: 128kbps = 16KB/second, 40 seconds = 640KB max
            // Add small buffer for metadata, but keep it strict
            const bytesPerSecond = 16 * 1024; // 16KB per second
            maxSize = Math.min(fileSize, Math.floor(PREVIEW_DURATION_SECONDS * bytesPerSecond));
            
            // Hard limit: 800KB for 40-second preview (includes small buffer for headers)
            maxSize = Math.min(maxSize, 800 * 1024);
        }

        const range = req.headers.range;

        // Set appropriate headers with strict security for non-purchased users
        res.setHeader('Content-Type', getAudioMimeType(song.audio_format));
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        
        // STRICT: Add security headers for preview mode
        if (!hasPurchased) {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Download-Options', 'noopen');
            res.setHeader('Content-Disposition', 'inline; filename="preview.mp3"');
            res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
        }

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            let end = parts[1] ? parseInt(parts[1], 10) : maxSize - 1;
            
            // Ensure end doesn't exceed our preview limit
            end = Math.min(end, maxSize - 1);
            
            const chunksize = (end - start) + 1;
            
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${maxSize}`);
            res.setHeader('Content-Length', chunksize);
            
            const stream = require('fs').createReadStream(filePath, { start, end });
            stream.pipe(res);
        } else {
            res.setHeader('Content-Length', maxSize);
            if (maxSize < fileSize) {
                // Serve only the preview portion
                const stream = require('fs').createReadStream(filePath, { start: 0, end: maxSize - 1 });
                stream.pipe(res);
            } else {
                // Serve the entire file (for purchased users or preview files)
                require('fs').createReadStream(filePath).pipe(res);
            }
        }
    } catch (error) {
        console.error('Preview stream error:', error);
        res.status(500).json({ error: 'Preview streaming failed' });
    }
});

// Simple preview endpoint that serves just the first part of the audio file when FFmpeg is not available
router.get('/:id/simple-preview', async (req, res) => {
    try {
        const songId = parseInt(req.params.id);
        const pool = await db.getPool();
        
        const [songs] = await pool.execute('SELECT * FROM songs WHERE id = ?', [songId]);
        if (!songs.length) {
            return res.status(404).json({ error: 'Song not found' });
        }

        const song = songs[0];
        const filePath = path.join(__dirname, '../public/uploads', song.audio_path);
        
        try {
            await fs.access(filePath);
        } catch {
            return res.status(404).json({ error: 'Audio file not found' });
        }

        const stat = await fs.stat(filePath);
        const fileSize = stat.size;
        
        // Calculate approximate bytes for 45 seconds (rough estimate)
        // Most audio files are around 128kbps, so 45 seconds ≈ 720KB
        const previewSize = Math.min(fileSize, 720 * 1024); // 720KB or file size, whichever is smaller
        
        res.setHeader('Content-Type', getAudioMimeType(song.audio_format));
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Range', `bytes 0-${previewSize - 1}/${fileSize}`);
        res.setHeader('Content-Length', previewSize);
        res.status(206);
        
        const stream = require('fs').createReadStream(filePath, { start: 0, end: previewSize - 1 });
        stream.pipe(res);
    } catch (error) {
        console.error('Simple preview error:', error);
        res.status(500).json({ error: 'Preview failed' });
    }
});

// Download lyrics as PDF for purchased song
router.get('/:id/lyrics-pdf', isAuthenticated, async (req, res) => {
    try {
        const songId = parseInt(req.params.id);
        const token = req.query.token;

        if (!token) {
            return res.status(401).json({ error: 'Authentication token required' });
        }

        const pool = await db.getPool();
        
        // Verify purchase token and ownership
        const [transactions] = await pool.execute(
            `SELECT t.*, s.title, s.lyrics, s.genre, s.style, u.name as artist_name
             FROM transactions t
             JOIN songs s ON t.song_id = s.id
             JOIN users u ON s.user_id = u.id
             WHERE t.id = ? AND t.song_id = ? AND t.buyer_id = ? AND t.status = 'completed'`,
            [token, songId, req.session.user.id]
        );

        if (!transactions.length) {
            return res.status(403).json({ error: 'Invalid download token or song not purchased by you' });
        }

        const transaction = transactions[0];
        const { title, lyrics, genre, style, artist_name } = transaction;

        // Generate PDF content
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument();
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/[^a-zA-Z0-9]/g, '_')}_lyrics.pdf"`);
        
        // Pipe PDF to response
        doc.pipe(res);
        
        // Add content to PDF
        doc.fontSize(20).text('Song Lyrics', { align: 'center' });
        doc.moveDown();
        
        doc.fontSize(16).text(`Title: ${title}`);
        doc.fontSize(14).text(`Artist: ${artist_name}`);
        doc.text(`Genre: ${genre.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`);
        doc.text(`Style: ${style.charAt(0).toUpperCase() + style.slice(1)}`);
        doc.moveDown();
        
        doc.fontSize(12).text('Lyrics:', { underline: true });
        doc.moveDown();
        doc.fontSize(11).text(lyrics || 'No lyrics available', { align: 'left' });
        
        doc.moveDown(2);
        doc.fontSize(8).text('Downloaded from Nawe Ririmba Space', { align: 'center' });
        doc.text('© NebeluRw - All rights reserved', { align: 'center' });
        
        doc.end();

        // Log lyrics download
        await pool.execute(
            'UPDATE transactions SET lyrics_download_count = lyrics_download_count + 1 WHERE id = ?',
            [token]
        );

    } catch (error) {
        console.error('Lyrics PDF download error:', error);
        res.status(500).json({ error: 'Lyrics download failed' });
    }
});

// Full song streaming endpoint (for purchased users)
router.get('/:id/full-stream', isAuthenticated, async (req, res) => {
    try {
        const songId = parseInt(req.params.id);
        const pool = await db.getPool();
        
        const [songs] = await pool.execute('SELECT * FROM songs WHERE id = ?', [songId]);
        if (!songs.length) {
            return res.status(404).json({ error: 'Song not found' });
        }

        const song = songs[0];
        
        // Check if user has purchased this song
        let hasPurchased = false;
        if (req.session.user) {
            const [purchases] = await pool.execute(
                'SELECT id FROM transactions WHERE song_id = ? AND buyer_id = ? AND status = "completed"',
                [songId, req.session.user.id]
            );
            hasPurchased = purchases.length > 0;
        }
        
        if (!hasPurchased) {
            return res.status(403).json({ error: 'You must purchase this song to access the full version' });
        }
        
        // Stream the full song file
        const filePath = path.join(__dirname, '../public/uploads', song.audio_path);
        
        try {
            await fs.access(filePath);
        } catch {
            return res.status(404).json({ error: 'Audio file not found' });
        }

        const stat = await fs.stat(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        // Set appropriate headers
        res.setHeader('Content-Type', getAudioMimeType(song.audio_format));
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            res.setHeader('Content-Length', chunksize);
            
            const stream = require('fs').createReadStream(filePath, { start, end });
            stream.pipe(res);
        } else {
            res.setHeader('Content-Length', fileSize);
            require('fs').createReadStream(filePath).pipe(res);
        }
    } catch (error) {
        console.error('Full stream error:', error);
        res.status(500).json({ error: 'Full song streaming failed' });
    }
});

// Delete song route (admin only - hard delete)
router.delete('/:id', isAuthenticated, async (req, res) => {
    try {
        const songId = req.params.id;
        const pool = await db.getPool();
        
        // Check if user is admin
        if (!req.session.user.is_admin) {
            return res.status(403).json({ 
                success: false, 
                error: 'Admin access required' 
            });
        }
        
        // Get song details before deletion for file cleanup
        const [songs] = await pool.execute(
            'SELECT audio_path, preview_path, cover_image FROM songs WHERE id = ?',
            [songId]
        );
        
        if (songs.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Song not found' 
            });
        }
        
        const song = songs[0];
        
        // Delete from database first
        await pool.execute('DELETE FROM songs WHERE id = ?', [songId]);
        
        // Clean up files
        try {
            if (song.audio_path) {
                const audioPath = path.join(__dirname, '../public', song.audio_path);
                await fs.unlink(audioPath).catch(() => {}); // Ignore errors if file doesn't exist
            }
            if (song.preview_path) {
                const previewPath = path.join(__dirname, '../public', song.preview_path);
                await fs.unlink(previewPath).catch(() => {});
            }
            if (song.cover_image && song.cover_image !== 'default.svg') {
                const coverPath = path.join(__dirname, '../public/uploads/covers', song.cover_image);
                await fs.unlink(coverPath).catch(() => {});
            }
        } catch (fileError) {
            console.warn('File cleanup warning:', fileError);
            // Don't fail the deletion if file cleanup fails
        }
        
        res.json({ 
            success: true, 
            message: 'Song deleted successfully' 
        });
        
    } catch (error) {
        console.error('Delete song error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to delete song' 
        });
    }
});

// Soft delete/deactivate song route (for users - sets a flag)
router.post('/:id/deactivate', isAuthenticated, async (req, res) => {
    try {
        const songId = req.params.id;
        const pool = await db.getPool();
        
        // Check if user owns the song or is admin
        const [songs] = await pool.execute(
            'SELECT user_id, is_sold FROM songs WHERE id = ?',
            [songId]
        );
        
        if (songs.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Song not found' 
            });
        }
        
        const song = songs[0];
        
        // Check ownership or admin rights
        if (song.user_id !== req.session.user.id && !req.session.user.is_admin) {
            return res.status(403).json({ 
                success: false, 
                error: 'You can only deactivate your own songs' 
            });
        }
        
        // Check if song is already sold
        if (song.is_sold) {
            return res.status(400).json({ 
                success: false, 
                error: 'Cannot deactivate sold songs' 
            });
        }
        
        // For now, we'll use a workaround by setting title to indicate deactivated
        // In a real migration, we'd add is_active column
        await pool.execute(
            'UPDATE songs SET title = CONCAT("[INACTIVE] ", title) WHERE id = ? AND title NOT LIKE "[INACTIVE]%"',
            [songId]
        );
        
        res.json({ 
            success: true, 
            message: 'Song deactivated successfully' 
        });
        
    } catch (error) {
        console.error('Deactivate song error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to deactivate song' 
        });
    }
});

// Reactivate song route (for users and admin)
router.post('/:id/reactivate', isAuthenticated, async (req, res) => {
    try {
        const songId = req.params.id;
        const pool = await db.getPool();
        
        // Check if user owns the song or is admin
        const [songs] = await pool.execute(
            'SELECT user_id, title FROM songs WHERE id = ?',
            [songId]
        );
        
        if (songs.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Song not found' 
            });
        }
        
        const song = songs[0];
        
        // Check ownership or admin rights
        if (song.user_id !== req.session.user.id && !req.session.user.is_admin) {
            return res.status(403).json({ 
                success: false, 
                error: 'You can only reactivate your own songs' 
            });
        }
        
        // Remove [INACTIVE] prefix if it exists
        if (song.title.startsWith('[INACTIVE] ')) {
            const newTitle = song.title.replace('[INACTIVE] ', '');
            await pool.execute(
                'UPDATE songs SET title = ? WHERE id = ?',
                [newTitle, songId]
            );
        }
        
        res.json({ 
            success: true, 
            message: 'Song reactivated successfully' 
        });
        
    } catch (error) {
        console.error('Reactivate song error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to reactivate song' 
        });
    }
});

module.exports = router;
