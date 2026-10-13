require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'fuego_stoves'
        });

        console.log('Connected to MySQL. Running migrations...');

        // 1. Add 'status' column to 'transactions' if it doesn't exist
        try {
            await connection.query(`ALTER TABLE transactions ADD COLUMN status VARCHAR(20) DEFAULT 'pending'`);
            console.log('Added \`status\` column to \`transactions\` table.');
            
            // Retroactively confirm older transactions
            await connection.query(`UPDATE transactions SET status = 'confirmed'`);
            console.log('Marked existing transactions as confirmed.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('\`status\` column already exists in \`transactions\`.');
            } else {
                console.error('Error modifying transactions table:', err.message);
            }
        }

        // 2. Add 'type' column to 'expenses' if it doesn't exist
        try {
            await connection.query(`ALTER TABLE expenses ADD COLUMN type VARCHAR(20) DEFAULT 'expense'`);
            console.log('Added \`type\` column to \`expenses\` table.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('\`type\` column already exists in \`expenses\`.');
            } else {
                console.error('Error modifying expenses table:', err.message);
            }
        }

        await connection.end();
        console.log('Migration complete.');
    } catch (err) {
        console.error('Database connection failed:', err);
    }
}

migrate();
