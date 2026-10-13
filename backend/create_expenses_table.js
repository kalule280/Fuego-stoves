require('dotenv').config();
const mysql = require('mysql2/promise');

async function createExpensesTable() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('Connected to MySQL database.');

        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS expenses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                branch_id INT,
                category VARCHAR(50),
                description TEXT,
                amount DECIMAL(12,2),
                date DATE,
                created_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `;

        await connection.query(createTableQuery);
        console.log('Expenses table created successfully.');

        await connection.end();
    } catch (error) {
        console.error('Error creating expenses table:', error);
    }
}

createExpensesTable();
