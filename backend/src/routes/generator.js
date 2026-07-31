const express = require('express');
const router = express.Router();

router.post('/visual', async (req, res) => {
  try {
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/visualgenerator';
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {})
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`n8n error ${response.status}: ${errText}`);
    }

    res.json({ success: true, message: 'Berhasil mengirim perintah ke n8n' });
  } catch (error) {
    console.error('[Generator] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/webhook-receive', (req, res) => {
  try {
    const data = req.body;
    console.log('[Generator] Menerima data n8n:', data?.length || 0, 'items');

    if (Array.isArray(data)) {
      if (req.wsService) {
        req.wsService.broadcast('generator_visual_done', { payload: data });
      }
      res.status(200).json({ success: true, message: 'Data diterima server' });
    } else {
      res.status(400).json({ success: false, message: 'Format data bukan array' });
    }
  } catch (error) {
    console.error('[Generator] Webhook error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
