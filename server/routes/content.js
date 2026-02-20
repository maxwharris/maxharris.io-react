import { Router } from 'express';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');

router.get('/projects', async (req, res) => {
  try {
    const data = await readFile(join(dataDir, 'projects.json'), 'utf-8');
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load projects' });
  }
});

router.get('/concepts', async (req, res) => {
  try {
    const data = await readFile(join(dataDir, 'concepts.json'), 'utf-8');
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load concepts' });
  }
});

export default router;
