const db = require('./db');

async function test() {
    try {
        const branch_id = 1;
        const date = '2026-08-05';
        const stove_id = 1;
        const openingStock = 10;
        const sold = 2;
        const damaged = 0;
        const returned = 0;
        const removed = 0;

        const query = `
            INSERT INTO daily_stove_inventory 
              (branch_id, record_date, stove_id, opening_stock, received_stock, sold_stock, damaged_stock, returned_stock, removed_stock)
            VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
              sold_stock = sold_stock + VALUES(sold_stock),
              damaged_stock = damaged_stock + VALUES(damaged_stock),
              returned_stock = returned_stock + VALUES(returned_stock),
              removed_stock = removed_stock + VALUES(removed_stock)
        `;

        await db.query(query, [branch_id, date, stove_id, openingStock, sold, damaged, returned, removed]);
        console.log('Query executed successfully!');
    } catch (err) {
        console.error('Query failed:', err);
    } finally {
        process.exit(0);
    }
}

test();
