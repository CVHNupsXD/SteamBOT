const Logger = require('./logger');

class JwtUtils {
  /**
   * Decode a JWT and return its payload object.
   *
   * @param {string} token
   * @returns {object|null}
   */
  static decodeJWT(token) {
    if (!token || typeof token !== 'string' || token.split('.').length < 2) {
      return null;
    }

    let payload = token.split('.')[1]; // only care about payload

    // JWTs are base64url-encoded; convert to regular base64
    payload = payload.replace(/-/g, '+').replace(/_/g, '/');

    // Pad with '=' to make length a multiple of 4
    while (payload.length % 4 !== 0) {
      payload += '=';
    }

    try {
      const decoded = Buffer.from(payload, 'base64');
      const parsed = JSON.parse(decoded.toString());
      return parsed;
    } catch (err) {
      Logger.error('System', `Failed to parse JWT from stored refresh token: ${err.message}`);
      return null;
    }
  }
}

module.exports = JwtUtils;