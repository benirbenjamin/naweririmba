require('dotenv').config();

// Initialize database on startup
const initializeDatabase = require('./models/init-db');

const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const expressLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

// Initialize cover generator to ensure directories exist
require('./utils/coverGenerator');

// Initialize currency service
const currencyService = require('./utils/currencyService');

// Initialize express app
const app = express();

// Trust proxy for production deployments behind reverse proxies
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1); // Trust first proxy
}

// Production security middleware
if (process.env.NODE_ENV === 'production') {
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                "img-src": ["'self'", "https:", "data:"],
                "script-src": ["'self'", "'unsafe-inline'", "https:"],
                "media-src": ["'self'", "blob:", "data:"],
                "connect-src": ["'self'", "blob:", "data:"]
            }
        }
    }));
    app.use(compression());
}

// Logging middleware
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Regular middleware setup
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session store configuration
const sessionStore = new MySQLStore({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nawe_ririmba',
    createDatabaseTable: true,
    schema: {
        tableName: 'sessions',
        columnNames: {
            session_id: 'session_id',
            expires: 'expires',
            data: 'data'
        }
    }
});

// Handle session store errors
sessionStore.onReady().then(() => {
    console.log('MySQLStore ready');
}).catch(error => {
    console.error('MySQLStore error:', error);
});

// Session middleware must be set up before any routes
app.use(session({
    key: 'session_cookie_name',
    secret: process.env.SESSION_SECRET || 'default_secret_key_change_in_production',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        // Only use secure cookies if HTTPS is explicitly enabled
        secure: process.env.USE_HTTPS === 'true',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'lax'
    }
}));

// Initialize res.locals with default values for all views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.error = null;
    res.locals.success = null;
    res.locals.currentPath = req.originalUrl; // Add current path for redirect functionality
    
    // Add currency information to all views with fallback
    try {
        const userCurrency = currencyService.detectUserCurrency(req);
        const rates = currencyService.getCurrentRates();
        res.locals.currency = {
            current: userCurrency || 'USD',
            rates: rates || { USD_to_RWF: 1450, RWF_to_USD: 1/1450 },
            convert: currencyService.formatCurrency.bind(currencyService),
            getPaymentOptions: currencyService.getPaymentAmounts.bind(currencyService)
        };
    } catch (error) {
        console.warn('Currency service error, using fallback:', error);
        res.locals.currency = {
            current: 'USD',
            rates: { USD_to_RWF: 1450, RWF_to_USD: 1/1450 },
            convert: (amount, from, to) => amount,
            getPaymentOptions: (amount) => ({ USD: amount, RWF: amount * 1450 })
        };
    }
    
    next();
});

app.use(expressLayouts);

// Check remember token middleware
const { checkRememberToken } = require('./controllers/authController');
app.use(checkRememberToken);

// Make user available to all views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    if (req.path === '/' && req.session.user) {
        console.log('Home page - User in session:', req.session.user.email);
    }
    next();
});

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');

// Import routes
const authRoutes = require('./routes/auth');
const songRoutes = require('./routes/songs');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/users');
const paymentRoutes = require('./routes/payment');
const apiRoutes = require('./routes/api');

// Use routes
app.use('/auth', authRoutes);
app.use('/songs', songRoutes);
app.use('/admin', adminRoutes);
app.use('/users', userRoutes);
app.use('/payment', paymentRoutes);
app.use('/api', apiRoutes);

// Root-level auth route redirects for backward compatibility
app.get('/login', (req, res) => {
    res.redirect('/auth/login');
});

app.get('/register', (req, res) => {
    res.redirect('/auth/register');
});

app.get('/logout', (req, res) => {
    res.redirect('/auth/logout');
});

app.post('/logout', (req, res) => {
    res.redirect('/auth/logout');
});

app.post('/login', (req, res) => {
    res.redirect(307, '/auth/login');
});

app.post('/register', (req, res) => {
    res.redirect(307, '/auth/register');
});

// Dashboard route (redirect to users dashboard)
app.get('/dashboard', (req, res) => {
    res.redirect('/users/dashboard');
});

// Home route
app.get('/', async (req, res) => {
    try {
        const pool = await require('./models/db').getPool();
        
        // Get featured songs (newest unsold songs)
        const [featuredSongs] = await pool.execute(`
            SELECT songs.*, users.name as artist_name, users.whatsapp as artist_whatsapp 
            FROM songs 
            JOIN users ON songs.user_id = users.id 
            WHERE songs.is_sold = FALSE AND songs.title NOT LIKE '[INACTIVE]%'
            ORDER BY songs.created_at DESC 
            LIMIT 12
        `);
        
        // Get songs by genre for variety
        const [gospelSongs] = await pool.execute(`
            SELECT songs.*, users.name as artist_name 
            FROM songs 
            JOIN users ON songs.user_id = users.id 
            WHERE songs.is_sold = FALSE AND songs.style = 'gospel' AND songs.title NOT LIKE '[INACTIVE]%'
            ORDER BY songs.play_count DESC
            LIMIT 6
        `);
        
        const [secularSongs] = await pool.execute(`
            SELECT songs.*, users.name as artist_name 
            FROM songs 
            JOIN users ON songs.user_id = users.id 
            WHERE songs.is_sold = FALSE AND songs.style = 'secular' AND songs.title NOT LIKE '[INACTIVE]%'
            ORDER BY songs.play_count DESC
            LIMIT 6
        `);
        
        // Get platform statistics
        const [stats] = await pool.execute(`
            SELECT 
                (SELECT COUNT(*) FROM songs WHERE is_sold = FALSE AND title NOT LIKE '[INACTIVE]%') as available_songs,
                (SELECT COUNT(*) FROM songs WHERE is_sold = TRUE) as sold_songs,
                (SELECT COUNT(*) FROM users WHERE is_admin = FALSE) as total_artists,
                (SELECT COUNT(*) FROM transactions WHERE status = 'completed') as total_sales
        `);
        
        res.render('home', { 
            featuredSongs: featuredSongs || [],
            gospelSongs: gospelSongs || [],
            secularSongs: secularSongs || [],
            stats: stats[0] || {},
            title: 'Naweririmba - Where Music Finds Its Home'
        });
    } catch (error) {
        console.error('Home page error:', error);
        res.render('home', { 
            featuredSongs: [],
            gospelSongs: [],
            secularSongs: [],
            stats: {},
            title: 'Naweririmba - Where Music Finds Its Home',
            error: 'Failed to load songs. Please try again later.'
        });
    }
});

// Home route (same as root, for hosting compatibility)
app.get('/home', async (req, res) => {
    try {
        const pool = await require('./models/db').getPool();
        
        // Get featured songs (newest unsold songs)
        const [featuredSongs] = await pool.execute(`
            SELECT songs.*, users.name as artist_name, users.whatsapp as artist_whatsapp 
            FROM songs 
            JOIN users ON songs.user_id = users.id 
            WHERE songs.is_sold = FALSE AND songs.title NOT LIKE '[INACTIVE]%'
            ORDER BY songs.created_at DESC 
            LIMIT 12
        `);
        
        // Get songs by genre for variety
        const [gospelSongs] = await pool.execute(`
            SELECT songs.*, users.name as artist_name 
            FROM songs 
            JOIN users ON songs.user_id = users.id 
            WHERE songs.is_sold = FALSE AND songs.style = 'gospel' AND songs.title NOT LIKE '[INACTIVE]%'
            ORDER BY songs.play_count DESC
            LIMIT 6
        `);
        
        const [secularSongs] = await pool.execute(`
            SELECT songs.*, users.name as artist_name 
            FROM songs 
            JOIN users ON songs.user_id = users.id 
            WHERE songs.is_sold = FALSE AND songs.style = 'secular' AND songs.title NOT LIKE '[INACTIVE]%'
            ORDER BY songs.play_count DESC
            LIMIT 6
        `);
        
        // Get platform statistics
        const [stats] = await pool.execute(`
            SELECT 
                (SELECT COUNT(*) FROM songs WHERE is_sold = FALSE AND title NOT LIKE '[INACTIVE]%') as available_songs,
                (SELECT COUNT(*) FROM songs WHERE is_sold = TRUE) as sold_songs,
                (SELECT COUNT(*) FROM users WHERE is_admin = FALSE) as total_artists,
                (SELECT COUNT(*) FROM transactions WHERE status = 'completed') as total_sales
        `);
        
        res.render('home', { 
            featuredSongs: featuredSongs || [],
            gospelSongs: gospelSongs || [],
            secularSongs: secularSongs || [],
            stats: stats[0] || {},
            title: 'Naweririmba - Where Music Finds Its Home'
        });
    } catch (error) {
        console.error('Home page error:', error);
        res.render('home', { 
            featuredSongs: [],
            gospelSongs: [],
            secularSongs: [],
            stats: {},
            title: 'Naweririmba - Where Music Finds Its Home',
            error: 'Failed to load songs. Please try again later.'
        });
    }
});

// Redirect index.php to /home (for hosting compatibility)
app.get('/index.php', (req, res) => {
    res.redirect(301, '/home');
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API info endpoint
app.get('/api/info', (req, res) => {
    res.json({
        name: 'Nawe Ririmba Space API',
        version: '1.0.0',
        description: 'Music marketplace where unique songs find their perfect owners',
        features: [
            'Browser-based audio recording',
            'Automatic preview generation',
            'Secure payment processing',
            'Exclusive song ownership',
            'Mobile-responsive design'
        ],
        endpoints: {
            auth: ['/login', '/register', '/logout'],
            songs: ['/songs', '/songs/upload', '/songs/:id', '/songs/:id/purchase'],
            users: ['/users/profile'],
            admin: ['/admin/dashboard']
        }
    });
});

// Currency detection and conversion endpoint
app.get('/api/detect-currency', (req, res) => {
    const suggestedCurrency = currencyService.detectUserCurrency(req);
    const rates = currencyService.getCurrentRates();
    
    res.json({
        suggested_currency: suggestedCurrency,
        current_currency: suggestedCurrency,
        exchange_rates: {
            USD_to_RWF: rates.USD_to_RWF,
            RWF_to_USD: rates.RWF_to_USD
        },
        last_update: rates.lastUpdate,
        is_stale: rates.isStale
    });
});

// Currency conversion endpoint
app.get('/api/convert/:amount/:from/:to', (req, res) => {
    try {
        const { amount, from, to } = req.params;
        const numAmount = parseFloat(amount);
        
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        if (!['USD', 'RWF'].includes(from.toUpperCase()) || !['USD', 'RWF'].includes(to.toUpperCase())) {
            return res.status(400).json({ error: 'Unsupported currency. Only USD and RWF are supported.' });
        }

        let convertedAmount;
        if (from.toUpperCase() === 'USD' && to.toUpperCase() === 'RWF') {
            convertedAmount = currencyService.convertUSDToRWF(numAmount);
        } else if (from.toUpperCase() === 'RWF' && to.toUpperCase() === 'USD') {
            convertedAmount = currencyService.convertRWFToUSD(numAmount);
        } else {
            convertedAmount = numAmount; // Same currency
        }

        const rates = currencyService.getCurrentRates();
        
        res.json({
            original_amount: numAmount,
            original_currency: from.toUpperCase(),
            converted_amount: convertedAmount,
            converted_currency: to.toUpperCase(),
            exchange_rate: from.toUpperCase() === 'USD' ? rates.USD_to_RWF : rates.RWF_to_USD,
            formatted_display: currencyService.formatCurrency(
                from.toUpperCase() === 'USD' ? numAmount : currencyService.convertRWFToUSD(numAmount), 
                to.toUpperCase()
            )
        });
    } catch (error) {
        console.error('Currency conversion error:', error);
        res.status(500).json({ error: 'Currency conversion failed' });
    }
});

// Get payment options for a specific amount
app.get('/api/payment-options/:amount', (req, res) => {
    try {
        const amount = parseFloat(req.params.amount);
        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        const paymentOptions = currencyService.getPaymentAmounts(amount);
        const rates = currencyService.getCurrentRates();
        
        res.json({
            base_amount_usd: amount,
            payment_options: paymentOptions,
            exchange_rates: {
                USD_to_RWF: rates.USD_to_RWF,
                RWF_to_USD: rates.RWF_to_USD
            },
            last_update: rates.lastUpdate
        });
    } catch (error) {
        console.error('Payment options error:', error);
        res.status(500).json({ error: 'Failed to get payment options' });
    }
});

// Debug endpoint to check environment variables
app.get('/api/debug-env', (req, res) => {
    res.json({
        NODE_ENV: process.env.NODE_ENV,
        FLW_PUBLIC_KEY: process.env.FLW_PUBLIC_KEY ? 'Set (length: ' + process.env.FLW_PUBLIC_KEY.length + ')' : 'Not set',
        FLW_SECRET_KEY: process.env.FLW_SECRET_KEY ? 'Set (length: ' + process.env.FLW_SECRET_KEY.length + ')' : 'Not set',
        DB_NAME: process.env.DB_NAME
    });
});

// Terms and Conditions page
app.get('/terms', (req, res) => {
    res.render('terms', { title: 'Terms and Conditions' });
});

// Privacy Policy page
app.get('/privacy', (req, res) => {
    res.render('privacy', { title: 'Privacy Policy' });
});

// About Us page
app.get('/about', (req, res) => {
    res.render('about', { title: 'About Us' });
});

// Contact page
app.get('/contact', (req, res) => {
    res.render('contact', { title: 'Contact Us' });
});

// Logout route at root level for backward compatibility
app.get('/logout', (req, res) => {
    res.redirect('/auth/logout');
});

app.post('/logout', (req, res) => {
    res.redirect(307, '/auth/logout'); // 307 preserves POST method
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { 
        message: process.env.NODE_ENV === 'production' 
            ? 'Something went wrong!' 
            : err.message
    });
});

// Start server with database initialization
const PORT = process.env.PORT || 3001;

async function startServer() {
    try {
        console.log('Initializing database...');
        await initializeDatabase();
        console.log('Database initialization completed.');
        
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
            console.log(`Visit http://localhost:${PORT} to access the application`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
