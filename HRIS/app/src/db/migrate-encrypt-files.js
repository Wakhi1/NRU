// One-time migration: encrypt existing plaintext files under uploads/ (employee profile photos)
// and the branding-uploaded files under public/img/ (branding-logo-*, branding-favicon-* — NOT
// the bundled default nru-logo.png, which is a git-tracked repo asset, not user data, and is
// deliberately left alone). Safe to re-run — a file that decrypts successfully (its GCM auth tag
// verifies) is already ciphertext and is skipped, so this only touches files that are still
// genuinely plaintext. Not part of the normal migrate.js run since it's a one-time data
// migration, not a schema change. Mirrors migrate-encrypt-fields.js's same idempotency approach,
// applied to files instead of DB columns.
const fs = require('fs');
const path = require('path');
const enc = require('../platform/crypto');

function looksAlreadyEncrypted(buf) {
  // decryptBufferTolerant() returns the input unchanged when it can't parse/verify it as our
  // ciphertext format — so "result !== input" (by reference/content) means it really was ours
  // already. Compare by content since these are fresh Buffer instances either way.
  const result = enc.decryptBufferTolerant(buf);
  return !result.equals(buf);
}

function migrateDir(dir, { onlyPrefix } = {}) {
  if (!fs.existsSync(dir)) { console.log(`${dir}: does not exist, skipping`); return; }
  const files = fs.readdirSync(dir).filter((f) => !f.startsWith('.') && (!onlyPrefix || f.startsWith(onlyPrefix)));
  let migrated = 0;
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (!fs.statSync(filePath).isFile()) continue;
    const buf = fs.readFileSync(filePath);
    if (looksAlreadyEncrypted(buf)) continue;
    fs.writeFileSync(filePath, enc.encryptBuffer(buf));
    migrated++;
  }
  console.log(`${dir}: ${migrated} file(s) encrypted (${files.length - migrated} already done, skipped, or not a file)`);
}

(async () => {
  // private/uploads and private/img (not uploads/ or public/img) — see UPLOAD_DIR's comment in
  // people.routes.js for why user-uploaded files live outside any folder whose path matches its
  // own serving URL. Also sweeps the old uploads/ and public/img/branding-* locations in case
  // this runs against a server that hasn't had its files migrated to the new folders yet.
  migrateDir(path.join(__dirname, '..', '..', 'private', 'uploads'));
  migrateDir(path.join(__dirname, '..', '..', 'private', 'img'), { onlyPrefix: 'branding-' });
  migrateDir(path.join(__dirname, '..', '..', 'uploads'));
  migrateDir(path.join(__dirname, '..', '..', 'public', 'img'), { onlyPrefix: 'branding-' });
  console.log('Done.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
