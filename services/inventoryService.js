// ========================================
// services/inventoryService.js
// ========================================
const Logger = require('../utils/logger');

class InventoryService {
  constructor(websocketService, config, database) {
    this.ws = websocketService;
    this.config = config;
    this.database = database;
  }

  getRarityFromTags(tags) {
    if (!tags) return 'common';

    const rarityTag = tags.find(tag => tag.category === 'Rarity');
    if (!rarityTag) return 'common';

    const rarity = rarityTag.internal_name.toLowerCase();

    if (rarity.includes('rare')) return 'rare';
    if (rarity.includes('mythical')) return 'classified';
    if (rarity.includes('legendary')) return 'covert';
    if (rarity.includes('ancient')) return 'legendary';

    return 'common';
  }

  loadInventory(botId, username, client, community, forceRefresh = false, manager = null) {
    if (!client || !client.steamID) {
      Logger.warning(username, 'Cannot load inventory - not logged in');
      return;
    }

    if (!community) {
      Logger.warning(username, 'Community not initialized');
      return;
    }

    const appId = this.config.CS2_APP_ID;
    const contextId = this.config.CONTEXT_ID;

    if (!forceRefresh) {
      const cached = this.database.getInventoryCache(username, appId, contextId);

      if (cached) {
        this.ws.emit('inventoryUpdate', {
          id: botId,
          username,
          inventory: cached,
          count: cached.length,
          cached: true
        });
        return;
      }
    }

    Logger.inventory(username, 'Loading inventory...');

    if (manager && typeof manager.getInventoryContents === 'function') {
      
      manager.getInventoryContents(appId, contextId, false, (err, inventory) => {
        if (err) {
          Logger.error(username, `Failed to load inventory via manager: ${err.message}`);
          return;
        }

        const items = inventory.map(item => {
          const isTradable = item.tradable === true || item.tradable === 1;
          
          const descriptions = item.descriptions || [];
          let hasTradeHold = false;
          let actualTradeHoldDays = 0;
          let extraDescription = '';
          
          for (const desc of descriptions) {
            const rawText = desc.value || '';
            const text = rawText.toLowerCase();
            if (text.includes('tradable after') || text.includes('cannot be traded until')) {
              hasTradeHold = true;
              const daysMatch = text.match(/(\d+)\s*day/i);
              if (daysMatch) {
                actualTradeHoldDays = parseInt(daysMatch[1], 10);
              }
            }

            if (!extraDescription && rawText && !text.includes('tradable after') && !text.includes('cannot be traded until')) {
              extraDescription = rawText.replace(/<br\s*\/?>/gi, ' ').trim();
            }
          }
          
          const tradeLocked = isTradable && hasTradeHold;
          const tradable = isTradable && !hasTradeHold;
          const nonTradable = !isTradable;

          return {
            assetid: item.assetid,
            classid: item.classid,
            instanceid: item.instanceid,
            amount: item.amount || 1,
            name: item.market_hash_name || item.name || 'Unknown Item',
            type: item.type || 'Unknown',
            rarity: this.getRarityFromTags(item.tags),
            description: extraDescription,

            tradable,
            tradeLocked,
            nonTradable,

            marketable: item.marketable === 1 || item.marketable === true,

            tradeHoldDuration: actualTradeHoldDays,

            image: item.icon_url
              ? `https://community.cloudflare.steamstatic.com/economy/image/${item.icon_url}`
              : '',
            nameColor: item.name_color || '',
            backgroundColor: item.background_color || ''
          };
        });

        this.database.saveInventoryCache(username, appId, contextId, items);

        Logger.success(username, `Loaded ${items.length} item(s) via manager`);

        this.ws.emit('inventoryUpdate', {
          id: botId,
          username,
          inventory: items,
          count: items.length,
          cached: false
        });
      });
      return;
    }

    const steamId = client.steamID.getSteamID64();

    const protectedContextId = this.config.TRADE_PROTECTED_CONTEXT_ID || 16;
    const contextsToCheck = [contextId, protectedContextId];

    let allItems = [];
    let contextsLoaded = 0;
    
    const checkComplete = () => {
      contextsLoaded++;
      if (contextsLoaded === contextsToCheck.length) {
        if (allItems.length === 0) {
          Logger.info(username, 'Inventory is empty');
          this.ws.emit('inventoryUpdate', {
            id: botId,
            username,
            inventory: [],
            count: 0,
            cached: false
          });
          return;
        }

        this.database.saveInventoryCache(username, appId, contextId, allItems);

        Logger.success(username, `Loaded ${allItems.length} item(s)`);

        this.ws.emit('inventoryUpdate', {
          id: botId,
          username,
          inventory: allItems,
          count: allItems.length,
          cached: false
        });
      }
    };
    
    contextsToCheck.forEach(ctx => {
      community.getUserInventory(steamId, appId, ctx, false, (err, inventory, currency) => {
        if (err) {
          checkComplete();
          return;
        }

        if (!inventory || inventory.length === 0) {
          checkComplete();
          return;
        }

        const items = inventory.map(item => {
          const isTradable = item.tradable === true || item.tradable === 1;

          const isTradeProtectedContext = ctx === protectedContextId;
          
          const descriptions = item.descriptions || [];
          let hasTradeHold = false;
          let actualTradeHoldDays = 0;
          
          for (const desc of descriptions) {
            const text = (desc.value || '').toLowerCase();
            
            if (text.includes('tradable after') || 
                text.includes('cannot be traded until') ||
                text.includes('trade hold') ||
                text.includes('trade lock')) {
              hasTradeHold = true;

              const daysMatch = text.match(/(\d+)\s*day/i);
              if (daysMatch) {
                actualTradeHoldDays = parseInt(daysMatch[1], 10);
              }
            }
          }
          
          const tradeLocked = isTradable && hasTradeHold;
          const tradable = isTradable && !hasTradeHold && !isTradeProtectedContext;
          const nonTradable = !isTradable;

          return {
            assetid: item.assetid,
            classid: item.classid,
            instanceid: item.instanceid,
            amount: item.amount || 1,
            name: item.market_hash_name || item.name || 'Unknown Item',
            type: item.type || 'Unknown',
            rarity: this.getRarityFromTags(item.tags),
            
            tradable,
            tradeLocked,
            nonTradable,
            tradeProtected: isTradeProtectedContext,

            marketable: item.marketable === 1 || item.marketable === true,

            tradeHoldDuration: actualTradeHoldDays,

            image: item.icon_url
              ? `https://community.cloudflare.steamstatic.com/economy/image/${item.icon_url}`
              : '',
            nameColor: item.name_color || '',
            backgroundColor: item.background_color || ''
          };
        });

        allItems = allItems.concat(items);
        checkComplete();
      });
    });
  }

  clearCache(username = null) {
    if (username) {
      this.database.clearInventoryCache(username);
    } else {
      this.database.clearInventoryCache();
    }
  }
}

module.exports = InventoryService;