let lookups = { vehicles: [] };

const STAGE_LABELS = ['Scheduled', 'In workshop', 'Completed'];
const STAGE_BADGES = ['badge-warning', 'badge-info', 'badge-success'];

function priorityChip(p) {
  const map = { Critical: 'badge-danger', High: 'badge-warning', Routine: 'badge-neutral' };
  return `<span class="badge ${map[p] || 'badge-neutral'}">${esc(p)}</span>`;
}

function stageChip(stage) {
  return `<span class="badge ${STAGE_BADGES[stage] || 'badge-neutral'}">${esc(STAGE_LABELS[stage] || stage)}</span>`;
}

function openNewOrder() {
  FormDrawer.open({
    title: 'New work order',
    sub: 'Raise a workshop job against a vehicle',
    sections: [{ label: 'Work order', fields: [
      { key: 'vehicle_id', label: 'Vehicle', type: 'select', required: true, value: '', numeric: true,
        options: lookups.vehicles.map((v) => ({ value: v.id, label: `${v.reg_no} · ${v.model}` })) },
      { key: 'title', label: 'Title', value: '', required: true, hint: 'e.g. 45 000 km major service' },
      { key: 'priority', label: 'Priority', type: 'select', value: 'Routine', options: ['Routine', 'High', 'Critical'] },
      { key: 'cost', label: 'Estimated cost', type: 'number', value: '', numeric: true, required: true },
      { key: 'workshop_name', label: 'Workshop', value: '', hint: 'Motor Centre Manzini' },
      { key: 'due_note', label: 'Due note', value: '', hint: 'e.g. "Due 15 Aug"' },
      { key: 'due_date', label: 'Due date', type: 'date', value: '' },
    ] }],
    primaryLabel: 'Raise work order',
    onSave: async (values) => {
      await Api.post('/maintenance', values);
      Api.toast('Work order raised');
      loadOrders();
    },
  });
}

function openOrder(w, canManage) {
  const parts = Math.round(Number(w.cost) * 0.62);
  const labour = Number(w.cost) - parts;
  FormDrawer.open({
    title: `${w.wo_code} · ${w.title}`,
    sub: `${w.reg_no} · ${w.model}`,
    readOnly: true,
    sections: [{ label: 'Work order', fields: [
      { key: 'vehicle', label: 'Vehicle', value: `${w.reg_no} · ${w.model}` },
      { key: 'priority', label: 'Priority', value: w.priority },
      { key: 'stage', label: 'Stage', value: STAGE_LABELS[w.stage] },
      { key: 'due', label: 'Due', value: w.due_note || '—' },
      { key: 'workshop', label: 'Workshop', value: w.workshop_name || '—' },
      { key: 'cost', label: 'Cost', value: fmtMoney(w.cost) },
    ] }],
    extraHtml: `<div class="divider"></div>
      <div class="note">Estimate breakdown: parts and consumables ${fmtMoney(parts)}, labour ${fmtMoney(labour)}.
      ${w.stage < 2 ? `Vehicle is unavailable for dispatch while this work order is open.` : 'Vehicle returned to service; cost posted to maintenance expense.'}</div>
      ${w.stage < 2 && canManage ? `<div class="row" style="justify-content:flex-end;margin-top:12px">
        <button class="btn btn-primary btn-sm" id="act-advance">${w.stage === 0 ? 'Start work' : 'Complete & post cost'}</button>
      </div>` : ''}`,
    afterRender: (root) => {
      const btn = root.querySelector('#act-advance');
      if (!btn) return;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await Api.put(`/maintenance/${w.id}/advance`, {});
          FormDrawer.close();
          Api.toast(w.stage === 0 ? `${w.wo_code} moved into the workshop` : `${w.wo_code} completed — ${fmtMoney(w.cost)} posted to maintenance expense`);
          loadOrders();
        } catch (err) {
          Api.toast(err.message, true);
          btn.disabled = false;
        }
      });
    },
  });
}

async function loadOrders() {
  const me = Shell.me;
  const canManage = me.permissions.includes('maintenance.manage');
  const { data } = await Api.get('/maintenance');
  const tbl = document.getElementById('tbl');
  tbl.innerHTML = `<div class="tbl-wrap"><table><thead><tr>
    <th>WO</th><th>Title</th><th>Vehicle</th><th>Priority</th><th>Stage</th><th>Cost</th><th>Due</th>
  </tr></thead><tbody>${data.map((w) => `<tr class="clickable" data-id="${w.id}">
    <td>${esc(w.wo_code)}</td><td>${esc(w.title)}</td><td>${esc(w.reg_no)}</td>
    <td>${priorityChip(w.priority)}</td><td>${stageChip(w.stage)}</td><td>${fmtMoney(w.cost)}</td><td>${esc(w.due_note || '—')}</td>
  </tr>`).join('') || '<tr><td colspan="7">No work orders raised yet</td></tr>'}</tbody></table></div>`;

  [...tbl.querySelectorAll('tr[data-id]')].forEach((tr) => tr.addEventListener('click', () => {
    const w = data.find((x) => x.id === Number(tr.dataset.id));
    openOrder(w, canManage);
  }));
}

(async () => {
  const me = await Shell.init('maintenance');
  const canManage = me.permissions.includes('maintenance.manage');
  const { data: look } = await Api.get('/maintenance/lookups');
  lookups = look;

  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>Maintenance</h1>
      <p class="page-sub">The workshop board — every work order raised against a fleet vehicle.</p></div>
      ${canManage ? '<button class="btn btn-primary" id="new-btn">+ New work order</button>' : ''}</div>
    <div class="card" id="tbl"></div>`;

  if (canManage) document.getElementById('new-btn').addEventListener('click', openNewOrder);
  await loadOrders();
})();
