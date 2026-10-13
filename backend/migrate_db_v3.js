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

        // 1. Add 'created_by' column to 'transactions' if it doesn't exist
        try {
            await connection.query(`ALTER TABLE transactions ADD COLUMN created_by INT`);
            console.log('Added \`created_by\` column to \`transactions\` table.');
            
            await connection.query(`ALTER TABLE transactions ADD CONSTRAINT fk_trx_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL`);
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('\`created_by\` column already exists in \`transactions\`.');
            } else {
                console.error('Error modifying transactions table:', err.message);
            }
        }

        // 2. Add 'created_by' column to 'quotations' if it doesn't exist
        try {
            await connection.query(`ALTER TABLE quotations ADD COLUMN created_by INT`);
            console.log('Added \`created_by\` column to \`quotations\` table.');
            
            await connection.query(`ALTER TABLE quotations ADD CONSTRAINT fk_quo_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL`);
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('\`created_by\` column already exists in \`quotations\`.');
            } else {
                console.error('Error modifying quotations table:', err.message);
            }
        }

        await connection.end();
        console.log('Migration complete.');
    } catch (err) {
        console.error('Database connection failed:', err);
    }
}

migrate();
