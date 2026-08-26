// Right-side sliding drawer for view/create/edit/assignment interactions — ported from the HRIS's
// own form-drawer.js so both apps share the same interaction pattern. One shared component so
// every page gets the same validation, loading-state, and close handling instead of reimplementing
// it per page.
//
// FormDrawer.open({
//   title, sub,
//   readOnly: false,                 // true => every field renders as static text, no Save/Delete
//   sections: [{ label, fields: [
//     { key, label, type: 'text'|'email'|'number'|'date'|'time'|'select'|'textarea'|'checkbox', value,
//       options: [{value,label}] | ['a','b'], required, hint, editable (default true) }
//   ]}],
//   extraHtml: '...',                // optional raw HTML appended after the sections
//   afterRender: (drawerEl) => {},   // optional hook to wire listeners
//   primaryLabel: 'Save changes',
//   onSave: async (values) => {...}, // values = {key: val} for every editable field; throw Error(msg) to show inline error
//   deleteLabel: 'Delete',
//   onDelete: async () => {...},     // optional — shows a Delete action in the footer
// })
const FormDrawer = (() => {
  let scrimEl = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function close() {
    if (scrimEl) { scrimEl.remove(); scrimEl = null; }
  }

  function normalizeOptions(opts) {
    return (opts || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  }

  function renderField(f, readOnly) {
    const editable = !readOnly && f.editable !== false;
    const id = `fd-${f.key}`;
    if (!editable) {
      const display = f.type === 'select' ? (normalizeOptions(f.options).find((o) => String(o.value) === String(f.value)) || {}).label : f.value;
      return `<div class="form-row"><label>${esc(f.label)}</label><div>${display != null && display !== '' ? esc(display) : '<span class="faint">Not set</span>'}</div></div>`;
    }
    const req = f.required ? ' <span style="color:var(--color-danger)">*</span>' : '';
    const hint = f.hint ? `<div class="field-hint">${esc(f.hint)}</div>` : '';
    let control;
    if (f.type === 'select') {
      const opts = normalizeOptions(f.options);
      control = `<select id="${id}" data-fd-field="${f.key}">${opts.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(f.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    } else if (f.type === 'textarea') {
      control = `<textarea id="${id}" data-fd-field="${f.key}" placeholder="${esc(f.hint || '')}">${esc(f.value || '')}</textarea>`;
    } else if (f.type === 'checkbox') {
      control = `<label class="row" style="gap:8px;cursor:pointer"><input type="checkbox" id="${id}" data-fd-field="${f.key}" style="width:auto" ${f.value ? 'checked' : ''} /> <span class="faint">${esc(f.hint || '')}</span></label>`;
      return `<div class="form-row"><label>${esc(f.label)}${req}</label>${control}</div>`;
    } else {
      control = `<input id="${id}" data-fd-field="${f.key}" type="${f.type || 'text'}" value="${esc(f.value != null ? f.value : '')}" ${f.hint && f.type !== 'date' && f.type !== 'time' ? `placeholder="${esc(f.hint)}"` : ''} />`;
    }
    return `<div class="form-row"><label>${esc(f.label)}${req}</label>${control}${hint}</div>`;
  }

  function collectValues(root, sections) {
    const values = {};
    for (const section of sections) {
      for (const f of section.fields) {
        if (f.editable === false) continue;
        const el = root.querySelector(`[data-fd-field="${f.key}"]`);
        if (!el) continue;
        if (f.type === 'checkbox') values[f.key] = el.checked;
        else if (f.type === 'number' || f.numeric) values[f.key] = el.value === '' ? null : Number(el.value);
        else values[f.key] = el.value === '' ? null : el.value;
      }
    }
    return values;
  }

  function open(opts) {
    close();
    const readOnly = !!opts.readOnly;
    scrimEl = document.createElement('div');
    scrimEl.className = 'drawer-scrim';
    scrimEl.innerHTML = `
      <div class="drawer" role="dialog" aria-modal="true">
        <div class="drawer-head">
          <div style="flex:1;min-width:0">
            <div class="drawer-title">${esc(opts.title)}</div>
            ${opts.sub ? `<div class="drawer-sub">${esc(opts.sub)}</div>` : ''}
          </div>
          <button class="btn btn-ghost btn-sm drawer-close" data-fd-close>Close</button>
        </div>
        ${readOnly ? '<span class="badge badge-neutral">View only</span>' : ''}
        <div id="fd-body" class="stack">
          ${opts.sections.map((s) => `
            <div class="drawer-group">
              <div class="drawer-group-label">${esc(s.label)}</div>
              <div class="form-grid">${s.fields.map((f) => renderField(f, readOnly)).join('')}</div>
            </div>
          `).join('')}
        </div>
        ${opts.extraHtml ? `<div id="fd-extra">${opts.extraHtml}</div>` : ''}
        <div class="field-error" id="fd-error" style="display:none"></div>
        ${!readOnly ? `
          <div class="row" style="gap:8px;justify-content:flex-end;border-top:1px solid var(--color-neutral-200);padding-top:14px;margin-top:4px">
            ${opts.onDelete ? `<button class="btn btn-ghost btn-sm" id="fd-delete" style="color:var(--color-danger);margin-right:auto">${esc(opts.deleteLabel || 'Delete')}</button>` : ''}
            <button class="btn btn-primary" id="fd-save">${esc(opts.primaryLabel || 'Save changes')}</button>
          </div>` : ''}
      </div>
    `;
    document.body.appendChild(scrimEl);

    scrimEl.addEventListener('click', (e) => { if (e.target === scrimEl) close(); });
    scrimEl.querySelector('[data-fd-close]').addEventListener('click', close);
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
    });

    if (opts.afterRender) opts.afterRender(scrimEl);

    if (!readOnly) {
      const saveBtn = scrimEl.querySelector('#fd-save');
      saveBtn.addEventListener('click', async () => {
        const errEl = scrimEl.querySelector('#fd-error');
        errEl.style.display = 'none';
        const values = collectValues(scrimEl, opts.sections);
        const missing = opts.sections.flatMap((s) => s.fields).filter((f) => f.required && f.editable !== false && (values[f.key] === null || values[f.key] === undefined || values[f.key] === ''));
        if (missing.length) {
          errEl.textContent = `${missing.map((f) => f.label).join(', ')} ${missing.length > 1 ? 'are' : 'is'} required.`;
          errEl.style.display = 'block';
          return;
        }
        const original = saveBtn.textContent;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        try {
          await opts.onSave(values);
          close();
        } catch (err) {
          errEl.textContent = err.message || 'Save failed';
          errEl.style.display = 'block';
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = original;
        }
      });

      const deleteBtn = scrimEl.querySelector('#fd-delete');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          if (!confirm(`${opts.deleteLabel || 'Delete'}? This cannot be undone.`)) return;
          const original = deleteBtn.textContent;
          deleteBtn.disabled = true;
          deleteBtn.textContent = 'Deleting…';
          try {
            await opts.onDelete();
            close();
          } catch (err) {
            const errEl = scrimEl.querySelector('#fd-error');
            errEl.textContent = err.message || 'Delete failed';
            errEl.style.display = 'block';
            deleteBtn.disabled = false;
            deleteBtn.textContent = original;
          }
        });
      }
    }
  }

  return { open, close };
})();
