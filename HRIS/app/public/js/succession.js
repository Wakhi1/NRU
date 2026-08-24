const RISK_BADGE = { low: 'badge-success', medium: 'badge-warning', high: 'badge-danger' };
const READINESS_OPTIONS = [
  { value: 'ready_now', label: 'Ready now' },
  { value: 'ready_1_2yr', label: 'Ready 1–2 yrs' },
  { value: 'ready_3_5yr', label: 'Ready 3–5 yrs' },
];
const READINESS_LABEL = Object.fromEntries(READINESS_OPTIONS.map((o) => [o.value, o.label]));

(async () => {
  const shellData = await Shell.init('succession');
  const canCreate = !!(shellData.scope.succession && shellData.scope.succession.create);
  const canUpdate = !!(shellData.scope.succession && shellData.scope.succession.update);
  const canDelete = !!(shellData.scope.succession && shellData.scope.succession.delete);
  if (canCreate) document.getElementById('new-plan-btn').style.display = '';

  let unitOptions = null;
  let peopleOptions = null;
  async function getUnitOptions() {
    if (!unitOptions) {
      try { unitOptions = [{ value: '', label: '— Not tied to a unit —' }, ...(await Api.get('/org')).data.map((u) => ({ value: u.id, label: u.name }))]; }
      catch (e) { unitOptions = [{ value: '', label: '— Not tied to a unit —' }]; }
    }
    return unitOptions;
  }
  async function getPeopleOptions() {
    if (!peopleOptions) {
      try { peopleOptions = (await Api.get('/people')).data.map((p) => ({ value: p.employee_no, label: `${p.preferred_name || p.full_legal_name} (${p.employee_no})` })); }
      catch (e) { peopleOptions = []; }
    }
    return peopleOptions;
  }

  async function load() {
    const { data } = await Api.get('/succession');
    document.getElementById('plan-grid').innerHTML = data.map((p) => `
      <div class="card clickable" data-id="${p.id}">
        <div class="row between"><h3>${p.position_title}</h3><span class="badge ${RISK_BADGE[p.risk]}">${p.risk}</span></div>
        <div class="muted">Incumbent: ${p.incumbent_name || '—'}</div>
        <div class="faint">${p.org_unit_name || 'No unit'} · ${p.successor_count} successor(s)</div>
      </div>
    `).join('') || '<div class="empty-state">No succession plans yet.</div>';
    document.querySelectorAll('#plan-grid .card[data-id]').forEach((el) => el.addEventListener('click', () => openPlan(el.dataset.id)));
  }

  function successorsTableHtml(successors) {
    return `
      <div class="drawer-group">
        <div class="drawer-group-label">Successor candidates (${successors.length})</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Candidate</th><th>Readiness</th><th></th></tr></thead>
          <tbody>${successors.map((s) => `
            <tr data-successor="${s.id}">
              <td>${s.full_legal_name}</td>
              <td>${canUpdate ? `<select data-readiness-select>${READINESS_OPTIONS.map((o) => `<option value="${o.value}" ${o.value === s.readiness ? 'selected' : ''}>${o.label}</option>`).join('')}</select>` : READINESS_LABEL[s.readiness]}</td>
              <td>${canUpdate ? '<button class="btn btn-ghost btn-sm" data-remove-successor style="color:var(--color-danger)">Remove</button>' : ''}</td>
            </tr>
          `).join('') || '<tr><td colspan="3" class="faint">No successors identified.</td></tr>'}</tbody>
        </table></div>
        ${canUpdate ? `
          <div class="row" style="gap:8px;margin-top:10px;align-items:flex-end">
            <div class="form-row" style="flex:1;margin-bottom:0"><label>Add successor</label><select id="add-successor-emp"></select></div>
            <div class="form-row" style="margin-bottom:0"><label>Readiness</label><select id="add-successor-readiness">${READINESS_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}</select></div>
            <button class="btn btn-primary btn-sm" id="add-successor-btn">Add</button>
          </div>` : ''}
      </div>`;
  }

  async function openPlan(id) {
    const { data } = await Api.get(`/succession/${id}`);
    const units = await getUnitOptions();
    const people = await getPeopleOptions();

    FormDrawer.open({
      title: data.position_title,
      sub: `${data.org_unit_name || 'No unit'} · ${data.successors.length} successor(s)`,
      readOnly: !canUpdate,
      sections: [{
        label: 'Plan',
        fields: [
          { key: 'position_title', label: 'Position title', type: 'text', value: data.position_title, required: true },
          { key: 'risk', label: 'Risk', type: 'select', value: data.risk, options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }] },
          { key: 'org_unit_id', label: 'Org unit', type: 'select', value: data.org_unit_id || '', options: units, numeric: true },
          { key: 'incumbent_employee_no', label: 'Current incumbent', type: 'select', value: data.incumbent_employee_no || '', options: [{ value: '', label: '— Vacant —' }, ...people] },
          { key: 'note', label: 'Note', type: 'textarea', value: data.note, hint: 'Why this position is critical, and what\'s driving the risk rating' },
        ],
      }],
      extraHtml: successorsTableHtml(data.successors),
      afterRender: (root) => wireSuccessors(root, id, data, people),
      primaryLabel: 'Save changes',
      onSave: async (v) => {
        await Api.put(`/succession/${id}`, v);
        Api.toast('Succession plan updated', 'success');
        load();
      },
      onDelete: canDelete ? async () => {
        await Api.del(`/succession/${id}`);
        Api.toast('Succession plan deleted', 'success');
        load();
      } : undefined,
      deleteLabel: 'Delete plan',
    });
  }

  function wireSuccessors(root, planId, data, people) {
    root.querySelectorAll('[data-readiness-select]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const tr = sel.closest('tr');
        sel.disabled = true;
        try {
          await Api.put(`/succession/${planId}/successors/${tr.dataset.successor}`, { readiness: sel.value });
          Api.toast('Readiness updated', 'success');
        } catch (err) {
          Api.toast(err.message, 'error');
        } finally {
          sel.disabled = false;
        }
      });
    });
    root.querySelectorAll('[data-remove-successor]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!confirm('Remove this successor candidate?')) return;
      const tr = btn.closest('tr');
      await Api.withLoading(btn, 'Removing…', () => Api.del(`/succession/${planId}/successors/${tr.dataset.successor}`));
      Api.toast('Successor removed', 'success');
      FormDrawer.close();
      openPlan(planId);
      load();
    }));

    const currentIds = new Set(data.successors.map((s) => s.employee_no));
    const addSelect = root.querySelector('#add-successor-emp');
    if (addSelect) addSelect.innerHTML = people.filter((p) => !currentIds.has(p.value)).map((p) => `<option value="${p.value}">${p.label}</option>`).join('');
    const addBtn = root.querySelector('#add-successor-btn');
    if (addBtn) addBtn.addEventListener('click', async () => {
      const emp = addSelect.value;
      if (!emp) return;
      await Api.withLoading(addBtn, 'Adding…', () => Api.post(`/succession/${planId}/successors`, { employee_no: emp, readiness: root.querySelector('#add-successor-readiness').value }));
      Api.toast('Successor added', 'success');
      FormDrawer.close();
      openPlan(planId);
      load();
    });
  }

  document.getElementById('new-plan-btn').addEventListener('click', async () => {
    const units = await getUnitOptions();
    const people = await getPeopleOptions();
    FormDrawer.open({
      title: 'New succession plan',
      sub: 'Flags a critical position so its risk and successor readiness stay visible.',
      sections: [{
        label: 'Plan',
        fields: [
          { key: 'position_title', label: 'Position title', type: 'text', value: '', required: true },
          { key: 'risk', label: 'Risk', type: 'select', value: 'medium', options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }] },
          { key: 'org_unit_id', label: 'Org unit', type: 'select', value: '', options: units, numeric: true },
          { key: 'incumbent_employee_no', label: 'Current incumbent', type: 'select', value: '', options: [{ value: '', label: '— Vacant —' }, ...people] },
          { key: 'note', label: 'Note', type: 'textarea', value: '', hint: 'Why this position is critical, and what\'s driving the risk rating' },
        ],
      }],
      primaryLabel: 'Create',
      onSave: async (v) => {
        await Api.post('/succession', v);
        Api.toast('Succession plan created', 'success');
        load();
      },
    });
  });

  load();
})();
