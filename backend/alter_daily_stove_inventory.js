const db = require('./db');

async function migrate() {
    try {
        // 1. Add branch_id column if not exists
        try {
            await db.query('ALTER TABLE daily_stove_inventory ADD COLUMN branch_id INT DEFAULT 1 AFTER id');
            console.log('Added branch_id column.');
        } catch (err) {
            console.log('branch_id column already exists or failed:', err.message);
        }

        // 2. Drop old unique key if exists
        try {
            await db.query('ALTER TABLE daily_stove_inventory DROP KEY unique_stove_date');
            console.log('Dropped unique_stove_date key.');
        } catch (err) {
            console.log('unique_stove_date key does not exist or failed:', err.message);
        }

        // 3. Add new unique key on branch_id, stove_id, record_date
        try {
            await db.query('ALTER TABLE daily_stove_inventory ADD UNIQUE KEY unique_branch_stove_date (branch_id, stove_id, record_date)');
            console.log('Added unique_branch_stove_date key.');
        } catch (err) {
            console.log('unique_branch_stove_date key already exists or failed:', err.message);
        }

        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration error:', err);
    } finally {
        process.exit(0);
    }
}

migrate();
