const Logger = require('../utils/logger');

class TradeService {
  sendTradeOffer(botId, username, tradeUrl, client, manager, community, appId, contextId, accounts) {
    return new Promise((resolve, reject) => {
      if (!client || !manager || !community) {
        return reject(new Error('Bot not initialized'));
      }

      if (!client.steamID) {
        return reject(new Error('Bot not logged in'));
      }

      Logger.trade(username, 'Creating trade offer...');

      community.getUserInventory(client.steamID.getSteamID64(), appId, contextId, true, (err, inventory) => {
        if (err) {
          return reject(err);
        }

        const tradableItems = inventory.filter(item => item.tradable);

        if (tradableItems.length === 0) {
          return reject(new Error('No tradable items in inventory'));
        }

        const offer = manager.createOffer(tradeUrl.trim());

        tradableItems.forEach(item => {
          offer.addMyItem({
            appid: appId,
            contextid: contextId,
            assetid: item.assetid
          });
        });

        offer.send((err, status) => {
          if (err) {
            Logger.error(`✗ [${username}] Trade failed:`, err.message);
            return reject(err);
          }

          Logger.success(`[${username}] Trade offer sent. Status: ${status}`);

          if (status === 'pending') {
            const account = accounts.find(a => a.id === botId);
            if (account && account.identity_secret) {
              community.acceptConfirmationForObject(account.identity_secret, offer.id, (err) => {
                if (err) {
                  Logger.error(`[${username}] Failed to confirm trade:`, err.message);
                } else {
                  Logger.success(`[${username}] Trade confirmed`);
                }
              });
            }
          }

          resolve({
            offerId: offer.id,
            status: status,
            itemCount: tradableItems.length
          });
        });
      });
    });
  }
}

module.exports = TradeService;