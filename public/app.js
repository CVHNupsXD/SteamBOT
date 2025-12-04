let ws = null;
const App = {
  accounts: [],
  accountInventories: new Map(),
  expandedAccounts: new Set(),
  settings: {},
  notifications: [],
  currentTab: 'dashboard',
  isLoading: true,

  async init() {
    this.updateLoadingStatus('Initializing WebSocket...');
    this.connectWebSocket();
    this.setupModalListeners();

    this.updateLoadingStatus('Loading accounts...');
    await this.loadAccounts();

    this.updateLoadingStatus('Loading settings...');
    await this.loadSettings();

    this.updateLoadingStatus('Loading inventories...');
    await this.preloadInventories();

    this.hideLoadingScreen();
    this.render();

    setInterval(() => this.loadAccounts(), 30000);
  },

  updateLoadingStatus(message) {
    const el = document.getElementById('loadingStatus');
    if (el) el.textContent = message;
  },

  hideLoadingScreen() {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    this.isLoading = false;
  },

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = protocol + '//' + window.location.host;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      this.addNotification('Connected to server', 'success');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleWebSocketMessage(message);
      } catch (error) {
        this.addNotification('Failed to parse WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      if (!this.isLoading) {
        this.addNotification('Disconnected from server', 'error');
      }
      setTimeout(() => this.connectWebSocket(), 3000);
    };

    ws.onerror = (error) => {
      this.addNotification('WebSocket error:', error);
    };
  },

  handleWebSocketMessage(message) {
    switch (message.type) {
      case 'botStatus':
        this.updateBotStatus(message.data);
        break;
      case 'inventoryUpdate':
        this.updateInventory(message.data);
        break;
      case 'newItems':
        this.addNotification(message.data.username + ' received ' + message.data.count + ' new items!', 'success');
        break;
      case 'newTradeOffer':
        this.addNotification(message.data.username + ' received trade offer #' + message.data.offerId, 'info');
        break;
    }
  },

  updateBotStatus(data) {
    const account = this.accounts.find(a => a.id === data.id);
    if (account) {
      account.status = data.status;
      if (data.error) {
        this.addNotification(data.username + ': ' + data.error, 'error');
      }
      this.render();
    }
  },

  updateInventory(data) {
    this.accountInventories.set(data.id, data.inventory || []);

    const account = this.accounts.find(a => a.id === data.id);
    if (account) {
      account.inventory = data.inventory || [];
      this.render();
    }
  },

  async loadAccounts() {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      const newAccounts = data.accounts || [];

      newAccounts.forEach(acc => {
        const existing = this.accountInventories.get(acc.id);
        if (existing) {
          acc.inventory = existing;
        }
      });

      this.accounts = newAccounts;
      if (!this.isLoading) this.render();
    } catch (error) {
      this.addNotification('Failed to load accounts', 'error');
    }
  },

  async loadSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      this.settings = data.settings || {};
    } catch (error) {
      this.addNotification('Failed to load settings:', error);
    }
  },

  async preloadInventories() {
    for (const account of this.accounts) {
      if (account.status === 'online') {
        await this.refreshInventory(account.id, account.username, true);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  },

  setupModalListeners() {
    document.addEventListener('change', (e) => {
      if (e.target.name === 'secretSource') {
        document.getElementById('manualSecretDiv').style.display = e.target.value === 'manual' ? 'block' : 'none';
        document.getElementById('uploadSecretDiv').style.display = e.target.value === 'upload' ? 'block' : 'none';
      }
    });
  },

  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    event.target.closest('.tab-button').classList.add('active');
    document.getElementById('dashboardTab').style.display = tab === 'dashboard' ? 'block' : 'none';
    document.getElementById('settingsTab').style.display = tab === 'settings' ? 'block' : 'none';
    this.render();
  },

  openAddAccountModal() {
    document.getElementById('addAccountModal').classList.add('active');
  },

  closeAddAccountModal() {
    document.getElementById('addAccountModal').classList.remove('active');
  },

  async saveNewAccount() {
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    const email = document.getElementById('newEmail').value.trim();
    const secretSource = document.querySelector('input[name="secretSource"]:checked').value;

    if (!username || !password) {
      this.addNotification('Username and password are required', 'error');
      return;
    }

    let sharedSecret = '';
    let identitySecret = '';

    if (secretSource === 'manual') {
      sharedSecret = document.getElementById('newSharedSecret').value.trim();
      identitySecret = document.getElementById('newIdentitySecret').value.trim();
    } else if (secretSource === 'upload') {
      const fileInput = document.getElementById('maFileUpload');
      if (fileInput.files.length > 0) {
        try {
          const file = fileInput.files[0];
          const text = await file.text();
          const maData = JSON.parse(text);

          if (maData.account_name !== username) {
            this.addNotification('Account name in .maFile (' + maData.account_name + ') does not match username', 'error');
            return;
          }

          sharedSecret = maData.shared_secret;
          identitySecret = maData.identity_secret;
          this.addNotification('.maFile parsed successfully', 'success');
        } catch (error) {
          this.addNotification('Failed to parse .maFile: ' + error.message, 'error');
          return;
        }
      }
    }

    try {
      const res = await fetch('/api/accounts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, email, sharedSecret, identitySecret })
      });

      if (res.ok) {
        this.addNotification('Account added successfully!', 'success');
        this.closeAddAccountModal();
        await this.loadAccounts();
      } else {
        const data = await res.json();
        this.addNotification(data.error || 'Failed to add account', 'error');
      }
    } catch (error) {
      this.addNotification('Error: ' + error.message, 'error');
    }
  },

  async refreshInventory(accountId, username, silent = false) {
    try {
      await fetch('/api/inventory/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, username })
      });
      if (!silent) this.addNotification('Refreshing inventory for ' + username, 'info');
    } catch (error) {
      if (!silent) this.addNotification('Failed to refresh inventory', 'error');
    }
  },

  toggleExpandInventory(accountId) {
    if (this.expandedAccounts.has(accountId)) {
      this.expandedAccounts.delete(accountId);
    } else {
      this.expandedAccounts.add(accountId);
    }
    this.render();
  },

  async sendTrade(accountId, username) {
    const tradeLink = this.settings.trade_link;
    if (!tradeLink) {
      this.addNotification('Please set trade link in Settings', 'error');
      return;
    }

    try {
      const res = await fetch('/api/trade/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, username, tradeUrl: tradeLink })
      });

      const data = await res.json();
      if (res.ok) {
        this.addNotification('Trade sent! Offer #' + data.offerId, 'success');
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      this.addNotification('Trade failed: ' + error.message, 'error');
    }
  },

  async redeemGame(accountId, storeLink) {
    try {
      const res = await fetch('/api/trade/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, storeLink })
      });

      const data = await res.json();
      if (res.ok) {
        this.addNotification('Game redeemed successfully!', 'success');
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      this.addNotification('Failed to redeem: ' + error.message, 'error');
    }
  },

  async saveSetting(key, value) {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
      this.settings[key] = value;
      this.addNotification('Setting saved', 'success');
    } catch (error) {
      this.addNotification('Failed to save setting', 'error');
    }
  },

  addNotification(message, type) {
    const id = Date.now();
    this.notifications.push({ id, message, type });
    this.render();
    setTimeout(() => {
      this.notifications = this.notifications.filter(n => n.id !== id);
      this.render();
    }, 5000);
  },

  render() {
    if (this.currentTab === 'dashboard') {
      document.getElementById('dashboardTab').innerHTML = this.renderDashboard();
    } else {
      document.getElementById('settingsTab').innerHTML = this.renderSettings();
    }
    const notifContainer = document.getElementById('notifications');
    if (!notifContainer) {
      const div = document.createElement('div');
      div.id = 'notifications';
      div.className = 'fixed top-6 right-6 z-50 space-y-2 max-w-md';
      document.body.appendChild(div);
    }
    document.getElementById('notifications').innerHTML = this.renderNotifications();
  },

  renderNotifications() {
    return this.notifications.map(n =>
      '<div class="glass-strong px-4 py-3 rounded-lg shadow-lg ' +
      (n.type === 'success' ? 'border-l-4 border-green-500' : n.type === 'error' ? 'border-l-4 border-red-500' : 'border-l-4 border-blue-500') + '">' +
      '<p class="text-white text-sm"><i class="fas fa-' + (n.type === 'success' ? 'check-circle' : n.type === 'error' ? 'exclamation-circle' : 'info-circle') + ' mr-2"></i>' + n.message + '</p>' +
      '</div>'
    ).join('');
  },

  renderDashboard() {
    const activeCount = this.accounts.filter(a => a.status === 'online').length;
    const totalItems = this.accounts.reduce((sum, acc) => {
      const inv = this.accountInventories.get(acc.id) || [];
      return sum + inv.length;
    }, 0);

    return '<div class="mb-8 flex justify-between items-center">' +
      '<div>' +
      '<div class="flex items-center gap-4">' +
      '<span class="text-sm text-gray-300 glass px-3 py-1 rounded-full"><i class="fas fa-check-circle text-green-400 mr-1"></i> Active: ' + activeCount + '/' + this.accounts.length + '</span>' +
      '<span class="text-sm text-gray-300 glass px-3 py-1 rounded-full"><i class="fas fa-box text-blue-400 mr-1"></i> Items: ' + totalItems + '</span>' +
      '</div>' +
      '</div>' +
      '<button onclick="App.openAddAccountModal()" class="glass-strong hover:bg-blue-600/30 text-white px-6 py-3 rounded-lg font-semibold transition-all">' +
      '<i class="fas fa-plus mr-2"></i>Add Account' +
      '</button>' +
      '</div>' +
      (this.accounts.length === 0 ? this.renderEmptyState() : this.renderAccounts());
  },

  renderEmptyState() {
    return '<div class="glass-strong rounded-xl p-12 border border-white/20 text-center">' +
      '<i class="fas fa-robot text-6xl text-gray-400 mb-4"></i>' +
      '<h3 class="text-xl font-semibold text-white mb-2">No Accounts Loaded</h3>' +
      '<p class="text-gray-300">Click "Add Account" to get started</p>' +
      '</div>';
  },

  renderAccounts() {
    return '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">' +
      this.accounts.map(acc => this.renderAccount(acc)).join('') +
      '</div>';
  },

  renderAccount(account) {
    const statusIcon = account.status === 'online' ? 'check-circle text-green-400' : account.status === 'error' ? 'exclamation-circle text-red-400' : 'circle text-gray-400';
    const inventory = this.accountInventories.get(account.id) || [];
    const itemCount = inventory.length;
    const tradableCount = inventory.filter(i => i.tradable && !i.tradeLocked && !i.tradeProtected).length;
    const isExpanded = this.expandedAccounts.has(account.id);
    const displayLimit = isExpanded ? inventory.length : 20;
    const hasMore = inventory.length > 20;

    return '<div class="glass-strong rounded-xl p-6 border border-white/20 hover:border-white/30 transition-all">' +
      '<div class="flex justify-between items-center mb-4">' +
      '<div>' +
      '<h3 class="text-xl font-semibold text-white">' + account.username + '</h3>' +
      (account.email ? '<p class="text-gray-400 text-sm"><i class="fas fa-envelope mr-1"></i>' + account.email + '</p>' : '') +
      '<div class="flex items-center gap-2 mt-1">' +
      '<i class="fas fa-' + statusIcon + '"></i>' +
      '<span class="text-gray-300 text-sm capitalize">' + account.status + '</span>' +
      '</div>' +
      '</div>' +
      '<button onclick="App.refreshInventory(\'' + account.id + '\', \'' + account.username + '\')" class="glass hover:bg-white/10 p-2 rounded-lg transition-all">' +
      '<i class="fas fa-sync-alt text-white"></i>' +
      '</button>' +
      '</div>' +
      '<div class="mb-4">' +
      '<h4 class="text-sm font-semibold text-gray-300 uppercase mb-3"><i class="fas fa-box mr-2"></i>Inventory (' + itemCount + ')</h4>' +
      '<div class="space-y-2 max-h-80 overflow-y-auto scrollbar-hide">' +
      (itemCount === 0 ? '<div class="text-center py-8 text-gray-400"><i class="fas fa-inbox text-4xl mb-2"></i><p>No items</p></div>' :
        inventory.slice(0, displayLimit).map(item => this.renderItem(item)).join('')) +
      '</div>' +
      (hasMore && !isExpanded ?
        '<button onclick="App.toggleExpandInventory(\'' + account.id + '\')" class="w-full glass hover:bg-white/10 text-white py-2 rounded-lg mt-2 text-sm transition-all">' +
        '<i class="fas fa-chevron-down mr-2"></i>Show All (' + (inventory.length - 20) + ' more)' +
        '</button>' : '') +
      (isExpanded ?
        '<button onclick="App.toggleExpandInventory(\'' + account.id + '\')" class="w-full glass hover:bg-white/10 text-white py-2 rounded-lg mt-2 text-sm transition-all">' +
        '<i class="fas fa-chevron-up mr-2"></i>Show Less' +
        '</button>' : '') +
      '</div>' +
      '<button onclick="App.sendTrade(\'' + account.id + '\', \'' + account.username + '\')" ' +
      'class="w-full glass-strong hover:bg-blue-600/30 text-white py-3 rounded-lg font-semibold transition-all">' +
      '<i class="fas fa-paper-plane mr-2"></i>Send ' + tradableCount + ' Items' +
      '</button>' +
      '</div>';
  },

  renderItem(item) {
    let icon = 'check-circle text-green-400';
    if (item.tradeProtected) icon = 'shield-alt text-orange-400';
    else if (item.tradeLocked) icon = 'lock text-red-400';
    else if (!item.tradable) icon = 'times-circle text-red-400';

    return '<div class="glass rounded-lg p-3 flex items-center justify-between hover:bg-white/5 transition-all">' +
      '<div class="flex items-center gap-3 flex-1">' +
      (item.image ? '<img src="' + item.image + '" class="w-12 h-12 object-contain" />' : '<i class="fas fa-box text-gray-500 text-2xl"></i>') +
      '<div class="flex-1 min-w-0">' +
      '<p class="font-medium text-white text-sm truncate">' + item.name + '</p>' +
      '<p class="text-xs text-gray-400">' + item.type + '</p>' +
      '</div>' +
      '</div>' +
      '<i class="fas fa-' + icon + '"></i>' +
      '</div>';
  },

  renderSettings() {
    return '<div class="space-y-6">' +
      '<div class="glass-strong rounded-xl p-6 border border-white/20">' +
      '<h2 class="text-xl font-semibold text-white mb-4"><i class="fas fa-link mr-2"></i>Trade Link</h2>' +
      '<input type="text" id="settingTradeLink" value="' + (this.settings.trade_link || '') + '" class="w-full glass text-white px-4 py-2 rounded-lg border border-white/20 focus:border-blue-500 focus:outline-none mb-3" placeholder="https://steamcommunity.com/tradeoffer/new/?partner=..." />' +
      '<button onclick="App.saveSetting(\'trade_link\', document.getElementById(\'settingTradeLink\').value)" class="glass-strong hover:bg-blue-600/30 text-white px-6 py-2 rounded-lg transition-all"><i class="fas fa-save mr-2"></i>Save</button>' +
      '</div>' +
      '<div class="glass-strong rounded-xl p-6 border border-white/20">' +
      '<h2 class="text-xl font-semibold text-white mb-4"><i class="fas fa-clock mr-2"></i>Login Settings</h2>' +
      '<label class="text-gray-300 text-sm mb-2 block">Login Delay (milliseconds)</label>' +
      '<input type="number" id="settingLoginDelay" value="' + (this.settings.login_delay || '5000') + '" class="w-full glass text-white px-4 py-2 rounded-lg border border-white/20 focus:border-blue-500 focus:outline-none mb-3" />' +
      '<label class="text-gray-300 text-sm mb-2 block">Login Mode</label>' +
      '<select id="settingLoginMode" class="w-full glass text-white px-4 py-2 rounded-lg border border-white/20 focus:border-blue-500 focus:outline-none mb-3">' +
      '<option value="queue" ' + (this.settings.login_mode === 'queue' ? 'selected' : '') + '>Queue (One by One)</option>' +
      '<option value="parallel" ' + (this.settings.login_mode === 'parallel' ? 'selected' : '') + '>Parallel (All at Once)</option>' +
      '</select>' +
      '<button onclick="App.saveSetting(\'login_delay\', document.getElementById(\'settingLoginDelay\').value); App.saveSetting(\'login_mode\', document.getElementById(\'settingLoginMode\').value)" class="glass-strong hover:bg-blue-600/30 text-white px-6 py-2 rounded-lg transition-all"><i class="fas fa-save mr-2"></i>Save</button>' +
      '</div>' +
      '<div class="glass-strong rounded-xl p-6 border border-white/20">' +
      '<h2 class="text-xl font-semibold text-white mb-4"><i class="fas fa-gift mr-2"></i>Redeem Free Game</h2>' +
      '<input type="text" id="storeLinkInput" class="w-full glass text-white px-4 py-2 rounded-lg border border-white/20 focus:border-blue-500 focus:outline-none mb-3" placeholder="https://store.steampowered.com/app/2397300/..." />' +
      '<select id="redeemAccountSelect" class="w-full glass text-white px-4 py-2 rounded-lg border border-white/20 focus:border-blue-500 focus:outline-none mb-3">' +
      '<option value="">Select Account</option>' +
      this.accounts.filter(a => a.status === 'online').map(a => '<option value="' + a.id + '">' + a.username + '</option>').join('') +
      '</select>' +
      '<button onclick="App.redeemGame(document.getElementById(\'redeemAccountSelect\').value, document.getElementById(\'storeLinkInput\').value)" class="glass-strong hover:bg-green-600/30 text-white px-6 py-2 rounded-lg transition-all"><i class="fas fa-download mr-2"></i>Redeem</button>' +
      '</div>' +
      '</div>';
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}