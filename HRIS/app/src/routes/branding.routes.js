// Org branding (logo, favicon) — deliberately mounted WITHOUT requireAuth: the login page and
// the app shell both need to render the current logo before a session exists. GET / is fully
// public; the two upload endpoints do their own admin check since the router isn't wrapped.
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const db = require('../platform/db');
const { asyncHandler, badRequest, unauthorized, forbidden } = require('../platform/errors');
const { writeAudit } = require('../platform/audit');
const enc = require('../platform/crypto');

const router = express.Router();

// Uploaded (encrypted) logo/favicon files live OUTSIDE public/ on purpose — see the matching
// comment on UPLOAD_DIR in people.routes.js. A file at public/img/<name> sits at the exact path
// its own URL (/img/<name>) maps to, so Apache/LiteSpeed+Passenger serves it directly from disk
// and never gives Node a chance to decrypt it (confirmed in production — uploads "succeeded" but
// rendered as broken images, because the browser was receiving raw ciphertext). The bundled
// default logo (nru-logo.png) deliberately stays in public/img — it's not encrypted or sensitive,
// so serving it as a fast static file is fine; only uploads go into IMG_DIR.
const IMG_DIR = path.join(__dirname, '..', '..', 'private', 'img');
fs.mkdirSync(IMG_DIR, { recursive: true });
const DEFAULT_LOGO = '/img/nru-logo.png';

// memoryStorage — an uploaded logo/favicon is encrypted (encryptBuffer) and written by the route
// handler below, never touching disk in plaintext. The bundled default (nru-logo.png) is a
// git-tracked repo asset, not an upload, and is deliberately left as plain image bytes — decrypted
// serving in platform/fileServe.js is tolerant of that (nothing to decrypt, served as-is).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(file.mimetype)) {
      return cb(badRequest('Unsupported image type — use PNG, JPEG, WebP, GIF, SVG or ICO'));
    }
    cb(null, true);
  },
});

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) return next(unauthorized());
  if (!['HR administrator', 'System administrator'].includes(req.session.user.role)) {
    return next(forbidden('Branding changes require HR or System administrator'));
  }
  next();
}

router.get('/', asyncHandler(async (req, res) => {
  const rows = await db.query(`SELECT setting_key, setting_value FROM app_setting WHERE setting_key IN ('org_logo_url', 'org_favicon_url', 'org_name')`);
  const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  res.json({
    data: {
      logo_url: map.org_logo_url || DEFAULT_LOGO,
      favicon_url: map.org_favicon_url || null,
      org_name: map.org_name || 'Your Organization',
      is_default_logo: !map.org_logo_url,
      is_configured: !!map.org_name,
    },
  });
}));

async function saveSetting(key, value) {
  await db.query(
    `INSERT INTO app_setting (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, value]
  );
}

router.post('/logo', requireAdmin, upload.single('logo'), asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('No file uploaded');
  const before = await db.query(`SELECT setting_value FROM app_setting WHERE setting_key = 'org_logo_url'`);
  const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
  const filename = `branding-logo-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(IMG_DIR, filename), enc.encryptBuffer(req.file.buffer));
  const url = `/img/${filename}`;
  await saveSetting('org_logo_url', url);
  await writeAudit(req, 'update', 'app_setting', 'org_logo_url', before[0] || null, { url });
  if (before[0] && before[0].setting_value && before[0].setting_value.startsWith('/img/branding-')) {
    fs.unlink(path.join(IMG_DIR, path.basename(before[0].setting_value)), () => {});
  }
  res.json({ data: { logo_url: url } });
}));

router.post('/favicon', requireAdmin, upload.single('favicon'), asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('No file uploaded');
  const before = await db.query(`SELECT setting_value FROM app_setting WHERE setting_key = 'org_favicon_url'`);
  const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
  const filename = `branding-favicon-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(IMG_DIR, filename), enc.encryptBuffer(req.file.buffer));
  const url = `/img/${filename}`;
  await saveSetting('org_favicon_url', url);
  await writeAudit(req, 'update', 'app_setting', 'org_favicon_url', before[0] || null, { url });
  if (before[0] && before[0].setting_value && before[0].setting_value.startsWith('/img/branding-')) {
    fs.unlink(path.join(IMG_DIR, path.basename(before[0].setting_value)), () => {});
  }
  res.json({ data: { favicon_url: url } });
}));

router.delete('/logo', requireAdmin, asyncHandler(async (req, res) => {
  const before = await db.query(`SELECT setting_value FROM app_setting WHERE setting_key = 'org_logo_url'`);
  await db.query(`DELETE FROM app_setting WHERE setting_key = 'org_logo_url'`);
  await writeAudit(req, 'delete', 'app_setting', 'org_logo_url', before[0] || null, null);
  res.json({ data: { logo_url: DEFAULT_LOGO } });
}));

router.delete('/favicon', requireAdmin, asyncHandler(async (req, res) => {
  const before = await db.query(`SELECT setting_value FROM app_setting WHERE setting_key = 'org_favicon_url'`);
  await db.query(`DELETE FROM app_setting WHERE setting_key = 'org_favicon_url'`);
  await writeAudit(req, 'delete', 'app_setting', 'org_favicon_url', before[0] || null, null);
  res.json({ data: { favicon_url: null } });
}));

module.exports = router;
