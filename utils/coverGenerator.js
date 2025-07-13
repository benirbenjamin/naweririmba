const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class CoverGenerator {
    constructor() {
        this.ensureCoversDirectory();
    }

    ensureCoversDirectory() {
        const coversDir = path.join(__dirname, '../public/uploads/covers');
        if (!fsSync.existsSync(coversDir)) {
            fsSync.mkdirSync(coversDir, { recursive: true });
        }
    }

    generateCoverSVG(songTitle, genre, style) {
        const isGospel = genre.toLowerCase().includes('gospel') || style.toLowerCase().includes('gospel');
        
        // Clean title for display (take first 3-4 words max)
        const displayTitle = this.truncateTitle(songTitle);
        
        if (isGospel) {
            return this.generateGospelCover(displayTitle, songTitle);
        } else {
            return this.generateSecularCover(displayTitle, genre, style);
        }
    }

    truncateTitle(title) {
        const words = title.split(' ');
        if (words.length <= 3) return title;
        return words.slice(0, 3).join(' ') + '...';
    }

    generateGospelCover(displayTitle, fullTitle) {
        const gospelGradients = [
            { start: '#667eea', end: '#764ba2', name: 'Divine Blue' },
            { start: '#f093fb', end: '#f5576c', name: 'Heavenly Pink' },
            { start: '#4facfe', end: '#00f2fe', name: 'Sacred Cyan' },
            { start: '#43e97b', end: '#38f9d7', name: 'Blessed Green' },
            { start: '#fa709a', end: '#fee140', name: 'Golden Grace' },
            { start: '#a8edea', end: '#fed6e3', name: 'Peaceful Pastel' },
            { start: '#d299c2', end: '#fef9d7', name: 'Angelic Light' }
        ];
        
        const gradient = gospelGradients[Math.floor(Math.random() * gospelGradients.length)];
        
        return `
        <svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:${gradient.start};stop-opacity:1" />
                    <stop offset="100%" style="stop-color:${gradient.end};stop-opacity:1" />
                </linearGradient>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                    <feMerge> 
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
                <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="3" dy="3" stdDeviation="4" flood-color="rgba(0,0,0,0.4)"/>
                </filter>
                <filter id="textShadow">
                    <feDropShadow dx="2" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.5)"/>
                </filter>
                <radialGradient id="lightBurst" cx="50%" cy="30%">
                    <stop offset="0%" style="stop-color:rgba(255,255,255,0.3);stop-opacity:1" />
                    <stop offset="100%" style="stop-color:rgba(255,255,255,0);stop-opacity:0" />
                </radialGradient>
            </defs>
            
            <!-- Background -->
            <rect width="400" height="400" fill="url(#bg)"/>
            
            <!-- Light burst -->
            <ellipse cx="200" cy="120" rx="150" ry="80" fill="url(#lightBurst)"/>
            
            <!-- Decorative elements -->
            <circle cx="350" cy="50" r="25" fill="rgba(255,255,255,0.15)" opacity="0.8"/>
            <circle cx="50" cy="350" r="35" fill="rgba(255,255,255,0.1)" opacity="0.6"/>
            <circle cx="320" cy="320" r="20" fill="rgba(255,255,255,0.12)" opacity="0.7"/>
            <circle cx="80" cy="80" r="18" fill="rgba(255,255,255,0.18)" opacity="0.5"/>
            
            <!-- Dove silhouette -->
            <g transform="translate(320, 80)" opacity="0.4">
                <path d="M0,0 Q-8,-5 -15,-3 Q-12,0 -8,2 Q-5,5 0,3 Q8,5 12,2 Q15,0 12,-3 Q5,-5 0,0" fill="white"/>
                <circle cx="-5" cy="-1" r="1" fill="white"/>
            </g>
            
            <!-- Cross with enhanced styling -->
            <g transform="translate(200, 110)">
                <rect x="-4" y="-25" width="8" height="50" fill="white" filter="url(#glow)" opacity="0.9"/>
                <rect x="-20" y="-4" width="40" height="8" fill="white" filter="url(#glow)" opacity="0.9"/>
                <!-- Inner light on cross -->
                <rect x="-2" y="-23" width="4" height="46" fill="rgba(255,255,255,0.7)"/>
                <rect x="-18" y="-2" width="36" height="4" fill="rgba(255,255,255,0.7)"/>
            </g>
            
            <!-- Musical notes with gospel styling -->
            <g transform="translate(120, 200)" opacity="0.7">
                <circle cx="0" cy="0" r="10" fill="white" filter="url(#glow)"/>
                <rect x="8" y="-30" width="3" height="30" fill="white" filter="url(#glow)"/>
                <path d="M11,-30 Q20,-25 20,-18 Q20,-12 11,-18" fill="white" filter="url(#glow)"/>
            </g>
            
            <g transform="translate(280, 180)" opacity="0.6">
                <circle cx="0" cy="0" r="8" fill="white" filter="url(#glow)"/>
                <rect x="6" y="-24" width="2" height="24" fill="white" filter="url(#glow)"/>
            </g>
            
            <!-- Star accents -->
            <g transform="translate(150, 140)" opacity="0.5">
                <path d="M0,-8 L2,-2 L8,-2 L3,2 L5,8 L0,4 L-5,8 L-3,2 L-8,-2 L-2,-2 Z" fill="white" filter="url(#glow)"/>
            </g>
            
            <g transform="translate(250, 150)" opacity="0.4">
                <path d="M0,-6 L1.5,-1.5 L6,-1.5 L2.5,1.5 L4,6 L0,3 L-4,6 L-2.5,1.5 L-6,-1.5 L-1.5,-1.5 Z" fill="white" filter="url(#glow)"/>
            </g>
            
            <!-- Main GOSPEL text with enhanced styling -->
            <text x="200" y="260" text-anchor="middle" fill="white" font-family="Arial Black, Impact, sans-serif" 
                  font-size="32" font-weight="900" filter="url(#textShadow)" letter-spacing="2px">GOSPEL</text>
            
            <!-- Song title with elegant styling -->
            <text x="200" y="295" text-anchor="middle" fill="rgba(255,255,255,0.95)" 
                  font-family="Georgia, serif" font-size="18" font-weight="bold" font-style="italic">${displayTitle}</text>
            
            <!-- Decorative lines -->
            <line x1="80" y1="320" x2="320" y2="320" stroke="rgba(255,255,255,0.6)" stroke-width="2" opacity="0.8"/>
            <line x1="90" y1="325" x2="310" y2="325" stroke="rgba(255,255,255,0.3)" stroke-width="1" opacity="0.6"/>
            
            <!-- Subtitle with blessing -->
            <text x="200" y="345" text-anchor="middle" fill="rgba(255,255,255,0.8)" 
                  font-family="Georgia, serif" font-size="14" font-style="italic">✨ Blessed Music ✨</text>
        </svg>`;
    }

    generateSecularCover(displayTitle, genre, style) {
        const themes = {
            'hip hop': { 
                start: '#ff6b6b', end: '#ee5a24',
                icon: 'mic', subtitle: 'Hip Hop Vibes',
                accent: '#fff'
            },
            'rnb': { 
                start: '#a8edea', end: '#fed6e3',
                icon: 'heart', subtitle: 'R&B Soul',
                accent: '#333'
            },
            'pop': { 
                start: '#ffecd2', end: '#fcb69f',
                icon: 'star', subtitle: 'Pop Music',
                accent: '#333'
            },
            'rock': { 
                start: '#434343', end: '#000000',
                icon: 'lightning', subtitle: 'Rock Sound',
                accent: '#fff'
            },
            'electronic': { 
                start: '#00c9ff', end: '#92fe9d',
                icon: 'wave', subtitle: 'Electronic',
                accent: '#fff'
            },
            'jazz': { 
                start: '#d3a256', end: '#8b4513',
                icon: 'music', subtitle: 'Jazz Classic',
                accent: '#fff'
            },
            'blues': { 
                start: '#4a69bd', end: '#1e3799',
                icon: 'music', subtitle: 'Blues Soul',
                accent: '#fff'
            },
            'country': { 
                start: '#e1b12c', end: '#b7950b',
                icon: 'music', subtitle: 'Country',
                accent: '#fff'
            },
            'default': { 
                start: '#667eea', end: '#764ba2',
                icon: 'music', subtitle: 'Music',
                accent: '#fff'
            }
        };

        const themeKey = Object.keys(themes).find(key => 
            genre.toLowerCase().includes(key) || style.toLowerCase().includes(key)
        ) || 'default';
        
        const theme = themes[themeKey];

        // Icon SVG paths
        const icons = {
            mic: 'M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z',
            heart: 'M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z',
            star: 'M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.46,13.97L5.82,21L12,17.27Z',
            lightning: 'M11,21H5L13,3H7L9,1H15L7,19H13L11,21Z',
            wave: 'M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M14.71,14L15.5,10H11.5L12.29,6L9.21,10L8.5,14H12.5L11.71,18L14.79,14',
            music: 'M12,3V13.55C11.41,13.21 10.73,13 10,13A3,3 0 0,0 7,16A3,3 0 0,0 10,19A3,3 0 0,0 13,16V7H17V5H12Z'
        };

        return `
        <svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:${theme.start};stop-opacity:1" />
                    <stop offset="100%" style="stop-color:${theme.end};stop-opacity:1" />
                </linearGradient>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                    <feMerge> 
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
                <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="3" dy="3" stdDeviation="4" flood-color="rgba(0,0,0,0.4)"/>
                </filter>
                <filter id="textShadow">
                    <feDropShadow dx="2" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.6)"/>
                </filter>
                <radialGradient id="spotlight" cx="50%" cy="30%">
                    <stop offset="0%" style="stop-color:rgba(255,255,255,0.2);stop-opacity:1" />
                    <stop offset="100%" style="stop-color:rgba(255,255,255,0);stop-opacity:0" />
                </radialGradient>
            </defs>
            
            <!-- Background -->
            <rect width="400" height="400" fill="url(#bg)"/>
            
            <!-- Spotlight effect -->
            <ellipse cx="200" cy="120" rx="180" ry="100" fill="url(#spotlight)"/>
            
            <!-- Decorative circles with depth -->
            <circle cx="80" cy="80" r="30" fill="rgba(255,255,255,0.15)" opacity="0.8"/>
            <circle cx="320" cy="320" r="40" fill="rgba(255,255,255,0.1)" opacity="0.6"/>
            <circle cx="350" cy="100" r="25" fill="rgba(255,255,255,0.18)" opacity="0.7"/>
            <circle cx="50" cy="300" r="35" fill="rgba(255,255,255,0.12)" opacity="0.5"/>
            
            <!-- Enhanced waveform visualization -->
            <g transform="translate(0, 200)" opacity="0.4">
                <rect x="50" y="-15" width="5" height="30" fill="${theme.accent}" rx="2"/>
                <rect x="60" y="-22" width="5" height="44" fill="${theme.accent}" rx="2"/>
                <rect x="70" y="-10" width="5" height="20" fill="${theme.accent}" rx="2"/>
                <rect x="80" y="-28" width="5" height="56" fill="${theme.accent}" rx="2"/>
                <rect x="90" y="-18" width="5" height="36" fill="${theme.accent}" rx="2"/>
                <rect x="100" y="-25" width="5" height="50" fill="${theme.accent}" rx="2"/>
                <rect x="110" y="-8" width="5" height="16" fill="${theme.accent}" rx="2"/>
                <rect x="120" y="-20" width="5" height="40" fill="${theme.accent}" rx="2"/>
                
                <rect x="280" y="-18" width="5" height="36" fill="${theme.accent}" rx="2"/>
                <rect x="290" y="-25" width="5" height="50" fill="${theme.accent}" rx="2"/>
                <rect x="300" y="-12" width="5" height="24" fill="${theme.accent}" rx="2"/>
                <rect x="310" y="-22" width="5" height="44" fill="${theme.accent}" rx="2"/>
                <rect x="320" y="-15" width="5" height="30" fill="${theme.accent}" rx="2"/>
                <rect x="330" y="-30" width="5" height="60" fill="${theme.accent}" rx="2"/>
                <rect x="340" y="-20" width="5" height="40" fill="${theme.accent}" rx="2"/>
                <rect x="350" y="-12" width="5" height="24" fill="${theme.accent}" rx="2"/>
            </g>
            
            <!-- Central icon based on genre -->
            <g transform="translate(200, 130) scale(1.5)" fill="${theme.accent}" opacity="0.8" filter="url(#glow)">
                <path d="${icons[theme.icon] || icons.music}"/>
            </g>
            
            <!-- Musical notes scattered -->
            <g transform="translate(150, 120)" opacity="0.6">
                <circle cx="0" cy="0" r="10" fill="${theme.accent}" filter="url(#glow)"/>
                <rect x="8" y="-30" width="3" height="30" fill="${theme.accent}" filter="url(#glow)"/>
                <path d="M11,-30 Q18,-25 18,-18 Q18,-12 11,-18" fill="${theme.accent}" filter="url(#glow)"/>
            </g>
            
            <g transform="translate(250, 140)" opacity="0.5">
                <circle cx="0" cy="0" r="8" fill="${theme.accent}" filter="url(#glow)"/>
                <rect x="6" y="-24" width="2" height="24" fill="${theme.accent}" filter="url(#glow)"/>
            </g>
            
            <!-- Genre/Style text with dynamic styling -->
            <text x="200" y="260" text-anchor="middle" fill="${theme.accent}" font-family="Arial Black, Impact, sans-serif" 
                  font-size="28" font-weight="900" filter="url(#textShadow)" letter-spacing="1px">${style.toUpperCase()}</text>
            
            <!-- Song title with elegant styling -->
            <text x="200" y="295" text-anchor="middle" fill="${theme.accent === '#fff' ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.85)'}" 
                  font-family="Arial, sans-serif" font-size="18" font-weight="bold">${displayTitle}</text>
            
            <!-- Decorative lines with style -->
            <line x1="80" y1="320" x2="320" y2="320" stroke="${theme.accent}" stroke-width="2" opacity="0.6"/>
            <line x1="90" y1="325" x2="310" y2="325" stroke="${theme.accent}" stroke-width="1" opacity="0.4"/>
            
            <!-- Dynamic subtitle -->
            <text x="200" y="345" text-anchor="middle" fill="${theme.accent === '#fff' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)'}" 
                  font-family="Arial, sans-serif" font-size="14" font-weight="500">${theme.subtitle}</text>
                  
            <!-- Corner accent elements -->
            <g transform="translate(30, 30)" opacity="0.3">
                <circle cx="0" cy="0" r="3" fill="${theme.accent}"/>
                <circle cx="15" cy="0" r="2" fill="${theme.accent}"/>
                <circle cx="0" cy="15" r="2" fill="${theme.accent}"/>
            </g>
            
            <g transform="translate(370, 370)" opacity="0.3">
                <circle cx="0" cy="0" r="3" fill="${theme.accent}"/>
                <circle cx="-15" cy="0" r="2" fill="${theme.accent}"/>
                <circle cx="0" cy="-15" r="2" fill="${theme.accent}"/>
            </g>
        </svg>`;
    }

    async generateCover(songTitle, genre, style) {
        const timestamp = Date.now();
        const filename = `cover-${timestamp}.svg`;
        const coverPath = path.join(__dirname, '../public/uploads/covers', filename);
        
        try {
            const svgContent = this.generateCoverSVG(songTitle, genre, style);
            await fs.writeFile(coverPath, svgContent);
            return filename;
        } catch (error) {
            console.error('Error generating cover:', error);
            return null;
        }
    }

    async generateCoverForSong(songId, songTitle, genre, style) {
        const filename = `${songId}.svg`;
        const coverPath = path.join(__dirname, '../public/uploads/covers', filename);
        
        // Check if cover already exists
        if (fsSync.existsSync(coverPath)) {
            return `/uploads/covers/${filename}`;
        }

        try {
            const svgContent = this.generateCoverSVG(songTitle, genre, style);
            await fs.writeFile(coverPath, svgContent);
            return `/uploads/covers/${filename}`;
        } catch (error) {
            console.error('Error generating cover:', error);
            return null;
        }
    }

    getCoverUrl(songId, songTitle, genre, style) {
        const coverPath = path.join(__dirname, '../public/uploads/covers', `${songId}.svg`);
        
        if (fsSync.existsSync(coverPath)) {
            return `/uploads/covers/${songId}.svg`;
        }
        
        // Generate cover asynchronously and return a placeholder for now
        this.generateCoverForSong(songId, songTitle, genre, style);
        
        // Return a data URL for immediate display
        const svgContent = this.generateCoverSVG(songTitle, genre, style);
        const base64 = Buffer.from(svgContent).toString('base64');
        return `data:image/svg+xml;base64,${base64}`;
    }
}

module.exports = new CoverGenerator();
