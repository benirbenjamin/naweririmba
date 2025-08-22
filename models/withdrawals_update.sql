-- Add account details columns to withdrawals table
ALTER TABLE withdrawals 
ADD COLUMN account_type ENUM('mobile_money', 'bank_account') AFTER whatsapp_number,
ADD COLUMN account_name VARCHAR(255) AFTER account_type,
ADD COLUMN account_number VARCHAR(100) AFTER account_name,
ADD COLUMN bank_name VARCHAR(255) AFTER account_number,
ADD COLUMN momo_operator VARCHAR(50) AFTER bank_name;

-- Create user_payment_accounts table for saving payment methods
CREATE TABLE IF NOT EXISTS user_payment_accounts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    account_type ENUM('mobile_money', 'bank_account') NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_number VARCHAR(100) NOT NULL,
    bank_name VARCHAR(255) NULL,
    momo_operator VARCHAR(50) NULL,
    is_default BOOLEAN DEFAULT FALSE,
    usage_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
