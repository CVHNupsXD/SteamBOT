// ========================================
// routes/accounts.js
// ========================================
const express = require('express');

module.exports = (botManager, database, config) => {
  const router = express.Router();

  // Get all accounts
  router.get('/', (req, res) => {
    const accounts = database.getAllAccounts();
    
    const sanitizedAccounts = accounts.map(acc => {
      const bot = botManager.getBot(`bot_${acc.id}`);
      const session = database.getSession(acc.username);
      
      return {
        id: `bot_${acc.id}`,
        username: acc.username,
        email: acc.email,
        status: bot && bot.steamID ? 'online' : 'offline',
        hasSession: !!(session && session.refresh_token),
        inventory: []
      };
    });
    
    res.json({ accounts: sanitizedAccounts });
  });

  // Add new account
  router.post('/add', async (req, res) => {
    const { username, password, email, sharedSecret } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const existing = database.getAccount(username);
    if (existing) {
      return res.status(400).json({ error: 'Account already exists' });
    }

    const accountId = database.addAccount({
      username,
      password,
      email: email || null,
      recoveryCode: null,
      sharedSecret: sharedSecret || null,
      identitySecret: null
    });
    
    if (accountId) {
      res.json({ 
        message: 'Account added successfully',
        accountId: accountId
      });
    } else {
      res.status(500).json({ error: 'Failed to add account' });
    }
  });

  // Delete account
  router.delete('/:username', (req, res) => {
    const { username } = req.params;
    
    const account = database.getAccount(username);
    if (account) {
      botManager.stopBot(`bot_${account.id}`);
    }
    
    database.deleteAccount(username);
    
    res.json({ message: 'Account deleted successfully' });
  });

  return router;
};