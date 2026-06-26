const http = require('http');
const crypto = require('crypto');

const SECRET_KEY = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');
const PORT = process.env.PORT || 4000;

// Base64URL helper functions
function base64url(str, encoding = 'utf8') {
  return Buffer.from(str, encoding)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString('utf8');
}

// Custom JWT Sign implementation using native Node.js crypto
function signJWT(payload, secret, options = {}) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const cleanPayload = { ...payload };
  const expiresIn = options.expiresIn || '15m'; // Cambiado a '15m' por seguridad (buenas prácticas)

  let exp;
  if (typeof expiresIn === 'string') {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (match) {
      const val = parseInt(match[1], 10);
      const unit = match[2];
      const now = Math.floor(Date.now() / 1000);
      let seconds = 0;
      if (unit === 's') seconds = val;
      else if (unit === 'm') seconds = val * 60;
      else if (unit === 'h') seconds = val * 3600;
      else if (unit === 'd') seconds = val * 86400;
      exp = now + seconds;
    }
  } else if (typeof expiresIn === 'number') {
    exp = Math.floor(Date.now() / 1000) + expiresIn;
  }

  if (exp) {
    cleanPayload.exp = exp;
  }

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(cleanPayload));

  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signatureInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signatureInput}.${signature}`;
}

// Custom JWT Verify implementation using native Node.js crypto
function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signatureInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (signature !== expectedSignature) {
    throw new Error('Invalid signature');
  }

  const payload = JSON.parse(base64urlDecode(encodedPayload));
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error('Token expired');
  }

  return payload;
}

// HTTP Helper to parse JSON body
function getJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Mock backend HTTP Server
const server = http.createServer(async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // Route: POST /api/login
  if (req.method === 'POST' && url.pathname === '/api/login') {
    try {
      const body = await getJsonBody(req);
      const { username, password } = body;

      // Mock check credentials
      if (username === 'admin' && password === ADMIN_PASSWORD) {
        const payload = {
          sub: 'admin',
          role: 'administrator',
          scope: 'all'
        };

        // Generates token with expiresIn: '15m' for security best practices
        const token = signJWT(payload, SECRET_KEY, { expiresIn: '15m' });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          token: token,
          message: 'Authentication successful. Token expires in 15 minutes.'
        }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid username or password' }));
      }
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Malformed JSON payload' }));
    }
    return;
  }

  // Route: GET /api/protected
  if (req.method === 'GET' && url.pathname === '/api/protected') {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Missing or invalid Authorization header' }));
      return;
    }

    const token = authHeader.substring(7);
    try {
      const decoded = verifyJWT(token, SECRET_KEY);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Access granted to protected route',
        user: decoded
      }));
    } catch (err) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // Default Route (Not Found)
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Route not found' }));
});

// Export capabilities and start server if executed directly
module.exports = {
  signJWT,
  verifyJWT,
  SECRET_KEY,
  ADMIN_PASSWORD
};

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Mock Backend server listening on port ${PORT}`);
    if (!process.env.JWT_SECRET) {
      console.log('JWT_SECRET not provided, dynamically generated secure key in use.');
    }
    if (!process.env.ADMIN_PASSWORD) {
      console.log(`ADMIN_PASSWORD not provided, dynamically generated password in use: ${ADMIN_PASSWORD}`);
    }
  });
}
