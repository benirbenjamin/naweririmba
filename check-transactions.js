const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'nawe'
});

async function checkTransactions() {
    try {
        const [transactions] = await pool.execute('SELECT id, amount, seller_amount, commission_amount, status FROM transactions ORDER BY created_at DESC LIMIT 5');
        console.log('Recent transactions:');
        transactions.forEach(t => {
            console.log(`ID: ${t.id}, Amount: $${t.amount}, Seller: $${t.seller_amount}, Commission: $${t.commission_amount}, Status: ${t.status}`);
        });
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkTransactions();
