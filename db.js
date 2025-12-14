const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbFile = path.join(__dirname, 'data.sqlite');
const db = new sqlite3.Database(dbFile);


function initDb() {
// users
db.run(`CREATE TABLE IF NOT EXISTS users (
id INTEGER PRIMARY KEY AUTOINCREMENT,
name TEXT,
email TEXT UNIQUE,
password_hash TEXT,
balance REAL DEFAULT 0,
is_admin INTEGER DEFAULT 0
)`);


// bets
  db.run(`CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    numbers TEXT,
    amount REAL,
    status TEXT,
    created_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);


// transactions (topup, withdraw, payout)
db.run(`CREATE TABLE IF NOT EXISTS transactions (
id TEXT PRIMARY KEY,
user_id INTEGER,
type TEXT,
amount REAL,
status TEXT,
reference TEXT,
created_at TEXT
)`);


// results
db.run(`CREATE TABLE IF NOT EXISTS results (
id TEXT PRIMARY KEY,
numbers TEXT,
created_at TEXT
)`);
}



module.exports = { initDb, db };