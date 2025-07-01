const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../models/db');

// Show login form
exports.showLogin = (req, res) => {
    res.render('auth/login', { 
        title: 'Login',
        error: null 
    });
};

// Show registration form
exports.showRegister = (req, res) => {
    res.render('auth/register', { 
        title: 'Register',
        error: null
    });
};

// Handle login
exports.login = async (req, res) => {
    try {
        console.log('=== LOGIN ATTEMPT ===');
        console.log('Request body:', req.body);
        console.log('Session before login:', req.session);
        
        const { email, password, rememberMe } = req.body;
        const isJsonRequest = req.headers['content-type'] === 'application/json';
        
        console.log('Is JSON request:', isJsonRequest);
        console.log('Remember me:', rememberMe);

        // Input validation
        if (!email || !password) {
            console.log('Validation failed - missing fields');
            if (isJsonRequest) {
                return res.status(400).json({ message: 'All fields are required' });
            }
            return res.render('auth/login', { 
                title: 'Login',
                error: 'All fields are required'
            });
        }

        // Get connection from pool
        const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        const user = users[0];
        
        console.log('User found:', user ? 'Yes' : 'No');

        if (!user || !(await bcrypt.compare(password, user.password))) {
            console.log('Authentication failed');
            if (isJsonRequest) {
                return res.status(401).json({ message: 'Invalid email or password' });
            }
            return res.render('auth/login', {
                title: 'Login',
                error: 'Invalid email or password'
            });
        }

        // Set user session
        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            whatsapp: user.whatsapp,
            is_admin: user.is_admin,
            balance: user.balance,
            referral_code: user.referral_code
        };
        
        console.log('Session after setting user:', req.session);
        console.log('User logged in successfully:', user.email);

        // Handle remember me functionality
        if (rememberMe) {
            console.log('Creating remember token...');
            try {
                // Generate secure token
                const rememberToken = crypto.randomBytes(64).toString('hex');
                
                // Set expiration date (30 days from now)
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 30);
                
                // Clean up old tokens for this user
                await db.execute('DELETE FROM remember_tokens WHERE user_id = ?', [user.id]);
                
                // Insert new remember token
                await db.execute(
                    'INSERT INTO remember_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
                    [user.id, rememberToken, expiresAt]
                );
                
                // Set remember token cookie (secure in production)
                res.cookie('remember_token', rememberToken, {
                    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax'
                });
                
                console.log('Remember token created and cookie set');
            } catch (tokenError) {
                console.error('Error creating remember token:', tokenError);
                // Continue without remember token if there's an error
            }
        }

        if (isJsonRequest) {
            return res.json({ message: 'Login successful' });
        }

        // Redirect to appropriate dashboard
        if (user.is_admin) {
            console.log('Redirecting admin to dashboard');
            res.redirect('/admin/dashboard');
        } else {
            console.log('Redirecting user to dashboard');
            res.redirect('/dashboard');
        }
    } catch (error) {
        console.error('Login error:', error);
        const isJsonRequest = req.headers['content-type'] === 'application/json';
        
        if (isJsonRequest) {
            return res.status(500).json({ message: 'An error occurred during login. Please try again.' });
        }
        res.render('auth/login', {
            title: 'Login',
            error: 'An error occurred during login. Please try again.'
        });
    }
};

// Handle registration
exports.register = async (req, res) => {
    try {
        const { name, email, password, confirmPassword, phoneNumber, whatsapp, referralCode, acceptTerms } = req.body;
        const isJsonRequest = req.headers['content-type'] === 'application/json';
        const phone = phoneNumber || whatsapp;

        // Input validation
        if (!name || !email || !password || !phone) {
            if (isJsonRequest) {
                return res.status(400).json({ message: 'All fields are required' });
            }
            return res.render('auth/register', {
                title: 'Register',
                error: 'All fields are required'
            });
        }

        if (!acceptTerms) {
            if (isJsonRequest) {
                return res.status(400).json({ message: 'You must accept the Terms and Conditions' });
            }
            return res.render('auth/register', {
                title: 'Register',
                error: 'You must accept the Terms and Conditions'
            });
        }

        if (confirmPassword && password !== confirmPassword) {
            if (isJsonRequest) {
                return res.status(400).json({ message: 'Passwords do not match' });
            }
            return res.render('auth/register', {
                title: 'Register',
                error: 'Passwords do not match'
            });
        }

        // Validate phone number format
        const phoneRegex = /^[0-9]{10,}$/;
        if (!phoneRegex.test(phone)) {
            if (isJsonRequest) {
                return res.status(400).json({ message: 'Please enter a valid phone number (minimum 10 digits)' });
            }
            return res.render('auth/register', {
                title: 'Register',
                error: 'Please enter a valid phone number (minimum 10 digits)'
            });
        }

        // Check if email already exists
        const [existingUsers] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUsers.length > 0) {
            if (isJsonRequest) {
                return res.status(400).json({ message: 'Email already registered' });
            }
            return res.render('auth/register', {
                title: 'Register',
                error: 'Email already registered'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate referral code
        const newReferralCode = 'NRS' + Date.now().toString(36).toUpperCase();
        let referredBy = null;
        if (referralCode) {
            // Check if referral code exists
            const [refUser] = await db.execute('SELECT id FROM users WHERE referral_code = ?', [referralCode]);
            if (refUser.length === 0) {
                if (isJsonRequest) {
                    return res.status(400).json({ message: 'Invalid referral code' });
                }
                return res.render('auth/register', {
                    title: 'Register',
                    error: 'Invalid referral code'
                });
            }
            referredBy = refUser[0].id;
        }

        // Insert new user
        const [result] = await db.execute(
            'INSERT INTO users (name, email, password, whatsapp, referral_code, referred_by) VALUES (?, ?, ?, ?, ?, ?)',
            [name, email, hashedPassword, phone, newReferralCode, referredBy]
        );

        // Set user session
        req.session.user = {
            id: result.insertId,
            name: name,
            email: email,
            whatsapp: phone,
            is_admin: false,
            balance: 0,
            referral_code: newReferralCode
        };

        // Send welcome email
        try {
            const emailService = require('../utils/emailService');
            await emailService.sendWelcomeEmail({
                name: name,
                email: email
            });
            console.log('Welcome email sent to:', email);
        } catch (emailError) {
            console.error('Welcome email failed:', emailError);
            // Don't fail registration if email fails
        }

        if (isJsonRequest) {
            return res.json({ message: 'Registration successful' });
        }

        // Redirect to home page
        res.redirect('/?success=registration_successful');
    } catch (error) {
        console.error('Registration error:', error);
        const isJsonRequest = req.headers['content-type'] === 'application/json';
        if (isJsonRequest) {
            return res.status(500).json({ message: 'An error occurred during registration. Please try again.' });
        }
        res.render('auth/register', {
            title: 'Register',
            error: 'An error occurred during registration. Please try again.'
        });
    }
};

// Handle logout
exports.logout = async (req, res) => {
    try {
        // Clear remember token if it exists
        const rememberToken = req.cookies.remember_token;
        if (rememberToken) {
            await db.execute('DELETE FROM remember_tokens WHERE token = ?', [rememberToken]);
            res.clearCookie('remember_token');
        }
        
        // Destroy session
        req.session.destroy((err) => {
            if (err) {
                console.error('Logout error:', err);
            }
            res.redirect('/auth/login');
        });
    } catch (error) {
        console.error('Logout error:', error);
        req.session.destroy((err) => {
            res.redirect('/auth/login');
        });
    }
};

// Middleware to check remember token
exports.checkRememberToken = async (req, res, next) => {
    // If user is already logged in, continue
    if (req.session.user) {
        return next();
    }
    
    // Check for remember token
    const rememberToken = req.cookies.remember_token;
    if (!rememberToken) {
        return next();
    }
    
    try {
        console.log('Checking remember token...');
        
        // Find valid remember token
        const [tokens] = await db.execute(
            `SELECT rt.*, u.* FROM remember_tokens rt 
             JOIN users u ON rt.user_id = u.id 
             WHERE rt.token = ? AND rt.expires_at > NOW()`,
            [rememberToken]
        );
        
        if (tokens.length === 0) {
            console.log('Remember token not found or expired');
            res.clearCookie('remember_token');
            return next();
        }
        
        const user = tokens[0];
        console.log('Remember token valid, logging in user:', user.email);
        
        // Set user session from remember token
        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            whatsapp: user.whatsapp,
            is_admin: user.is_admin,
            balance: user.balance,
            referral_code: user.referral_code
        };
        
        console.log('User automatically logged in via remember token');
    } catch (error) {
        console.error('Error checking remember token:', error);
        res.clearCookie('remember_token');
    }
    
    next();
};
