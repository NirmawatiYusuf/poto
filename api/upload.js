const { savePhoto } = require('./lib/gdrive');

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') {
      return resolve(req.body);
    }
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) { // 25MB max
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method Not Allowed. Use POST.' }));
  }

  try {
    const payload = await readBody(req);
    const { image, type, filter, device } = payload;

    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Invalid or missing base64 image data' }));
    }

    const matches = image.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
    if (!matches) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Invalid base64 image format' }));
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    const buffer = Buffer.from(matches[2], 'base64');

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const deviceTag = (device || 'unknown').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
    const filterTag = (filter || 'raw').replace(/[^a-zA-Z0-9-]/g, '_');
    const photoType = type === 'strip' ? 'strip' : 'photo';
    const filename = `snapbooth_${photoType}_${filterTag}_${deviceTag}_${timestamp}.${ext}`;

    const result = await savePhoto({
      buffer,
      filename,
      mimeType,
      metadata: {
        device: deviceTag,
        type: photoType,
        filter: filterTag
      }
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(result));
  } catch (err) {
    console.error('[API /upload] Error:', err.message);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
  }
};
