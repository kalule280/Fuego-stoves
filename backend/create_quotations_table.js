require('dotenv').config();
const db = require('./db');

async function createTables() {
    try {
        const queryQuotations = `
            CREATE TABLE IF NOT EXISTS \`quotations\` (
              \`id\` VARCHAR(50) PRIMARY KEY,
              \`branch_id\` INT NOT NULL,
              \`date\` DATE NOT NULL,
              \`type\` VARCHAR(20) NOT NULL,
              \`customer\` VARCHAR(100) DEFAULT NULL,
              \`phone\` VARCHAR(50) DEFAULT NULL,
              \`address\` VARCHAR(255) DEFAULT NULL,
              \`notes\` TEXT DEFAULT NULL,
              \`amount_paid\` VARCHAR(50) DEFAULT NULL,
              \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await db.query(queryQuotations);
        console.log("Table 'quotations' created or already exists.");

        const queryItems = `
            CREATE TABLE IF NOT EXISTS \`quotation_items\` (
              \`id\` INT AUTO_INCREMENT PRIMARY KEY,
              \`quotation_id\` VARCHAR(50) NOT NULL,
              \`item_name\` VARCHAR(255) NOT NULL,
              \`qty\` INT NOT NULL,
              \`price\` VARCHAR(50) NOT NULL,
              \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (\`quotation_id\`) REFERENCES \`quotations\`(\`id\`) ON DELETE CASCADE
            )
        `;
        await db.query(queryItems);
        console.log("Table 'quotation_items' created or already exists.");

    } catch (error) {
        console.error("Error creating tables:", error);
    } finally {
        process.exit();
    }
}

createTables();
