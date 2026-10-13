const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./db');

async function logActivity(req, action, details = "") {
    try {
        await db.query(
            "INSERT INTO activity_logs (user_id, username, branch_id, action, details) VALUES (?,?,?,?,?)",
            [req.user.id, req.user.username, req.user.branch_id || null, action, details]
        );
    } catch (e) {
        console.error("logActivity failed", e);
    }
}

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');

const JWT_SECRET = process.env.JWT_SECRET || 'fuego-secret-key-12345';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// --- Multer Configuration ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public/uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });
const profilePhotoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public/uploads'));
    },
    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        cb(null, `profile-${Date.now()}-${Math.round(Math.random() * 1E9)}${extension}`);
    }
});
const photoExtensions = new Map([
    ['image/jpeg', new Set(['.jpg', '.jpeg'])],
    ['image/png', new Set(['.png'])],
    ['image/webp', new Set(['.webp'])]
]);
const uploadProfilePhoto = multer({
    storage: profilePhotoStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const validExtensions = photoExtensions.get(file.mimetype);
        if (!validExtensions || !validExtensions.has(path.extname(file.originalname).toLowerCase())) {
            return cb(new Error('Upload a JPEG, PNG, or WebP image'));
        }
        cb(null, true);
    }
});
const handleProfilePhotoUpload = (req, res, next) => {
    uploadProfilePhoto.single('photo')(req, res, (error) => {
        if (!error) return next();
        const message = error.code === 'LIMIT_FILE_SIZE'
            ? 'Profile photos must be 5 MB or smaller'
            : error.message;
        res.status(400).json({ error: message || 'Failed to upload profile photo' });
    });
};

const ensureLoginHistoryTable = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS user_login_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            username VARCHAR(50) NOT NULL,
            branch_id INT NULL,
            login_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_login_history_user_date (user_id, login_at)
        )
    `);
};

const ensurePurchasesTable = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS purchases (
            id INT AUTO_INCREMENT PRIMARY KEY,
            branch_id INT NOT NULL,
            item_name VARCHAR(150) NOT NULL,
            category ENUM('material', 'stock') NOT NULL DEFAULT 'material',
            quantity DECIMAL(12,2) NOT NULL,
            unit_cost DECIMAL(12,2) NOT NULL,
            total_cost DECIMAL(14,2) NOT NULL,
            supplier VARCHAR(150) NULL,
            notes TEXT NULL,
            purchase_date DATE NOT NULL,
            created_by INT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            voided TINYINT(1) NOT NULL DEFAULT 0,
            INDEX idx_purchases_branch_date (branch_id, purchase_date),
            INDEX idx_purchases_created_by (created_by)
        )
    `);
};

const ensureUserProfilePhotoColumn = async () => {
    const [columns] = await db.query('SHOW COLUMNS FROM users');
    if (!columns.some((column) => column.Field === 'profile_photo_url')) {
        await db.query('ALTER TABLE users ADD COLUMN profile_photo_url VARCHAR(255) NULL');
    }
};

const judgeMonthlyPerformance = (current, previous, isCurrentMonth) => {
    if (current.net > 0) {
        return previous && current.net > previous.net
            ? { status: 'profit', message: 'Profit, and better than last month.' }
            : { status: 'profit', message: 'The business made a profit this month.' };
    }
    if (isCurrentMonth && current.revenue > 0) {
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const projectedRevenue = (current.revenue / now.getDate()) * daysInMonth;
        if (projectedRevenue - current.costs > 0) {
            return {
                status: 'promising',
                message: 'Loss so far, but at the current sales pace the month should end in profit.'
            };
        }
    }
    return { status: 'loss', message: 'Spending is higher than sales this month.' };
};

// --- Auth Endpoints ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        
        const user = users[0];
        if (!user.active) {
            return res.status(403).json({ error: 'This account is locked. Contact an administrator.' });
        }
        const isMatch = await bcrypt.compare(password, user.password_hash);
        
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
        await db.query(
            'INSERT INTO user_login_history (user_id, username, branch_id) VALUES (?, ?, ?)',
            [user.id, user.username, user.branch_id || null]
        );
        
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, branch_id: user.branch_id }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );
        
        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                branch_id: user.branch_id,
                profile_photo_url: user.profile_photo_url || null
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Auth Middleware ---
const requireAuth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });
    
    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        try {
            const [[user]] = await db.query('SELECT active, role, username, branch_id FROM users WHERE id = ?', [decoded.id]);
            if (!user) {
                return res.status(401).json({ error: 'Unauthorized: Account no longer exists' });
            }
            if (!user.active) {
                return res.status(403).json({ error: 'This account is locked. Contact an administrator.' });
            }
            req.user = {
                ...decoded,
                role: user.role,
                username: user.username,
                branch_id: user.branch_id
            };
            next();
        } catch (error) {
            console.error('Error validating authenticated user:', error);
            res.status(500).json({ error: 'Failed to validate account status' });
        }
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: Admins only' });
    }
    next();
};

const authorizeProfilePhotoUpload = (req, res, next) => {
    const targetUserId = Number(req.params.id);
    if (!Number.isInteger(targetUserId) || targetUserId < 1) {
        return res.status(400).json({ error: 'Invalid user id' });
    }
    if (targetUserId !== Number(req.user.id) && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'You can only change your own profile photo' });
    }
    next();
};

// --- User Management Endpoints ---
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT u.id, u.name, u.username, u.role, u.branch_id, u.active, u.last_login, u.created_at,
                u.profile_photo_url,
                COALESCE(login_counts.login_count, 0) AS login_count
             FROM users u
             LEFT JOIN (
                SELECT user_id, COUNT(*) AS login_count
                FROM user_login_history
                GROUP BY user_id
             ) login_counts ON login_counts.user_id = u.id
             ORDER BY u.id DESC`
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.post('/api/users/:id/photo', requireAuth, authorizeProfilePhotoUpload, handleProfilePhotoUpload, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id < 1) {
            if (req.file) await fs.unlink(req.file.path);
            return res.status(400).json({ error: 'Invalid user id' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Choose a profile photo to upload' });
        }

        const [[existingUser]] = await db.query(
            'SELECT id, profile_photo_url FROM users WHERE id = ?',
            [id]
        );
        if (!existingUser) {
            await fs.unlink(req.file.path);
            return res.status(404).json({ error: 'User not found' });
        }

        const photoUrl = `/uploads/${req.file.filename}`;
        const [result] = await db.query('UPDATE users SET profile_photo_url = ? WHERE id = ?', [photoUrl, id]);
        if (!result.affectedRows && existingUser.profile_photo_url !== photoUrl) {
            throw new Error('Profile photo update did not affect the user record');
        }
        if (existingUser.profile_photo_url?.startsWith('/uploads/profile-')) {
            const previousFilename = path.basename(existingUser.profile_photo_url);
            if (previousFilename === existingUser.profile_photo_url.slice('/uploads/'.length)) {
                try {
                    await fs.unlink(path.join(__dirname, 'public/uploads', previousFilename));
                } catch (cleanupError) {
                    if (cleanupError.code !== 'ENOENT') {
                        console.error('Failed to remove previous profile photo:', cleanupError);
                    }
                }
            }
        }
        res.json({ ok: true, profile_photo_url: photoUrl });
    } catch (error) {
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            } catch (cleanupError) {
                if (cleanupError.code !== 'ENOENT') {
                    console.error('Failed to clean up profile photo:', cleanupError);
                }
            }
        }
        console.error('Error saving profile photo:', error);
        res.status(500).json({ error: 'Failed to save profile photo' });
    }
});

app.get('/api/users/:id/login-history', requireAuth, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id < 1) {
            return res.status(400).json({ error: 'Invalid user id' });
        }

        const [[user]] = await db.query('SELECT id, username FROM users WHERE id = ?', [id]);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const [[summary]] = await db.query(
            'SELECT COUNT(*) AS login_count FROM user_login_history WHERE user_id = ?',
            [id]
        );
        const [logins] = await db.query(
            'SELECT login_at, branch_id FROM user_login_history WHERE user_id = ? ORDER BY login_at DESC LIMIT 100',
            [id]
        );
        res.json({ login_count: summary.login_count, logins });
    } catch (error) {
        console.error('Error fetching user login history:', error);
        res.status(500).json({ error: 'Failed to fetch user login history' });
    }
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { name, username, password, role = 'staff', branch_id } = req.body;
        if (typeof name !== 'string' || !name.trim()
            || typeof username !== 'string' || !username.trim()
            || typeof password !== 'string' || password.length < 6) {
            return res.status(400).json({ error: 'Name, username and a password of 6+ characters are required' });
        }
        if (!['admin', 'staff'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        const [existingUsers] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
        if (existingUsers.length) {
            return res.status(409).json({ error: 'Username already taken' });
        }

        const hash = await bcrypt.hash(password, 10);
        await db.query(
            'INSERT INTO users (name, username, password_hash, role, branch_id, created_by) VALUES (?, ?, ?, ?, ?, ?)',
            [name, username, hash, role, branch_id || req.user.branch_id || 1, req.user.id]
        );
        res.json({ ok: true });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Username already taken' });
        }
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

app.put('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
    let connection;
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id < 1) {
            return res.status(400).json({ error: 'Invalid user id' });
        }

        const { name, username, password, role, branch_id, active } = req.body;
        if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
            return res.status(400).json({ error: 'Name cannot be empty' });
        }
        if (username !== undefined && (typeof username !== 'string' || !username.trim())) {
            return res.status(400).json({ error: 'Username cannot be empty' });
        }
        if (password !== undefined && password !== '' && (typeof password !== 'string' || password.length < 6)) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        if (role !== undefined && !['admin', 'staff'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }
        if (branch_id !== undefined && (!Number.isInteger(Number(branch_id)) || Number(branch_id) < 1)) {
            return res.status(400).json({ error: 'Invalid branch id' });
        }
        if (active !== undefined && ![true, false, 0, 1].includes(active)) {
            return res.status(400).json({ error: 'Invalid account status' });
        }
        if (id === Number(req.user.id) && active !== undefined && !Boolean(active)) {
            return res.status(400).json({ error: 'You cannot lock your own account' });
        }
        if (id === Number(req.user.id) && role !== undefined && role !== 'admin') {
            return res.status(400).json({ error: 'You cannot remove your own administrator role' });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();
        const [[targetUser]] = await connection.query(
            'SELECT id, role, active FROM users WHERE id = ? FOR UPDATE',
            [id]
        );
        if (!targetUser) {
            await connection.rollback();
            return res.status(404).json({ error: 'User not found' });
        }

        const nextRole = role ?? targetUser.role;
        const nextActive = active === undefined ? Boolean(targetUser.active) : Boolean(active);
        if (targetUser.role === 'admin' && targetUser.active && (nextRole !== 'admin' || !nextActive)) {
            const [activeAdmins] = await connection.query(
                "SELECT id FROM users WHERE role = 'admin' AND active = 1 FOR UPDATE"
            );
            if (activeAdmins.length <= 1) {
                await connection.rollback();
                return res.status(409).json({ error: 'The last active administrator cannot be locked or demoted' });
            }
        }

        if (username) {
            const [existingUsers] = await connection.query(
                'SELECT id FROM users WHERE username = ? AND id != ?',
                [username.trim(), id]
            );
            if (existingUsers.length) {
                await connection.rollback();
                return res.status(409).json({ error: 'Username already taken' });
            }
        }

        const updates = [];
        const values = [];
        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        if (username !== undefined) {
            updates.push('username = ?');
            values.push(username.trim());
        }
        if (role !== undefined) {
            updates.push('role = ?');
            values.push(role);
        }
        if (branch_id !== undefined) {
            updates.push('branch_id = ?');
            values.push(Number(branch_id));
        }
        if (active !== undefined) {
            updates.push('active = ?');
            values.push(Number(Boolean(active)));
        }
        if (password) {
            updates.push('password_hash = ?');
            values.push(await bcrypt.hash(password, 10));
        }
        if (!updates.length) {
            await connection.rollback();
            return res.status(400).json({ error: 'At least one user field is required' });
        }

        values.push(id);
        await connection.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
        await connection.commit();
        res.json({ ok: true });
    } catch (error) {
        if (connection) await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Username already taken' });
        }
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user' });
    } finally {
        if (connection) connection.release();
    }
});

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
    let connection;
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id < 1) {
            return res.status(400).json({ error: 'Invalid user id' });
        }
        if (id === Number(req.user.id)) {
            return res.status(400).json({ error: 'You cannot delete your own account' });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();
        const [[targetUser]] = await connection.query(
            'SELECT id, username, role, active, profile_photo_url FROM users WHERE id = ? FOR UPDATE',
            [id]
        );
        if (!targetUser) {
            await connection.rollback();
            return res.status(404).json({ error: 'User not found' });
        }

        if (targetUser.role === 'admin' && targetUser.active) {
            const [activeAdmins] = await connection.query(
                "SELECT id FROM users WHERE role = 'admin' AND active = 1 FOR UPDATE"
            );
            if (activeAdmins.length <= 1) {
                await connection.rollback();
                return res.status(409).json({ error: 'The last active administrator cannot be deleted' });
            }
        }

        await connection.query('DELETE FROM users WHERE id = ?', [id]);
        await connection.commit();
        if (targetUser.profile_photo_url?.startsWith('/uploads/profile-')) {
            const filename = path.basename(targetUser.profile_photo_url);
            if (filename === targetUser.profile_photo_url.slice('/uploads/'.length)) {
                try {
                    await fs.unlink(path.join(__dirname, 'public/uploads', filename));
                } catch (cleanupError) {
                    if (cleanupError.code !== 'ENOENT') {
                        console.error('Failed to remove deleted user profile photo:', cleanupError);
                    }
                }
            }
        }
        await logActivity(req, 'USER_DELETED', `user #${id} (${targetUser.username})`);
        res.json({ ok: true });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    } finally {
        if (connection) connection.release();
    }
});

// Test API endpoint to fetch stoves catalog
app.get('/api/stoves', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM stoves');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch stoves' });
    }
});

// POST route to add a new stove product to the catalog
app.post('/api/stoves', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { name, price } = req.body;
        const numericPrice = Number(price);
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 100
            || price === undefined || price === null || price === ''
            || !Number.isFinite(numericPrice) || numericPrice < 0 || numericPrice > 99999999.99) {
            return res.status(400).json({ error: 'Name and price are required' });
        }
        const storedPrice = Math.round((numericPrice + Number.EPSILON) * 100) / 100;
        const [result] = await db.query(
            'INSERT INTO stoves (name, price) VALUES (?, ?)',
            [name.trim(), storedPrice]
        );
        res.json({ success: true, id: result.insertId, price: storedPrice, message: 'Product added successfully' });
    } catch (err) {
        console.error('Error adding stove:', err);
        res.status(500).json({ error: 'Failed to add product' });
    }
});

// POST route to upload image for a stove
app.post('/api/stoves/:id/image', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image uploaded' });
        }
        const stoveId = req.params.id;
        const imageUrl = `/uploads/${req.file.filename}`;
        
        await db.query('UPDATE stoves SET image_url = ? WHERE id = ?', [imageUrl, stoveId]);
        res.json({ success: true, image_url: imageUrl, message: 'Image uploaded successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

// PUT route to update stove name/price
app.put('/api/stoves/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const stoveId = Number(req.params.id);
        const { name, price } = req.body;
        const numericPrice = Number(price);
        if (!Number.isInteger(stoveId) || stoveId < 1) {
            return res.status(400).json({ error: 'Invalid stove id' });
        }
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 100
            || price === undefined || price === null || price === ''
            || !Number.isFinite(numericPrice) || numericPrice < 0 || numericPrice > 99999999.99) {
            return res.status(400).json({ error: 'A valid stove name and non-negative price are required' });
        }

        const storedPrice = Math.round((numericPrice + Number.EPSILON) * 100) / 100;
        const [result] = await db.query(
            'UPDATE stoves SET name = ?, price = ? WHERE id = ?',
            [name.trim(), storedPrice, stoveId]
        );
        if (!result.affectedRows) {
            const [[stove]] = await db.query('SELECT id FROM stoves WHERE id = ?', [stoveId]);
            if (!stove) {
                return res.status(404).json({ error: 'Stove not found' });
            }
        }
        res.json({ success: true, price: storedPrice, message: 'Stove updated successfully' });
    } catch (err) {
        console.error('Error updating stove:', err);
        res.status(500).json({ error: 'Failed to update stove' });
    }
});

// GET opening stock route (reads from daily_stove_inventory with auto-rollover logic)
app.get('/api/inventory/opening-stock', async (req, res) => {
    try {
        const { branch_id, date } = req.query;
        const targetBranchId = Number(branch_id) || 1;
        const targetDate = date || new Date().toISOString().slice(0, 10);
        
        const query = `
            SELECT s.id as stove_id, s.name, s.price, s.image_url,
                   i.id as inventory_record_id,
                   COALESCE(i.opening_stock, 
                            (SELECT prev.closing_stock 
                             FROM daily_stove_inventory prev 
                             WHERE prev.stove_id = s.id AND prev.branch_id = ? AND prev.record_date < ? 
                             ORDER BY prev.record_date DESC LIMIT 1), 
                            0) as opening_stock,
                   COALESCE(i.received_stock, 0) as received_stock,
                   COALESCE(i.sold_stock, 0) as sold_stock,
                   COALESCE(i.damaged_stock, 0) as damaged_stock,
                   COALESCE(i.returned_stock, 0) as returned_stock,
                   COALESCE(i.removed_stock, 0) as removed_stock,
                   COALESCE(i.closing_stock, 
                            (SELECT prev.closing_stock 
                             FROM daily_stove_inventory prev 
                             WHERE prev.stove_id = s.id AND prev.branch_id = ? AND prev.record_date < ? 
                             ORDER BY prev.record_date DESC LIMIT 1), 
                            0) as closing_stock
            FROM stoves s
            LEFT JOIN daily_stove_inventory i ON s.id = i.stove_id AND i.branch_id = ? AND i.record_date = ?
        `;
        
        const [rows] = await db.query(query, [
            targetBranchId, targetDate, 
            targetBranchId, targetDate, 
            targetBranchId, targetDate
        ]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch opening stock' });
    }
});

// POST inventory (Opening/Received stock save/update)
app.post('/api/inventory', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { branch_id, date, items } = req.body;

        if (!branch_id || !date || !items || !Array.isArray(items)) {
            return res.status(400).json({ error: 'Missing required fields: branch_id, date, or items array' });
        }

        for (let item of items) {
            const { stove_id, opening_stock, received_stock, closing_stock } = item;

            const query = `
                INSERT INTO daily_stove_inventory (branch_id, record_date, stove_id, opening_stock, received_stock, closing_stock)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    opening_stock = VALUES(opening_stock),
                    received_stock = VALUES(received_stock),
                    closing_stock = VALUES(closing_stock)
            `;

            await db.query(query, [branch_id, date, stove_id, opening_stock || 0, received_stock || 0, closing_stock || 0]);
        }

        res.json({ success: true, message: 'Inventory saved successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save inventory data' });
    }
});

app.delete('/api/inventory/:branchId/:date/:stoveId', requireAuth, requireAdmin, async (req, res) => {
    try {
        const branchId = Number(req.params.branchId);
        const stoveId = Number(req.params.stoveId);
        const { date } = req.params;
        const parsedDate = new Date(`${date}T00:00:00Z`);
        if (!Number.isInteger(branchId) || branchId < 1
            || !Number.isInteger(stoveId) || stoveId < 1
            || !/^\d{4}-\d{2}-\d{2}$/.test(date)
            || Number.isNaN(parsedDate.getTime())
            || parsedDate.toISOString().slice(0, 10) !== date) {
            return res.status(400).json({ error: 'Invalid branch, date, or stove id' });
        }

        const [result] = await db.query(
            'DELETE FROM daily_stove_inventory WHERE branch_id = ? AND record_date = ? AND stove_id = ?',
            [branchId, date, stoveId]
        );
        if (!result.affectedRows) {
            return res.status(404).json({ error: 'No stock record exists for this branch, date, and stove' });
        }
        res.json({ success: true, message: 'Stock record deleted successfully' });
    } catch (error) {
        console.error('Error deleting stock record:', error);
        res.status(500).json({ error: 'Failed to delete stock record' });
    }
});

// POST record transaction and update stock levels
app.post('/api/transaction', requireAuth, async (req, res) => {
    try {
        const { branch_id, date, stove_id, type, qty, is_cancel, transaction_id, price, notes, staff_name } = req.body;

        if (!branch_id || !date || !stove_id || !type || qty === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // 1. Fetch rollover opening stock if not already recorded for today
        const rolloverQuery = `
            SELECT closing_stock 
            FROM daily_stove_inventory 
            WHERE stove_id = ? AND branch_id = ? AND record_date < ? 
            ORDER BY record_date DESC LIMIT 1
        `;
        const [rolloverRows] = await db.query(rolloverQuery, [stove_id, branch_id, date]);
        const openingStock = rolloverRows.length > 0 ? rolloverRows[0].closing_stock : 0;

        // 2. Map type to stock columns
        const finalQty = is_cancel ? -qty : qty;
        let sold = 0, damaged = 0, returned = 0, removed = 0;
        if (type === 'sale') sold = finalQty;
        else if (type === 'damaged') damaged = finalQty;
        else if (type === 'returned') returned = finalQty;
        else if (type === 'removed') removed = finalQty;

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

        // 3. Recalculate closing_stock after the transaction
        const updateClosingQuery = `
            UPDATE daily_stove_inventory 
            SET closing_stock = COALESCE(opening_stock, 0) + COALESCE(received_stock, 0) + COALESCE(returned_stock, 0) 
                                - COALESCE(sold_stock, 0) - COALESCE(damaged_stock, 0) - COALESCE(removed_stock, 0)
            WHERE branch_id = ? AND record_date = ? AND stove_id = ?
        `;
        await db.query(updateClosingQuery, [branch_id, date, stove_id]);

        // 4. Update the transactions history log
        if (is_cancel && transaction_id) {
            // Only admins can delete/cancel transactions
            if (req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Only admins can delete transactions.' });
            }
            await db.query('DELETE FROM transactions WHERE id = ?', [transaction_id]);
        } else if (!is_cancel) {
            const txId = transaction_id || `TRX-${Math.floor(1000 + Math.random() * 9000)}`;
            const txPrice = price || 0;
            const txNotes = notes || '';
            await db.query(`
                INSERT INTO transactions (id, branch_id, record_date, stove_id, type, qty, price, notes, created_by, staff_name)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [txId, branch_id, date, stove_id, type, qty, txPrice, txNotes, req.user.id, staff_name || null]);
        }

        res.json({ success: true, message: 'Transaction recorded and inventory updated successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to record transaction', details: err.message, stack: err.stack });
    }
});

// GET transactions history for a specific branch and date
app.get('/api/transactions', async (req, res) => {
    try {
        const { branch_id, date } = req.query;
        if (!branch_id || !date) {
            return res.status(400).json({ error: 'Missing required query parameters' });
        }

        const query = `
            SELECT t.*, s.name as stoveName, u.name as created_by_name 
            FROM transactions t
            LEFT JOIN stoves s ON t.stove_id = s.id
            LEFT JOIN users u ON t.created_by = u.id
            WHERE t.branch_id = ? AND t.record_date = ?
            ORDER BY t.created_at DESC
        `;
        const [rows] = await db.query(query, [branch_id, date]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// PUT confirm transaction (Admin only)
app.put('/api/transactions/:id/confirm', requireAuth, requireAdmin, async (req, res) => {
    try {
        const txId = req.params.id;
        
        // 1. Get the transaction details
        const [txRows] = await db.query('SELECT * FROM transactions WHERE id = ?', [txId]);
        if (txRows.length === 0) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        const tx = txRows[0];
        
        if (tx.status === 'confirmed') {
            return res.status(400).json({ error: 'Transaction already confirmed' });
        }
        
        // 2. Update status to confirmed
        await db.query('UPDATE transactions SET status = ? WHERE id = ?', ['confirmed', txId]);
        
        // 3. Insert into expenses as income (if it's a sale)
        if (tx.type === 'sale' && tx.price > 0 && tx.qty > 0) {
            const amount = tx.price * tx.qty;
            const description = `Sale - Stove ID: ${tx.stove_id} (Qty: ${tx.qty})`;
            
            await db.query(`
                INSERT INTO expenses (branch_id, category, description, amount, date, created_by, type)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [tx.branch_id, 'sales', description, amount, tx.record_date, req.user.id, 'income']);
        }
        
        res.json({ success: true, message: 'Transaction confirmed successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to confirm transaction' });
    }
});

// QUOTATIONS & RECEIPTS ENDPOINTS

app.get('/api/quotations', requireAuth, async (req, res) => {
    try {
        const { branch_id } = req.query;
        let query = `
            SELECT q.*, qi.id as item_id, qi.item_name, qi.qty, qi.price as item_price, u.name as created_by_name
            FROM quotations q
            LEFT JOIN quotation_items qi ON q.id = qi.quotation_id
            LEFT JOIN users u ON q.created_by = u.id
        `;
        let params = [];
        if (branch_id) {
            query += ' WHERE q.branch_id = ?';
            params.push(branch_id);
        }
        query += ' ORDER BY q.created_at DESC';

        const [rows] = await db.query(query, params);
        
        // Group items by quotation
        const quotationsMap = {};
        rows.forEach(row => {
            if (!quotationsMap[row.id]) {
                const total = Number(row.amount_paid || 0);
                const derivedStatus = row.type === 'receipt'
                    ? (Number(row.amount_paid || 0) > 0 ? 'Paid' : 'Unpaid')
                    : (row.status || 'Draft');
                quotationsMap[row.id] = {
                    id: row.id,
                    branch_id: row.branch_id,
                    date: row.date,
                    type: row.type,
                    customer: row.customer,
                    phone: row.phone,
                    address: row.address,
                    notes: row.notes,
                    amount_paid: row.amount_paid,
                    status: row.status || derivedStatus,
                    created_at: row.created_at,
                    created_by_name: row.created_by_name,
                    items: []
                };
            }
            if (row.item_id) {
                quotationsMap[row.id].items.push({
                    item: row.item_name,
                    qty: row.qty,
                    price: row.item_price
                });
            }
        });

        res.json(Object.values(quotationsMap));
    } catch (error) {
        console.error("Error fetching quotations:", error);
        res.status(500).json({ error: 'Failed to fetch quotations' });
    }
});

app.post('/api/quotations', requireAuth, async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id, branch_id, date: rawDate, type, customer, phone, address, notes, amount_paid, items, status } = req.body;

        // Normalize date to YYYY-MM-DD format (frontend may send full ISO timestamp)
        const date = rawDate ? rawDate.split('T')[0] : new Date().toISOString().split('T')[0];

        // Check if this is an update (record already exists)
        const [existing] = await connection.query('SELECT id FROM quotations WHERE id = ?', [id]);
        if (existing.length > 0 && req.user.role !== 'admin') {
            await connection.rollback();
            connection.release();
            return res.status(403).json({ error: 'Only admins can edit existing quotations/receipts' });
        }

        const queryQuotation = `
            INSERT INTO quotations (id, branch_id, date, type, customer, phone, address, notes, amount_paid, status, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                date=VALUES(date), type=VALUES(type),
                customer=VALUES(customer), phone=VALUES(phone), address=VALUES(address), 
                notes=VALUES(notes), amount_paid=VALUES(amount_paid), status=VALUES(status)
        `;
        const itemsTotal = (items || []).reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.price || 0)), 0);
        const paidAmount = Number(amount_paid || 0);
        const derivedStatus = type === 'receipt'
            ? (paidAmount >= itemsTotal ? 'Paid' : (paidAmount > 0 ? 'Partially Paid' : 'Unpaid'))
            : 'Draft';
        const finalStatus = status || derivedStatus;
        await connection.query(queryQuotation, [id, branch_id, date, type, customer, phone, address, notes, amount_paid, finalStatus, req.user.id]);

        // Delete existing items for update
        await connection.query('DELETE FROM quotation_items WHERE quotation_id = ?', [id]);

        if (items && items.length > 0) {
            const queryItems = `INSERT INTO quotation_items (quotation_id, item_name, qty, price) VALUES ?`;
            const itemValues = items.map(item => [id, item.item, item.qty, item.price]);
            await connection.query(queryItems, [itemValues]);
        }

        await connection.commit();
        res.json({ message: 'Quotation saved successfully' });
    } catch (error) {
        await connection.rollback();
        console.error("Error saving quotation:", error);
        res.status(500).json({ error: 'Failed to save quotation' });
    } finally {
        connection.release();
    }
});

app.delete('/api/quotations/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM quotations WHERE id = ?', [id]);
        res.json({ message: 'Quotation deleted successfully' });
    } catch (error) {
        console.error("Error deleting quotation:", error);
        res.status(500).json({ error: 'Failed to delete quotation' });
    }
});

// EXPENSES / ACCOUNTING ENDPOINTS (Protected: Any authenticated user)

app.post('/api/purchases', requireAuth, requireAdmin, async (req, res) => {
    try {
        const {
            item_name,
            category = 'material',
            quantity,
            unit_cost,
            supplier,
            notes,
            purchase_date,
            branch_id
        } = req.body;
        const qty = Number(quantity);
        const cost = Number(unit_cost);
        const parsedDate = typeof purchase_date === 'string'
            ? new Date(`${purchase_date}T00:00:00Z`)
            : null;
        if (typeof item_name !== 'string' || !item_name.trim()
            || !Number.isFinite(qty) || qty <= 0
            || !Number.isFinite(cost) || cost < 0
            || !/^\d{4}-\d{2}-\d{2}$/.test(purchase_date || '')
            || !parsedDate || Number.isNaN(parsedDate.getTime())
            || parsedDate.toISOString().slice(0, 10) !== purchase_date) {
            return res.status(400).json({ error: 'Item, quantity, unit cost and a valid date are required' });
        }
        if (!['material', 'stock'].includes(category)) {
            return res.status(400).json({ error: 'Invalid category' });
        }

        const targetBranchId = Number(branch_id) || Number(req.user.branch_id) || 1;
        if (!Number.isInteger(targetBranchId) || targetBranchId < 1) {
            return res.status(400).json({ error: 'Invalid branch id' });
        }
        const total = qty * cost;
        await db.query(
            `INSERT INTO purchases
                (branch_id, item_name, category, quantity, unit_cost, total_cost, supplier, notes, purchase_date, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                targetBranchId,
                item_name.trim(),
                category,
                qty,
                cost,
                total,
                typeof supplier === 'string' && supplier.trim() ? supplier.trim() : null,
                typeof notes === 'string' && notes.trim() ? notes.trim() : null,
                purchase_date,
                req.user.id
            ]
        );
        await logActivity(req, 'PURCHASE', `${qty} x ${item_name.trim()} = ${total} UGX`);
        res.json({ ok: true });
    } catch (error) {
        console.error('Error recording purchase:', error);
        res.status(500).json({ error: 'Failed to record purchase' });
    }
});

app.get('/api/purchases', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { month } = req.query;
        if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
            return res.status(400).json({ error: 'A valid month in YYYY-MM format is required' });
        }
        const targetBranchId = Number(req.query.branch_id) || Number(req.user.branch_id) || 1;
        if (!Number.isInteger(targetBranchId) || targetBranchId < 1) {
            return res.status(400).json({ error: 'Invalid branch id' });
        }

        const [rows] = await db.query(
            `SELECT p.*, u.username AS created_by_name
             FROM purchases p
             LEFT JOIN users u ON u.id = p.created_by
             WHERE p.branch_id = ? AND DATE_FORMAT(p.purchase_date, '%Y-%m') = ?
             ORDER BY p.purchase_date DESC, p.id DESC`,
            [targetBranchId, month]
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching purchases:', error);
        res.status(500).json({ error: 'Failed to fetch purchases' });
    }
});

app.put('/api/purchases/:id/void', requireAuth, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id < 1) {
            return res.status(400).json({ error: 'Invalid purchase id' });
        }

        const [result] = await db.query(
            'UPDATE purchases SET voided = 1 WHERE id = ? AND voided = 0',
            [id]
        );
        if (!result.affectedRows) {
            const [[purchase]] = await db.query('SELECT id, voided FROM purchases WHERE id = ?', [id]);
            if (!purchase) {
                return res.status(404).json({ error: 'Purchase not found' });
            }
            return res.status(409).json({ error: 'Purchase is already voided' });
        }
        await logActivity(req, 'PURCHASE_VOIDED', `purchase #${id}`);
        res.json({ ok: true });
    } catch (error) {
        console.error('Error voiding purchase:', error);
        res.status(500).json({ error: 'Failed to void purchase' });
    }
});

app.get('/api/performance', requireAuth, requireAdmin, async (req, res) => {
    try {
        const branchId = Number(req.query.branch_id) || Number(req.user.branch_id) || 1;
        if (!Number.isInteger(branchId) || branchId < 1) {
            return res.status(400).json({ error: 'Invalid branch id' });
        }

        const now = new Date();
        const months = [];
        for (let offset = 5; offset >= 0; offset -= 1) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
            months.push(`${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`);
        }
        const firstDate = `${months[0]}-01`;
        const [accountingRows] = await db.query(
            `SELECT DATE_FORMAT(date, '%Y-%m') AS ym,
                    SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS revenue,
                    SUM(CASE WHEN type = 'income' THEN 0 ELSE amount END) AS expenses
             FROM expenses
             WHERE branch_id = ? AND date >= ?
             GROUP BY ym`,
            [branchId, firstDate]
        );
        const [purchaseRows] = await db.query(
            `SELECT DATE_FORMAT(purchase_date, '%Y-%m') AS ym, SUM(total_cost) AS total
             FROM purchases
             WHERE branch_id = ? AND voided = 0 AND purchase_date >= ?
             GROUP BY ym`,
            [branchId, firstDate]
        );

        const pick = (rows, month, field) => Number(rows.find((row) => row.ym === month)?.[field] || 0);
        const data = months.map((month) => {
            const revenue = pick(accountingRows, month, 'revenue');
            const expenses = pick(accountingRows, month, 'expenses');
            const purchases = pick(purchaseRows, month, 'total');
            const costs = purchases + expenses;
            return { month, revenue, purchases, expenses, costs, net: revenue - costs };
        });
        const current = data[data.length - 1];
        const previous = data[data.length - 2];
        res.json({
            months: data,
            current: {
                ...current,
                ...judgeMonthlyPerformance(current, previous, true)
            }
        });
    } catch (error) {
        console.error('Error calculating monthly performance:', error);
        res.status(500).json({ error: 'Failed to calculate monthly performance' });
    }
});

app.get('/api/expenses', requireAuth, async (req, res) => {
    try {
        const { branch_id, date } = req.query;
        let query = `
            SELECT e.*, u.username as created_by_name
            FROM expenses e
            LEFT JOIN users u ON e.created_by = u.id
            WHERE 1=1
        `;
        const params = [];
        if (branch_id) {
            query += ' AND e.branch_id = ?';
            params.push(branch_id);
        }
        if (date) {
            query += ' AND e.date = ?';
            params.push(date);
        }
        query += ' ORDER BY e.created_at DESC';

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error("Error fetching expenses:", error);
        res.status(500).json({ error: 'Failed to fetch expenses' });
    }
});

app.post('/api/expenses', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { branch_id, category, description, amount, date } = req.body;
        if (!branch_id || !category || !amount || !date) {
            return res.status(400).json({ error: 'Missing required fields: branch_id, category, amount, date' });
        }

        const created_by = req.user.id;
        const query = `
            INSERT INTO expenses (branch_id, category, description, amount, date, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        await db.query(query, [branch_id, category, description || '', amount, date, created_by]);
        res.json({ message: 'Expense recorded successfully' });
    } catch (error) {
        console.error("Error saving expense:", error);
        res.status(500).json({ error: 'Failed to save expense' });
    }
});

app.delete('/api/expenses/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM expenses WHERE id = ?', [id]);
        res.json({ message: 'Expense deleted successfully' });
    } catch (error) {
        console.error("Error deleting expense:", error);
        res.status(500).json({ error: 'Failed to delete expense' });
    }
});

const PORT = process.env.PORT || 5000;
Promise.all([
    fs.mkdir(path.join(__dirname, 'public/uploads'), { recursive: true }),
    ensureLoginHistoryTable(),
    ensurePurchasesTable(),
    ensureUserProfilePhotoColumn()
])
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch(async (error) => {
        console.error('Failed to initialize database tables:', error);
        await db.end();
        process.exitCode = 1;
    });
