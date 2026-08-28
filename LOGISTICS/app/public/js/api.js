const Api = (() => {
  async function request(path, opts = {}) {
    const res = await fetch(`/api/v1${path}`, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    // Only the login flow's own endpoints (/auth/login, /auth/login/verify, /auth/login/send-email-code)
    // are excluded from the auto-redirect — a failed login attempt needs an inline error, not a bounce
    // back to the page it's already on. Everything else, including /auth/me (what every protected
    // page's Shell.init() calls first), should redirect on 401: a stale/expired session hitting
    // GET /auth/me must send the visitor to the login page, not fail silently into a blank #app div.
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      window.location.href = '/login.html';
      return new Promise(() => {});
    }
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `Request failed (${res.status})`);
    return payload;
  }
  const get = (path) => request(path);
  const post = (path, body) => request(path, { method: 'POST', body });
  const put = (path, body) => request(path, { method: 'PUT', body });
  const del = (path) => request(path, { method: 'DELETE' });

  // For multipart uploads (branding images) — no Content-Type header so the browser sets the
  // multipart boundary itself, and no JSON.stringify since body is a FormData.
  async function postForm(path, formData) {
    const res = await fetch(`/api/v1${path}`, { method: 'POST', body: formData, credentials: 'same-origin' });
    // Only the login flow's own endpoints (/auth/login, /auth/login/verify, /auth/login/send-email-code)
    // are excluded from the auto-redirect — a failed login attempt needs an inline error, not a bounce
    // back to the page it's already on. Everything else, including /auth/me (what every protected
    // page's Shell.init() calls first), should redirect on 401: a stale/expired session hitting
    // GET /auth/me must send the visitor to the login page, not fail silently into a blank #app div.
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      window.location.href = '/login.html';
      return new Promise(() => {});
    }
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `Request failed (${res.status})`);
    return payload;
  }

  async function withLoading(btn, busyLabel, fn) {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = busyLabel || 'Working…';
    try {
      return await fn();
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  function toast(message, isError) {
    let stack = document.querySelector('.toast-stack');
    if (!stack) { stack = document.createElement('div'); stack.className = 'toast-stack'; document.body.appendChild(stack); }
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  return { get, post, put, del, postForm, withLoading, toast };
})();
