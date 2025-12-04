// ========================================
// bot/botManager.js
// ========================================
const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const TradeOfferManager = require('steam-tradeoffer-manager');
const SteamCommunity = require('steamcommunity');
const path = require('path');
const Logger = require('../utils/logger');

class BotManager {
  constructor(config, websocketService, inventoryService, database) {
    this.config = config;
    this.ws = websocketService;
    this.inventoryService = inventoryService;
    this.database = database;

    this.bots = new Map();
    this.tradeManagers = new Map();
    this.communities = new Map();
    this.loginAttempts = new Map();
  }

  initializeBot(account, retryCount = 0) {
    Logger.info(account.username, `Initializing bot... (Attempt ${retryCount + 1}/${this.config.MAX_LOGIN_RETRIES})`);

    // Check for saved session in database
    const savedSession = this.database.getSession(account.username);

    const client = new SteamUser({
      promptSteamGuardCode: false,
      autoRelogin: true,
      dataDirectory: path.join(this.config.POLL_DATA_DIR, account.username)
    });

    const community = new SteamCommunity();
    const manager = new TradeOfferManager({
      steam: client,
      community: community,
      language: 'en',
      pollInterval: this.config.TRADE_POLL_INTERVAL,
      cancelTime: this.config.TRADE_CANCEL_TIME,
      pollDataPath: path.join(this.config.POLL_DATA_DIR, `${account.username}.json`)
    });

    let logOnOptions = {};

    if (savedSession && savedSession.refresh_token) {
      Logger.info(account.username, 'Attempting login with saved refresh token');
      logOnOptions = {
        refreshToken: savedSession.refresh_token
      };
    } else {
      logOnOptions = {
        accountName: account.username,
        password: account.password
      };

      if (account.sharedSecret && account.sharedSecret.length > 0) {
        try {
          logOnOptions.twoFactorCode = SteamTotp.generateAuthCode(account.sharedSecret);
          Logger.info(account.username, 'Generated 2FA code');
        } catch (error) {
          Logger.error(account.username, `Failed to generate 2FA code: ${error.message}`);
        }
      }
    }


    const loginTimeout = setTimeout(() => {
      Logger.error(account.username, `Login timeout after ${this.config.LOGIN_TIMEOUT / 1000} seconds`);
      client.logOff();

      if (retryCount < this.config.MAX_LOGIN_RETRIES - 1) {
        const retryDelay = (retryCount + 1) * 5000;
        Logger.warning(account.username, `Retrying in ${retryDelay / 1000} seconds...`);
        setTimeout(() => {
          this.initializeBot(account, retryCount + 1);
        }, retryDelay);
      } else {
        Logger.error(account.username, 'Max login retries reached');
        this.ws.emit('botStatus', {
          id: account.id,
          username: account.username,
          status: 'error',
          error: 'Login timeout'
        });
      }
    }, this.config.LOGIN_TIMEOUT);

    this.setupEventHandlers(client, manager, community, account, loginTimeout, retryCount);

    client.logOn(logOnOptions);

    this.bots.set(account.id, client);
    this.communities.set(account.id, community);
    this.tradeManagers.set(account.id, manager);

    return { client, manager, community };
  }

  setupEventHandlers(client, manager, community, account, loginTimeout, retryCount) {
    // Logged in successfully
    client.on('loggedOn', (details) => {
      clearTimeout(loginTimeout);
      Logger.success(account.username, 'Logged in successfully');
      client.setPersona(SteamUser.EPersonaState.Online);

      this.loginAttempts.delete(account.id);

      this.ws.emit('botStatus', {
        id: account.id,
        username: account.username,
        status: 'online'
      });
    });

    client.on('refreshToken', (newToken) => {
      Logger.success(account.username, 'Received/renewed refresh token');

      this.database.saveSession(account.username, {
        refreshToken: newToken,
        steamId: client.steamID ? client.steamID.getSteamID64() : null
      });

      Logger.success(account.username, 'Saved refresh token to database');
    });

    client.on('webSession', (sessionId, cookies) => {
      clearTimeout(loginTimeout);
      Logger.success(account.username, 'Got web session');

      try {
        manager.setCookies(cookies);
        community.setCookies(cookies);

        this.database.saveSession(account.username, {
          sessionId: sessionId,
          refreshToken: client.refreshToken,
          steamId: client.steamID ? client.steamID.getSteamID64() : null
        });

        setTimeout(() => {
          this.inventoryService.loadInventory(
            account.id,
            account.username,
            client,
            community,
            this.config.CS2_APP_ID,
            this.config.CONTEXT_ID
          );
        }, this.config.INVENTORY_DELAY);
      } catch (error) {
        Logger.error(account.username, `Error setting cookies: ${error.message}`);
      }
    });

    client.on('steamGuard', (domain, callback) => {
      clearTimeout(loginTimeout);
      Logger.warning(account.username, `Steam Guard code required from ${domain || 'email'}`);

      this.database.deleteSession(account.username);

      this.ws.emit('needSteamGuard', {
        id: account.id,
        username: account.username,
        domain: domain
      });
    });

    client.on('error', (err) => {
      clearTimeout(loginTimeout);
      Logger.error(account.username, `Error: ${err.message}`);

      if (err.eresult === SteamUser.EResult.InvalidPassword ||
        err.eresult === SteamUser.EResult.AccessDenied ||
        err.eresult === SteamUser.EResult.Expired) {
        Logger.warning(account.username, 'Saved session invalid, deleting from database');
        this.database.deleteSession(account.username);

        if (retryCount < this.config.MAX_LOGIN_RETRIES - 1) {
          Logger.info(account.username, 'Retrying with fresh credentials');
          setTimeout(() => {
            this.initializeBot(account, retryCount + 1);
          }, 3000);
          return;
        }
      }

      if (err.eresult === SteamUser.EResult.RateLimitExceeded) {
        Logger.warning(account.username, `Rate limited, waiting ${this.config.RATE_LIMIT_WAIT / 1000} seconds...`);
        setTimeout(() => {
          if (retryCount < this.config.MAX_LOGIN_RETRIES - 1) {
            this.initializeBot(account, retryCount + 1);
          }
        }, this.config.RATE_LIMIT_WAIT);
        return;
      }

      this.ws.emit('botStatus', {
        id: account.id,
        username: account.username,
        status: 'error',
        error: err.message
      });

      if (retryCount < this.config.MAX_LOGIN_RETRIES - 1 &&
        (err.eresult === SteamUser.EResult.Timeout ||
          err.eresult === SteamUser.EResult.ServiceUnavailable)) {
        const retryDelay = (retryCount + 1) * 5000;
        Logger.warning(account.username, `Retrying in ${retryDelay / 1000} seconds...`);
        setTimeout(() => {
          this.initializeBot(account, retryCount + 1);
        }, retryDelay);
      }
    });

    client.on('newItems', (count) => {
      Logger.gift(account.username, `Received ${count} new item(s)`);
      this.ws.emit('newItems', {
        id: account.id,
        username: account.username,
        count: count
      });

      setTimeout(() => {
        this.inventoryService.loadInventory(
          account.id,
          account.username,
          client,
          community,
          this.config.CS2_APP_ID,
          this.config.CONTEXT_ID,
          true
        );
      }, 3000);
    });

    client.on('disconnected', (eresult, msg) => {
      Logger.warning(account.username, `Disconnected: ${msg}`);
      this.ws.emit('botStatus', {
        id: account.id,
        username: account.username,
        status: 'offline'
      });
    });

    client.on('loginKey', (loginKey) => {
      Logger.success(account.username, 'Received login key');
    });

    manager.on('newOffer', (offer) => {
      Logger.trade(account.username, `New trade offer #${offer.id}`);
      this.ws.emit('newTradeOffer', {
        id: account.id,
        username: account.username,
        offerId: offer.id
      });
    });

    manager.on('sentOfferChanged', (offer, oldState) => {
      Logger.trade(account.username, `Trade offer #${offer.id} changed from ${oldState} to ${offer.state}`);
    });
  }

  getBot(botId) {
    return this.bots.get(botId);
  }

  getCommunity(botId) {
    return this.communities.get(botId);
  }

  getTradeManager(botId) {
    return this.tradeManagers.get(botId);
  }

  stopBot(botId) {
    const client = this.bots.get(botId);
    if (client) {
      client.logOff();
      this.bots.delete(botId);
      this.tradeManagers.delete(botId);
      this.communities.delete(botId);
    }
  }

  getAllBots() {
    return this.bots;
  }

  getSavedSessions() {
    const accounts = this.database.getAllAccounts();
    return accounts.filter(acc => {
      const session = this.database.getSession(acc.username);
      return session && session.refresh_token;
    }).map(acc => acc.username);
  }

  clearSession(username) {
    this.database.deleteSession(username);
  }

  clearAllSessions() {
    const accounts = this.database.getAllAccounts();
    accounts.forEach(acc => {
      this.database.deleteSession(acc.username);
    });
  }
}

module.exports = BotManager;