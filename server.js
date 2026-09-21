const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Load .env locally if present
if (fs.existsSync(path.join(__dirname, '.env'))) {
  try {
    const envLines = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8').split('\n');
    envLines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const k = trimmed.slice(0, idx).trim();
        let v = trimmed.slice(idx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!process.env[k]) process.env[k] = v;
      }
    });
  } catch (_) {}
}

const PORT_HTTP = 3000;
const PORT_HTTPS = 3443;
const PUBLIC_DIR = __dirname;
const CERT_DIR = path.join(__dirname, '.certs');

// ─── Detect Local IPs ───
function getAllLocalIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        const isVirtual = /virtual|vmnet|vbox/i.test(name) || net.address.startsWith('169.254.');
        ips.push({ ip: net.address, isVirtual });
      }
    }
  }
  ips.sort((a, b) => (a.isVirtual ? 1 : 0) - (b.isVirtual ? 1 : 0));
  return ips.map(i => i.ip);
}

const allIPs = getAllLocalIPs();
const primaryIP = allIPs.find(ip => !ip.startsWith('192.168.56.') && !ip.startsWith('169.254.')) || allIPs[0] || 'localhost';

// ─── Generate Self-Signed Cert using Node.js crypto (compatible with all browsers) ───
function generateCert() {
  if (!fs.existsSync(CERT_DIR)) fs.mkdirSync(CERT_DIR, { recursive: true });

  const keyPath = path.join(CERT_DIR, 'key.pem');
  const certPath = path.join(CERT_DIR, 'cert.pem');

  // Generate RSA key pair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Build SAN entries
  const sanEntries = [
    { type: 'DNS', value: 'localhost' },
    { type: 'IP', value: '127.0.0.1' },
  ];
  allIPs.forEach(ip => sanEntries.push({ type: 'IP', value: ip }));

  // Create self-signed X.509 certificate using Node 20+ createCertificate (not available)
  // Fallback: use the forge approach via manual ASN.1
  // Actually, use node:crypto X509Certificate is read-only...
  // Best approach: generate via openssl-like subprocess or use a compatible lib

  // Since selfsigned had issues, let's try with node-forge inline
  try {
    const forge = requireForge();
    const pki = forge.pki;

    const keys = pki.rsa.generateKeyPair(2048);
    const cert = pki.createCertificate();

    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01' + crypto.randomBytes(8).toString('hex');
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

    const attrs = [
      { name: 'commonName', value: primaryIP },
      { name: 'organizationName', value: 'SnapBooth Studio' },
      { name: 'countryName', value: 'ID' },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    const altNames = sanEntries.map(entry => {
      if (entry.type === 'DNS') return { type: 2, value: entry.value };
      if (entry.type === 'IP') return { type: 7, ip: entry.value };
    });

    cert.setExtensions([
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames },
    ]);

    cert.sign(keys.privateKey, forge.md.sha256.create());

    const pemKey = pki.privateKeyToPem(keys.privateKey);
    const pemCert = pki.certificateToPem(cert);

    fs.writeFileSync(keyPath, pemKey);
    fs.writeFileSync(certPath, pemCert);

    return { key: pemKey, cert: pemCert };
  } catch (e) {
    // Fallback to selfsigned package
    console.log('   Using selfsigned fallback...');
    const selfsigned = require('selfsigned');
    const altNames = [
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' },
    ];
    allIPs.forEach(ip => altNames.push({ type: 7, ip }));

    const pems = selfsigned.generate(
      [{ name: 'commonName', value: primaryIP }],
      {
        days: 365,
        keySize: 2048,
        algorithm: 'sha256',
        extensions: [
          { name: 'basicConstraints', cA: false },
          { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
          { name: 'extKeyUsage', serverAuth: true },
          { name: 'subjectAltName', altNames },
        ],
      }
    );

    fs.writeFileSync(keyPath, pems.private);
    fs.writeFileSync(certPath, pems.cert);

    return { key: pems.private, cert: pems.cert };
  }
}

function requireForge() {
  try {
    return require('node-forge');
  } catch {
    // Install on the fly
    console.log('   Installing node-forge for certificate generation...');
    execSync('npm install --save-dev node-forge', { cwd: __dirname, stdio: 'pipe' });
    return require('node-forge');
  }
}

// ─── MIME Types ───
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

// ─── Captures Directory ───
const CAPTURES_DIR = path.join(PUBLIC_DIR, 'captures');
if (!fs.existsSync(CAPTURES_DIR)) fs.mkdirSync(CAPTURES_DIR, { recursive: true });

// ─── Helper: Read POST body ───
function readBody(req, maxBytes = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    req.on('data', chunk => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        req.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

// ─── CORS Headers ───
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ─── Request Handler ───
function handleRequest(req, res) {
  const hostHeader = req.headers.host || 'localhost';
  const reqHost = hostHeader.split(':')[0];
  const targetIP = (reqHost !== 'localhost' && reqHost !== '127.0.0.1') ? reqHost : primaryIP;

  const parsedUrl = new URL(req.url, `http://${hostHeader}`);
  let pathname = parsedUrl.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // Handle /admin route
  if (pathname === '/admin') pathname = '/admin.html';

  // API: Server info
  if (pathname === '/api/info') {
    setCorsHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      localIP: targetIP,
      httpUrl: `http://${targetIP}:${PORT_HTTP}`,
      httpsUrl: `https://${targetIP}:${PORT_HTTPS}`
    }));
    return;
  }

  // API: Upload photo (delegates to api/upload.js)
  if (pathname === '/api/upload') {
    return require('./api/upload')(req, res);
  }

  // API: List photos (delegates to api/photos.js)
  if (pathname === '/api/photos') {
    return require('./api/photos')(req, res);
  }

  // API: Admin PIN authentication (delegates to api/auth.js)
  if (pathname === '/api/auth') {
    return require('./api/auth')(req, res);
  }

  // API: Google OAuth 2.0 flow & config
  if (pathname.startsWith('/api/auth/google') || pathname.startsWith('/api/oauth')) {
    return require('./api/oauth')(req, res);
  }

  if (pathname === '/') pathname = '/index.html';

  // Don't serve server internals
  if (pathname.startsWith('/.certs') || pathname.startsWith('/node_modules') || pathname === '/server.js' || pathname === '/package.json' || pathname === '/package-lock.json') {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const filePath = path.join(PUBLIC_DIR, pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(data);
  });
}

// ─── Boot ───
console.log('\n  Generating SSL certificate for mobile camera access...');
const tlsCreds = generateCert();
console.log('  Certificate ready.\n');

const httpServer = http.createServer(handleRequest);
const httpsServer = https.createServer({
  key: tlsCreds.key,
  cert: tlsCreds.cert,
  // Ensure broad browser compatibility
  minVersion: 'TLSv1.2',
}, handleRequest);

httpServer.listen(PORT_HTTP, '0.0.0.0', () => {
  console.log(`  SnapBooth Studio`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  HTTP  : http://localhost:${PORT_HTTP}`);
  console.log(`  HTTP  : http://${primaryIP}:${PORT_HTTP}`);
});

httpsServer.listen(PORT_HTTPS, '0.0.0.0', () => {
  console.log(`  HTTPS : https://${primaryIP}:${PORT_HTTPS}`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  Buka HTTPS link di HP (Wi-Fi sama),`);
  console.log(`  klik Advanced > Proceed, kamera aktif!\n`);
});
