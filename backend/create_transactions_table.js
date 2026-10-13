require('dotenv').config();
const db = require('./db');

async function createTable() {
    try {
        const query = `
            CREATE TABLE IF NOT EXISTS \`transactions\` (
              \`id\` VARCHAR(50) PRIMARY KEY,
              \`branch_id\` INT NOT NULL,
              \`record_date\` DATE NOT NULL,
              \`stove_id\` INT NOT NULL,
              \`type\` VARCHAR(20) NOT NULL,
              \`qty\` INT NOT NULL,
              \`price\` INT DEFAULT 0,
              \`notes\` TEXT,
              \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (\`stove_id\`) REFERENCES \`stoves\` (\`id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        await db.query(query);
        console.log('Table "transactions" created or already exists.');
    } catch (err) {
        console.error('Error creating table:', err);
    } finally {
        process.exit(0);
    }
}

createTable();
