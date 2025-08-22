const mysql = require('mysql2/promise');

async function createTestTransaction() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'nawe_ririmba'
    });
    
    // Create a test pending transaction - amount should always be stored in USD
    await pool.execute(`
        INSERT INTO transactions (
            song_id, seller_id, buyer_email, amount, commission_amount, currency, usd_to_rwf_rate, status, 
            payment_reference, customer_email, customer_name, customer_phone
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        6, // song_id 
        4, // seller_id
        'test@example.com', // buyer_email (required field)
        50.00, // amount in USD (always store in USD regardless of payment currency)
        20.00, // commission_amount (40% of 50 USD)
        'RWF', // currency used for payment
        1447.00, // usd_to_rwf_rate
        'pending', // status
        'test_rwf_' + Date.now(),
        'test@example.com',
        'Test User',
        '+250123456789'
    ]);
    
    console.log('Created test transaction: $50 USD song paid with RWF currency');
    
    // Get the transaction
    const [transaction] = await pool.execute('SELECT * FROM transactions WHERE payment_reference LIKE "test_rwf_%" ORDER BY created_at DESC LIMIT 1');
    console.log('Test transaction created:', transaction[0]);
    
    await pool.end();
}

createTestTransaction();
