require('dotenv').config();
const db = require('./db');

async function migrate() {
    try {
        // Add 'status' column to quotations table if it doesn't exist
        try {
            await db.query(`ALTER TABLE quotations ADD COLUMN status VARCHAR(20) DEFAULT 'Draft'`);
            console.log('Added `status` column to `quotations` table.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('`status` column already exists in `quotations`.');
            } else {
                console.error('Error adding status column:', err.message);
            }
        }

        // Set default status values for existing records
        await db.query(`UPDATE quotations SET status = 'Paid' WHERE type = 'receipt' AND (status IS NULL OR status = 'Draft')`);
        await db.query(`UPDATE quotations SET status = 'Draft' WHERE type = 'quotation' AND status IS NULL`);
        console.log('Updated default status values for existing records.');

        console.log('Migration complete!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        process.exit();
    }
}

migrate();
