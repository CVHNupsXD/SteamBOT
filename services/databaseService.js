// ========================================
// services/databaseService.js
// ========================================
const Database = require('better-sqlite3');
const Logger = require('../utils/logger');

class DatabaseService {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initTables();
    Logger.success('System', 'Database initialized');
  }

  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        recovery_code TEXT,
        shared_secret TEXT,
        identity_secret TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        refresh_token TEXT,
        session_id TEXT,
        steam_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS inventory_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        app_id INTEGER NOT NULL,
        context_id INTEGER NOT NULL,
        inventory_data TEXT NOT NULL,
        cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        UNIQUE(account_id, app_id, context_id)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.setSettingDefault('trade_link', '');
    this.setSettingDefault('login_delay', '5000');
    this.setSettingDefault('login_mode', 'queue');
  }

  addAccount(accountData) {
    const stmt = this.db.prepare(`
      INSERT INTO accounts (username, password, email, recovery_code, shared_secret, identity_secret)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    try {
      const result = stmt.run(
        accountData.username,
        accountData.password,
        accountData.email || null,
        accountData.recoveryCode || null,
        accountData.sharedSecret || null,
        accountData.identitySecret || null
      );
      return result.lastInsertRowid;
    } catch (error) {
      Logger.error('Database', `Failed to add account: ${error.message}`);
      return null;
    }
  }

  getAccount(username) {
    const stmt = this.db.prepare('SELECT * FROM accounts WHERE username = ?');
    return stmt.get(username);
  }

  getAllAccounts() {
    const stmt = this.db.prepare('SELECT * FROM accounts ORDER BY id');
    return stmt.all();
  }

  updateAccount(username, updates) {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(username);
    
    const stmt = this.db.prepare(`
      UPDATE accounts 
      SET ${fields}, updated_at = CURRENT_TIMESTAMP 
      WHERE username = ?
    `);
    
    return stmt.run(...values);
  }

  deleteAccount(username) {
    const stmt = this.db.prepare('DELETE FROM accounts WHERE username = ?');
    return stmt.run(username);
  }

  saveSession(username, sessionData) {
    const account = this.getAccount(username);
    if (!account) return null;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions (account_id, refresh_token, session_id, steam_id, expires_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now', '+30 days'), CURRENT_TIMESTAMP)
    `);

    try {
      return stmt.run(
        account.id,
        sessionData.refreshToken || null,
        sessionData.sessionId || null,
        sessionData.steamId || null
      );
    } catch (error) {
      Logger.error('Database', `Failed to save session: ${error.message}`);
      return null;
    }
  }

  getSession(username) {
    const account = this.getAccount(username);
    if (!account) return null;

    const stmt = this.db.prepare(`
      SELECT * FROM sessions 
      WHERE account_id = ? AND expires_at > datetime('now')
      ORDER BY updated_at DESC LIMIT 1
    `);
    
    return stmt.get(account.id);
  }

  deleteSession(username) {
    const account = this.getAccount(username);
    if (!account) return null;

    const stmt = this.db.prepare('DELETE FROM sessions WHERE account_id = ?');
    return stmt.run(account.id);
  }

  saveInventoryCache(username, appId, contextId, inventoryData) {
    const account = this.getAccount(username);
    if (!account) return null;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO inventory_cache (account_id, app_id, context_id, inventory_data, cached_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    try {
      return stmt.run(account.id, appId, contextId, JSON.stringify(inventoryData));
    } catch (error) {
      Logger.error('Database', `Failed to save inventory cache: ${error.message}`);
      return null;
    }
  }

  getInventoryCache(username, appId, contextId, maxAge = 5 * 60 * 1000) {
    const account = this.getAccount(username);
    if (!account) return null;

    const stmt = this.db.prepare(`
      SELECT inventory_data, cached_at FROM inventory_cache 
      WHERE account_id = ? AND app_id = ? AND context_id = ?
      AND cached_at > datetime('now', '-${Math.floor(maxAge / 1000)} seconds')
    `);

    const result = stmt.get(account.id, appId, contextId);
    if (!result) return null;

    try {
      return JSON.parse(result.inventory_data);
    } catch (error) {
      Logger.error('Database', `Failed to parse inventory cache: ${error.message}`);
      return null;
    }
  }

  clearInventoryCache(username = null) {
    if (username) {
      const account = this.getAccount(username);
      if (!account) return null;
      const stmt = this.db.prepare('DELETE FROM inventory_cache WHERE account_id = ?');
      return stmt.run(account.id);
    } else {
      const stmt = this.db.prepare('DELETE FROM inventory_cache');
      return stmt.run();
    }
  }

  setSetting(key, value) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);
    return stmt.run(key, String(value));
  }

  setSettingDefault(key, defaultValue) {
    const existing = this.getSetting(key);
    if (existing === null) {
      this.setSetting(key, defaultValue);
    }
  }

  getSetting(key) {
    const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    const result = stmt.get(key);
    return result ? result.value : null;
  }

  getAllSettings() {
    const stmt = this.db.prepare('SELECT key, value FROM settings');
    const rows = stmt.all();
    return rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  }

  cleanupExpiredSessions() {
    const stmt = this.db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')");
    const result = stmt.run();
    if (result.changes > 0) {
      Logger.info('Database', `Cleaned up ${result.changes} expired sessions`);
    }
  }

  cleanupOldInventoryCache(maxAge = 24 * 60 * 60 * 1000) {
    const stmt = this.db.prepare(`
      DELETE FROM inventory_cache 
      WHERE cached_at < datetime('now', '-${Math.floor(maxAge / 1000)} seconds')
    `);
    const result = stmt.run();
    if (result.changes > 0) {
      Logger.info('Database', `Cleaned up ${result.changes} old inventory caches`);
    }
  }

  close() {
    this.db.close();
    Logger.info('Database', 'Database connection closed');
  }
}

module.exports = DatabaseService;