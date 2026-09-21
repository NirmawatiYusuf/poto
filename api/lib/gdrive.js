const { google } = require('googleapis');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

// Local fallback directory
const LOCAL_CAPTURES_DIR = path.join(process.cwd(), 'captures');
if (!fs.existsSync(LOCAL_CAPTURES_DIR)) {
  try { fs.mkdirSync(LOCAL_CAPTURES_DIR, { recursive: true }); } catch (_) {}
}

const TOKENS_PATH = path.join(process.cwd(), '.tokens.json');

function getStoredTokens() {
  if (fs.existsSync(TOKENS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'));
    } catch (_) {}
  }
  return null;
}

function getDriveClient() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const stored = getStoredTokens();
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN || (stored && stored.refresh_token);

  // ─── 1. Prioritize Google OAuth 2.0 (Uses user's personal Google Drive 15GB quota!) ───
  if (clientId && clientSecret && refreshToken) {
    try {
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
      oauth2Client.setCredentials({
        refresh_token: refreshToken,
        ...(stored || {})
      });

      return {
        drive: google.drive({ version: 'v3', auth: oauth2Client }),
        folderId,
        mode: 'oauth'
      };
    } catch (err) {
      console.error('[GDRIVE-OAUTH] Auth error:', err.message);
    }
  }

  // ─── 2. Service Account Fallback (Shared Drives / Workspace) ───
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (email && privateKey && folderId) {
    try {
      privateKey = privateKey.replace(/\\n/g, '\n');
      if ((privateKey.startsWith('"') && privateKey.endsWith('"')) || (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
        privateKey = privateKey.slice(1, -1);
      }
      const auth = new google.auth.JWT({
        email,
        key: privateKey,
        scopes: ['https://www.googleapis.com/auth/drive']
      });

      return {
        drive: google.drive({ version: 'v3', auth }),
        folderId,
        mode: 'service_account'
      };
    } catch (err) {
      console.error('[GDRIVE-SA] Auth error:', err.message);
    }
  }

  return null;
}

/**
 * Upload image buffer to Google Drive or fallback to local disk
 */
async function savePhoto({ buffer, filename, mimeType = 'image/png', metadata = {} }) {
  const client = getDriveClient();

  // If Google Drive credentials configured, upload to Google Drive
  if (client) {
    try {
      const { drive, folderId } = client;
      const bufferStream = new Readable();
      bufferStream.push(buffer);
      bufferStream.push(null);

      const description = JSON.stringify({
        device: metadata.device || 'unknown',
        type: metadata.type || 'single',
        filter: metadata.filter || 'normal',
        timestamp: new Date().toISOString()
      });

      const response = await drive.files.create({
        supportsAllDrives: true,
        requestBody: {
          name: filename,
          parents: [folderId],
          description,
          properties: {
            device: metadata.device || 'unknown',
            type: metadata.type || 'single',
            filter: metadata.filter || 'normal'
          }
        },
        media: {
          mimeType,
          body: bufferStream
        },
        fields: 'id, name, webViewLink, webContentLink, thumbnailLink, createdTime, size'
      });

      const file = response.data;

      // Make file readable to anyone with link for admin thumbnail preview
      try {
        await drive.permissions.create({
          supportsAllDrives: true,
          fileId: file.id,
          requestBody: {
            role: 'reader',
            type: 'anyone'
          }
        });
      } catch (permErr) {
        console.warn('[GDRIVE] Permission warning:', permErr.message);
      }

      return {
        storage: 'gdrive',
        success: true,
        id: file.id,
        filename: file.name,
        size: parseInt(file.size || buffer.length),
        webViewLink: file.webViewLink,
        downloadUrl: `/api/photos?id=${file.id}`,
        thumbnailUrl: `/api/photos?id=${file.id}`,
        createdTime: file.createdTime || new Date().toISOString()
      };
    } catch (gdriveErr) {
      console.error('[GDRIVE] Upload failed, falling back to local:', gdriveErr.message);
    }
  }

  // Fallback: save to local disk
  const localPath = path.join(LOCAL_CAPTURES_DIR, filename);
  await fs.promises.writeFile(localPath, buffer);

  return {
    storage: 'local',
    success: true,
    id: filename,
    filename,
    size: buffer.length,
    downloadUrl: `/captures/${filename}`,
    thumbnailUrl: `/captures/${filename}`,
    createdTime: new Date().toISOString()
  };
}

/**
 * List photos from Google Drive and local captures directory
 */
async function listPhotos(limit = 100) {
  const allPhotos = [];
  let primaryStorage = 'local';

  // 1. Fetch from Google Drive if client configured
  const client = getDriveClient();
  if (client) {
    try {
      const { drive, folderId } = client;
      const res = await drive.files.list({
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        q: `'${folderId}' in parents and trashed = false and (mimeType contains 'image/')`,
        fields: 'files(id, name, mimeType, description, properties, webViewLink, webContentLink, thumbnailLink, createdTime, size)',
        orderBy: 'createdTime desc',
        pageSize: limit
      });

      primaryStorage = 'gdrive';
      (res.data.files || []).forEach(f => {
        let meta = {};
        try {
          if (f.description) meta = JSON.parse(f.description);
        } catch (_) {}

        allPhotos.push({
          id: f.id,
          filename: f.name,
          size: parseInt(f.size || 0),
          createdTime: f.createdTime,
          webViewLink: f.webViewLink,
          downloadUrl: `/api/photos?id=${f.id}`,
          thumbnailUrl: `/api/photos?id=${f.id}`,
          type: meta.type || f.properties?.type || (f.name.includes('strip') ? 'strip' : 'single'),
          filter: meta.filter || f.properties?.filter || 'normal',
          device: meta.device || f.properties?.device || 'unknown',
          storage: 'gdrive'
        });
      });
    } catch (gdriveErr) {
      console.error('[GDRIVE] List failed:', gdriveErr.message);
    }
  }

  // 2. Also check local disk captures (PC folder)
  try {
    if (fs.existsSync(LOCAL_CAPTURES_DIR)) {
      const files = await fs.promises.readdir(LOCAL_CAPTURES_DIR);
      const existingNames = new Set(allPhotos.map(p => p.filename));

      files
        .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f) && !existingNames.has(f))
        .forEach(f => {
          let stat = { size: 0, mtime: new Date() };
          try { stat = fs.statSync(path.join(LOCAL_CAPTURES_DIR, f)); } catch (_) {}
          const isStrip = f.includes('strip');
          allPhotos.push({
            id: f,
            filename: f,
            size: stat.size,
            createdTime: (stat.birthtime || stat.mtime).toISOString(),
            downloadUrl: `/captures/${f}`,
            thumbnailUrl: `/captures/${f}`,
            type: isStrip ? 'strip' : 'single',
            filter: 'normal',
            device: 'Local-Device',
            storage: 'local'
          });
        });
    }
  } catch (_) {}

  allPhotos.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

  return {
    storage: primaryStorage,
    photos: allPhotos.slice(0, limit),
    total: allPhotos.length
  };
}

async function getPhotoStream(fileId) {
  const client = getDriveClient();
  if (!client) throw new Error('Drive client not available');
  const response = await client.drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );
  return response.data;
}

module.exports = {
  getDriveClient,
  savePhoto,
  listPhotos,
  getPhotoStream
};
