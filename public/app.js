let ws = null;

// Global mouse-based highlight for liquid glass cards
document.addEventListener('pointermove', (e) => {
  const x = (e.clientX / window.innerWidth) * 100;
  const y = (e.clientY / window.innerHeight) * 100;
  document.documentElement.style.setProperty('--mouse-x', x + '%');
  document.documentElement.style.setProperty('--mouse-y', y + '%');
});

const LiquidBackground = {
  orbs: [],
  mouseX: 0.5,
  mouseY: 0.5,

  init() {
    const container = document.getElementById('bg-orbs');
    if (!container || typeof gsap === 'undefined') return;

    container.innerHTML = '';
    this.orbs = [];

    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;
    const area = (vw * vh) / (1280 * 720);
    const orbCount = Math.max(4, Math.min(10, Math.round(6 * area)));

    for (let idx = 0; idx < orbCount; idx++) {
      const orb = document.createElement('div');
      orb.className = 'bg-orb';

      const size = 260 + Math.random() * 320;
      orb.style.width = size + 'px';
      orb.style.height = size + 'px';

      const hue = Math.floor(Math.random() * 360);
      const satInner = 70 + Math.random() * 20;
      const satOuter = 35 + Math.random() * 25;
      const lightInner = 65 + Math.random() * 15;
      const lightOuter = 20 + Math.random() * 10;

      orb.style.background = 'radial-gradient(circle at 30% 30%, ' +
        'hsla(' + hue + ', ' + satInner + '%, ' + lightInner + '%, 0.85), ' +
        'hsla(' + hue + ', ' + satOuter + '%, ' + lightOuter + '%, 0) 60%)';

      const data = {
        el: orb,
        baseX: Math.random(),
        baseY: Math.random(),
        ampX: 0.10 + Math.random() * 0.08,
        ampY: 0.10 + Math.random() * 0.08,
        speed: 0.00008 + Math.random() * 0.00008,
        depth: 0.4 + (idx / orbCount) * 0.6
      };

      this.orbs.push(data);
      container.appendChild(orb);
    }

    window.addEventListener('pointermove', (e) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      this.mouseX = e.clientX / w;
      this.mouseY = e.clientY / h;
    });

    gsap.ticker.add(this.animate.bind(this));
  },

  animate(time) {
    const t = time * 16;
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;

    const centerX = this.mouseX;
    const centerY = this.mouseY;

    const container = document.getElementById('bg-orbs');
    if (container) {
      const bgOffsetX = (centerX - 0.5) * 40;
      const bgOffsetY = (centerY - 0.5) * 40;
      const bgRotateX = (centerY - 0.5) * -4;
      const bgRotateY = (centerX - 0.5) * 4;
      container.style.transform =
        'translate3d(' + bgOffsetX + 'px,' + bgOffsetY + 'px,0) rotateX(' + bgRotateX + 'deg) rotateY(' + bgRotateY + 'deg)';
    }

    this.orbs.forEach((orb, index) => {
      const localT = t * orb.speed + index * 2000;
      const swayX = Math.sin(localT) * orb.ampX;
      const swayY = Math.cos(localT * 0.8) * orb.ampY;

      const targetX = (orb.baseX + swayX) * w;
      const targetY = (orb.baseY + swayY) * h;

      const depth = orb.depth;
      const parallaxX = (centerX - 0.5) * 80 * (1.4 - depth);
      const parallaxY = (centerY - 0.5) * 80 * (1.4 - depth);

      const x = targetX - w * 0.25 + parallaxX;
      const y = targetY - h * 0.25 + parallaxY;
      const z = (depth - 0.7) * 320;

      gsap.set(orb.el, {
        x,
        y,
        z,
        opacity: 0.4 + (1 - depth) * 0.4
      });
    });
  }
};

const App = {
  accounts: [],
  accountInventories: new Map(),
  expandedAccounts: new Set(),
  inventoryTabs: new Map(),
  settings: {},
  notifications: [],
  currentTab: 'dashboard',
  isLoading: true,
  settingsSubTab: 'current',

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
    this.switchTab('dashboard');

    window.addEventListener('resize', () => {
      this.updateNotificationPosition();
    });
    window.addEventListener('scroll', () => {
      this.updateNotificationPosition();
    });

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

      const card = document.getElementById('account-' + account.id);
      if (card) {
        card.outerHTML = this.renderAccount(account);
        this.animateInventoryContainer(account.id);
      } else {
        this.render();
      }
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

  setSettingsSubTab(tab) {
    this.settingsSubTab = tab;
    const settingsEl = document.getElementById('settingsTab');
    if (settingsEl) {
      settingsEl.innerHTML = this.renderSettings();
    }
  },

  switchTab(tab) {
    if (this.currentTab === tab) return;

    const previousTab = this.currentTab;
    this.currentTab = tab;

    document.querySelectorAll('.tab-button').forEach(btn => {
      if (btn.dataset && btn.dataset.tab === tab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const dashboardEl = document.getElementById('dashboardTab');
    const settingsEl = document.getElementById('settingsTab');

    const fromEl = previousTab === 'dashboard' ? dashboardEl : settingsEl;
    const toEl = tab === 'dashboard' ? dashboardEl : settingsEl;

    const finishSwitch = () => {
      if (tab === 'dashboard') {
        if (dashboardEl) {
          dashboardEl.innerHTML = this.renderDashboard();
          dashboardEl.style.display = 'block';
        }
        if (settingsEl) settingsEl.style.display = 'none';
      } else if (tab === 'settings') {
        if (settingsEl) {
          settingsEl.innerHTML = this.renderSettings();
          settingsEl.style.display = 'block';
        }
        if (dashboardEl) dashboardEl.style.display = 'none';
      }

      if (toEl) {
        toEl.style.opacity = '0';
        toEl.style.transform = 'translateY(8px)';
        toEl.style.transition = 'opacity 200ms ease, transform 200ms ease';
        requestAnimationFrame(() => {
          toEl.style.opacity = '1';
          toEl.style.transform = 'translateY(0)';
        });
      }

      // Smoothly reveal inventories/items after tab switch
      this.accounts.forEach(acc => this.animateInventoryContainer(acc.id));
    };

    if (fromEl && fromEl !== toEl) {
      fromEl.style.transition = 'opacity 150ms ease, transform 150ms ease';
      fromEl.style.opacity = '0';
      fromEl.style.transform = 'translateY(8px)';
      setTimeout(finishSwitch, 150);
    } else {
      finishSwitch();
    }
  },

  openAddAccountModal() {
    const modal = document.getElementById('addAccountModal');
    if (!modal) return;

    const appRoot = document.getElementById('app');
    if (appRoot) {
      appRoot.classList.add('app-blurred');
    }

    modal.classList.add('active');
    modal.style.opacity = '0';
    modal.style.transform = 'translateY(12px) scale(0.98)';
    modal.style.transition = 'opacity 200ms ease, transform 200ms ease';

    requestAnimationFrame(() => {
      modal.style.opacity = '1';
      modal.style.transform = 'translateY(0) scale(1)';
    });
  },

  closeAddAccountModal() {
    const modal = document.getElementById('addAccountModal');
    if (!modal) return;

    modal.style.transition = 'opacity 180ms ease, transform 180ms ease';
    modal.style.opacity = '0';
    modal.style.transform = 'translateY(12px) scale(0.98)';

    const appRoot = document.getElementById('app');
    if (appRoot) {
      appRoot.classList.remove('app-blurred');
    }

    setTimeout(() => {
      modal.classList.remove('active');
    }, 180);
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

    const account = this.accounts.find(a => String(a.id) === String(accountId));
    if (!account) return;

    const container = document.getElementById('inventory-' + account.id);
    if (!container) {
      // Fallback: full re-render if container not found
      this.render();
      return;
    }

    container.outerHTML = this.renderAccountInventory(account);
    this.animateInventoryContainer(account.id);
  },

  setInventoryTab(accountId, tab) {
    this.inventoryTabs.set(accountId, tab);

    const account = this.accounts.find(a => String(a.id) === String(accountId));
    if (!account) return;

    const container = document.getElementById('inventory-' + account.id);
    if (!container) {
      // Fallback: full re-render if container not found
      this.render();
      return;
    }

    container.outerHTML = this.renderAccountInventory(account);
    this.animateInventoryContainer(account.id);
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
    this.updateNotificationsUI();
    setTimeout(() => {
      this.hideNotification(id);
    }, 5000);
  },

  hideNotification(id) {
    const notifEl = document.querySelector('[data-notification-id="' + id + '"]');

    if (notifEl) {
      notifEl.style.transition = 'opacity 180ms ease, transform 180ms ease';
      notifEl.style.opacity = '0';
      notifEl.style.transform = 'translateY(8px)';

      setTimeout(() => {
        this.notifications = this.notifications.filter(n => n.id !== id);
        this.updateNotificationsUI();
      }, 180);
    } else {
      this.notifications = this.notifications.filter(n => n.id !== id);
      this.updateNotificationsUI();
    }
  },

  updateNotificationPosition() {
    const notifContainer = document.getElementById('notifications');
    if (!notifContainer) return;

    notifContainer.className = 'fixed bottom-4 right-4 z-[80] space-y-2 pointer-events-none';
  },

  updateNotificationsUI() {
    let notifContainer = document.getElementById('notifications');
    if (!notifContainer) {
      const div = document.createElement('div');
      div.id = 'notifications';
      div.className = 'fixed bottom-4 right-4 z-[80] space-y-2 pointer-events-none';
      document.body.appendChild(div);
      notifContainer = div;
    }

    notifContainer.innerHTML =
      '<div class="space-y-2 max-w-md w-full sm:w-auto pointer-events-auto">' +
      this.renderNotifications() +
      '</div>';

    // Animate notifications smoothly on enter
    requestAnimationFrame(() => {
      notifContainer.querySelectorAll('.notification-bubble').forEach(el => {
        if (el.dataset.animated === 'true') return;
        el.dataset.animated = 'true';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      });
    });
  },

  render() {
    if (this.currentTab === 'dashboard') {
      document.getElementById('dashboardTab').innerHTML = this.renderDashboard();
    } else {
      document.getElementById('settingsTab').innerHTML = this.renderSettings();
    }
    this.updateNotificationPosition();
    this.updateNotificationsUI();

    // Initial smooth reveal for inventories/items
    this.accounts.forEach(acc => this.animateInventoryContainer(acc.id));
    this.animateAccountCards();
  },

  renderNotifications() {
    return this.notifications.map(n =>
      '<div class="notification-bubble glass-strong px-4 py-3 rounded-lg shadow-lg ' +
      (n.type === 'success' ? 'border-l-4 border-green-500' : n.type === 'error' ? 'border-l-4 border-red-500' : 'border-l-4 border-blue-500') + '"' +
      ' data-notification-id="' + n.id + '"' +
      ' style="opacity:0; transform:translateY(8px); transition:opacity 200ms ease, transform 200ms ease;">' +
      '<p class="text-white text-sm"><i class="fas fa-' + (n.type === 'success' ? 'check-circle' : n.type === 'error' ? 'exclamation-circle' : 'info-circle') + ' mr-2"></i>' + n.message + '</p>' +
      '</div>'
    ).join('');
  },

  animateInventoryContainer(accountId) {
    const container = document.getElementById('inventory-' + accountId);
    if (!container) return;

    const itemsEl = container.querySelector('.inventory-items');
    if (!itemsEl) return;

    itemsEl.style.opacity = '0';
    itemsEl.style.transform = 'translateY(4px)';
    itemsEl.style.transition = 'opacity 200ms ease, transform 200ms ease';

    requestAnimationFrame(() => {
      itemsEl.style.opacity = '1';
      itemsEl.style.transform = 'translateY(0)';
    });
  },

  animateAccountCards() {
    const cards = document.querySelectorAll('#dashboardTab .account-card');
    cards.forEach((card, index) => {
      if (card.dataset.animated === 'true') return;
      card.dataset.animated = 'true';

      card.style.opacity = '0';
      card.style.transform = 'translateY(8px)';
      card.style.transition = 'opacity 220ms ease, transform 220ms ease';

      setTimeout(() => {
        requestAnimationFrame(() => {
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
        });
      }, index * 40);
    });
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
      '<button onclick="App.openAddAccountModal()" class="glass-strong glass-cta hover:bg-blue-600/30 text-white px-6 py-3 rounded-lg font-semibold transition-all">' +
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

  renderAccountInventory(account) {
    const inventory = this.accountInventories.get(account.id) || [];
    const tradableItems = inventory.filter(i => i.tradable && !i.tradeLocked && !i.tradeProtected);
    const nonTradableItems = inventory.filter(i => !i.tradable || i.tradeLocked || i.tradeProtected);
    const itemCount = inventory.length;

    const currentTab = this.inventoryTabs.get(account.id) || 'tradable';
    const visibleItems = currentTab === 'tradable' ? tradableItems : nonTradableItems;
    const isExpanded = this.expandedAccounts.has(account.id);
    const displayLimit = isExpanded ? visibleItems.length : 20;
    const hasMore = visibleItems.length > 20;

    return '<div id="inventory-' + account.id + '" class="mb-4">' +
      '<h4 class="text-sm font-semibold text-gray-300 uppercase mb-3"><i class="fas fa-box mr-2"></i>Inventory (' + itemCount + ')</h4>' +
      '<div class="grid grid-cols-2 gap-2 mb-3">' +
      '<button onclick="App.setInventoryTab(\'' + account.id + '\', \'tradable\')" ' +
      'class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ' +
      (currentTab === 'tradable' ? 'glass-strong text-white' : 'glass text-gray-300 hover:text-white') + '">' +
      '<i class="fas fa-exchange-alt"></i><span>Tradable (' + tradableItems.length + ')</span>' +
      '</button>' +
      '<button onclick="App.setInventoryTab(\'' + account.id + '\', \'non-tradable\')" ' +
      'class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ' +
      (currentTab === 'non-tradable' ? 'glass-strong text-white' : 'glass text-gray-300 hover:text-white') + '">' +
      '<i class="fas fa-ban"></i><span>Non-tradable (' + nonTradableItems.length + ')</span>' +
      '</button>' +
      '</div>' +
      '<div class="inventory-items space-y-2 max-h-80 overflow-y-auto scrollbar-hide">' +
      (visibleItems.length === 0 ? '<div class="text-center py-8 text-gray-400"><i class="fas fa-inbox text-4xl mb-2"></i><p>No items</p></div>' :
        visibleItems.slice(0, displayLimit).map(item => this.renderItem(item)).join('')) +
      '</div>' +
      (hasMore && !isExpanded ?
        '<button onclick="App.toggleExpandInventory(\'' + account.id + '\')" class="w-full glass glass-cta hover:bg-white/10 text-white py-2 rounded-lg mt-2 text-sm transition-all">' +
        '<i class="fas fa-chevron-down mr-2"></i>Show All (' + (visibleItems.length - 20) + ' more)' +
        '</button>' : '') +
      (isExpanded ?
        '<button onclick="App.toggleExpandInventory(\'' + account.id + '\')" class="w-full glass glass-cta hover:bg-white/10 text-white py-2 rounded-lg mt-2 text-sm transition-all">' +
        '<i class="fas fa-chevron-up mr-2"></i>Show Less' +
        '</button>' : '') +
      '</div>';
  },

  isHideIdentityEnabled() {
    return String(this.settings.hide_identity || 'false') === 'true';
  },

  toggleHideIdentity() {
    const newValue = this.isHideIdentityEnabled() ? 'false' : 'true';
    this.settings.hide_identity = newValue;

    // Persist setting to backend
    this.saveSetting('hide_identity', newValue);

    // Re-render current view so masking applies immediately
    this.render();
  },

  maskUsername(username) {
    if (!this.isHideIdentityEnabled() || !username) return username;

    if (username.length <= 4) {
      return username[0] + '***';
    }

    const start = username.slice(0, 2);
    const end = username.slice(-3);
    return start + '***' + end;
  },

  maskEmail(email) {
    if (!this.isHideIdentityEnabled() || !email) return email;

    const parts = String(email).split('@');
    if (parts.length !== 2) return this.maskUsername(email);

    const local = parts[0];
    const domain = parts[1];

    let maskedLocal;
    if (local.length <= 4) {
      maskedLocal = local[0] + '***';
    } else {
      maskedLocal = local.slice(0, 2) + '***' + local.slice(-2);
    }

    return maskedLocal + '@' + domain;
  },

  renderAccount(account) {
    const statusIcon = account.status === 'online' ? 'check-circle text-green-400' : account.status === 'error' ? 'exclamation-circle text-red-400' : 'circle text-gray-400';
    const inventory = this.accountInventories.get(account.id) || [];
    const tradableItems = inventory.filter(i => i.tradable && !i.tradeLocked && !i.tradeProtected);
    const tradableCount = tradableItems.length;

    const displayUsername = this.maskUsername(account.username);
    const displayEmail = this.maskEmail(account.email);

    return '<div id="account-' + account.id + '" class="account-card glass-strong glass-tilt rounded-xl p-6 border border-white/20 hover:border-white/30 transition-all">' +
      '<div class="flex justify-between items-center mb-4">' +
      '<div>' +
      '<h3 class="text-xl font-semibold text-white">' + displayUsername + '</h3>' +
      (displayEmail ? '<p class="text-gray-400 text-sm"><i class="fas fa-envelope mr-1"></i>' + displayEmail + '</p>' : '') +
      '<div class="flex items-center gap-2 mt-1">' +
      '<i class="fas fa-' + statusIcon + '"></i>' +
      '<span class="text-gray-300 text-sm capitalize">' + account.status + '</span>' +
      '</div>' +
      '</div>' +
      '<button onclick="App.refreshInventory(\'' + account.id + '\', \'' + account.username + '\')" class="glass glass-cta hover:bg-white/10 p-2 rounded-lg transition-all">' +
      '<i class="fas fa-sync-alt text-white"></i>' +
      '</button>' +
      '</div>' +
      this.renderAccountInventory(account) +
      '<button onclick="App.sendTrade(\'' + account.id + '\', \'' + account.username + '\')" ' +
      'class="w-full glass-strong glass-cta hover:bg-blue-600/30 text-white py-3 rounded-lg font-semibold transition-all">' +
      '<i class="fas fa-paper-plane mr-2"></i>Send ' + tradableCount + ' Items' +
      '</button>' +
      '</div>';
  },

  renderItem(item) {
    let icon = 'check-circle text-green-400';
    if (item.tradeProtected) icon = 'shield-alt text-orange-400';
    else if (item.tradeLocked) icon = 'lock text-red-400';
    else if (!item.tradable) icon = 'times-circle text-red-400';

    const hasHold = item.tradeHoldDuration && item.tradeHoldDuration > 0;

    let statusLabel = '';
    if (item.tradeProtected || item.tradeLocked) {
      statusLabel = hasHold
        ? item.tradeHoldDuration + ' day(s) trade lock'
        : 'Trade locked';
    } else if (!item.tradable) {
      statusLabel = 'Non-tradable';
    } else if (hasHold) {
      statusLabel = item.tradeHoldDuration + ' day(s) trade hold';
    } else {
      statusLabel = 'Tradable now';
    }

    const rarity = item.rarity || 'Unknown rarity';
    const desc = (item.description || '').trim();

    return '<div class="relative group glass rounded-lg p-3 flex items-center justify-between hover:bg-white/5 transition-all cursor-pointer">' +
      '<div class="flex items-center gap-3 flex-1">' +
      (item.image ? '<img src="' + item.image + '" class="w-12 h-12 object-contain" />' : '<i class="fas fa-box text-gray-500 text-2xl"></i>') +
      '<div class="flex-1 min-w-0">' +
      '<p class="font-medium text-white text-sm truncate">' + item.name + '</p>' +
      '<p class="text-xs text-gray-400">' + item.type + '</p>' +
      '</div>' +
      '</div>' +
      '<div class="flex flex-col items-end gap-1 text-[11px] text-gray-300 ml-2">' +
      '<i class="fas fa-' + icon + '"></i>' +
      (statusLabel ? '<span class="text-right text-gray-300">' + statusLabel + '</span>' : '') +
      '</div>' +
      '<div class="hidden sm:block absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none">' +
      '<div class="opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-150 glass-strong rounded-lg px-3 py-2 shadow-lg border border-white/20 min-w-[220px] max-w-xs text-[11px]">' +
      '<p class="text-xs font-semibold text-white mb-1">' + item.name + '</p>' +
      '<p class="text-[11px] text-gray-300 mb-1">' + rarity + ' • ' + (item.type || 'Unknown type') + '</p>' +
      (statusLabel ? '<p class="text-[11px] text-amber-300 mb-1">' + statusLabel + '</p>' : '') +
      (desc ? '<p class="text-[11px] text-gray-200 mb-1 leading-snug">' + desc + '</p>' : '') +
      '<p class="text-[11px] text-gray-400 break-all">Asset ID: ' + (item.assetid || 'N/A') + '</p>' +
      '<p class="text-[11px] text-gray-400">' + (item.marketable ? 'Marketable' : 'Not marketable') + '</p>' +
      '</div>' +
      '</div>' +
      '</div>';
  },

  renderSettings() {
    const current = this.settingsSubTab || 'current';

    return '<div class="space-y-6">' +
      '<div class="glass-strong rounded-xl p-2 border border-white/20 flex items-center gap-2 mb-2">' +
      '<button onclick="App.setSettingsSubTab(\'current\')" class="flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ' +
      (current === 'current' ? 'glass-strong text-white' : 'glass text-gray-300 hover:text-white') + '">' +
      '<i class="fas fa-sliders-h mr-2"></i>Current Settings' +
      '</button>' +
      '<button onclick="App.setSettingsSubTab(\'bots\')" class="flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ' +
      (current === 'bots' ? 'glass-strong text-white' : 'glass text-gray-300 hover:text-white') + '">' +
      '<i class="fas fa-user-cog mr-2"></i>Edit Bot Info' +
      '</button>' +
      '</div>' +
      (current === 'current' ? this.renderSettingsGeneral() : this.renderSettingsBotEditor()) +
      '</div>';
  },

  renderSettingsGeneral() {
    const hideIdentity = this.isHideIdentityEnabled();

    return '' +
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
      '<h2 class="text-xl font-semibold text-white mb-4"><i class="fas fa-user-secret mr-2"></i>Privacy</h2>' +
      '<label class="flex items-center justify-between gap-4 cursor-pointer">' +
      '<div>' +
      '<p class="text-sm text-white font-medium mb-1">Hide bot usernames & emails in UI</p>' +
      '<p class="text-xs text-gray-300">Masks bot identity in dashboard and settings.</p>' +
      '</div>' +
      '<button onclick="App.toggleHideIdentity()" class="glass px-4 py-2 rounded-full text-xs font-semibold ' +
      (hideIdentity ? 'text-emerald-300 border border-emerald-400/50' : 'text-gray-300 border border-white/20') +
      '">' +
      (hideIdentity ? '<i class="fas fa-eye-slash mr-1"></i>Hidden' : '<i class="fas fa-eye mr-1"></i>Visible') +
      '</button>' +
      '</label>' +
      '</div>' +
      '<div class="glass-strong rounded-xl p-6 border border-white/20">' +
      '<h2 class="text-xl font-semibold text-white mb-4"><i class="fas fa-gift mr-2"></i>Redeem Free Game</h2>' +
      '<input type="text" id="storeLinkInput" class="w-full glass text-white px-4 py-2 rounded-lg border border-white/20 focus:border-blue-500 focus:outline-none mb-3" placeholder="https://store.steampowered.com/app/2397300/..." />' +
      '<select id="redeemAccountSelect" class="w-full glass text-white px-4 py-2 rounded-lg border border-white/20 focus:border-blue-500 focus:outline-none mb-3">' +
      '<option value="">Select Account</option>' +
      this.accounts.filter(a => a.status === 'online').map(a => '<option value="' + a.id + '">' + a.username + '</option>').join('') +
      '</select>' +
      '<button onclick="App.redeemGame(document.getElementById(\'redeemAccountSelect\').value, document.getElementById(\'storeLinkInput\').value)" class="glass-strong hover:bg-green-600/30 text-white px-6 py-2 rounded-lg transition-all"><i class="fas fa-download mr-2"></i>Redeem</button>' +
      '</div>';
  },

  renderSettingsBotEditor() {
    if (this.accounts.length === 0) {
      return '<div class="glass-strong rounded-xl p-6 border border-white/20 text-center">' +
        '<h2 class="text-xl font-semibold text-white mb-2"><i class="fas fa-user-cog mr-2"></i>Edit Bot Info</h2>' +
        '<p class="text-gray-300 text-sm">No accounts available. Add an account on the Dashboard first.</p>' +
        '</div>';
    }

    const hideIdentity = this.isHideIdentityEnabled();

    return '<div class="space-y-4">' +
      this.accounts.map(acc =>
        (function () {
          const displayUsername = hideIdentity ? App.maskUsername(acc.username) : acc.username;
          const displayEmail = hideIdentity ? App.maskEmail(acc.email) : acc.email;

          return (
        '<div class="glass-strong rounded-xl p-5 border border-white/20">' +
        '<div class="flex items-center justify-between mb-3">' +
        '<div>' +
        '<h3 class="text-lg font-semibold text-white">' + displayUsername + '</h3>' +
        (displayEmail ? '<p class="text-xs text-gray-400">' + displayEmail + '</p>' : '') +
        '</div>' +
        '<span class="text-xs px-2 py-1 rounded-full ' +
        (acc.status === 'online' ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-300') +
        ' capitalize">' + acc.status + '</span>' +
        '</div>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
        '<div>' +
        '<label class="text-xs text-gray-300 mb-1 block">Password</label>' +
        '<input type="password" id="editPassword-' + acc.id + '" class="w-full glass text-white px-3 py-2 rounded-lg border border-white/20 focus:border-blue-500 focus:outline-none text-sm" placeholder="Leave blank to keep current" />' +
        '</div>' +
        '<div>' +
        '<label class="text-xs text-gray-300 mb-1 block">Email</label>' +
        '<input type="email" id="editEmail-' + acc.id + '" class="w-full glass text-white px-3 py-2 rounded-lg border border-white/20 focus:border-blue-500 focus:outline-none text-sm" placeholder="' + (displayEmail || 'example@domain.com') + '" />' +
        '</div>' +
        '<div>' +
        '<label class="text-xs text-gray-300 mb-1 block">Shared Secret</label>' +
        '<input type="text" id="editSharedSecret-' + acc.id + '" class="w-full glass text-white px-3 py-2 rounded-lg border border-white/20 focus:border-blue-500 focus:outline-none text-sm" placeholder="•••••• (optional)" />' +
        '</div>' +
        '<div>' +
        '<label class="text-xs text-gray-300 mb-1 block">Identity Secret</label>' +
        '<input type="text" id="editIdentitySecret-' + acc.id + '" class="w-full glass text-white px-3 py-2 rounded-lg border border-white/20 focus:border-blue-500 focus:outline-none text-sm" placeholder="•••••• (optional)" />' +
        '</div>' +
        '</div>' +
        '<div class="mt-4 flex justify-end gap-3">' +
        '<button onclick="App.saveAccountInfo(\'' + acc.id + '\')" class="glass-strong glass-cta hover:bg-blue-600/30 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all">' +
        '<i class="fas fa-save mr-2"></i>Save Changes' +
        '</button>' +
        '</div>' +
        '</div>');
        })()
      ).join('') +
      '</div>';
  },

  async saveAccountInfo(accountId) {
    const account = this.accounts.find(a => String(a.id) === String(accountId));
    if (!account) return;

    const passwordEl = document.getElementById('editPassword-' + accountId);
    const emailEl = document.getElementById('editEmail-' + accountId);
    const sharedEl = document.getElementById('editSharedSecret-' + accountId);
    const identityEl = document.getElementById('editIdentitySecret-' + accountId);

    const payload = {
      username: account.username,
      password: passwordEl && passwordEl.value ? passwordEl.value : '',
      email: emailEl ? emailEl.value : account.email || '',
      sharedSecret: sharedEl ? sharedEl.value : '',
      identitySecret: identityEl ? identityEl.value : ''
    };

    try {
      const res = await fetch('/api/accounts/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        this.addNotification('Account updated and bot restarting...', 'success');

        if (passwordEl) passwordEl.value = '';
        if (sharedEl) sharedEl.value = '';
        if (identityEl) identityEl.value = '';

        await this.loadAccounts();
      } else {
        const data = await res.json();
        this.addNotification(data.error || 'Failed to update account', 'error');
      }
    } catch (error) {
      this.addNotification('Failed to update account: ' + error.message, 'error');
    }
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    LiquidBackground.init();
    App.init();
  });
} else {
  LiquidBackground.init();
  App.init();
}