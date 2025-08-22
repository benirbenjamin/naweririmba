const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../models/db');

// Show login form
exports.showLogin = (req, res) => {
    // Check if user is already logged in
    if (req.session.user) {
        console.log('User already logged in, redirecting to dashboard');
        if (req.session.user.is_admin) {
            return res.redirect('/admin/dashboard');
        } else {
            return res.redirect('/users/dashboard');
        }
    }
    
    let success = null;
    if (req.query.success === 'password_reset_successful') {
        success = 'Password reset successful! Please login with your new password.';
    }
    
    // Get redirect URL from query or session
    const redirectUrl = req.query.redirect || req.session.redirectAfterLogin || null;
    
    res.render('auth/login', { 
        title: 'Login',
        error: req.query.error ? 'Admin access required' : null,
        success: success,
        redirectUrl: redirectUrl
    });
};

// Show registration form
exports.showRegister = async (req, res) => {
    // Check if user is already logged in
    if (req.session.user) {
        console.log('User already logged in, redirecting to dashboard');
        if (req.session.user.is_admin) {
            return res.redirect('/admin/dashboard');
        } else {
            return res.redirect('/users/dashboard');
        }
    }
    
    try {
        // Get security questions
        const [securityQuestions] = await db.execute('SELECT * FROM security_questions WHERE is_active = TRUE ORDER BY id');
        
        // Get redirect URL from query or session
        const redirectUrl = req.query.redirect || req.session.redirectAfterLogin || null;
        
        res.render('auth/register', { 
            title: 'Register',
            error: null,
            securityQuestions: securityQuestions || [],
            redirectUrl: redirectUrl
        });
    } catch (error) {
        console.error('Error loading security questions:', error);
        res.render('auth/register', { 
            title: 'Register',
            error: null,
            securityQuestions: []
        });
    }
};

// Handle login
exports.login = async (req, res) => {
    try {
        console.log('=== LOGIN ATTEMPT ===');
        console.log('Request body:', req.body);
        console.log('Session before login:', req.session);
        
        // Check if user is already logged in
        if (req.session.user) {
            console.log('User already logged in, redirecting to dashboard');
            const isJsonRequest = req.headers['content-type'] === 'application/json';
            
            if (isJsonRequest) {
                return res.json({ 
                    message: 'Already logged in',
                    redirectUrl: req.session.user.is_admin ? '/admin/dashboard' : '/users/dashboard'
                });
            }
            
            if (req.session.user.is_admin) {
                return res.redirect('/admin/dashboard');
            } else {
                return res.redirect('/users/dashboard');
            }
        }
        
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
        console.log('Session config - secure cookies:', process.env.USE_HTTPS === 'true');
        console.log('Session config - NODE_ENV:', process.env.NODE_ENV);

        // Save session before redirecting
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                console.error('Session save error details:', {
                    error: err.message,
                    stack: err.stack,
                    sessionId: req.sessionID,
                    userId: user.id,
                    timestamp: new Date().toISOString()
                });
                if (isJsonRequest) {
                    return res.status(500).json({ message: 'Session error. Please try again.' });
                }
                return res.render('auth/login', {
                    title: 'Login',
                    error: 'Session error. Please try again.'
                });
            }

            // Handle remember me functionality
            if (rememberMe) {
                console.log('Creating remember token...');
                handleRememberMe(user.id, res).then(() => {
                    performRedirect();
                }).catch((tokenError) => {
                    console.error('Error creating remember token:', tokenError);
                    performRedirect();
                });
            } else {
                performRedirect();
            }
        });

        function performRedirect() {
            console.log('=== PERFORMING REDIRECT ===');
            console.log('Session at redirect time:', req.session);
            console.log('User data at redirect time:', req.session.user);
            console.log('Session ID at redirect time:', req.sessionID);
            
            // Check for redirect URL from form or session
            const redirectUrl = req.body.redirectUrl || req.session.redirectAfterLogin;
            console.log('Redirect URL found:', redirectUrl);
            
            // Clear the redirect URL from session
            delete req.session.redirectAfterLogin;
            
            // Determine redirect destination
            let destination;
            if (redirectUrl && redirectUrl !== '/login' && redirectUrl !== '/register') {
                // Redirect to the intended page (song page, etc.)
                destination = redirectUrl;
                console.log('Redirecting to intended page:', destination);
            } else if (user.is_admin) {
                destination = '/admin/dashboard';
                console.log('Redirecting admin to dashboard');
            } else {
                destination = '/users/dashboard';
                console.log('Redirecting user to dashboard');
            }
            
            console.log('Final destination:', destination);
            console.log('===============================');
            
            if (isJsonRequest) {
                return res.json({ 
                    message: 'Login successful',
                    redirectUrl: destination
                });
            }

            return res.redirect(destination);
        }

        async function handleRememberMe(userId, response) {
            try {
                // Generate secure token
                const rememberToken = crypto.randomBytes(64).toString('hex');
                
                // Set expiration date (30 days from now)
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 30);
                
                // Clean up old tokens for this user
                await db.execute('DELETE FROM remember_tokens WHERE user_id = ?', [userId]);
                
                // Insert new remember token
                await db.execute(
                    'INSERT INTO remember_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
                    [userId, rememberToken, expiresAt]
                );
                
                // Set remember token cookie (secure in production)
                response.cookie('remember_token', rememberToken, {
                    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax'
                });
                
                console.log('Remember token created and cookie set');
            } catch (tokenError) {
                console.error('Error creating remember token:', tokenError);
                throw tokenError;
            }
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
        // Check if user is already logged in
        if (req.session.user) {
            console.log('User already logged in, redirecting to dashboard');
            const isJsonRequest = req.headers['content-type'] === 'application/json';
            
            if (isJsonRequest) {
                return res.json({ 
                    message: 'Already logged in',
                    redirectUrl: req.session.user.is_admin ? '/admin/dashboard' : '/users/dashboard'
                });
            }
            
            if (req.session.user.is_admin) {
                return res.redirect('/admin/dashboard');
            } else {
                return res.redirect('/users/dashboard');
            }
        }
        
        const { name, email, password, confirmPassword, phoneNumber, whatsapp, referralCode, acceptTerms, securityQuestion, securityAnswer } = req.body;
        const isJsonRequest = req.headers['content-type'] === 'application/json';
        const phone = phoneNumber || whatsapp;

        // Get security questions for re-rendering in case of error
        const [securityQuestions] = await db.execute('SELECT * FROM security_questions WHERE is_active = TRUE ORDER BY id');

        // Input validation
        if (!name || !email || !password || !phone || !securityQuestion || !securityAnswer) {
            if (isJsonRequest) {
                return res.status(400).json({ message: 'All fields are required' });
            }
            return res.render('auth/register', {
                title: 'Register',
                error: 'All fields are required',
                securityQuestions: securityQuestions || []
            });
        }

        if (!acceptTerms) {
            if (isJsonRequest) {
                return res.status(400).json({ message: 'You must accept the Terms and Conditions' });
            }
            return res.render('auth/register', {
                title: 'Register',
                error: 'You must accept the Terms and Conditions',
                securityQuestions: securityQuestions || []
            });
        }

        if (confirmPassword && password !== confirmPassword) {
            if (isJsonRequest) {
                return res.status(400).json({ message: 'Passwords do not match' });
            }
            return res.render('auth/register', {
                title: 'Register',
                error: 'Passwords do not match',
                securityQuestions: securityQuestions || []
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
                error: 'Please enter a valid phone number (minimum 10 digits)',
                securityQuestions: securityQuestions || []
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
                error: 'Email already registered',
                securityQuestions: securityQuestions || []
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
                    error: 'Invalid referral code',
                    securityQuestions: securityQuestions || []
                });
            }
            referredBy = refUser[0].id;
        }

        // Hash security answer
        const hashedSecurityAnswer = await bcrypt.hash(securityAnswer.toLowerCase().trim(), 10);

        // Insert new user
        const [result] = await db.execute(
            'INSERT INTO users (name, email, password, whatsapp, referral_code, referred_by, security_question_id, security_answer) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [name, email, hashedPassword, phone, newReferralCode, referredBy, securityQuestion, hashedSecurityAnswer]
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

        // Handle redirect after registration
        const redirectUrl = req.body.redirectUrl || req.session.redirectAfterLogin;
        delete req.session.redirectAfterLogin; // Clear from session
        
        if (isJsonRequest) {
            return res.json({ 
                message: 'Registration successful',
                redirectUrl: redirectUrl || '/users/dashboard'
            });
        }

        // Redirect to intended page or dashboard
        if (redirectUrl && redirectUrl !== '/login' && redirectUrl !== '/register') {
            console.log('Redirecting new user to intended page:', redirectUrl);
            return res.redirect(redirectUrl);
        } else {
            // Redirect to home page with success message
            return res.redirect('/?success=registration_successful');
        }
    } catch (error) {
        console.error('Registration error:', error);
        const isJsonRequest = req.headers['content-type'] === 'application/json';
        
        // Get security questions for re-rendering
        let securityQuestions = [];
        try {
            const [questions] = await db.execute('SELECT * FROM security_questions WHERE is_active = TRUE ORDER BY id');
            securityQuestions = questions || [];
        } catch (questionError) {
            console.error('Error loading security questions:', questionError);
        }
        
        if (isJsonRequest) {
            return res.status(500).json({ message: 'An error occurred during registration. Please try again.' });
        }
        res.render('auth/register', {
            title: 'Register',
            error: 'An error occurred during registration. Please try again.',
            securityQuestions: securityQuestions
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
            res.redirect('/login');
        });
    } catch (error) {
        console.error('Logout error:', error);
        req.session.destroy((err) => {
            res.redirect('/login');
        });
    }
};

// Admin password reset - directly set new password without email
exports.adminResetPassword = async (req, res) => {
    try {
        // Check if user is admin
        if (!req.session.user || !req.session.user.is_admin) {
            return res.status(403).json({ 
                success: false, 
                error: 'Admin access required' 
            });
        }

        const { userId } = req.params;
        const { newPassword } = req.body;

        // Validate input
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ 
                success: false, 
                error: 'Password must be at least 6 characters long' 
            });
        }

        // Check if target user exists
        const [users] = await db.execute('SELECT id, name, email FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const targetUser = users[0];

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update user password
        await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);

        // Clear any existing remember tokens for this user
        await db.execute('DELETE FROM remember_tokens WHERE user_id = ?', [userId]);

        console.log(`Admin ${req.session.user.email} reset password for user ${targetUser.email}`);

        res.json({ 
            success: true, 
            message: `Password successfully reset for ${targetUser.name}` 
        });

    } catch (error) {
        console.error('Admin password reset error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'An error occurred while resetting the password' 
        });
    }
};

// Show password reset form
exports.showResetPassword = (req, res) => {
    res.render('auth/reset-password', { 
        title: 'Reset Password',
        error: null,
        success: null,
        step: 'verify'
    });
};

// Handle password reset verification
exports.resetPasswordVerify = async (req, res) => {
    try {
        const { email, phoneNumber, securityAnswer } = req.body;
        const step = req.body.step || 'verify';
        
        if (step === 'verify') {
            // First step: verify email and phone, then show security question
            if (!email || !phoneNumber) {
                return res.render('auth/reset-password', {
                    title: 'Reset Password',
                    error: 'Email and phone number are required',
                    success: null,
                    step: 'verify'
                });
            }

            // Find user with email and phone number
            const [users] = await db.execute(`
                SELECT u.*, sq.question 
                FROM users u 
                JOIN security_questions sq ON u.security_question_id = sq.id 
                WHERE u.email = ? AND u.whatsapp = ?
            `, [email, phoneNumber]);
            
            if (users.length === 0) {
                return res.render('auth/reset-password', {
                    title: 'Reset Password',
                    error: 'No account found with this email and phone number combination',
                    success: null,
                    step: 'verify'
                });
            }

            const user = users[0];
            
            // Store user info in session for security question step
            req.session.passwordResetUser = {
                id: user.id,
                email: user.email,
                phone: user.whatsapp,
                securityQuestion: user.question
            };

            // Show security question step
            return res.render('auth/reset-password', {
                title: 'Reset Password',
                error: null,
                success: 'Account verified! Please answer your security question below.',
                step: 'security_question',
                securityQuestion: user.question,
                email: email,
                phoneNumber: phoneNumber
            });
        }
        
        if (step === 'security_question') {
            // Second step: verify security answer
            if (!securityAnswer) {
                return res.render('auth/reset-password', {
                    title: 'Reset Password',
                    error: 'Security answer is required',
                    success: null,
                    step: 'security_question',
                    securityQuestion: req.session.passwordResetUser?.securityQuestion || '',
                    email: req.session.passwordResetUser?.email || '',
                    phoneNumber: req.session.passwordResetUser?.phone || ''
                });
            }

            // Verify we have user info in session
            if (!req.session.passwordResetUser) {
                return res.render('auth/reset-password', {
                    title: 'Reset Password',
                    error: 'Session expired. Please start over.',
                    success: null,
                    step: 'verify'
                });
            }

            // Get user with security answer
            const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [req.session.passwordResetUser.id]);
            
            if (users.length === 0) {
                return res.render('auth/reset-password', {
                    title: 'Reset Password',
                    error: 'User not found. Please start over.',
                    success: null,
                    step: 'verify'
                });
            }

            const user = users[0];
            
            // Verify security answer
            const isAnswerCorrect = await bcrypt.compare(securityAnswer.toLowerCase().trim(), user.security_answer);
            
            if (!isAnswerCorrect) {
                return res.render('auth/reset-password', {
                    title: 'Reset Password',
                    error: 'Security answer is incorrect. Please try again.',
                    success: null,
                    step: 'security_question',
                    securityQuestion: req.session.passwordResetUser.securityQuestion,
                    email: req.session.passwordResetUser.email,
                    phoneNumber: req.session.passwordResetUser.phone
                });
            }

            // Generate reset token
            const resetToken = crypto.randomBytes(32).toString('hex');
            const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

            // Store reset token in session
            req.session.passwordReset = {
                userId: user.id,
                token: resetToken,
                expires: resetTokenExpiry
            };

            // Clear user info from session
            delete req.session.passwordResetUser;

            // Show password reset form
            return res.render('auth/reset-password', {
                title: 'Reset Password',
                error: null,
                success: 'Security question verified! You can now set a new password.',
                step: 'reset',
                resetToken: resetToken
            });
        }

    } catch (error) {
        console.error('Password reset verification error:', error);
        res.render('auth/reset-password', {
            title: 'Reset Password',
            error: 'An error occurred. Please try again.',
            success: null,
            step: 'verify'
        });
    }
};

// Handle password reset
exports.resetPassword = async (req, res) => {
    try {
        const { newPassword, confirmPassword, resetToken } = req.body;
        
        if (!newPassword || !confirmPassword || !resetToken) {
            return res.render('auth/reset-password', {
                title: 'Reset Password',
                error: 'All fields are required',
                success: null,
                step: 'reset',
                resetToken: resetToken
            });
        }

        if (newPassword !== confirmPassword) {
            return res.render('auth/reset-password', {
                title: 'Reset Password',
                error: 'Passwords do not match',
                success: null,
                step: 'reset',
                resetToken: resetToken
            });
        }

        // Validate reset token
        if (!req.session.passwordReset || 
            req.session.passwordReset.token !== resetToken || 
            new Date() > new Date(req.session.passwordReset.expires)) {
            
            return res.render('auth/reset-password', {
                title: 'Reset Password',
                error: 'Reset token has expired. Please start the process again.',
                success: null,
                step: 'verify'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update user password
        await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.session.passwordReset.userId]);

        // Clear reset session
        delete req.session.passwordReset;

        // Redirect to login with success message
        res.redirect('/login?success=password_reset_successful');

    } catch (error) {
        console.error('Password reset error:', error);
        res.render('auth/reset-password', {
            title: 'Reset Password',
            error: 'An error occurred. Please try again.',
            success: null,
            step: 'verify'
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
        
        // Save session explicitly when setting from remember token
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        console.log('User automatically logged in via remember token');
    } catch (error) {
        console.error('Error checking remember token:', error);
        res.clearCookie('remember_token');
    }
    
    next();
};
