# Deploying HRIS to production

This repo is a monorepo (`ACCOUNTING/`, `HRIS/`, `SPTS/` at the root) but only `HRIS/app` is the
live Node application at `hris.docsecuresd.com`. Your hosting account has **cPanel File Manager,
FTP accounts, Git Version Control, and phpMyAdmin** — no SSH/terminal. This guide sets up:

1. A GitHub Actions workflow that FTPs `HRIS/app` to the server automatically on every push to
   `main` and restarts the Node app — no manual File Manager uploads after this is wired up.
2. A one-time fix for the missing `uploads/` folder that's been breaking photo/logo uploads.
3. A clean production database (System administrator + HR administrator only, no demo data).

Do these roughly in order — each section says what depends on what.

---

## 1. One-time server fixes (File Manager)

### 1a. Create the missing `uploads/` folder

The `ENOENT: no such file or directory, open '/home/USERNAME/uploads/...'` error you saw on
profile photo upload means this folder doesn't exist on the server. Same root cause very likely
explains the silent branding logo/favicon failures.

- In cPanel File Manager, go to your Node app's **Application root** (the same folder you set
  in "Setup Node.js App" — e.g. `/home/USERNAME/nodeapp`).
- Create a new folder named exactly `uploads` there, as a sibling of `src/` and `public/`.
- Right-click it → Permissions → set to `755`.
- Confirm `public/img/` already exists (it should, since it ships with the deployed code and the
  default logo renders today) — if not, create that too with `755`.

### 1b. Find your Application root and Node app details

Open cPanel → **Setup Node.js App**, click into your HRIS app, and note:

- **Application root** — e.g. `/home/USERNAME/nodeapp` (you'll need this for step 2 and 3)
- **Application URL** — should be `hris.docsecuresd.com`
- There's a **Restart** button here too — you can always use this manually instead of the
  automated `tmp/restart.txt` trick the CI workflow uses, if you ever need to force a restart.

---

## 2. Automatic deploy on push (GitHub Actions → FTP)

### 2a. Get your FTP details

cPanel → **FTP Accounts**. Either use an existing account or create one scoped to the Node app's
Application root specifically (safer than using the account's root FTP login). Note:

- FTP server/host (often just your domain, or a `ftp.` subdomain — cPanel's FTP Accounts page
  shows the exact host to use)
- FTP username
- FTP password
- The **absolute server path** to the Application root from step 1b (e.g. `/home/USERNAME/nodeapp`)

### 2b. Add GitHub repository secrets

On GitHub: your repo → **Settings → Secrets and variables → Actions → New repository secret**.
Add all four:

| Secret name | Value |
|---|---|
| `FTP_SERVER` | your FTP host |
| `FTP_USERNAME` | your FTP username |
| `FTP_PASSWORD` | your FTP password |
| `FTP_APP_DIR` | the Application root path, e.g. `/home/USERNAME/nodeapp` |

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
- Clone it to somewhere **outside** your live app folder, e.g. `/home/USERNAME/repositories/NRU`
  (it clones the whole monorepo — `ACCOUNTING`/`SPTS` included — so it shouldn't itself be the
  document root or Node app root).
- A `.cpanel.yml` is already committed at the repo root. Edit the `DEPLOYPATH` line in it to your
  real Application root (from step 1b) before relying on it:
  ```yaml
  deployment:
    tasks:
      - export DEPLOYPATH=/home/USERNAME/nodeapp/
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

1. File Manager: create `uploads/` folder, `755` permissions. (§1a)
2. Note your Application root path from Setup Node.js App. (§1b)
3. FTP Accounts: get/create FTP credentials. (§2a)
4. GitHub: add the four `FTP_*` secrets. (§2b)
5. Push anything (or use **Run workflow** in the Actions tab) to trigger the first automatic
   deploy — confirm `hris.docsecuresd.com` picks up the dashboard fix (the `"[object Object]" is
   not valid JSON"` toast should be gone) and that a branding logo upload now shows a real error
   message if it still fails, instead of doing nothing.
6. phpMyAdmin: import schema + run the clean seed (or tell me if demo data is already loaded, so
   I can give you a safe wipe-first script instead). (§3)
