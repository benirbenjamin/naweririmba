const db = require('../models/db');

// Middleware to check if a song is available for purchase
const checkSongAvailability = async (req, res, next) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        // Get song details and lock the row
        const [songs] = await connection.execute(
            'SELECT * FROM songs WHERE id = ? AND is_sold = FALSE FOR UPDATE',
            [req.params.songId]
        );

        if (songs.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Song not found or already sold' });
        }

        // Attach song and connection to request object
        req.song = songs[0];
        req.dbConnection = connection;
        
        next();
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Song availability check error:', error);
        res.status(500).json({ message: 'Error checking song availability' });
    }
};

module.exports = {
    checkSongAvailability
};
