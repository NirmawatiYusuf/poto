const { listPhotos, getPhotoStream, deletePhoto } = require('./lib/gdrive');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const photoId = url.searchParams.get('id');

    // ─── Delete Photo (Google Drive / Local Disk) ───
    if (req.method === 'DELETE' || (req.method === 'POST' && url.searchParams.get('action') === 'delete')) {
      if (!photoId) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'Photo ID is required for deletion' }));
      }

      const result = await deletePhoto(photoId);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(result));
    }

    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Method Not Allowed. Use GET or DELETE.' }));
    }

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
