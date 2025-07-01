# Nawe Ririmba Space - Music Marketplace

A modern music marketplace platform where artists can upload, sell, and share their unique compositions. Once a song is purchased, it becomes exclusive to the buyer and is no longer available to others.

## Features

### 🎵 For Artists
- **Audio Recording**: Built-in browser-based recording with metronome and tempo control
- **File Upload**: Support for MP3, WAV, and AAC audio formats
- **Preview Generation**: Automatic preview creation using Web Audio API (30-60 seconds)
- **Earnings Dashboard**: Track sales, commissions, and withdrawal requests
- **Song Management**: Upload lyrics, set genres, styles, and pricing

### 🛒 For Buyers
- **Preview & Purchase**: Listen to song previews before buying
- **Secure Payments**: Flutterwave payment integration
- **Instant Download**: Immediate access to purchased songs
- **Exclusive Ownership**: Songs become unavailable after purchase
- **Full Lyrics Access**: Complete lyrics revealed after purchase

### ⚙️ For Administrators
- **Commission Management**: Set platform commission rates
- **Referral System**: Manage referral rewards and tracking
- **User Analytics**: View user statistics and revenue data
- **Withdrawal Processing**: Handle artist withdrawal requests
- **Transaction Monitoring**: Track all platform transactions

## Technology Stack

- **Backend**: Node.js with Express.js
- **Database**: MySQL with connection pooling
- **Frontend**: EJS templating with Bootstrap 5
- **Audio Processing**: Web Audio API (browser-based)
- **Payments**: Flutterwave payment gateway
- **Security**: bcryptjs, helmet, express-rate-limit
- **File Upload**: Multer with file type validation

## Project Structure

```
src/
├── server.js                 # Main application entry point
├── models/
│   ├── db.js                # Database connection and utilities
│   ├── init-db.js           # Database initialization script
│   └── schema.sql           # Database schema definition
├── controllers/
│   └── authController.js    # Authentication logic
├── routes/
│   ├── auth.js              # Authentication routes
│   ├── songs.js             # Song management routes
│   ├── users.js             # User profile and dashboard routes
│   └── admin.js             # Admin dashboard routes
├── middlewares/
│   └── songMiddleware.js    # Song-related middleware
├── views/
│   ├── layouts/             # EJS layout templates
│   ├── partials/            # Reusable template components
│   ├── auth/                # Login and registration pages
│   ├── songs/               # Song upload, listing, and detail pages
│   ├── users/               # User profile and dashboard
│   └── admin/               # Admin dashboard
└── public/
    ├── js/
    │   ├── audioRecorder.js # Browser-based audio recording
    │   └── songUpload.js    # Song upload and preview generation
    ├── css/
    │   └── style.css        # Custom styles and responsive design
    └── uploads/             # Audio file storage
```

## Installation & Setup

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd naweririmba
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your database and Flutterwave credentials
   ```

3. **Set up database:**
   - Create a MySQL database named `nawe_ririmba`
   - Run `npm run postinstall` to initialize tables

4. **Start the application:**
   ```bash
   npm run dev  # Development mode
   npm start    # Production mode
   ```

## Environment Variables

```env
NODE_ENV=development
PORT=3000

# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=nawe_ririmba

# Session Security
SESSION_SECRET=your_session_secret

# Flutterwave Payment
FLW_PUBLIC_KEY=your_flutterwave_public_key
FLW_SECRET_KEY=your_flutterwave_secret_key

# Application
APP_NAME=Nawe Ririmba Space
APP_URL=http://localhost:3000
```

## Key Features Implementation

### Audio Recording & Processing
- **Browser-based recording** using MediaRecorder API
- **Metronome integration** with customizable tempo and time signatures
- **Real-time preview generation** using Web Audio API
- **Audio format conversion** to WAV for consistent playback

### Payment Integration
- **Flutterwave payment gateway** for secure transactions
- **Automatic payment verification** with callback handling
- **Commission calculation** with configurable rates
- **Referral tracking** and reward distribution

### Security Features
- **Password hashing** with bcryptjs
- **Rate limiting** to prevent abuse
- **Input validation** and sanitization
- **File type validation** for uploads
- **Session management** with secure cookies

### Mobile-First Design
- **Responsive layout** with Bootstrap 5
- **Mobile navigation** with bottom tab bar
- **Touch-friendly interfaces** for all interactions
- **Progressive enhancement** for audio features

## Database Schema

The application uses the following main tables:
- `users` - User accounts and profile information
- `songs` - Song metadata, pricing, and file references
- `transactions` - Purchase history and payment tracking
- `settings` - Platform configuration (commission, referral rates)
- `withdrawals` - Artist withdrawal requests and processing

## API Endpoints

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout

### Songs
- `GET /songs` - List available songs
- `GET /songs/upload` - Upload form
- `POST /songs` - Create new song
- `GET /songs/:id` - Song details
- `POST /songs/:id/purchase` - Initiate purchase
- `GET /songs/:id/download` - Download purchased song

### User Dashboard
- `GET /users/profile` - User profile and earnings
- `POST /users/withdraw` - Request withdrawal
- `PUT /users/profile` - Update profile

### Admin
- `GET /admin/dashboard` - Admin overview
- `POST /admin/settings` - Update platform settings
- `POST /admin/withdrawals/:id/process` - Process withdrawal

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the ISC License.

---

**Nawe Ririmba Space** - Where unique music finds its perfect owner. 🎵
# naweririmba
