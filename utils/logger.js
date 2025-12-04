const fs = require('fs');
const path = require('path');

const logsFolder = path.join(__dirname, '../logs');
if (!fs.existsSync(logsFolder)) {
  fs.mkdirSync(logsFolder);
}

const now = new Date();
const logFileName = `${now.getFullYear()}-${(now.getMonth()+1)
  .toString().padStart(2, '0')}-${now.getDate()
  .toString().padStart(2, '0')}_${now.getHours()
  .toString().padStart(2, '0')}-${now.getMinutes()
  .toString().padStart(2, '0')}-${now.getSeconds()
  .toString().padStart(2, '0')}.log`;

const logFilePath = path.join(logsFolder, logFileName);

class Logger {
  static getTimestamp() {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `[${day}/${month}/${year} - ${hours}:${minutes}:${seconds}]`;
  }

  static writeLog(entry) {
    fs.appendFileSync(logFilePath, entry + '\n', 'utf8');
  }

  static info(username, message) {
    const log = `${Logger.getTimestamp()} ℹ️  [${username}] ${message}`;
    console.log(log);
    Logger.writeLog(log);
  }

  static success(username, message) {
    const log = `${Logger.getTimestamp()} ✓ [${username}] ${message}`;
    console.log(log);
    Logger.writeLog(log);
  }

  static error(username, message) {
    const log = `${Logger.getTimestamp()} ✗ [${username}] ${message}`;
    console.error(log);
    Logger.writeLog(log);
  }

  static warning(username, message) {
    const log = `${Logger.getTimestamp()} ⚠ [${username}] ${message}`;
    console.log(log);
    Logger.writeLog(log);
  }

  static gift(username, message) {
    const log = `${Logger.getTimestamp()} 🎁 [${username}] ${message}`;
    console.log(log);
    Logger.writeLog(log);
  }

  static trade(username, message) {
    const log = `${Logger.getTimestamp()} 📨 [${username}] ${message}`;
    console.log(log);
    Logger.writeLog(log);
  }

  static inventory(username, message) {
    const log = `${Logger.getTimestamp()} 📦 [${username}] ${message}`;
    console.log(log);
    Logger.writeLog(log);
  }

  static system(message) {
    const log = `${Logger.getTimestamp()} 🔧 ${message}`;
    console.log(log);
    Logger.writeLog(log);
  }

  static separator() {
    const log = '=================================';
    console.log(log);
    Logger.writeLog(log);
  }
}

module.exports = Logger;
