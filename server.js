// ========================================
// server.js
// ========================================
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const config = require('./config/config');

const Logger = require('./utils/logger');

const DatabaseService = require('./services/databaseService');
const WebSocketService = require('./services/websocketService');
const InventoryService = require('./services/inventoryService');
const TradeService = require('./services/tradeService');

const BotManager = require('./services/botManager');

const accountRoutes = require('./routes/accounts');
const botRoutes = require('./routes/bots');
const inventoryRoutes = require('./routes/inventory');
const tradeRoutes = require('./routes/trade');
const settingsRoutes = require('./routes/settings');

const app = express();
const server = http.createServer(app);

app.use(express.json());

app.use('/dev', (req, res) => {
    res.redirect('/');
});

app.use(express.static(config.PUBLIC_DIR, {
    extensions: ['html', 'js', 'css']
}));


const SYSTEM_TMP = os.tmpdir();
config.POLL_DATA_DIR = path.join(SYSTEM_TMP, 'steambot_polldata');

const database = new DatabaseService(config.DATABASE_FILE);

setInterval(() => {
  database.cleanupExpiredSessions();
  database.cleanupOldInventoryCache();
}, 60 * 60 * 1000);

const websocketService = new WebSocketService(server);
const inventoryService = new InventoryService(websocketService, config, database);
const tradeService = new TradeService();

const botManager = new BotManager(config, websocketService, inventoryService, database);

app.use('/api/accounts', accountRoutes(botManager, database, config));
app.use('/api/bots', botRoutes(botManager, database));
app.use('/api/inventory', inventoryRoutes(botManager, inventoryService, config, database));
app.use('/api/trade', tradeRoutes(botManager, tradeService, config, database));
app.use('/api/settings', settingsRoutes(database));

websocketService.startHeartbeat();

// Graceful shutdown
process.on('SIGINT', () => {
  Logger.system('Shutting down...');
  
  botManager.getAllBots().forEach((client, id) => {
    Logger.system(`Logging off ${id}...`);
    client.logOff();
  });
  
  database.close();
  websocketService.close();
  
  setTimeout(() => {
    process.exit(0);
  }, 2000);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  Logger.error('System', `Uncaught Exception: ${error.message}`);
});

process.on('unhandledRejection', (error) => {
  Logger.error('System', `Unhandled Rejection: ${error}`);
});

// Start server
const PORT = config.PORT;
server.listen(PORT, () => {
  Logger.separator();
  Logger.system('🚀 Steam Bot Manager Started');
  Logger.separator();
  Logger.system(`📡 Server running on http://localhost:${PORT}`);
  Logger.system(`📁 Database file: ${config.DATABASE_FILE}`);
  Logger.system(`📂 Poll data directory: ${config.POLL_DATA_DIR} (system temp)`);
  
  // Load accounts from database
  const dbAccounts = database.getAllAccounts();
  Logger.system(`💾 Found ${dbAccounts.length} account(s) in database`);
  
  // Get login settings
  const loginDelay = parseInt(database.getSetting('login_delay') || config.DEFAULT_LOGIN_DELAY);
  const loginMode = database.getSetting('login_mode') || 'queue';
  
  if (dbAccounts.length === 0) {
    Logger.warning('System', 'No accounts in database!');
    Logger.system('💡 Add accounts via the web interface');
  } else {
    Logger.system(`\n✓ Starting ${dbAccounts.length} bot(s)...`);
    Logger.system(`⏱️  Login mode: ${loginMode}`);
    Logger.system(`⏱️  Login delay: ${loginDelay/1000}s between accounts\n`);
    
    if (loginMode === 'queue') {
      dbAccounts.forEach((account, index) => {
        const delay = index * loginDelay;
        
        setTimeout(() => {
          try {
            Logger.system(`[${index + 1}/${dbAccounts.length}] Logging in ${account.username}...`);
            botManager.initializeBot({
              id: `bot_${account.id}`,
              username: account.username,
              password: account.password,
              email: account.email,
              sharedSecret: account.shared_secret,
              identitySecret: account.identity_secret,
              recoveryCode: account.recovery_code,
              status: 'offline',
              inventory: []
            });
          } catch (error) {
            Logger.error('System', `Failed to initialize ${account.username}: ${error.message}`);
          }
        }, delay);
        
        if (index === 0) {
          Logger.system('📅 Login schedule:');
        }
        Logger.system(`   ${account.username} - in ${delay/1000}s`);
      });
      
      const totalTime = ((dbAccounts.length - 1) * loginDelay) / 1000;
      Logger.system(`\n⏳ All bots will be logged in within ~${totalTime} seconds\n`);
    } else {

      Logger.system('⚡ Logging in all bots simultaneously...\n');
      
      dbAccounts.forEach((account, index) => {
        try {
          botManager.initializeBot({
            id: `bot_${account.id}`,
            username: account.username,
            password: account.password,
            email: account.email,
            sharedSecret: account.shared_secret,
            identitySecret: account.identity_secret,
            recoveryCode: account.recovery_code,
            status: 'offline',
            inventory: []
          });
        } catch (error) {
          Logger.error('System', `Failed to initialize ${account.username}: ${error.message}`);
        }
      });
    }
  }
  Logger.separator();
});