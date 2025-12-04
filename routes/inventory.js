const express = require('express');

module.exports = (botManager, inventoryService, config, database) => {
  const router = express.Router();

  // Get inventory from cache or load
  router.get('/:accountId', (req, res) => {
    const { accountId } = req.params;
    const dbId = parseInt(accountId.replace('bot_', ''));
    const account = database.getAllAccounts().find(a => a.id === dbId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Try to get from cache
    const cached = database.getInventoryCache(account.username, config.CS2_APP_ID, config.CONTEXT_ID);
    
    if (cached) {
      return res.json({ inventory: cached, cached: true });
    }

    res.json({ inventory: [], cached: false, message: 'Inventory loading...' });
  });

  // Refresh inventory
  router.post('/refresh', (req, res) => {
    const { accountId, username } = req.body;
    const client = botManager.getBot(accountId);
    const community = botManager.getCommunity(accountId);
    
    if (client && community) {
      inventoryService.loadInventory(
        accountId, 
        username, 
        client, 
        community, 
        config.CS2_APP_ID, 
        config.CONTEXT_ID,
        true // Force refresh
      );
      res.json({ message: 'Inventory refresh started' });
    } else {
      res.status(400).json({ error: 'Bot not online' });
    }
  });

  // Clear inventory cache
  router.delete('/cache/:username', (req, res) => {
    const { username } = req.params;
    inventoryService.clearCache(username);
    res.json({ message: 'Cache cleared' });
  });

  return router;
};