import { Router } from 'express';
import { putObject, getObject } from '../services/s3.js';

const router = Router();

router.post('/pageview', async (req, res) => {
  const { path, referrer } = req.body;

  if (!path) {
    return res.status(400).json({ error: 'Path is required' });
  }

  const today = new Date().toISOString().split('T')[0];
  const key = `analytics/${today}.json`;

  try {
    let views = [];
    try {
      const existing = await getObject(key);
      views = JSON.parse(existing);
    } catch {
      // No data for today yet
    }

    views.push({
      path,
      referrer: referrer || null,
      timestamp: new Date().toISOString(),
      ip: req.ip,
    });

    await putObject(key, JSON.stringify(views), 'application/json');
    res.json({ success: true });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to record pageview' });
  }
});

router.get('/', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const key = `analytics/${today}.json`;

  try {
    let views = [];
    try {
      const data = await getObject(key);
      views = JSON.parse(data);
    } catch {
      // No data yet
    }

    const pathCounts = {};
    for (const view of views) {
      pathCounts[view.path] = (pathCounts[view.path] || 0) + 1;
    }

    res.json({ date: today, total: views.length, paths: pathCounts });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

export default router;
