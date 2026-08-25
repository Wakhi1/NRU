# Deploying HRIS to production

This repo is a monorepo (`ACCOUNTING/`, `HRIS/`, `SPTS/` at the root) but only `HRIS/app` is the
live Node application at `hris.docsecuresd.com`. Your hosting account has **cPanel File Manager,
FTP accounts, Git Version Control, and phpMyAdmin** — no SSH/terminal. This guide sets up:

1. A one-time fix for the actual deployed folder structure, which is why photo/logo uploads
   fail — it's not a missing folder, it's a flattened directory layout.
2. A GitHub Actions workflow that FTPs `HRIS/app` to the server automatically on every push to
   `main` and restarts the Node app — no manual File Manager uploads after this is wired up.
3. A clean production database (System administrator + HR administrator only, no demo data).

Do these roughly in order — each section says what depends on what.

---

## 1. Fix the deployed folder structure (File Manager)

### The actual bug, confirmed from your File Manager screenshot

Your app's real root is **`/home/docsyrgv/hris.docsecuresd.com`**. In the repo, everything under
`HRIS/app/src/` (`config`, `db`, `platform`, `routes`, `validators`, `server.js`, ...) is meant to
live inside an `src/` subfolder, one level below the app root — e.g. `app/src/routes/people.routes.js`.
On the server right now, `src/`'s contents were flattened directly into the app root instead:
`hris.docsecuresd.com/routes/people.routes.js`, no `src/` folder at all.

That one missing directory level breaks any code that computes a path as
`path.join(__dirname, '..', '..', 'something')` — two levels up, correct only when the file is
truly two levels below the app root (`app/src/routes/*.js`). With the flattening, `routes/*.js` is
only **one** level below the app root now, so the same computation overshoots by one directory —
landing at `/home/docsyrgv/uploads` instead of `/home/docsyrgv/hris.docsecuresd.com/uploads`. That's
exactly the `ENOENT: .../home/docsyrgv/uploads/...` error from the profile photo upload, and the
identical pattern in `branding.routes.js` almost certainly explains the silent logo/favicon
failure too. CSS/JS/the default logo still render fine because those are served as plain static
files directly from `public/` by Apache/LiteSpeed before the request ever reaches Node — only the
handful of *dynamic* upload/serve routes go through the broken `__dirname` math.

**The fix is to restore the real `src/` nesting, not to scatter folders around to match the
flattened layout.** Section 2's automated deploy does this correctly on its own (it uploads
`HRIS/app/` as-is, `src/` included) — you just need two manual steps alongside it:

1. **Before or right after the first automated deploy**, go to cPanel → **Setup Node.js App** →
   your HRIS app, and change **Application startup file** from `server.js` to `src/server.js`.
   Save and restart.
2. **After confirming the app works** (dashboard loads with no JSON toast, photo/logo upload
   succeed), go back into File Manager and delete the now-stale top-level `config/`, `db/`,
   `platform/`, `routes/`, `validators/`, and `server.js` sitting directly under
   `hris.docsecuresd.com` — those are the old flattened copies, now superseded by the ones inside
   `src/`. **Leave `public/`, `uploads/`, `docs/`, `logs/`, `node_modules/`, `.env`, `.htaccess`,
   and `tmp/` alone** — those are correctly placed as siblings of `src/`, exactly where the code
   expects them.

If `uploads/` doesn't already exist as a sibling of `public/` once `src/` is restored, create it
with `755` permissions — it should already be there per your screenshot, so likely nothing to do.

### 1c. Encrypted uploads now live in a new `private/` folder — re-upload after deploying

A second, deeper bug was found after fixing the `src/` flattening: uploaded logo/favicon files
were writing successfully but rendering as **broken images** everywhere, including the raw file
in File Manager. Root cause: on Apache/LiteSpeed+Passenger hosting, if a real file exists at the
exact path a URL maps to, the webserver serves it directly and never asks Node to handle the
request. Uploaded files lived at `public/img/<filename>`, which is *exactly* the path their own
URL (`/img/<filename>`) maps to — so the webserver always won the race, serving the raw encrypted
bytes straight from disk instead of asking Node to decrypt them first. The same problem affects
profile photo uploads in `uploads/` too (and there it's worse — it also skips the login check).

Fixed by moving where encrypted files are *written* to a new `private/` folder (`private/img/`,
`private/uploads/`) whose path never matches any URL the app serves — so there's never a real
file for the webserver to shortcut to, and every request is forced through Node's decrypt step.
The public URLs themselves (`/img/<filename>`, `/uploads/<filename>`) are unchanged. Node creates
these folders itself on startup; nothing to create manually in File Manager. A `private/.htaccess`
denies direct web access to the folder too, as a second layer of protection.

**This means anything uploaded before this fix is stranded at the old location** and will still
404 or look broken if referenced — after deploying this fix, just re-upload the branding logo,
favicon, and any profile photos once more; the fresh uploads go to the new location and work
correctly. The old orphaned files in `public/img/branding-*` and `uploads/*` are harmless and can
be deleted from File Manager whenever convenient, no rush.

### Application root, for reference

- **Application root**: `/home/docsyrgv/hris.docsecuresd.com`
- **Application URL**: `hris.docsecuresd.com`
- cPanel's Setup Node.js App page also has a **Restart** button — use it any time instead of the
  automated `tmp/restart.txt` trick if you need to force a restart manually.

---

## 2. Automatic deploy on push (GitHub Actions → FTP)

### 2a. Get your FTP details

cPanel → **FTP Accounts**. Either use an existing account or create one scoped to the Node app's
Application root specifically (safer than using the account's root FTP login). Note:

- FTP server/host (often just your domain, or a `ftp.` subdomain — cPanel's FTP Accounts page
  shows the exact host to use)
- FTP username
- FTP password
- The **absolute server path** to the Application root: `/home/docsyrgv/hris.docsecuresd.com`

### 2b. Add GitHub repository secrets

On GitHub: your repo → **Settings → Secrets and variables → Actions → New repository secret**.
Add all four:

| Secret name | Value |
|---|---|
| `FTP_SERVER` | your FTP host |
| `FTP_USERNAME` | your FTP username |
| `FTP_PASSWORD` | your FTP password |
| `FTP_APP_DIR` | `/home/docsyrgv/hris.docsecuresd.com` |

Secrets are encrypted and never appear in logs or in this repo.

### 2c. The workflow itself

Already added at `.github/workflows/deploy-hris.yml`. On every push to `main` that touches
`HRIS/app/**`, it:

1. Uploads changed files from `HRIS/app/` to `FTP_APP_DIR` over FTP (skips `.env`, `node_modules`,
   `uploads/`, `logs/` — it never touches your real server config, uploaded files, or logs).
2. Writes a fresh `tmp/restart.txt` and uploads that too — this is the standard trick that makes
   cPanel's Passenger process notice and reload the app with the new code.

You can also trigger it manually anytime from GitHub → **Actions** tab → "Deploy HRIS to
production (FTP)" → **Run workflow**, without needing a new commit.

**First deploy after wiring this up**: since `package.json` changed (added the
`seed:production` script), if you ever add a new npm *dependency* you'll still need to go to
cPanel → Setup Node.js App → your app → **Run NPM Install** manually once — the FTP workflow
copies files but doesn't run `npm install` (no Node/SSH access from GitHub Actions into this
host). This specific fix didn't add any new dependencies, so nothing to do there right now.

### 2d. (Optional) cPanel Git Version Control, as a manual fallback

You mentioned you're also adding this repo to cPanel's Git Version Control. That's useful as a
secondary, manual way to pull/inspect code on the server even if you don't use it as the primary
CI trigger:

- Repository URL: `https://github.com/Wakhi1/NRU.git`
- Clone it to somewhere **outside** your live app folder, e.g. `/home/docsyrgv/repositories/NRU`
  (it clones the whole monorepo — `ACCOUNTING`/`SPTS` included — so it shouldn't itself be the
  document root or Node app root).
- A `.cpanel.yml` is already committed at the repo root, already pointed at your real path:
  ```yaml
  deployment:
    tasks:
      - export DEPLOYPATH=/home/docsyrgv/hris.docsecuresd.com/
      - /bin/cp -R HRIS/app/* $DEPLOYPATH
      - /bin/touch $DEPLOYPATH/tmp/restart.txt
  ```
- With that in place, cPanel's Git Version Control page shows a **"Deploy HEAD Commit"** button
  after a pull, which runs those exact steps.

---

## 3. Clean production database (phpMyAdmin only)

Since you have no Node access on the server, use the plain SQL version rather than
`npm run seed:production` (which needs Node and is for local/dev use only).

**If the production database is currently empty:**

1. phpMyAdmin → select the database → **Import** tab → upload `HRIS/app/src/db/schema.sql`.
   This creates every table (safe to re-run — every statement is `CREATE TABLE IF NOT EXISTS`).
2. Open `HRIS/app/src/db/seed-production.sql` in a text editor. Near the bottom, replace the
   placeholder rows:
   ```sql
   INSERT INTO person (employee_no, full_legal_name, preferred_name, email, status)
     VALUES ('ADM-0001', 'System Administrator', 'System', 'sysadmin@yourorg.org', 'active');
   INSERT INTO person (employee_no, full_legal_name, preferred_name, email, status)
     VALUES ('ADM-0002', 'HR Administrator', 'HR', 'hradmin@yourorg.org', 'active');
   ```
   with the real names/emails for your two admin accounts (keep the `app_user` email values in
   sync with whatever you put here — there are two more `INSERT INTO app_user` lines just below
   that repeat the same emails).
3. phpMyAdmin → **SQL** tab → paste the whole edited file → **Go**.
4. Log in at `hris.docsecuresd.com` with the email(s) you set and password `Passw0rd!`, then
   immediately: change both passwords (Settings → Security), set your real organisation name and
   logo (Settings → Branding — this is where the "United Nations and Religions World
   Organization" placeholder gets replaced), and add departments/employees through the app.

**If the production database already has the full demo dataset loaded** (16 fake NRU employees,
sample leave/payroll/etc.), tell me and I'll give you the exact `TRUNCATE`/`DROP` sequence first —
don't run the import over existing data, since `seed-production.sql`'s `INSERT`s (not
`INSERT ... ON DUPLICATE KEY`) will fail or duplicate against rows that already exist.

---

## Recap: what to do, in order

1. FTP Accounts: get/create FTP credentials for `/home/docsyrgv/hris.docsecuresd.com`. (§2a)
2. GitHub: add the four `FTP_*` secrets, `FTP_APP_DIR` = `/home/docsyrgv/hris.docsecuresd.com`. (§2b)
3. Push anything (or use **Run workflow** in the Actions tab) to trigger the first automatic
   deploy — this lays down the proper `src/` folder alongside the old flattened one, doesn't
   delete anything yet.
4. cPanel → Setup Node.js App → change **Application startup file** to `src/server.js` → Save →
   Restart. (§1)
5. Confirm: dashboard loads with no `"[object Object]" is not valid JSON` toast, profile photo
   upload succeeds, branding logo upload succeeds (or now shows a real error instead of nothing).
6. File Manager: delete the stale top-level `config/`, `db/`, `platform/`, `routes/`,
   `validators/`, `server.js` under `hris.docsecuresd.com` — everything now lives under `src/`. (§1)
7. phpMyAdmin: import schema + run the clean seed (or tell me if demo data is already loaded, so
   I can give you a safe wipe-first script instead). (§3)
