function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtDate(s) { return s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }

const ACTIONS = ['create', 'read', 'update', 'delete'];
const ACTION_LABEL = { create: 'C', read: 'R', update: 'U', delete: 'D' };

(async () => {
  await Shell.init('integration');

  // Fetched once — the same list drives both the matrix widget (only a cell this schema marks
  // allowed gets a checkbox) and the compact per-category summary in the key list, so the UI can
  // never offer or display a scope the server doesn't actually recognise.
  const { data: matrixSchema } = await Api.get('/integration/keys/matrix-schema');

  // Renders the CRUD grid — rows = categories, columns = C/R/U/D, a checkbox only where this
  // category's schema marks that action allowed, a plain dash otherwise (same convention the
  // internal permission matrix in Settings uses for "not applicable" cells).
  function matrixHtml(checkedScopes) {
    const checked = new Set(checkedScopes || []);
    const rows = matrixSchema.map((cat) => `
      <tr data-category="${cat.key}">
        <td>${esc(cat.label)}<div class="field-hint">${esc(cat.hint)}</div></td>
        ${ACTIONS.map((a) => cat.crud[a]
          ? `<td style="text-align:center"><input type="checkbox" data-scope="${cat.key}:${a}" ${checked.has(`${cat.key}:${a}`) ? 'checked' : ''} /></td>`
          : `<td style="text-align:center" class="faint">—</td>`
        ).join('')}
      </tr>`).join('');
    return `
      <div class="drawer-group">
        <div class="drawer-group-label">Access matrix</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Category</th><th>C</th><th>R</th><th>U</th><th>D</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }
  function collectMatrixScopes(root) {
    return Array.from(root.querySelectorAll('[data-scope]'))
      .filter((el) => el.checked)
      .map((el) => el.dataset.scope);
  }

  // Same category, per-scope-list summary shown in the key list — "Timesheets: CRU" instead of
  // raw scope-string badges, using the identical CRUD-letter convention scopeMeta() already uses
  // for the internal permission matrix (src/platform/scope.js).
  function scopeSummaryHtml(scopesCsv) {
    const granted = new Set((scopesCsv || '').split(',').filter(Boolean));
    const parts = matrixSchema
      .map((cat) => {
        const letters = ACTIONS.filter((a) => granted.has(`${cat.key}:${a}`)).map((a) => ACTION_LABEL[a]).join('');
        return letters ? `${cat.label}: ${letters}` : null;
      })
      .filter(Boolean);
    return parts.length
      ? parts.map((p) => `<span class="badge badge-neutral">${esc(p)}</span>`).join(' ')
      : '<span class="faint">No access granted</span>';
  }

  async function loadKeys() {
    const { data } = await Api.get('/integration/keys');
    const tbody = document.querySelector('#keys-table tbody');
    tbody.innerHTML = data.map((k) => `
      <tr data-id="${k.id}" data-scopes="${esc(k.scopes)}">
        <td>${esc(k.name)}</td>
        <td><code>${esc(k.key_prefix)}…</code></td>
        <td style="max-width:280px">${scopeSummaryHtml(k.scopes)}</td>
        <td><span class="badge ${k.is_active ? 'badge-success' : 'badge-neutral'}">${k.is_active ? 'active' : 'suspended'}</span></td>
        <td>${fmtDate(k.last_used_at)}</td>
        <td>${fmtDate(k.created_at)}${k.created_by_name ? ` · ${esc(k.created_by_name)}` : ''}</td>
        <td class="row" style="gap:4px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm edit-access-btn">Edit access</button>
          ${k.is_active
            ? '<button class="btn btn-ghost btn-sm revoke-btn" style="color:var(--color-danger)">Revoke</button>'
            : '<button class="btn btn-ghost btn-sm reactivate-btn">Reactivate</button>'}
          <button class="btn btn-ghost btn-sm renew-btn">Renew</button>
          <button class="btn btn-ghost btn-sm delete-btn" style="color:var(--color-danger)">Delete</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="7" class="faint">No API keys yet.</td></tr>';

    tbody.querySelectorAll('.revoke-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('tr').dataset.id;
        if (!confirm('Revoke this API key? Any system using it will immediately lose access. It can be reactivated later without issuing a new key.')) return;
        await Api.withLoading(btn, 'Revoking…', () => Api.post(`/integration/keys/${id}/revoke`));
        Api.toast('API key revoked', 'success');
        loadKeys();
      });
    });

    tbody.querySelectorAll('.reactivate-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('tr').dataset.id;
        await Api.withLoading(btn, 'Reactivating…', () => Api.post(`/integration/keys/${id}/reactivate`));
        Api.toast('API key reactivated', 'success');
        loadKeys();
      });
    });

    tbody.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('tr').dataset.id;
        if (!confirm('Permanently delete this API key? This cannot be undone — unlike revoke, there is no way back.')) return;
        await Api.withLoading(btn, 'Deleting…', () => Api.del(`/integration/keys/${id}`));
        Api.toast('API key deleted', 'success');
        loadKeys();
      });
    });

    tbody.querySelectorAll('.renew-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('tr').dataset.id;
        if (!confirm('Renew this key? The current secret will stop working immediately — anything still using it needs the new one.')) return;
        const res = await Api.withLoading(btn, 'Renewing…', () => Api.post(`/integration/keys/${id}/renew`));
        Api.toast('API key renewed', 'success');
        loadKeys();
        showPlaintextKey(res.data.key);
      });
    });

    tbody.querySelectorAll('.edit-access-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr');
        const id = tr.dataset.id;
        const currentScopes = tr.dataset.scopes.split(',').filter(Boolean);
        let drawerRoot = null;
        FormDrawer.open({
          title: 'Edit access',
          sub: 'Changes what this key can do without rotating its secret — anything already using it keeps working, just with updated access.',
          sections: [],
          extraHtml: matrixHtml(currentScopes),
          afterRender: (root) => { drawerRoot = root; },
          primaryLabel: 'Save access',
          onSave: async () => {
            const scopes = collectMatrixScopes(drawerRoot);
            if (!scopes.length) throw new Error('Select at least one scope.');
            await Api.put(`/integration/keys/${id}`, { scopes });
            Api.toast('Access updated', 'success');
            loadKeys();
          },
        });
      });
    });
  }

  function showPlaintextKey(key) {
    Drawer.open({
      title: 'API key created',
      sub: 'Copy this now — for security, the full key is never shown again. If it is lost, revoke it and create a new one.',
      groups: [{ label: 'Key', fields: [{ label: 'Plaintext key', value: key }] }],
    });
    const body = document.querySelector('.drawer');
    if (body) {
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <div class="drawer-group">
          <div class="form-row" style="align-items:center;gap:8px">
            <input readonly id="plaintext-key-input" value="${esc(key)}" style="font-family:monospace;flex:1" />
            <button class="btn btn-ghost btn-sm" id="copy-key-btn">Copy</button>
          </div>
        </div>`;
      body.appendChild(wrap);
      document.getElementById('copy-key-btn').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(key);
          Api.toast('Copied to clipboard', 'success');
        } catch (e) {
          document.getElementById('plaintext-key-input').select();
        }
      });
    }
  }

  document.getElementById('new-key-btn').addEventListener('click', () => {
    let drawerRoot = null;
    FormDrawer.open({
      title: 'New API key',
      sub: 'Issue a key for an external system (smartphone tracking, accounting, fleet/logistics). Grant only the access it actually needs.',
      sections: [{
        label: 'Key',
        fields: [
          { key: 'name', label: 'Name', type: 'text', value: '', required: true, hint: 'e.g. "Fleet & Logistics system"' },
          { key: 'expires_at', label: 'Expires (optional)', type: 'date', value: '' },
        ],
      }],
      extraHtml: matrixHtml([]),
      afterRender: (root) => { drawerRoot = root; },
      primaryLabel: 'Create key',
      onSave: async (v) => {
        const scopes = collectMatrixScopes(drawerRoot);
        if (!scopes.length) throw new Error('Select at least one scope.');
        const res = await Api.post('/integration/keys', { name: v.name, scopes, expires_at: v.expires_at || null });
        Api.toast('API key created', 'success');
        loadKeys();
        showPlaintextKey(res.data.key);
      },
    });
  });

  loadKeys();
})();
