CREATE DATABASE IF NOT EXISTS nawe_ririmba;

USE nawe_ririmba;

CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    whatsapp VARCHAR(20) NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    balance DECIMAL(10,2) DEFAULT 0.00,
    referral_code VARCHAR(50) UNIQUE,
    referred_by INT,
    security_question_id INT NOT NULL,
    security_answer VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (referred_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS security_questions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    question TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS songs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    style ENUM('gospel', 'secular') NOT NULL,
    genre ENUM('igisirimba', 'zouke', 'zulu', 'reggae', 'zulu_reggae', 'techno', 'seben', 'ikinimba', 'country', 'slow', 'rnb', 'pop', 'afrobeat', 'hip_hop', 'jazz', 'rock', 'blues', 'folk', 'electronic', 'other') NOT NULL,
    lyrics TEXT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    audio_path VARCHAR(255) NOT NULL,
    audio_format ENUM('mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a') NOT NULL DEFAULT 'mp3',
    preview_path VARCHAR(255),
    preview_start_time DECIMAL(5,2) DEFAULT 0,
    preview_end_time DECIMAL(5,2) DEFAULT 45,
    tempo INT DEFAULT 120,
    time_signature VARCHAR(10) DEFAULT '4/4',
    duration DECIMAL(8,2) DEFAULT 0,
    file_size INT DEFAULT 0,
    is_sold BOOLEAN DEFAULT FALSE,
    buyer_id INT,
    purchased_at TIMESTAMP NULL,
    play_count INT DEFAULT 0,
    share_count INT DEFAULT 0,
    cover_image VARCHAR(255),
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (buyer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    song_id INT NOT NULL,
    seller_id INT NOT NULL,
    buyer_id INT,
    buyer_email VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    commission_amount DECIMAL(10,2) NOT NULL,
    seller_amount DECIMAL(10,2) NOT NULL,
    flutterwave_tx_ref VARCHAR(255) NOT NULL,
    flutterwave_tx_id VARCHAR(255),
    status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (song_id) REFERENCES songs(id),
    FOREIGN KEY (seller_id) REFERENCES users(id),
    FOREIGN KEY (buyer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    commission_rate DECIMAL(5,2) NOT NULL DEFAULT 40.00,
    referral_rate DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    share_commission_rate DECIMAL(5,2) NOT NULL DEFAULT 15.00,
    min_withdrawal_amount DECIMAL(10,2) NOT NULL DEFAULT 10.00,
    site_name VARCHAR(255) DEFAULT 'Naweririmba',
    site_description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS song_shares (
    id INT PRIMARY KEY AUTO_INCREMENT,
    song_id INT NOT NULL,
    sharer_id INT NOT NULL,
    share_url VARCHAR(255) NOT NULL,
    clicks INT DEFAULT 0,
    purchases INT DEFAULT 0,
    total_commission DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
    FOREIGN KEY (sharer_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_song_sharer (song_id, sharer_id)
);

CREATE TABLE IF NOT EXISTS guest_purchases (
    id INT PRIMARY KEY AUTO_INCREMENT,
    song_id INT NOT NULL,
    buyer_email VARCHAR(255) NOT NULL,
    buyer_name VARCHAR(255),
    amount DECIMAL(10,2) NOT NULL,
    commission_amount DECIMAL(10,2) NOT NULL,
    seller_amount DECIMAL(10,2) NOT NULL,
    share_commission DECIMAL(10,2) DEFAULT 0.00,
    sharer_id INT NULL,
    flutterwave_tx_ref VARCHAR(255) NOT NULL,
    flutterwave_tx_id VARCHAR(255),
    status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
    download_token VARCHAR(255),
    download_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (song_id) REFERENCES songs(id),
    FOREIGN KEY (sharer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS withdrawals (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    whatsapp_number VARCHAR(20) NOT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS remember_tokens (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Insert default settings
INSERT IGNORE INTO settings (id, commission_rate, referral_rate, share_commission_rate, min_withdrawal_amount, site_name, site_description) 
VALUES (1, 40.00, 5.00, 15.00, 10.00, 'Naweririmba', 'Where Unique Songs Find Their Perfect Owners');

-- Insert default admin user (password: admin123)
INSERT IGNORE INTO users (id, name, email, password, whatsapp, is_admin) 
VALUES (1, 'Admin', 'admin@naweririmba.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '250000000000', true);

-- Insert default security questions
INSERT IGNORE INTO security_questions (id, question) VALUES
(1, 'What is your mother\'s maiden name?'),
(2, 'What was the name of your first pet?'),
(3, 'What city were you born in?'),
(4, 'What is the name of your favorite teacher?'),
(5, 'What was your childhood nickname?'),
(6, 'What is the name of the street you grew up on?'),
(7, 'What is your favorite food?'),
(8, 'What was the make of your first car?'),
(9, 'What is the name of your best friend from childhood?'),
(10, 'What is your favorite movie?');
