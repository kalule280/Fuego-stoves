require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'fuego_stove_tracker'
        });

        console.log('Connected to MySQL. Running migrations...');

        // 1. Add 'staff_name' column to 'transactions' if it doesn't exist
        try {
            await connection.query(`ALTER TABLE transactions ADD COLUMN staff_name VARCHAR(100)`);
            console.log('Added `staff_name` column to `transactions` table.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('`staff_name` column already exists in `transactions`.');
            } else {
                console.error('Error modifying transactions table (staff_name):', err.message);
            }
        }

        // 2. Add 'status' column to 'transactions' if it doesn't exist
        try {
            await connection.query(`ALTER TABLE transactions ADD COLUMN status VARCHAR(50) DEFAULT 'pending'`);
            console.log('Added `status` column to `transactions` table.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('`status` column already exists in `transactions`.');
            } else {
                console.error('Error modifying transactions table (status):', err.message);
            }
        }

        await connection.end();
        console.log('Migration complete.');
    } catch (err) {
        console.error('Database connection failed:', err);
    }
}

migrate();
