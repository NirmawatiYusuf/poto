const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const TOKENS_PATH = path.join(process.cwd(), '.tokens.json');
const ENV_PATH = path.join(process.cwd(), '.env');

function getStoredTokens() {
  if (fs.existsSync(TOKENS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'));
    } catch (_) {}
  }
  return null;
}

function saveTokens(tokens) {
  try {
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
  } catch (e) {
    console.error('[OAUTH] Failed to save .tokens.json:', e.message);
  }
}

function updateEnv(key, value) {
  try {
    let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const safeValue = value.includes(' ') || value.includes('\n') ? `"${value}"` : value;
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${safeValue}`);
    } else {
      content = content.trim() + `\n${key}=${safeValue}\n`;
    }
    fs.writeFileSync(ENV_PATH, content, 'utf-8');
    process.env[key] = value;
  } catch (e) {
    console.error('[OAUTH] Failed to update .env:', e.message);
  }
}

function getOAuthClient(req) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  const rawHost = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const hostname = rawHost.split(':')[0];
  
  // Detect if running locally (localhost, 127.0.0.1, or private LAN IP like 192.168.x.x)
  const isPrivateIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || isPrivateIp;

  let redirectUri;
  if (isLocal) {
    // Google OAuth strictly forbids private IP addresses (e.g. 192.168.63.179).
    // Local development MUST always use localhost:3000!
    redirectUri = 'http://localhost:3000/api/auth/google/callback';
  } else {
    const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http');
    redirectUri = `${proto}://${rawHost}/api/auth/google/callback`;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;
  const action = urlObj.searchParams.get('action');

  // ─── 1. Status Check (GET /api/oauth?action=status) ───
  if (action === 'status' || pathname === '/api/oauth/status') {
    const stored = getStoredTokens();
    const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN || (stored && stored.refresh_token);
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    let connectedEmail = null;
    let isConnected = false;

    if (clientId && clientSecret && refreshToken) {
      isConnected = true;
      try {
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        oauth2Client.setCredentials({ refresh_token: refreshToken, ...(stored || {}) });
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const u = await oauth2.userinfo.get();
        connectedEmail = u.data?.email || null;
      } catch (e) {
        connectedEmail = stored?.email || 'Akun Google Terhubung';
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      connected: isConnected,
      email: connectedEmail,
      mode: isConnected ? 'oauth' : (process.env.GOOGLE_CLIENT_EMAIL ? 'service_account' : 'local'),
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      folderId: folderId || null
    }));
  }

  // ─── 2. Save OAuth Config from Admin UI (POST /api/oauth?action=config) ───
  if ((action === 'config' || pathname === '/api/oauth/config') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { clientId, clientSecret, folderId } = JSON.parse(body || '{}');
        if (clientId) updateEnv('GOOGLE_OAUTH_CLIENT_ID', clientId.trim());
        if (clientSecret) updateEnv('GOOGLE_OAUTH_CLIENT_SECRET', clientSecret.trim());
        if (folderId) updateEnv('GOOGLE_DRIVE_FOLDER_ID', folderId.trim());

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ success: true, message: 'Kredensial OAuth berhasil disimpan!' }));
      } catch (err) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ─── 3. Disconnect OAuth (POST /api/oauth?action=disconnect) ───
  if (action === 'disconnect' && req.method === 'POST') {
    if (fs.existsSync(TOKENS_PATH)) {
      try { fs.unlinkSync(TOKENS_PATH); } catch (_) {}
    }
    updateEnv('GOOGLE_OAUTH_REFRESH_TOKEN', '');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: true, message: 'Google Drive terputus' }));
  }

  // ─── 4. OAuth Callback from Google (GET /api/auth/google/callback or /api/oauth/callback) ───
  if (pathname.includes('/callback') || action === 'callback') {
    const code = urlObj.searchParams.get('code');
    const error = urlObj.searchParams.get('error');

    if (error) {
      res.writeHead(302, { Location: `/admin.html?oauth_error=${encodeURIComponent(error)}` });
      return res.end();
    }

    if (!code) {
      res.writeHead(302, { Location: '/admin.html?oauth_error=no_code' });
      return res.end();
    }

    try {
      const oauth2Client = getOAuthClient(req);
      if (!oauth2Client) {
        res.writeHead(302, { Location: '/admin.html?oauth_error=missing_credentials' });
        return res.end();
      }

      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      let userEmail = '';
      try {
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const u = await oauth2.userinfo.get();
        userEmail = u.data?.email || '';
      } catch (_) {}

      tokens.email = userEmail;
      saveTokens(tokens);

      if (tokens.refresh_token) {
        updateEnv('GOOGLE_OAUTH_REFRESH_TOKEN', tokens.refresh_token);
      }

      res.writeHead(302, { Location: `/admin.html?oauth_success=true&email=${encodeURIComponent(userEmail)}` });
      return res.end();
    } catch (err) {
      console.error('[OAUTH-CALLBACK] Error exchanging code:', err);
      res.writeHead(302, { Location: `/admin.html?oauth_error=${encodeURIComponent(err.message)}` });
      return res.end();
    }
  }

  // ─── 5. Initiate Google OAuth Flow (GET /api/auth/google or /api/oauth?action=login) ───
  const oauth2Client = getOAuthClient(req);
  if (!oauth2Client) {
    if (urlObj.searchParams.get('format') === 'json') {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Kredensial GOOGLE_OAUTH_CLIENT_ID / SECRET belum diisi' }));
    }
    res.writeHead(302, { Location: '/admin.html?oauth_setup_needed=true' });
    return res.end();
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/userinfo.email'
    ]
  });

  if (urlObj.searchParams.get('format') === 'json') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ authUrl }));
  }

  res.writeHead(302, { Location: authUrl });
  res.end();
};
