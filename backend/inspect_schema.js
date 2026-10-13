const db = require('./db');

async function inspect() {
    try {
        const [desc] = await db.query('DESCRIBE daily_stove_inventory');
        console.table(desc);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

inspect();
