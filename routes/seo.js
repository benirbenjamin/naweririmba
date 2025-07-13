const express = require('express');
const router = express.Router();
const db = require('../models/db');

// Generate sitemap.xml
router.get('/sitemap.xml', async (req, res) => {
    try {
        const pool = await db.getPool();
        
        // Get all public songs
        const [songs] = await pool.execute(`
            SELECT id, title, updated_at 
            FROM songs 
            WHERE status = 'active' 
            ORDER BY updated_at DESC
        `);

        // Get static pages
        const staticPages = [
            { url: '', priority: '1.0', changefreq: 'daily' },
            { url: '/songs', priority: '0.9', changefreq: 'daily' },
            { url: '/register', priority: '0.8', changefreq: 'monthly' },
            { url: '/login', priority: '0.7', changefreq: 'monthly' },
            { url: '/about', priority: '0.6', changefreq: 'monthly' },
            { url: '/contact', priority: '0.6', changefreq: 'monthly' },
            { url: '/terms', priority: '0.4', changefreq: 'yearly' },
            { url: '/privacy', priority: '0.4', changefreq: 'yearly' }
        ];

        let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`;

        // Add static pages
        staticPages.forEach(page => {
            sitemap += `
    <url>
        <loc>https://naweririmba.space${page.url}</loc>
        <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
        <changefreq>${page.changefreq}</changefreq>
        <priority>${page.priority}</priority>
    </url>`;
        });

        // Add song pages
        songs.forEach(song => {
            const lastmod = new Date(song.updated_at).toISOString().split('T')[0];
            sitemap += `
    <url>
        <loc>https://naweririmba.space/songs/${song.id}</loc>
        <lastmod>${lastmod}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
    </url>`;
        });

        sitemap += `
</urlset>`;

        res.set('Content-Type', 'application/xml');
        res.send(sitemap);
    } catch (error) {
        console.error('Sitemap generation error:', error);
        res.status(500).send('Error generating sitemap');
    }
});

// Generate robots.txt
router.get('/robots.txt', (req, res) => {
    const robots = `User-agent: *
Allow: /

# Prioritize important pages
Allow: /songs
Allow: /register
Allow: /login
Allow: /about
Allow: /contact

# Block admin and user-specific pages
Disallow: /admin/
Disallow: /users/dashboard
Disallow: /users/profile
Disallow: /api/admin/

# Block unnecessary files
Disallow: /src/
Disallow: /*.json$
Disallow: /*.log$
Disallow: /node_modules/

# Allow images and CSS
Allow: /uploads/images/
Allow: /css/
Allow: /js/

# Sitemap location
Sitemap: https://naweririmba.space/sitemap.xml

# Crawl delay for respectful crawling
Crawl-delay: 1`;

    res.set('Content-Type', 'text/plain');
    res.send(robots);
});

module.exports = router;
