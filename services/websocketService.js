// ========================================
// services/websocketService.js
// ========================================
const WebSocket = require('ws');
const Logger = require('../utils/logger');

class WebSocketService {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.clients = new Set();
    
    this.wss.on('connection', (ws) => this.handleConnection(ws));
    Logger.success('System', 'WebSocket server initialized');
  }

  handleConnection(ws) {
    this.clients.add(ws);
    Logger.info('System', `Client connected. Total clients: ${this.clients.size}`);

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleMessage(ws, message);
      } catch (error) {
        Logger.error('WebSocket', `Failed to parse message: ${error.message}`);
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      Logger.info('System', `Client disconnected. Total clients: ${this.clients.size}`);
    });

    ws.on('error', (error) => {
      Logger.error('WebSocket', `Client error: ${error.message}`);
    });

    // Send welcome message
    this.sendToClient(ws, {
      type: 'connected',
      message: 'Connected to Steam Bot Manager'
    });
  }

  handleMessage(ws, message) {
    Logger.info('WebSocket', `Received message: ${message.type}`);
    
    // Handle different message types
    switch (message.type) {
      case 'ping':
        this.sendToClient(ws, { type: 'pong' });
        break;
      case 'subscribe':
        // Handle subscriptions if needed
        break;
      default:
        Logger.warning('WebSocket', `Unknown message type: ${message.type}`);
    }
  }

  sendToClient(client, data) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(data));
      } catch (error) {
        Logger.error('WebSocket', `Failed to send to client: ${error.message}`);
      }
    }
  }

  broadcast(data) {
    const message = JSON.stringify(data);
    let sent = 0;
    
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
          sent++;
        } catch (error) {
          Logger.error('WebSocket', `Failed to broadcast to client: ${error.message}`);
        }
      }
    });

    if (sent > 0) {
      Logger.info('WebSocket', `Broadcasted ${data.type} to ${sent} client(s)`);
    }
  }

  // Broadcast specific events
  emit(event, data) {
    this.broadcast({
      type: event,
      data: data,
      timestamp: Date.now()
    });
  }

  // Start heartbeat to detect dead connections
  startHeartbeat() {
    setInterval(() => {
      this.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          this.clients.delete(ws);
          return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // Every 30 seconds
  }

  // Get connection stats
  getStats() {
    return {
      totalClients: this.clients.size,
      timestamp: Date.now()
    };
  }

  // Close all connections
  close() {
    this.clients.forEach((client) => {
      client.close();
    });
    this.wss.close();
    Logger.info('WebSocket', 'WebSocket server closed');
  }
}

module.exports = WebSocketService;