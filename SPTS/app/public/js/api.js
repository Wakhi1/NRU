const Api = (() => {
  async function request(path, opts = {}) {
    const res = await fetch(`/api/v1${path}`, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    if (res.status === 401 && !path.startsWith('/auth')) {
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

  return { get, post, put, del, withLoading, toast };
})();
