// ========================================
// routes/accounts.js
// ========================================
const express = require('express');
const Logger = require('../utils/logger');

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
    const { username, password, email, sharedSecret, identitySecret } = req.body;

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
      identitySecret: identitySecret || null
    });

    if (accountId) {
      try {
        const newAccount = database.getAccount(username);

        if (newAccount) {
          Logger.system('Accounts', `Initializing newly added bot ${newAccount.username}...`);

          botManager.initializeBot({
            id: `bot_${newAccount.id}`,
            username: newAccount.username,
            password: newAccount.password,
            email: newAccount.email,
            sharedSecret: newAccount.shared_secret,
            identitySecret: newAccount.identity_secret,
            recoveryCode: newAccount.recovery_code,
            status: 'offline',
            inventory: []
          });
        }
      } catch (error) {
        Logger.error('Accounts', `Failed to initialize new bot: ${error.message}`);
      }

      res.json({
        message: 'Account added successfully',
        accountId: accountId
      });
    } else {
      res.status(500).json({ error: 'Failed to add account' });
    }
  });

  // Update existing account
  router.post('/update', (req, res) => {
    const { username, password, email, sharedSecret, identitySecret } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const account = database.getAccount(username);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const updates = {};
    if (typeof password === 'string' && password.trim() !== '') updates.password = password;
    if (typeof email === 'string') updates.email = email.trim() || null;
    if (typeof sharedSecret === 'string') updates.shared_secret = sharedSecret.trim() || null;
    if (typeof identitySecret === 'string') updates.identity_secret = identitySecret.trim() || null;

    if (Object.keys(updates).length === 0) {
      return res.json({ message: 'No changes provided' });
    }

    try {
      database.updateAccount(username, updates);

      botManager.stopBot(`bot_${account.id}`);
      botManager.clearSession(account.username);

      const updatedAccount = database.getAccount(username);

      Logger.system('Accounts', `Re-initializing bot ${updatedAccount.username} after update...`);
      botManager.initializeBot({
        id: `bot_${updatedAccount.id}`,
        username: updatedAccount.username,
        password: updatedAccount.password,
        email: updatedAccount.email,
        sharedSecret: updatedAccount.shared_secret,
        identitySecret: updatedAccount.identity_secret,
        recoveryCode: updatedAccount.recovery_code,
        status: 'offline',
        inventory: []
      });

      res.json({ message: 'Account updated successfully' });
    } catch (error) {
      Logger.error('Accounts', `Failed to update account: ${error.message}`);
      res.status(500).json({ error: 'Failed to update account' });
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