const API_BASE = import.meta.env.VITE_API_URL || '';

export async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return res.json();
}

export async function getPresignedUrl(filename, contentType) {
  return api('/api/upload/presigned', {
    method: 'POST',
    body: JSON.stringify({ filename, contentType }),
  });
}

export async function uploadToS3(uploadUrl, file) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });

  if (!res.ok) throw new Error('Upload failed');
}
