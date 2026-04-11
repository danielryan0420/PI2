// One-time script to create the admin user
// Run from Physical_Inventory folder: node seed-admin.js
const path = require('path');
const { Database } = require('./node_modules/node-sqlite3-wasm');

const dbPath = path.join(__dirname, 'server', 'inventory.db');
console.log('Opening database at:', dbPath);

const db = new Database(dbPath);

try {
  db.exec("INSERT OR IGNORE INTO users (username, role) VALUES ('admin', 'admin')");
  const stmt = db.prepare("SELECT id, username, role FROM users");
  const users = stmt.all([]);
  console.log('\nUsers in database:');
  users.forEach(u => console.log(' -', u));
  console.log('\nDone! You can now log in with username: admin');
} catch (e) {
  console.error('Error:', e.message || e);
} finally {
  db.close();
}
