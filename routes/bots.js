// ========================================
// routes/bots.js
// ========================================
const express = require('express');

module.exports = (botManager, database) => {
  const router = express.Router();

  // Start bot
  router.post('/start', (req, res) => {
    const { accountId } = req.body;
    const dbId = parseInt(accountId.replace('bot_', ''));
    const account = database.getAllAccounts().find(a => a.id === dbId);

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (botManager.getBot(accountId)) {
      return res.json({ message: 'Bot already running' });
    }

    botManager.initializeBot({
      id: accountId,
      username: account.username,
      password: account.password,
      email: account.email,
      sharedSecret: account.shared_secret,
      identitySecret: account.identity_secret,
      recoveryCode: account.recovery_code,
      status: 'offline',
      inventory: []
    });
    
    res.json({ message: 'Bot started' });
  });

  // Stop bot
  router.post('/stop', (req, res) => {
    const { accountId } = req.body;
    botManager.stopBot(accountId);
    res.json({ message: 'Bot stopped' });
  });

  return router;
};