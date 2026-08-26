// Org branding (logo, favicon, org name) — mirrors the HRIS's own branding.routes.js pattern.
// Mounted WITHOUT requireAuth: the login page and the app shell both need to render the current
// logo before a session exists. GET / is fully public; the two upload endpoints do their own
// admin check inline since the router isn't wrapped. Simpler than the HRIS's own version — no
// encrypted-at-rest file storage here, since a logo/favicon isn't sensitive data (same reasoning
// the HRIS itself gives for leaving its bundled default logo unencrypted).
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const db = require('../platform/db');
const { asyncHandler, badRequest, unauthorized, forbidden } = require('../platform/errors');
const { writeAudit } = require('../platform/audit');

const router = express.Router();

const IMG_DIR = path.join(__dirname, '..', '..', 'public', 'img', 'branding');
fs.mkdirSync(IMG_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: IMG_DIR,
    filename: (req, file, cb) => cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname).toLowerCase() || '.png'}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(file.mimetype)) {
      return cb(badRequest('Unsupported image type — use PNG, JPEG, WebP, GIF, SVG or ICO'));
    }
    cb(null, true);
  },
});

// Only System administrator can change branding — same HRIS role that holds `admin.roles`
// throughout this app (see platform/scope.js — roles are the HRIS's own, not SPTS-invented ones).
function requireBrandingAdmin(req, res, next) {
  if (!req.session || !req.session.user) return next(unauthorized());
  if (!(req.session.user.roleKeys || []).includes('System administrator')) return next(forbidden('Branding changes require System administrator'));
  next();
}

async function getSetting(key) {
  const rows = await db.query('SELECT setting_value FROM app_setting WHERE setting_key = ?', [key]);
  return rows[0]?.setting_value || null;
}
async function saveSetting(key, value) {
  await db.query(
    `INSERT INTO app_setting (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, value]
  );
}

router.get('/', asyncHandler(async (req, res) => {
  const [logoUrl, faviconUrl, orgName] = await Promise.all([getSetting('org_logo_url'), getSetting('org_favicon_url'), getSetting('org_name')]);
  res.json({
    data: {
      logo_url: logoUrl || null,
      favicon_url: faviconUrl || null,
      org_name: orgName || 'NRU',
      is_default_logo: !logoUrl,
      is_configured: !!orgName,
    },
  });
}));

router.post('/logo', requireBrandingAdmin, upload.single('logo'), asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('No file uploaded');
  const before = await getSetting('org_logo_url');
  const url = `/img/branding/${req.file.filename}`;
  await saveSetting('org_logo_url', url);
  await writeAudit(req, 'branding.logo.update', 'app_setting', 'org_logo_url', { url: before }, { url });
  if (before && before.startsWith('/img/branding/')) fs.unlink(path.join(IMG_DIR, path.basename(before)), () => {});
  res.json({ data: { logo_url: url } });
}));

router.post('/favicon', requireBrandingAdmin, upload.single('favicon'), asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('No file uploaded');
  const before = await getSetting('org_favicon_url');
  const url = `/img/branding/${req.file.filename}`;
  await saveSetting('org_favicon_url', url);
  await writeAudit(req, 'branding.favicon.update', 'app_setting', 'org_favicon_url', { url: before }, { url });
  if (before && before.startsWith('/img/branding/')) fs.unlink(path.join(IMG_DIR, path.basename(before)), () => {});
  res.json({ data: { favicon_url: url } });
}));

router.put('/org-name', requireBrandingAdmin, asyncHandler(async (req, res) => {
  const name = String(req.body.org_name || '').trim();
  if (!name) throw badRequest('Organisation name is required');
  const before = await getSetting('org_name');
  await saveSetting('org_name', name);
  await writeAudit(req, 'branding.org_name.update', 'app_setting', 'org_name', { org_name: before }, { org_name: name });
  res.json({ ok: true });
}));

module.exports = router;
