const express = require('express');
const { promClient } = require('../middleware/metrics');

const router = express.Router();

router.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', promClient.register.contentType);
    const metrics = await promClient.register.metrics();
    res.end(metrics);
  } catch (error) {
    if (req.log) {
      req.log.error({ error: error.message }, 'Failed to generate metrics');
    }
    res.status(500).end(error.message);
  }
});

module.exports = router;
