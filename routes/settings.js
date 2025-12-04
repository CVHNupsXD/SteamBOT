const express = require('express');

module.exports = (database) => {
  const router = express.Router();

  // Get all settings
  router.get('/', (req, res) => {
    const settings = database.getAllSettings();
    res.json({ settings });
  });

  // Save setting
  router.post('/', (req, res) => {
    const { key, value } = req.body;
    
    if (!key) {
      return res.status(400).json({ error: 'Setting key is required' });
    }
    
    database.setSetting(key, value);
    res.json({ message: 'Setting saved', key, value });
  });

  // Get single setting
  router.get('/:key', (req, res) => {
    const { key } = req.params;
    const value = database.getSetting(key);
    
    if (value === null) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    res.json({ key, value });
  });

  return router;
};