const db = require('./db');

async function createTable() {
    try {
        const query = `
            CREATE TABLE IF NOT EXISTS \`inventory\` (
              \`id\` INT AUTO_INCREMENT PRIMARY KEY,
              \`branch_id\` INT NOT NULL,
              \`date\` DATE NOT NULL,
              \`stove_id\` INT NOT NULL,
              \`opening_stock\` INT DEFAULT 0,
              \`closing_stock\` INT DEFAULT 0,
              UNIQUE KEY \`unique_branch_date_stove\` (\`branch_id\`, \`date\`, \`stove_id\`),
              FOREIGN KEY (\`stove_id\`) REFERENCES \`stoves\` (\`id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        await db.query(query);
        console.log('Table "inventory" created or already exists.');
    } catch (err) {
        console.error('Error creating table:', err);
    } finally {
        process.exit(0);
    }
}

createTable();
