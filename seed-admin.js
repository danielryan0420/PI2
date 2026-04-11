// One-time script to create the admin user
// Run from Physical_Inventory folder: node seed-admin.js
const path = require('path');
const { SqliteDatabase } = require('./server/node_modules/node-sqlite3-wasm');

const dbPath = path.join(__dirname, 'server', 'inventory.db');
console.log('Opening database at:', dbPath);

const db = new SqliteDatabase(dbPath);

try {
  db.exec("INSERT OR IGNORE INTO users (username, role) VALUES ('admin', 'admin')");
  const users = db.exec("SELECT id, username, role FROM users");
  console.log('Users in database:');
  console.table(users);
  console.log('\nDone! You can now log in with username: admin');
} catch (e) {
  console.error('Error:', e.message);
} finally {
  db.close();
}
