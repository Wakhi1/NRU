// Thin fetch wrapper shared by every page: JSON in/out, 401 -> login redirect, toasts on error.
const Api = (() => {
  function toast(message, kind = '') {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = `toast ${kind}`.trim();
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  async function request(method, path, body) {
    const res = await fetch(`/api/v1${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });

    let payload = null;
    const text = await res.text();
    if (text) {
      try { payload = JSON.parse(text); } catch (e) { payload = text; }
    }

    if (res.status === 401) {
      // 401 covers two distinct cases: an expired/missing session (redirect to login), and a
      // credential/code rejection on the login flow itself (login.html handles that inline) —
      // either way the caller should see the server's actual message, not a generic stand-in.
      const message = (payload && payload.error) || 'Not authenticated';
      if (!location.pathname.endsWith('login.html')) {
        location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search);
      }
      throw new Error(message);
    }

    if (!res.ok) {
      const message = (payload && payload.error) || `Request failed (${res.status})`;
      toast(message, 'error');
      const err = new Error(message);
      err.status = res.status;
      err.payload = payload;
      throw err;
    }

    return payload;
  }

  // Standardizes the disabled+"Saving…" state every capture-dialog submit button should show
  // while its request is in flight, so a slow request can't be double-submitted and the user
  // always gets feedback. Restores the button's original label/state afterwards either way.
  async function withLoading(button, busyLabel, fn) {
    const original = button.textContent;
    const wasDisabled = button.disabled;
    button.disabled = true;
    button.textContent = busyLabel;
    try {
      return await fn();
    } finally {
      button.disabled = wasDisabled;
      button.textContent = original;
    }
  }

  // Branding (logo/favicon) is fetched once per page load and cached — every page (including
  // the pre-login login.html) applies the current favicon automatically, no per-page wiring.
  let brandingPromise = null;
  async function getBranding() {
    if (!brandingPromise) {
      brandingPromise = fetch('/api/v1/branding', { credentials: 'same-origin' }).then((r) => r.json()).then((r) => r.data);
    }
    return brandingPromise;
  }
  getBranding().then((b) => {
    if (b && b.favicon_url) {
      let link = document.querySelector('link[rel="icon"]');
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
      link.href = b.favicon_url;
    }
  }).catch(() => {});

  // Downloads a file produced by a POST endpoint (PDF/XLSX/CSV exports) — bypasses the JSON-only
  // request() wrapper since the response body is binary, then triggers a normal browser save via
  // a throwaway <a download>. Filename is read from the server's Content-Disposition header.
  async function download(path, body, fallbackName) {
    const res = await fetch(`/api/v1${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      credentials: 'same-origin',
    });
    if (res.status === 401) {
      location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search);
      throw new Error('Not authenticated');
    }
    if (!res.ok) {
      let message = `Export failed (${res.status})`;
      try { const j = await res.json(); if (j && j.error) message = j.error; } catch (e) { /* non-JSON error body */ }
      toast(message, 'error');
      throw new Error(message);
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = /filename="?([^"]+)"?/.exec(cd);
    const filename = m ? m[1] : fallbackName;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    del: (path) => request('DELETE', path),
    download,
    toast,
    withLoading,
    getBranding,
  };
})();

// Global dialog dismissal: click the scrim (not its contents) or press Escape to close whatever
// .modal-scrim / .drawer-scrim is open. Wired once here since api.js loads on every page —
// individual pages only need to show/hide their scrim element, not wire this themselves.
document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal-scrim')) {
    e.target.style.display = 'none';
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.modal-scrim').forEach((el) => {
    if (getComputedStyle(el).display !== 'none') el.style.display = 'none';
  });
});
