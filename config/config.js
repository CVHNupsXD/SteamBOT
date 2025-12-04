module.exports = {

  PORT: process.env.PORT || 3000,
  
  PUBLIC_DIR: 'public',
  DATABASE_FILE: 'database.sqlite',

  CS2_APP_ID: 730,
  CONTEXT_ID: 2,
  TRADE_PROTECTED_CONTEXT_ID: 16,
  
  LOGIN_DELAY: 5000,        // Delay between account logins (ms)
  INVENTORY_DELAY: 3000,    // Delay before loading inventory (ms)
  INVENTORY_CACHE_TIME: 5 * 60 * 1000, // Cache inventory for 5 minutes
  MAX_LOGIN_RETRIES: 3,     // Maximum login retry attempts
  LOGIN_TIMEOUT: 30000,     // Login timeout (ms)
  RATE_LIMIT_WAIT: 60000,   // Wait time after rate limit (ms)
  
  TRADE_POLL_INTERVAL: 30000,     // Trade offer poll interval (ms)
  TRADE_CANCEL_TIME: 7 * 60 * 1000 // Cancel trade after (ms)
};