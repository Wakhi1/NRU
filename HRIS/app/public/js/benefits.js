(async () => {
  const shellData = await Shell.init('benefits');
  const scope = shellData.scope.benefits || {};
  if (scope.create) document.getElementById('new-plan-btn').style.display = '';

  let plansCache = [];
  let peopleCache = null;

  async function getPeople() {
    if (!peopleCache) {
      try { peopleCache = (await Api.get('/people')).data; } catch (e) { peopleCache = []; }
    }
    return peopleCache;
  }

  async function load() {
    const [plans, enrollments] = await Promise.all([Api.get('/benefits/plans'), Api.get('/benefits/enrollments')]);
    plansCache = plans.data;
    const enrolledIds = new Set(enrollments.data.map((e) => e.benefit_plan_id));
    const enrollmentByPlan = {};
    enrollments.data.forEach((e) => { enrollmentByPlan[e.benefit_plan_id] = e.id; });

    document.getElementById('plan-grid').innerHTML = plansCache.map((p) => {
      const enrolled = enrolledIds.has(p.id);
      return `
        <div class="card">
          <div class="row between"><h3>${p.name}</h3>${enrolled ? '<span class="badge badge-success">Enrolled</span>' : ''}</div>
          <div class="faint">${p.kind || ''}</div>
          <p>${p.note || ''}</p>
          <div class="muted">E ${Number(p.cost_per_person).toFixed(2)} / month</div>
          <div class="divider"></div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <button class="btn ${enrolled ? 'btn-ghost' : 'btn-primary'} btn-sm" data-plan="${p.id}" data-enrolled="${enrolled}">
              ${enrolled ? 'Cancel enrollment' : 'Enroll'}
            </button>
            ${scope.update ? `<button class="btn btn-ghost btn-sm" data-manage="${p.id}">Manage enrollees</button>` : ''}
            ${scope.update ? `<button class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button>` : ''}
          </div>
        </div>`;
    }).join('') || '<div class="empty-state">No benefit plans configured.</div>';

    document.querySelectorAll('#plan-grid button[data-plan]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const planId = Number(btn.dataset.plan);
        const isEnrolled = btn.dataset.enrolled === 'true';
        try {
          await Api.withLoading(btn, isEnrolled ? 'Cancelling…' : 'Enrolling…', async () => {
            if (isEnrolled) {
              await Api.del(`/benefits/enrollments/${enrollmentByPlan[planId]}`);
              Api.toast('Enrollment cancelled', 'success');
            } else {
              await Api.post('/benefits/enrollments', { benefit_plan_id: planId });
              Api.toast('Enrolled', 'success');
            }
          });
          load();
        } catch (err) { /* toasted by Api */ }
      });
    });

    document.querySelectorAll('#plan-grid [data-edit]').forEach((btn) => btn.addEventListener('click', () => openPlanDrawer(plansCache.find((p) => p.id === Number(btn.dataset.edit)))));
    document.querySelectorAll('#plan-grid [data-manage]').forEach((btn) => btn.addEventListener('click', () => openEnrolleesDrawer(plansCache.find((p) => p.id === Number(btn.dataset.manage)))));
  }

  function openPlanDrawer(p) {
    FormDrawer.open({
      title: p ? 'Edit benefit plan' : 'New benefit plan',
      sub: 'Plans appear immediately for everyone to enroll in.',
      sections: [{
        label: 'Plan',
        fields: [
          { key: 'name', label: 'Name', type: 'text', value: p ? p.name : '', required: true },
          { key: 'kind', label: 'Kind', type: 'text', value: p ? p.kind : '', hint: 'e.g. Health, Insurance, Wellness' },
          { key: 'cost_per_person', label: 'Cost per person / month', type: 'number', value: p ? p.cost_per_person : 0 },
          { key: 'note', label: 'Note', type: 'textarea', value: p ? p.note : '' },
        ],
      }],
      primaryLabel: p ? 'Save changes' : 'Create',
      onSave: async (v) => {
        await (p ? Api.put(`/benefits/plans/${p.id}`, v) : Api.post('/benefits/plans', v));
        Api.toast('Plan saved', 'success');
        load();
      },
      onDelete: p && scope.delete ? async () => {
        await Api.del(`/benefits/plans/${p.id}`);
        Api.toast('Plan deleted', 'success');
        load();
      } : undefined,
      deleteLabel: 'Delete plan (removes its enrollments too)',
    });
  }
  document.getElementById('new-plan-btn').addEventListener('click', () => openPlanDrawer(null));

  async function openEnrolleesDrawer(plan) {
    const { data: enrollees } = await Api.get(`/benefits/plans/${plan.id}/enrollees`);
    const people = await getPeople();
    const enrolledIds = new Set(enrollees.map((e) => e.employee_no));

    FormDrawer.open({
      title: `Enrollees — ${plan.name}`,
      sub: `${enrollees.length} active enrollment(s) · E ${Number(plan.cost_per_person).toFixed(2)} / month each`,
      sections: [],
      extraHtml: `
        <div class="drawer-group">
          <div class="drawer-group-label">Currently enrolled</div>
          <div class="table-wrap"><table>
            <thead><tr><th>Name</th><th>Since</th><th></th></tr></thead>
            <tbody>${enrollees.map((e) => `
              <tr data-enrollment="${e.id}">
                <td>${e.full_legal_name}</td><td>${e.enrolled_at}</td>
                <td><button class="btn btn-ghost btn-sm" data-disenroll style="color:var(--color-danger)">Disenroll</button></td>
              </tr>
            `).join('') || '<tr><td colspan="3" class="faint">No one enrolled yet.</td></tr>'}</tbody>
          </table></div>
          <div class="row" style="gap:8px;margin-top:10px;align-items:flex-end">
            <div class="form-row" style="flex:1;margin-bottom:0"><label>Enroll someone</label><select id="enroll-person-select">${people.filter((p) => !enrolledIds.has(p.employee_no)).map((p) => `<option value="${p.employee_no}">${p.preferred_name || p.full_legal_name} (${p.employee_no})</option>`).join('')}</select></div>
            <button class="btn btn-primary btn-sm" id="enroll-person-btn">Enroll</button>
          </div>
        </div>`,
      afterRender: (root) => {
        document.getElementById('fd-save').style.display = 'none';
        root.querySelectorAll('[data-disenroll]').forEach((btn) => btn.addEventListener('click', async () => {
          const id = btn.closest('tr').dataset.enrollment;
          await Api.withLoading(btn, 'Removing…', () => Api.del(`/benefits/enrollments/${id}`));
          Api.toast('Disenrolled', 'success');
          FormDrawer.close();
          openEnrolleesDrawer(plan);
          load();
        }));
        root.querySelector('#enroll-person-btn').addEventListener('click', async (e) => {
          const employeeNo = root.querySelector('#enroll-person-select').value;
          if (!employeeNo) return;
          await Api.withLoading(e.currentTarget, 'Enrolling…', () => Api.post('/benefits/enrollments', { benefit_plan_id: plan.id, employee_no: employeeNo }));
          Api.toast('Enrolled', 'success');
          FormDrawer.close();
          openEnrolleesDrawer(plan);
          load();
        });
      },
      onSave: async () => { /* unused — enroll/disenroll buttons above handle everything */ },
    });
  }

  load();
})();
