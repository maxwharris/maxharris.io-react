import { Router } from 'express';
import { getAllItems, deleteItem } from '../services/shareStore.js';
import { deleteFile } from '../services/s3.js';

const router = Router();

router.get('/items', (req, res) => {
  res.json(getAllItems());
});

router.delete('/items/:id', async (req, res) => {
  const item = getAllItems().find((i) => i.id === req.params.id);

  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  if (item.s3Key) {
    try {
      await deleteFile(item.s3Key);
    } catch (err) {
      console.error('S3 delete error:', err);
    }
  }

  deleteItem(req.params.id);
  res.json({ success: true });
});

export default router;
