const CATEGORY_OPTIONS = [
  { value: 'property', label: 'Property' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'financial_interest', label: 'Financial interest' },
  { value: 'gift', label: 'Gift' },
  { value: 'outside_employment', label: 'Outside employment' },
  { value: 'other', label: 'Other' },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORY_OPTIONS.map((o) => [o.value, o.label]));
const STATUS_BADGE = { draft: 'badge-neutral', submitted: 'badge-warning', reviewed: 'badge-success', flagged: 'badge-danger' };

(async () => {
  const shellData = await Shell.init('assets');
  const scope = shellData.scope.assets || {};
  const me = shellData.user.employeeNo;
  const canReview = scope.update && scope.dataScope !== 'self';
  if (canReview) document.getElementById('review-card').style.display = '';

  function fmtValue(row) {
    if (row.estimated_value == null) return '—';
    return `${Number(row.estimated_value).toLocaleString()} ${row.currency || ''}`.trim();
  }

  async function loadAll() {
    const { data } = await Api.get('/assets');
    renderMine(data.filter((d) => d.employee_no === me));
    if (canReview) await loadReview();
  }

  function renderMine(rows) {
    const tbody = document.querySelector('#mine-table tbody');
    document.getElementById('mine-empty').style.display = rows.length ? 'none' : 'block';
    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td>${CATEGORY_LABEL[r.category] || r.category}</td>
        <td>${r.description}</td>
        <td>${fmtValue(r)}</td>
        <td>${r.declared_at}</td>
        <td><span class="badge ${STATUS_BADGE[r.status]}">${r.status}</span></td>
        <td>
          ${r.status === 'draft' ? `
            <button class="btn btn-ghost btn-sm" data-edit="${r.id}">Edit</button>
            <button class="btn btn-ghost btn-sm" data-submit="${r.id}">Submit</button>
          ` : (r.review_note ? `<span class="faint" title="${r.review_note}">note →</span>` : '')}
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openDeclareDrawer(rows.find((r) => r.id == btn.dataset.edit))));
    tbody.querySelectorAll('[data-submit]').forEach((btn) => btn.addEventListener('click', async () => {
      await Api.withLoading(btn, 'Submitting…', () => Api.post(`/assets/${btn.dataset.submit}/submit`));
      Api.toast('Declaration submitted', 'success');
      loadAll();
    }));
  }

  async function loadReview() {
    const status = document.getElementById('review-status-filter').value;
    const { data } = await Api.get('/assets' + (status ? `?status=${status}` : ''));
    const rows = data.filter((d) => d.employee_no !== me);
    const tbody = document.querySelector('#review-table tbody');
    document.getElementById('review-empty').style.display = rows.length ? 'none' : 'block';
    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td>${r.full_legal_name}</td>
        <td>${CATEGORY_LABEL[r.category] || r.category}</td>
        <td>${r.description}</td>
        <td>${fmtValue(r)}</td>
        <td>${r.declared_at}</td>
        <td><span class="badge ${STATUS_BADGE[r.status]}">${r.status}</span></td>
        <td>${r.status === 'submitted' ? `<button class="btn btn-primary btn-sm" data-review="${r.id}">Review</button>` : (r.reviewer_name ? `<span class="faint">by ${r.reviewer_name}</span>` : '')}</td>
      </tr>
    `).join('');
    tbody.querySelectorAll('[data-review]').forEach((btn) => btn.addEventListener('click', () => openReviewDrawer(rows.find((r) => r.id == btn.dataset.review))));
  }
  document.getElementById('review-status-filter').addEventListener('change', loadReview);

  // ---- Declare / edit draft (FormDrawer — own record, own draft only per assets.routes.js) ----
  function openDeclareDrawer(row) {
    FormDrawer.open({
      title: row ? 'Edit draft declaration' : 'Declare an asset or interest',
      sub: 'Draft declarations are private to you until submitted — reviewers only see submitted ones.',
      sections: [{
        label: 'Declaration',
        fields: [
          { key: 'category', label: 'Category', type: 'select', value: row ? row.category : 'property', options: CATEGORY_OPTIONS },
          { key: 'description', label: 'Description', type: 'textarea', value: row ? row.description : '', required: true, hint: 'What is it, and how did you acquire it?' },
          { key: 'estimated_value', label: 'Estimated value', type: 'number', value: row ? row.estimated_value : '' },
          { key: 'currency', label: 'Currency', type: 'text', value: row ? row.currency : 'SZL' },
          { key: 'acquired_at', label: 'Acquired on', type: 'date', value: row ? row.acquired_at : '' },
          { key: 'declared_at', label: 'Declared on', type: 'date', value: row ? row.declared_at : new Date().toISOString().slice(0, 10), required: true },
        ],
      }],
      primaryLabel: row ? 'Save changes' : 'Save draft',
      onSave: async (v) => {
        if (row) await Api.put(`/assets/${row.id}`, v);
        else await Api.post('/assets', v);
        Api.toast('Declaration saved', 'success');
        loadAll();
      },
      onDelete: row ? async () => {
        await Api.del(`/assets/${row.id}`);
        Api.toast('Draft deleted', 'success');
        loadAll();
      } : undefined,
      deleteLabel: 'Delete draft',
    });
  }
  document.getElementById('new-decl-btn').addEventListener('click', () => openDeclareDrawer(null));

  // ---- Review a submitted declaration (FormDrawer — reviewer decision only, never rewrites the declarant's entry) ----
  function openReviewDrawer(row) {
    FormDrawer.open({
      title: 'Review declaration',
      sub: `${row.full_legal_name} — ${CATEGORY_LABEL[row.category]}. This records your decision; the declarant's original entry is never altered.`,
      sections: [
        {
          label: 'Declaration (read-only)',
          fields: [
            { key: 'description', label: 'Description', type: 'textarea', value: row.description, editable: false },
            { key: 'value', label: 'Value', type: 'text', value: fmtValue(row), editable: false },
            { key: 'declared_at', label: 'Declared on', type: 'text', value: row.declared_at, editable: false },
          ],
        },
        {
          label: 'Decision',
          fields: [
            { key: 'status', label: 'Decision', type: 'select', value: 'reviewed', options: [{ value: 'reviewed', label: 'Reviewed — no concern' }, { value: 'flagged', label: 'Flagged — needs follow-up' }] },
            { key: 'review_note', label: 'Note', type: 'textarea', value: '' },
          ],
        },
      ],
      primaryLabel: 'Save decision',
      onSave: async (v) => {
        await Api.put(`/assets/${row.id}`, { status: v.status, review_note: v.review_note });
        Api.toast('Decision recorded', 'success');
        loadAll();
      },
    });
  }

  loadAll();
})();
