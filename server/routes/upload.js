import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { generatePresignedUploadUrl } from '../services/s3.js';

const router = Router();

const BUCKET = process.env.S3_BUCKET || 'maxharris-share';
const REGION = process.env.AWS_REGION || 'us-east-1';

router.post('/presigned', async (req, res) => {
  const { filename, contentType } = req.body;

  if (!filename || !contentType) {
    return res.status(400).json({ error: 'filename and contentType are required' });
  }

  const id = uuidv4();
  const ext = filename.split('.').pop();
  const key = `uploads/${id}.${ext}`;

  try {
    const uploadUrl = await generatePresignedUploadUrl(key, contentType);
    const publicUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;

    res.json({ uploadUrl, key, publicUrl, id });
  } catch (err) {
    console.error('Presigned URL error:', err);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

export default router;
