# Password Reset Feature

This document describes the password reset functionality implemented in Nawe Ririmba Space.

## Overview

The password reset system allows users to reset their passwords using security questions that they set up during registration. This provides a secure way to recover accounts without requiring email-based reset links.

## How It Works

### 1. During Registration
- Users select a security question from a predefined list
- Users provide an answer to their chosen security question
- The security answer is hashed and stored in the database

### 2. During Password Reset
- Users provide their email address and phone number
- Users answer their security question
- If all information matches, they can set a new password

## Features

### Security Questions
The system includes 10 predefined security questions:
1. What is your mother's maiden name?
2. What was the name of your first pet?
3. What city were you born in?
4. What is the name of your favorite teacher?
5. What was your childhood nickname?
6. What is the name of the street you grew up on?
7. What is your favorite food?
8. What was the make of your first car?
9. What is the name of your best friend from childhood?
10. What is your favorite movie?

### Database Schema
- `security_questions` table: Stores the predefined security questions
- `users` table: Extended with `security_question_id` and `security_answer` columns

### Migration System
- Automatic database migrations run when the application starts
- Manual migration commands available via npm scripts
- Rollback functionality for development

## Usage

### For Users
1. **Registration**: Select a security question and provide an answer
2. **Password Reset**: 
   - Go to `/auth/reset-password`
   - Enter email, phone number, and security answer
   - Set a new password

### For Developers

#### Running Migrations
```bash
# Run all pending migrations
npm run migrate

# Check migration status
npm run migrate:status

# Rollback a specific migration
npm run migrate:down <migration-file>
```

#### Environment Switching
```bash
# Switch to development mode
npm run env:dev

# Switch to production mode
npm run env:prod
```

## API Endpoints

### Authentication Routes
- `GET /auth/reset-password` - Show password reset form
- `POST /auth/reset-password-verify` - Verify user information and security answer
- `POST /auth/reset-password` - Set new password

### Updated Registration
- `GET /register` - Show registration form (now includes security questions)
- `POST /register` - Register new user (now includes security question handling)

## Security Considerations

1. **Security Answer Hashing**: All security answers are hashed using bcrypt
2. **Case Insensitive**: Answers are converted to lowercase before hashing
3. **Trimmed Input**: Leading/trailing whitespace is removed from answers
4. **Session-based Tokens**: Reset tokens are stored in session and expire after 15 minutes
5. **Multi-factor Verification**: Requires email, phone, and security answer to match

## Development vs Production

The system automatically adapts to different environments:

### Development Mode
- Cookies use `sameSite: 'lax'` for easier testing
- Flutterwave sandbox environment
- Enhanced logging
- Local server URLs

### Production Mode
- Cookies use `sameSite: 'strict'` for security
- Flutterwave live environment
- Production logging
- HTTPS-only cookies

## Database Migration Files

### `001_add_security_questions.js`
- Adds `security_question_id` and `security_answer` columns to users table
- Creates `security_questions` table
- Inserts default security questions
- Updates admin user with default security answer

## Troubleshooting

### Common Issues

1. **Migration Errors**: Check database connection and permissions
2. **Security Answer Mismatch**: Ensure answers are lowercase and trimmed
3. **Session Issues**: Clear browser cookies and restart application
4. **Database Schema**: Run `npm run migrate:status` to check migration status

### Environment Issues

If you can't log in:
1. Check if you're in the correct environment (dev/prod)
2. Clear browser cookies
3. Restart the application
4. Check the console for session errors

## Future Enhancements

1. **Email Verification**: Optional email-based password reset
2. **Multi-language Support**: Translate security questions
3. **Custom Security Questions**: Allow users to create their own questions
4. **Account Lockout**: Implement account lockout after failed attempts
5. **Password Strength**: Enforce password complexity requirements
