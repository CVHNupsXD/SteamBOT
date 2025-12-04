class Logger {
  static info(username, message) {
    console.log(`ℹ️  [${username}] ${message}`);
  }

  static success(username, message) {
    console.log(`✓ [${username}] ${message}`);
  }

  static error(username, message) {
    console.error(`✗ [${username}] ${message}`);
  }

  static warning(username, message) {
    console.log(`⚠ [${username}] ${message}`);
  }

  static gift(username, message) {
    console.log(`🎁 [${username}] ${message}`);
  }

  static trade(username, message) {
    console.log(`📨 [${username}] ${message}`);
  }

  static inventory(username, message) {
    console.log(`📦 [${username}] ${message}`);
  }

  static system(message) {
    console.log(`🔧 ${message}`);
  }

  static separator() {
    console.log('=================================');
  }
}

module.exports = Logger;