const SEQUENCE = ['draft', 'inputs_locked', 'in_review', 'approved_finance', 'approved_ed', 'paid', 'closed'];
const STATUS_LABEL = {
  draft: 'Draft', inputs_locked: 'Inputs locked', in_review: 'In review',
  approved_finance: 'Approved — finance', approved_ed: 'Approved — ED', paid: 'Paid', closed: 'Closed',
};

function money(n) { return 'E ' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function statusBadge(status) {
  const kind = status === 'closed' || status === 'paid' ? 'badge-success' : status === 'draft' ? 'badge-neutral' : 'badge-warning';
  return `<span class="badge ${kind}">${STATUS_LABEL[status] || status}</span>`;
}
function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Itemized read-only breakdown shared by both the self-service "View breakdown" drawer and (via
// employee.js duplicating this same logic) the Workspace Payroll tab — falls back to the flat
// basic/allowances/overtime/deductions totals when a payline has no payline_item rows yet.
function payslipBreakdownHtml(p) {
  const items = p.items || [];
  const allowanceItems = items.filter((i) => i.kind === 'allowance');
  const deductionItems = items.filter((i) => i.kind === 'deduction');
  const gross = Number(p.basic) + Number(p.overtime) + Number(p.allowances);

  const earnRows = [`<tr><td>Basic Salary</td><td style="text-align:right">${money(p.basic)}</td></tr>`];
  if (Number(p.overtime) !== 0) earnRows.push(`<tr><td>Overtime</td><td style="text-align:right">${money(p.overtime)}</td></tr>`);
  if (allowanceItems.length) {
    allowanceItems.forEach((i) => earnRows.push(`<tr><td>${escHtml(i.label)}</td><td style="text-align:right">${money(i.amount)}</td></tr>`));
  } else if (Number(p.allowances) !== 0) {
    earnRows.push(`<tr><td>Allowances</td><td style="text-align:right">${money(p.allowances)}</td></tr>`);
  }

  const dedRows = deductionItems.length
    ? deductionItems.map((i) => `<tr><td>${escHtml(i.label)}</td><td style="text-align:right">${money(i.amount)}</td></tr>`).join('')
    : (Number(p.deductions) !== 0 ? `<tr><td>Deductions</td><td style="text-align:right">${money(p.deductions)}</td></tr>` : '<tr><td class="faint">No deductions</td><td></td></tr>');

  return `
    <div class="drawer-group">
      <div class="drawer-group-label">Earnings</div>
      <table style="width:100%"><tbody>${earnRows.join('')}</tbody></table>
      <div class="row between" style="font-weight:600;border-top:1px solid var(--color-neutral-200);padding-top:6px;margin-top:6px"><span>Gross pay</span><span>${money(gross)}</span></div>
    </div>
    <div class="drawer-group">
      <div class="drawer-group-label">Deductions</div>
      <table style="width:100%"><tbody>${dedRows}</tbody></table>
      <div class="row between" style="font-weight:600;border-top:1px solid var(--color-neutral-200);padding-top:6px;margin-top:6px"><span>Total deductions</span><span>${money(p.deductions)}</span></div>
    </div>
    <div class="row between" style="font-weight:700;font-size:15px;background:var(--color-neutral-100);padding:8px 10px">
      <span>Net pay</span><span>${money(p.net)}</span>
    </div>`;
}

// Personal payslip history — shown to EVERY signed-in person with any payroll access at all,
// admins included. Whether or not someone can manage payroll runs org-wide is a separate
// question from whether they can find their own payslip; the two used to be mutually exclusive
// (an admin had no way to see their own payslip), which was a real gap, not a design choice.
async function renderMyPayslips() {
  const mine = document.getElementById('my-payslips');
  mine.style.display = 'block';

  const { data: paylines } = await Api.get('/payroll/paylines');
  const tbody = document.querySelector('#my-payslips-table tbody');
  tbody.innerHTML = paylines.map((p) => `
    <tr data-id="${p.id}">
      <td>${p.period}</td>
      <td>${statusBadge(p.run_status)}</td>
      <td>${money(p.net)}</td>
      <td class="row" style="gap:6px">
        <a class="btn btn-ghost btn-sm" href="/api/v1/payroll/paylines/${p.id}/payslip.pdf" target="_blank" rel="noopener">Download PDF</a>
        <button class="btn btn-ghost btn-sm my-payslip-view" data-id="${p.id}">View breakdown</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="faint">No payslips yet.</td></tr>';

  tbody.querySelectorAll('.my-payslip-view').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = paylines.find((x) => x.id === Number(btn.dataset.id));
      FormDrawer.open({
        title: `Payslip — ${p.period}`,
        sub: `Status: ${STATUS_LABEL[p.run_status] || p.run_status}`,
        readOnly: true,
        sections: [],
        extraHtml: payslipBreakdownHtml(p),
      });
    });
  });
}

(async () => {
  const shellData = await Shell.init('payroll');
  const scope = shellData.scope.payroll || {};

  // "My payslips" is available to anyone with any payroll read access — it always resolves to
  // the caller's OWN paylines regardless of how broad their scope otherwise is (GET
  // /payroll/paylines defaults to the caller's own employee_no). Payroll run administration is a
  // separate, additional section shown only to whoever can actually manage runs.
  const isAdmin = scope.update || scope.create;
  if (scope.read) await renderMyPayslips();

  if (!isAdmin) {
    document.getElementById('page-sub').textContent = 'Your payslip history — download or review the breakdown for any period.';
    return;
  }

  document.getElementById('admin-payroll').style.display = 'block';
  if (scope.create) document.getElementById('new-run-btn').style.display = '';

  let orgUnitsCache = null;

  async function loadRuns() {
    const { data } = await Api.get('/payroll/runs');
    const tbody = document.querySelector('#runs-table tbody');
    tbody.innerHTML = data.map((r) => `
      <tr class="clickable" data-id="${r.id}">
        <td>${r.period}</td><td>${statusBadge(r.status)}</td><td>${r.employee_count}</td><td>${money(r.net_total)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="faint">No payroll runs yet.</td></tr>';
    tbody.querySelectorAll('tr[data-id]').forEach((el) => el.addEventListener('click', () => openRun(el.dataset.id)));
  }

  async function openRun(id) {
    const { data: run } = await Api.get(`/payroll/runs/${id}`);
    const detail = document.getElementById('run-detail');
    detail.style.display = 'block';

    const gross = run.paylines.reduce((s, p) => s + Number(p.basic) + Number(p.allowances) + Number(p.overtime), 0);
    const net = run.paylines.reduce((s, p) => s + Number(p.net), 0);
    const currentIndex = SEQUENCE.indexOf(run.status);
    const nextStatus = SEQUENCE[currentIndex + 1];
    const editable = scope.update && ['draft', 'inputs_locked'].includes(run.status);

    const advanceBtn = scope.update && nextStatus
      ? `<button class="btn btn-primary btn-sm" id="advance-btn">Advance to ${STATUS_LABEL[nextStatus]}</button>`
      : '';
    const populateBtn = editable && scope.create ? `<button class="btn btn-ghost btn-sm" id="populate-btn">+ Add missing employees</button>` : '';
    const bulkAdjustBtn = editable && scope.update ? `<button class="btn btn-ghost btn-sm" id="bulk-adjust-btn">Bulk pay adjustment…</button>` : '';
    const deleteRunBtn = scope.delete && run.status === 'draft' ? `<button class="btn btn-ghost btn-sm" id="delete-run-btn" style="color:var(--color-danger)">Delete run</button>` : '';

    // A checkbox column exists in both editable and read-only render modes — bulk adjustment is
    // gated on `editable` for the button itself, but keeping the column present either way avoids
    // the table's column count silently shifting between the two render paths.
    const selectCell = (p) => `<td><input type="checkbox" class="pl-select" data-employee="${p.employee_no}" style="width:auto" /></td>`;

    const rows = run.paylines.map((p) => editable ? `
      <tr data-id="${p.id}">
        ${selectCell(p)}
        <td>${p.full_legal_name}</td>
        <td><input type="number" step="0.01" class="pl-basic" value="${p.basic}" style="width:100px" /></td>
        <td><input type="number" step="0.01" class="pl-allow" value="${p.allowances}" style="width:100px" /></td>
        <td><input type="number" step="0.01" class="pl-ot" value="${p.overtime}" style="width:100px" /></td>
        <td><input type="number" step="0.01" class="pl-ded" value="${p.deductions}" style="width:100px" /></td>
        <td class="pl-net">${money(p.net)}</td>
        <td class="row" style="gap:4px">
          <button class="btn btn-ghost btn-sm pl-save">Save</button>
          <button class="btn btn-ghost btn-sm pl-details" data-id="${p.id}">Details</button>
          <a class="btn btn-ghost btn-sm" href="/api/v1/payroll/paylines/${p.id}/payslip.pdf" target="_blank" rel="noopener">Payslip PDF</a>
          ${scope.delete ? '<button class="btn btn-ghost btn-sm pl-delete" style="color:var(--color-danger)">Remove</button>' : ''}
        </td>
      </tr>
    ` : `
      <tr>${selectCell(p)}<td>${p.full_legal_name}</td><td>${money(p.basic)}</td><td>${money(p.allowances)}</td><td>${money(p.overtime)}</td><td>${money(p.deductions)}</td><td><strong>${money(p.net)}</strong></td>
        <td class="row" style="gap:4px">
          <button class="btn btn-ghost btn-sm pl-details" data-id="${p.id}">Details</button>
          <a class="btn btn-ghost btn-sm" href="/api/v1/payroll/paylines/${p.id}/payslip.pdf" target="_blank" rel="noopener">Payslip PDF</a>
        </td></tr>
    `).join('');

    detail.innerHTML = `
      <div class="card">
        <div class="row between">
          <h3>${run.period} · ${statusBadge(run.status)}</h3>
          <div class="row" style="gap:8px">${populateBtn}${bulkAdjustBtn}${advanceBtn}${deleteRunBtn}</div>
        </div>
        <div class="grid grid-3" style="margin-top:10px">
          <div class="kpi"><div class="label">Employees in run</div><div class="value">${run.paylines.length}</div></div>
          <div class="kpi"><div class="label">Gross</div><div class="value">${money(gross)}</div></div>
          <div class="kpi"><div class="label">Net pay</div><div class="value">${money(net)}</div></div>
        </div>
        <div class="divider"></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th></th><th>Employee</th><th>Basic</th><th>Allowances</th><th>Overtime</th><th>Deductions</th><th>Net</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;

    if (advanceBtn) {
      document.getElementById('advance-btn').addEventListener('click', async (e) => {
        try {
          await Api.withLoading(e.currentTarget, 'Advancing…', async () => {
            await Api.post(`/payroll/runs/${id}/advance`, { to: nextStatus });
          });
          Api.toast(`Run advanced to ${STATUS_LABEL[nextStatus]}`, 'success');
          openRun(id);
          loadRuns();
        } catch (err) { /* toast already shown by Api */ }
      });
    }

    if (populateBtn) {
      document.getElementById('populate-btn').addEventListener('click', async (e) => {
        try {
          const res = await Api.withLoading(e.currentTarget, 'Adding…', () => Api.post(`/payroll/runs/${id}/populate`));
          Api.toast(`${res.data.added} employee(s) added — fill in their figures below`, 'success');
          openRun(id);
        } catch (err) { /* toast already shown */ }
      });
    }

    if (bulkAdjustBtn) {
      document.getElementById('bulk-adjust-btn').addEventListener('click', async () => {
        if (!orgUnitsCache) {
          try { orgUnitsCache = (await Api.get('/org')).data.filter((u) => u.kind === 'department'); } catch (e) { orgUnitsCache = []; }
        }
        FormDrawer.open({
          title: 'Bulk pay adjustment',
          sub: 'Applies a percentage increment, a COLA, or a bonus across many employees in this run at once.',
          sections: [{
            label: 'Adjustment',
            fields: [
              { key: 'type', label: 'Type', type: 'select', value: 'increment_percent', required: true,
                options: [
                  { value: 'increment_percent', label: 'Percentage increment (to basic)' },
                  { value: 'cola', label: 'Cost of Living Adjustment' },
                  { value: 'bonus', label: 'Bonus' },
                ] },
              { key: 'value', label: 'Value', type: 'number', value: '', required: true,
                hint: 'Percentage for an increment or a percent-mode COLA; a flat amount for a bonus or a flat-mode COLA.' },
              { key: 'mode', label: 'Mode (COLA only)', type: 'select', value: 'percent',
                options: [{ value: 'percent', label: '% of basic' }, { value: 'flat', label: 'Flat amount' }] },
              { key: 'label', label: 'Label (COLA / bonus only)', type: 'text', value: '',
                hint: 'Shown on the payslip as its own line, e.g. "Cost of Living Adjustment 2026" or "13th Month Bonus".' },
              { key: 'target', label: 'Apply to', type: 'select', value: 'all', required: true,
                options: [
                  { value: 'all', label: 'All employees in this run' },
                  { value: 'department', label: 'One department' },
                  { value: 'selected', label: 'Selected employees (check rows in the table below first)' },
                ] },
              { key: 'department_org_unit_id', label: 'Department (if applying to one department)', type: 'select', value: '', numeric: true,
                options: [{ value: '', label: '— Select —' }, ...orgUnitsCache.map((u) => ({ value: u.id, label: u.name }))] },
            ],
          }],
          primaryLabel: 'Apply',
          onSave: async (v) => {
            if ((v.type === 'cola' || v.type === 'bonus') && !v.label) throw new Error('Label is required for a COLA or bonus adjustment.');
            if (v.target === 'department' && !v.department_org_unit_id) throw new Error('Select a department.');
            const payload = { type: v.type, value: v.value, target: v.target };
            if (v.type === 'cola') payload.mode = v.mode;
            if (v.type === 'cola' || v.type === 'bonus') payload.label = v.label;
            if (v.target === 'department') payload.department_org_unit_id = v.department_org_unit_id;
            if (v.target === 'selected') {
              payload.employee_nos = Array.from(detail.querySelectorAll('.pl-select:checked')).map((el) => el.dataset.employee);
              if (!payload.employee_nos.length) throw new Error('Check at least one employee in the table first.');
            }
            const res = await Api.post(`/payroll/runs/${id}/bulk-adjust`, payload);
            Api.toast(`Applied to ${res.data.affected} payline(s)`, 'success');
            openRun(id);
          },
        });
      });
    }

    if (deleteRunBtn) {
      document.getElementById('delete-run-btn').addEventListener('click', async (e) => {
        if (!confirm(`Delete the draft ${run.period} run? This cannot be undone.`)) return;
        await Api.withLoading(e.currentTarget, 'Deleting…', () => Api.del(`/payroll/runs/${id}`));
        Api.toast('Run deleted', 'success');
        detail.style.display = 'none';
        loadRuns();
      });
    }

    detail.querySelectorAll('.pl-save').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tr = btn.closest('tr');
        const payload = {
          basic: Number(tr.querySelector('.pl-basic').value),
          allowances: Number(tr.querySelector('.pl-allow').value),
          overtime: Number(tr.querySelector('.pl-ot').value),
          deductions: Number(tr.querySelector('.pl-ded').value),
        };
        try {
          const res = await Api.withLoading(btn, 'Saving…', () => Api.put(`/payroll/paylines/${tr.dataset.id}`, payload));
          tr.querySelector('.pl-net').textContent = money(res.data.net);
          Api.toast('Payline saved', 'success');
        } catch (err) { /* toast already shown */ }
      });
    });

    detail.querySelectorAll('.pl-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tr = btn.closest('tr');
        if (!confirm('Remove this employee from the run?')) return;
        await Api.withLoading(btn, 'Removing…', () => Api.del(`/payroll/paylines/${tr.dataset.id}`));
        Api.toast('Removed from run', 'success');
        openRun(id);
      });
    });

    detail.querySelectorAll('.pl-details').forEach((btn) => {
      btn.addEventListener('click', () => openCompensationDrawer(run.paylines.find((p) => p.id === Number(btn.dataset.id)), id, editable));
    });
  }

  // Itemization mini-editor — add/remove label+amount rows for allowances/deductions, injected
  // via FormDrawer's extraHtml/afterRender hooks (the same technique used elsewhere in this app
  // for content FormDrawer's declarative `fields` can't express). Leaving both lists empty keeps
  // the payline in flat-total mode (the `allowances`/`deductions` number fields above apply
  // directly) — adding at least one row switches that payline to itemized mode, where those two
  // number fields become informational only (server recomputes them as the sum of the items).
  function itemRowHtml(item) {
    return `<div class="row pl-item-row" style="gap:6px;margin-bottom:6px;align-items:center">
      <input type="text" class="pl-item-label" placeholder="Label (e.g. Housing Allowance)" value="${escHtml(item ? item.label : '')}" style="flex:2" />
      <input type="number" step="0.01" min="0" class="pl-item-amount" placeholder="Amount" value="${item ? item.amount : ''}" style="flex:1" />
      <button type="button" class="btn btn-ghost btn-sm pl-item-remove" title="Remove">✕</button>
    </div>`;
  }
  function wireItemList(root, listId, addBtnId, existingItems) {
    const list = root.querySelector(`#${listId}`);
    function addRow(item) {
      const wrap = document.createElement('div');
      wrap.innerHTML = itemRowHtml(item);
      const row = wrap.firstElementChild;
      row.querySelector('.pl-item-remove').addEventListener('click', () => row.remove());
      list.appendChild(row);
    }
    (existingItems || []).forEach(addRow);
    root.querySelector(`#${addBtnId}`).addEventListener('click', () => addRow(null));
  }
  function collectItemRows(root, listId, kind) {
    return Array.from(root.querySelectorAll(`#${listId} .pl-item-row`))
      .map((row) => ({
        kind,
        label: row.querySelector('.pl-item-label').value.trim(),
        amount: Number(row.querySelector('.pl-item-amount').value) || 0,
      }))
      .filter((i) => i.label);
  }

  // Richer alternative to the inline table row — same fields, plus banking details and an
  // itemized allowance/deduction breakdown that don't fit the compact table.
  function openCompensationDrawer(p, runId, editable) {
    const allowanceItems = (p.items || []).filter((i) => i.kind === 'allowance');
    const deductionItems = (p.items || []).filter((i) => i.kind === 'deduction');
    let drawerRoot = null;

    FormDrawer.open({
      title: `Compensation — ${p.full_legal_name}`,
      sub: 'Basic, allowances, overtime, deductions and banking details for this run.',
      readOnly: !editable,
      sections: [{
        label: 'Payline',
        fields: [
          { key: 'basic', label: 'Basic', type: 'number', value: p.basic },
          { key: 'allowances', label: 'Allowances', type: 'number', value: p.allowances, hint: allowanceItems.length ? 'Itemized below — this total is computed automatically.' : undefined, editable: editable && !allowanceItems.length },
          { key: 'overtime', label: 'Overtime', type: 'number', value: p.overtime },
          { key: 'deductions', label: 'Deductions', type: 'number', value: p.deductions, hint: deductionItems.length ? 'Itemized below — this total is computed automatically.' : undefined, editable: editable && !deductionItems.length },
          { key: 'bank_account', label: 'Bank account', type: 'text', value: p.bank_account },
          { key: 'tax_number', label: 'Tax number', type: 'text', value: p.tax_number },
        ],
      }],
      extraHtml: editable ? `
        <div class="drawer-group">
          <div class="drawer-group-label">Allowance items <span class="faint">(optional — itemize instead of the flat Allowances figure above)</span></div>
          <div id="pl-allowance-items"></div>
          <button type="button" class="btn btn-ghost btn-sm" id="pl-add-allowance">+ Add allowance</button>
        </div>
        <div class="drawer-group">
          <div class="drawer-group-label">Deduction items <span class="faint">(optional — itemize instead of the flat Deductions figure above)</span></div>
          <div id="pl-deduction-items"></div>
          <button type="button" class="btn btn-ghost btn-sm" id="pl-add-deduction">+ Add deduction</button>
        </div>` : (p.items || []).length ? payslipBreakdownHtml(p) : '',
      afterRender: (root) => {
        drawerRoot = root;
        if (!editable) return;
        wireItemList(root, 'pl-allowance-items', 'pl-add-allowance', allowanceItems);
        wireItemList(root, 'pl-deduction-items', 'pl-add-deduction', deductionItems);
      },
      primaryLabel: 'Save changes',
      onSave: async (v) => {
        const items = [
          ...collectItemRows(drawerRoot, 'pl-allowance-items', 'allowance'),
          ...collectItemRows(drawerRoot, 'pl-deduction-items', 'deduction'),
        ];
        // Only send `items` when itemization is actually in play (rows present now, or the
        // payline was already itemized and every row got removed) — otherwise omitting it keeps
        // the flat allowances/deductions numbers above as the direct source of truth, exactly
        // like a payline that's never been itemized.
        const body = { ...v };
        if (items.length || (p.items && p.items.length)) body.items = items;
        await Api.put(`/payroll/paylines/${p.id}`, body);
        Api.toast('Payline updated', 'success');
        openRun(runId);
      },
    });
  }

  document.getElementById('new-run-btn').addEventListener('click', () => {
    FormDrawer.open({
      title: 'New payroll run',
      sub: 'Opens in draft — inputs stay editable until the run is locked for review.',
      sections: [{
        label: 'Run',
        fields: [{ key: 'period', label: 'Period (YYYY-MM)', type: 'text', value: '', required: true, hint: '2026-09' }],
      }],
      primaryLabel: 'Create',
      onSave: async (v) => {
        if (!/^\d{4}-\d{2}$/.test(v.period)) throw new Error('Use format YYYY-MM.');
        await Api.post('/payroll/runs', v);
        Api.toast('Payroll run created', 'success');
        loadRuns();
      },
    });
  });

  loadRuns();
})();
