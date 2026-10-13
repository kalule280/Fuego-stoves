require('dotenv').config();
const db = require('./db');
const bcrypt = require('bcryptjs');

async function createUsersTable() {
    try {
        const queryUsers = `
            CREATE TABLE IF NOT EXISTS \`users\` (
              \`id\` INT AUTO_INCREMENT PRIMARY KEY,
              \`name\` VARCHAR(100),
              \`username\` VARCHAR(50) UNIQUE NOT NULL,
              \`password_hash\` VARCHAR(255) NOT NULL,
              \`role\` VARCHAR(20) DEFAULT 'staff',
              \`branch_id\` INT,
              \`profile_photo_url\` VARCHAR(255),
              \`active\` TINYINT(1) NOT NULL DEFAULT 1,
              \`last_login\` TIMESTAMP NULL DEFAULT NULL,
              \`created_by\` INT,
              \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await db.query(queryUsers);
        const [columns] = await db.query('SHOW COLUMNS FROM users');
        const existingColumns = new Set(columns.map((column) => column.Field));
        const requiredColumns = [
            ['profile_photo_url', 'VARCHAR(255) NULL'],
            ['active', 'TINYINT(1) NOT NULL DEFAULT 1'],
            ['last_login', 'TIMESTAMP NULL DEFAULT NULL'],
            ['created_by', 'INT']
        ];
        for (const [name, definition] of requiredColumns) {
            if (!existingColumns.has(name)) {
                await db.query(`ALTER TABLE users ADD COLUMN \`${name}\` ${definition}`);
            }
        }
        console.log('Users table checked/created successfully.');

        // Check if admin user already exists
        const [rows] = await db.query('SELECT * FROM users WHERE username = ?', ['admin']);
        
        if (rows.length === 0) {
            console.log('No admin user found. Creating default users...');
            
            // Hash default passwords
            const saltRounds = 10;
            const adminPasswordHash = await bcrypt.hash('admin123', saltRounds);
            const staffPasswordHash = await bcrypt.hash('staff123', saltRounds);

            // Insert default Admin
            await db.query(`
                INSERT INTO users (name, username, password_hash, role, branch_id)
                VALUES (?, ?, ?, ?, ?)
            `, ['Boss / Admin', 'admin', adminPasswordHash, 'admin', 1]);

            // Insert default Staff
            await db.query(`
                INSERT INTO users (name, username, password_hash, role, branch_id)
                VALUES (?, ?, ?, ?, ?)
            `, ['Staff Member', 'staff', staffPasswordHash, 'staff', 1]);

            console.log('Default users created:');
            console.log('Admin -> username: admin, password: admin123');
            console.log('Staff -> username: staff, password: staff123');
        } else {
            console.log('Users already exist in the database, skipping defaults creation.');
        }

    } catch (err) {
        console.error('Error creating users table:', err);
    } finally {
        process.exit();
    }
}

createUsersTable();
