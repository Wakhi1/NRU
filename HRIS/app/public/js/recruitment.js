const STAGE_LABEL = { applied: 'Applied', screening: 'Screening', interview: 'Interview', offer: 'Offer', hired: 'Hired', rejected: 'Rejected' };
const OUTCOME_LABEL = { pending: 'Pending', pass: 'Pass', fail: 'Fail' };

(async () => {
  const shellData = await Shell.init('recruitment');
  const scope = shellData.scope.recruitment || {};
  if (scope.create) document.getElementById('new-req-btn').style.display = '';

  let deptOptions = null;
  let peopleOptions = null;

  async function getDeptOptions() {
    if (!deptOptions) {
      try {
        const { data } = await Api.get('/org');
        deptOptions = [{ value: '', label: '— Not set —' }, ...data.filter((u) => u.kind === 'department').map((u) => ({ value: u.id, label: u.name }))];
      } catch (e) { deptOptions = [{ value: '', label: '— Not set —' }]; }
    }
    return deptOptions;
  }
  async function getPeopleOptions() {
    if (!peopleOptions) {
      try {
        const { data } = await Api.get('/people');
        peopleOptions = [{ value: '', label: '— Unassigned —' }, ...data.map((p) => ({ value: p.employee_no, label: `${p.preferred_name || p.full_legal_name} (${p.employee_no})` }))];
      } catch (e) { peopleOptions = [{ value: '', label: '— Unassigned —' }]; }
    }
    return peopleOptions;
  }

  async function loadReqs() {
    const { data } = await Api.get('/recruitment/requisitions');
    const grid = document.getElementById('req-grid');
    grid.innerHTML = data.map((r) => `
      <div class="card clickable" data-id="${r.id}">
        <div class="row between"><h3>${r.title}</h3><span class="badge ${r.status === 'open' ? 'badge-success' : r.status === 'on_hold' ? 'badge-warning' : 'badge-neutral'}">${r.status.replace('_', ' ')}</span></div>
        <div class="muted">${r.department_name || '—'} · Grade ${r.grade || '—'}</div>
        <div class="faint">${r.applicant_count} applicant(s) · headcount ${r.headcount}</div>
      </div>
    `).join('') || '<div class="empty-state">No requisitions yet.</div>';
    grid.querySelectorAll('.card[data-id]').forEach((el) => el.addEventListener('click', () => openReqDrawer(el.dataset.id)));
  }

  function candidatesTableHtml(applications) {
    return `
      <div class="drawer-group">
        <div class="drawer-group-label">Pipeline (${applications.length})</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Candidate</th><th>Email</th><th>Stage</th><th>Interviews</th><th></th></tr></thead>
          <tbody>${applications.map((a) => `
            <tr data-app="${a.id}" data-candidate="${a.candidate_id}" data-name="${a.full_name}" data-email="${a.email || ''}" data-phone="${a.phone || ''}">
              <td>${a.full_name}</td>
              <td>${a.email || '—'}</td>
              <td>${scope.update ? `<select data-stage-select>${Object.keys(STAGE_LABEL).map((s) => `<option value="${s}" ${s === a.stage ? 'selected' : ''}>${STAGE_LABEL[s]}</option>`).join('')}</select>` : STAGE_LABEL[a.stage]}</td>
              <td class="faint">${a.interviews.length ? a.interviews.map((i) => `${new Date(i.scheduled_at).toLocaleDateString()} (${OUTCOME_LABEL[i.outcome]})`).join(', ') : '—'}</td>
              <td class="row" style="gap:4px">
                ${scope.update ? '<button class="btn btn-ghost btn-sm" data-schedule-interview>Interview</button>' : ''}
                ${scope.update ? '<button class="btn btn-ghost btn-sm" data-edit-cand>Edit</button>' : ''}
                ${scope.delete ? '<button class="btn btn-ghost btn-sm" data-delete-cand style="color:var(--color-danger)">Delete</button>' : ''}
              </td>
            </tr>
          `).join('') || '<tr><td colspan="5" class="faint">No candidates yet.</td></tr>'}</tbody>
        </table></div>
        ${scope.create ? `
          <div class="row" style="gap:8px;margin-top:10px;align-items:flex-end;flex-wrap:wrap">
            <div class="form-row" style="flex:1;min-width:140px;margin-bottom:0"><label>Name</label><input id="cand-name" /></div>
            <div class="form-row" style="flex:1;min-width:140px;margin-bottom:0"><label>Email</label><input id="cand-email" type="email" /></div>
            <div class="form-row" style="flex:1;min-width:140px;margin-bottom:0"><label>Phone</label><input id="cand-phone" /></div>
            <button class="btn btn-primary btn-sm" id="add-cand-btn">Add candidate</button>
          </div>
          <div class="field-error" id="cand-error" style="display:none"></div>` : ''}
      </div>`;
  }

  async function openReqDrawer(id) {
    const { data: req } = await Api.get(`/recruitment/requisitions/${id}`);
    const depts = await getDeptOptions();

    FormDrawer.open({
      title: req.title,
      sub: `${req.department_name || 'No department'} · ${req.applications.length} candidate(s)`,
      readOnly: !scope.update,
      sections: [{
        label: 'Requisition',
        fields: [
          { key: 'title', label: 'Title', type: 'text', value: req.title, required: true },
          { key: 'department_org_unit_id', label: 'Department', type: 'select', value: req.department_org_unit_id || '', options: depts, numeric: true },
          { key: 'grade', label: 'Grade', type: 'text', value: req.grade },
          { key: 'headcount', label: 'Headcount', type: 'number', value: req.headcount },
          { key: 'status', label: 'Status', type: 'select', value: req.status, options: [{ value: 'open', label: 'Open' }, { value: 'on_hold', label: 'On hold' }, { value: 'closed', label: 'Closed' }] },
        ],
      }],
      extraHtml: candidatesTableHtml(req.applications),
      afterRender: (root) => wirePipeline(root, id, req),
      primaryLabel: 'Save changes',
      onSave: async (v) => {
        await Api.put(`/recruitment/requisitions/${id}`, v);
        Api.toast('Requisition updated', 'success');
        loadReqs();
      },
      onDelete: scope.delete ? async () => {
        await Api.del(`/recruitment/requisitions/${id}`);
        Api.toast('Requisition deleted', 'success');
        loadReqs();
      } : undefined,
      deleteLabel: 'Delete requisition',
    });
  }

  function wirePipeline(root, reqId, req) {
    root.querySelectorAll('[data-stage-select]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const tr = sel.closest('tr');
        sel.disabled = true;
        try {
          await Api.put(`/recruitment/applications/${tr.dataset.app}/stage`, { stage: sel.value });
          Api.toast('Stage updated', 'success');
          loadReqs();
        } catch (err) {
          Api.toast(err.message, 'error');
        } finally {
          sel.disabled = false;
        }
      });
    });

    root.querySelectorAll('[data-edit-cand]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr');
        FormDrawer.open({
          title: 'Edit candidate',
          sub: tr.dataset.name,
          sections: [{
            label: 'Candidate',
            fields: [
              { key: 'full_name', label: 'Full name', type: 'text', value: tr.dataset.name, required: true },
              { key: 'email', label: 'Email', type: 'email', value: tr.dataset.email },
              { key: 'phone', label: 'Phone', type: 'text', value: tr.dataset.phone },
            ],
          }],
          primaryLabel: 'Save',
          onSave: async (v) => {
            await Api.put(`/recruitment/candidates/${tr.dataset.candidate}`, v);
            Api.toast('Candidate updated', 'success');
            openReqDrawer(reqId);
          },
        });
      });
    });

    root.querySelectorAll('[data-delete-cand]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tr = btn.closest('tr');
        if (!confirm(`Delete candidate "${tr.dataset.name}"? This also removes their application(s) and interview record(s).`)) return;
        await Api.withLoading(btn, 'Deleting…', () => Api.del(`/recruitment/candidates/${tr.dataset.candidate}`));
        Api.toast('Candidate deleted', 'success');
        openReqDrawer(reqId);
        loadReqs();
      });
    });

    root.querySelectorAll('[data-schedule-interview]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tr = btn.closest('tr');
        const people = await getPeopleOptions();
        FormDrawer.open({
          title: 'Schedule interview',
          sub: tr.dataset.name,
          sections: [{
            label: 'Interview',
            fields: [
              { key: 'interviewer_employee_no', label: 'Interviewer', type: 'select', value: '', options: people },
              { key: 'scheduled_at', label: 'Date & time', type: 'date', value: '', required: true },
              { key: 'notes', label: 'Notes', type: 'textarea', value: '' },
            ],
          }],
          primaryLabel: 'Schedule',
          onSave: async (v) => {
            await Api.post(`/recruitment/applications/${tr.dataset.app}/interviews`, v);
            Api.toast('Interview scheduled', 'success');
            openReqDrawer(reqId);
          },
        });
      });
    });

    const addBtn = root.querySelector('#add-cand-btn');
    if (addBtn) addBtn.addEventListener('click', async () => {
      const errEl = root.querySelector('#cand-error');
      errEl.style.display = 'none';
      const name = root.querySelector('#cand-name').value.trim();
      if (!name) { errEl.textContent = 'Name is required.'; errEl.style.display = 'block'; return; }
      try {
        await Api.withLoading(addBtn, 'Adding…', () => Api.post(`/recruitment/requisitions/${reqId}/applications`, {
          full_name: name,
          email: root.querySelector('#cand-email').value.trim() || null,
          phone: root.querySelector('#cand-phone').value.trim() || null,
        }));
        Api.toast('Candidate added', 'success');
        openReqDrawer(reqId);
        loadReqs();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      }
    });
  }

  document.getElementById('new-req-btn').addEventListener('click', async () => {
    const depts = await getDeptOptions();
    FormDrawer.open({
      title: 'New requisition',
      sub: 'Opens a role for applications. You can add candidates once it\'s created.',
      sections: [{
        label: 'Requisition',
        fields: [
          { key: 'title', label: 'Title', type: 'text', value: '', required: true },
          { key: 'department_org_unit_id', label: 'Department', type: 'select', value: '', options: depts, numeric: true },
          { key: 'grade', label: 'Grade', type: 'text', value: '', hint: 'e.g. G4' },
          { key: 'headcount', label: 'Headcount', type: 'number', value: 1 },
        ],
      }],
      primaryLabel: 'Create',
      onSave: async (v) => {
        await Api.post('/recruitment/requisitions', v);
        Api.toast('Requisition created', 'success');
        loadReqs();
      },
    });
  });

  loadReqs();
})();
