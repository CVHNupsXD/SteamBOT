const express = require('express');
const axios = require('axios');

module.exports = (botManager, tradeService, config, database) => {
  const router = express.Router();

  // Send trade offer
  router.post('/send', async (req, res) => {
    const { accountId, username, tradeUrl } = req.body;

    try {
      const client = botManager.getBot(accountId);
      const manager = botManager.getTradeManager(accountId);
      const community = botManager.getCommunity(accountId);
      
      const accounts = database.getAllAccounts();
      
      const result = await tradeService.sendTradeOffer(
        accountId, 
        username, 
        tradeUrl, 
        client, 
        manager, 
        community, 
        config.CS2_APP_ID, 
        config.CONTEXT_ID,
        accounts
      );
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Redeem game from Steam store link
  router.post('/redeem', async (req, res) => {
    const { accountId, storeLink } = req.body;

    try {
      const appIdMatch = storeLink.match(/\/app\/(\d+)\//);
      if (!appIdMatch) {
        return res.status(400).json({ error: 'Invalid Steam store link' });
      }

      const appId = parseInt(appIdMatch[1]);
      const client = botManager.getBot(accountId);

      if (!client) {
        return res.status(400).json({ error: 'Bot not found or not online' });
      }

      client.requestFreeLicense([appId], (err, grantedPackages, grantedAppIds) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        res.json({ 
          message: 'Game redeemed successfully',
          appId: appId,
          grantedPackages: grantedPackages,
          grantedAppIds: grantedAppIds
        });
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};