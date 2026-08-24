// Serves files from a directory whose contents may be AES-256-GCM encrypted at rest (see
// crypto.js's encryptBuffer / the upload routes in people.routes.js and branding.routes.js that
// write into uploads/ and public/img) — decrypts on the way out, tolerantly, so a file that was
// never encrypted (a bundled default asset, or one not yet migrated) still serves correctly. This
// replaces a plain express.static mount for those two directories specifically; every other
// static asset (css/js/html) still goes through the ordinary express.static(public) mount, which
// this module doesn't touch.
const fs = require('fs');
const path = require('path');
const enc = require('./crypto');

const MIME_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveEncryptedDir(dir) {
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const rel = decodeURIComponent(req.path.replace(/^\/+/, ''));
    if (!rel || rel.includes('..') || rel.includes('\0')) return next();
    const filePath = path.join(dir, rel);
    if (!filePath.startsWith(dir + path.sep) && filePath !== dir) return next();

    fs.readFile(filePath, (err, buf) => {
      if (err) return next();
      const plain = enc.decryptBufferTolerant(buf);
      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(plain);
    });
  };
}

module.exports = { serveEncryptedDir };
