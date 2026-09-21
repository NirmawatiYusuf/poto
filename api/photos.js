const { listPhotos, getPhotoStream } = require('./lib/gdrive');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method Not Allowed. Use GET.' }));
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const photoId = url.searchParams.get('id');

    // ─── Stream Single Photo / Thumbnail directly from Google Drive ───
    if (photoId) {
      try {
        const stream = await getPhotoStream(photoId);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
        return stream.pipe(res);
      } catch (streamErr) {
        console.error('[API /photos?id] Stream error:', streamErr.message);
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'Foto tidak ditemukan di Google Drive' }));
      }
    }

    // ─── List Photos ───
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const result = await listPhotos(limit);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(result));
  } catch (err) {
    console.error('[API /photos] Error:', err.message);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
  }
};
