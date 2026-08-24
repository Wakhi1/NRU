const ENROLLMENT_STATUS_OPTIONS = [
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

(async () => {
  const shellData = await Shell.init('training');
  const scope = shellData.scope.training || {};
  const canCreate = !!scope.create;
  const canUpdate = !!scope.update;
  const canDelete = !!scope.delete;
  const canManageRoster = scope.dataScope !== 'self' && !!scope.read;
  if (canCreate) {
    document.getElementById('add-course-btn').style.display = '';
    document.getElementById('add-cert-btn').style.display = '';
  }

  let coursesCache = [];
  let myEnrollmentsCache = [];
  let peopleCache = null;
  let unitsCache = null;

  async function getPeople() {
    if (!peopleCache) { try { peopleCache = (await Api.get('/people')).data; } catch (e) { peopleCache = []; } }
    return peopleCache;
  }
  async function getUnits() {
    if (!unitsCache) { try { unitsCache = (await Api.get('/org')).data; } catch (e) { unitsCache = []; } }
    return unitsCache;
  }

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-courses').style.display = tab.dataset.tab === 'courses' ? '' : 'none';
      document.getElementById('tab-certs').style.display = tab.dataset.tab === 'certs' ? '' : 'none';
    });
  });

  async function loadCourses() {
    const [{ data: courses }, { data: enrollments }] = await Promise.all([
      Api.get('/training/courses'),
      Api.get('/training/enrollments'),
    ]);
    coursesCache = courses;
    myEnrollmentsCache = enrollments;
    const enrolledIds = new Set(enrollments.map((e) => e.course_id));
    document.querySelector('#courses-table tbody').innerHTML = courses.map((c) => `
      <tr data-course="${c.id}" class="clickable">
        <td>${c.name}</td><td>${c.provider || '—'}</td><td>${c.category || '—'}</td>
        <td>${c.is_certification ? `<span class="badge badge-info">${c.validity_months || '—'} mo</span>` : '—'}</td>
        <td>${enrolledIds.has(c.id) ? '<span class="badge badge-success">Enrolled</span>' : ''}</td>
      </tr>
    `).join('') || '<tr><td colspan="5" class="faint">No courses yet.</td></tr>';
    document.querySelectorAll('#courses-table tbody tr[data-course]').forEach((tr) => tr.addEventListener('click', () => openCourseDrawer(Number(tr.dataset.course))));
  }

  function rosterTableHtml(roster) {
    return `
      <div class="drawer-group">
        <div class="drawer-group-label">Enrollments (${roster.length})</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Person</th><th>Status</th><th>Completed</th></tr></thead>
          <tbody>${roster.map((e) => `
            <tr data-enrollment="${e.id}">
              <td>${e.full_legal_name}</td>
              <td>${canUpdate ? `<select data-status-select>${ENROLLMENT_STATUS_OPTIONS.map((o) => `<option value="${o.value}" ${o.value === e.status ? 'selected' : ''}>${o.label}</option>`).join('')}</select>` : ENROLLMENT_STATUS_OPTIONS.find((o) => o.value === e.status).label}</td>
              <td class="faint">${e.completed_at || '—'}</td>
            </tr>
          `).join('') || '<tr><td colspan="3" class="faint">No one enrolled yet.</td></tr>'}</tbody>
        </table></div>
        ${canCreate ? `
          <div class="drawer-group-label" style="margin-top:14px">Assign to</div>
          <div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap">
            <div class="form-row" style="flex:1;min-width:160px;margin-bottom:0"><label>Individuals</label><select id="assign-people" multiple size="4" style="min-height:90px"></select></div>
            <button class="btn btn-ghost btn-sm" id="assign-people-btn">Assign selected</button>
          </div>
          <div class="row" style="gap:8px;align-items:flex-end;margin-top:8px;flex-wrap:wrap">
            <div class="form-row" style="flex:1;min-width:160px;margin-bottom:0"><label>Whole unit</label><select id="assign-unit"></select></div>
            <button class="btn btn-ghost btn-sm" id="assign-unit-btn">Assign unit's members</button>
          </div>` : ''}
      </div>`;
  }

  async function openCourseDrawer(courseId) {
    const c = coursesCache.find((x) => x.id === courseId);
    let roster = [];
    if (canManageRoster) { try { roster = (await Api.get(`/training/courses/${courseId}/enrollments`)).data; } catch (e) { roster = []; } }
    const myEnrollment = myEnrollmentsCache.find((e) => e.course_id === courseId);

    FormDrawer.open({
      title: c.name,
      sub: [c.provider, c.category].filter(Boolean).join(' · '),
      readOnly: !canUpdate,
      sections: [{
        label: 'Course',
        fields: [
          { key: 'name', label: 'Name', type: 'text', value: c.name, required: true },
          { key: 'provider', label: 'Provider', type: 'text', value: c.provider },
          { key: 'category', label: 'Category', type: 'text', value: c.category },
          { key: 'is_certification', label: 'Certification', type: 'checkbox', value: !!c.is_certification, hint: 'This course issues a certification' },
          { key: 'validity_months', label: 'Validity (months)', type: 'number', value: c.validity_months },
        ],
      }],
      extraHtml: (canManageRoster ? rosterTableHtml(roster) : '') + (!myEnrollment ? `
        <div class="drawer-group"><button class="btn btn-primary btn-sm" id="self-enroll-btn">Enroll myself</button></div>` : ''),
      afterRender: (root) => wireCourseDrawer(root, courseId, roster),
      primaryLabel: 'Save changes',
      onSave: async (v) => {
        await Api.put(`/training/courses/${courseId}`, v);
        Api.toast('Course updated', 'success');
        loadCourses();
      },
      onDelete: canDelete ? async () => {
        await Api.del(`/training/courses/${courseId}`);
        Api.toast('Course deleted', 'success');
        loadCourses();
      } : undefined,
      deleteLabel: 'Delete course',
    });
  }

  async function wireCourseDrawer(root, courseId, roster) {
    const selfBtn = root.querySelector('#self-enroll-btn');
    if (selfBtn) selfBtn.addEventListener('click', async () => {
      await Api.withLoading(selfBtn, 'Enrolling…', () => Api.post('/training/enrollments', { course_id: courseId }));
      Api.toast('Enrolled', 'success');
      FormDrawer.close();
      openCourseDrawer(courseId);
      loadCourses();
    });

    root.querySelectorAll('[data-status-select]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const tr = sel.closest('tr');
        sel.disabled = true;
        try {
          await Api.put(`/training/enrollments/${tr.dataset.enrollment}`, {
            status: sel.value,
            completed_at: sel.value === 'completed' ? new Date().toISOString().slice(0, 10) : null,
          });
          Api.toast('Status updated', 'success');
        } catch (err) {
          Api.toast(err.message, 'error');
        } finally {
          sel.disabled = false;
        }
      });
    });

    const peopleSelect = root.querySelector('#assign-people');
    const unitSelect = root.querySelector('#assign-unit');
    if (peopleSelect || unitSelect) {
      const people = await getPeople();
      const enrolledIds = new Set(roster.map((r) => r.employee_no));
      if (peopleSelect) {
        peopleSelect.innerHTML = people.filter((p) => !enrolledIds.has(p.employee_no))
          .map((p) => `<option value="${p.employee_no}">${p.preferred_name || p.full_legal_name} (${p.employee_no})</option>`).join('');
      }
      if (unitSelect) {
        const units = await getUnits();
        unitSelect.innerHTML = '<option value="">— Select a unit —</option>' + units.map((u) => `<option value="${u.id}">${u.name}</option>`).join('');
      }
    }

    const assignPeopleBtn = root.querySelector('#assign-people-btn');
    if (assignPeopleBtn) assignPeopleBtn.addEventListener('click', async () => {
      const selected = Array.from(peopleSelect.selectedOptions).map((o) => o.value);
      if (!selected.length) return;
      await Api.withLoading(assignPeopleBtn, 'Assigning…', async () => {
        for (const employeeNo of selected) {
          await Api.post('/training/enrollments', { employee_no: employeeNo, course_id: courseId });
        }
      });
      Api.toast(`Assigned to ${selected.length} people`, 'success');
      FormDrawer.close();
      openCourseDrawer(courseId);
    });

    const assignUnitBtn = root.querySelector('#assign-unit-btn');
    if (assignUnitBtn) assignUnitBtn.addEventListener('click', async () => {
      if (!unitSelect.value) return;
      const { data: unit } = await Api.get(`/org/${unitSelect.value}`);
      const members = (unit.members || []).filter((m) => !m.to_date);
      await Api.withLoading(assignUnitBtn, 'Assigning…', async () => {
        for (const m of members) {
          try { await Api.post('/training/enrollments', { employee_no: m.employee_no, course_id: courseId }); } catch (e) { /* already enrolled — skip */ }
        }
      });
      Api.toast(`Assigned to ${members.length} unit member(s)`, 'success');
      FormDrawer.close();
      openCourseDrawer(courseId);
    });
  }

  document.getElementById('add-course-btn').addEventListener('click', () => {
    FormDrawer.open({
      title: 'New course',
      sub: 'Adds a course to the catalogue.',
      sections: [{
        label: 'Course',
        fields: [
          { key: 'name', label: 'Name', type: 'text', value: '', required: true },
          { key: 'provider', label: 'Provider', type: 'text', value: '' },
          { key: 'category', label: 'Category', type: 'text', value: '' },
          { key: 'is_certification', label: 'Certification', type: 'checkbox', value: false, hint: 'This course issues a certification' },
          { key: 'validity_months', label: 'Validity (months)', type: 'number', value: '' },
        ],
      }],
      primaryLabel: 'Create',
      onSave: async (v) => {
        await Api.post('/training/courses', v);
        Api.toast('Course created', 'success');
        loadCourses();
      },
    });
  });

  function expiryBadge(expiresAt) {
    if (!expiresAt) return '—';
    const days = (new Date(expiresAt) - new Date()) / 86400000;
    if (days < 0) return `${expiresAt} <span class="badge badge-danger">Expired</span>`;
    if (days <= 90) return `${expiresAt} <span class="badge badge-warning">Expiring</span>`;
    return expiresAt;
  }

  let certsCache = [];
  async function loadCerts() {
    const { data } = await Api.get('/training/certifications');
    certsCache = data;
    document.querySelector('#certs-table tbody').innerHTML = data.map((c) => `
      <tr data-cert="${c.id}" class="clickable">
        <td>${c.name}</td><td>${c.issuing_body || '—'}</td><td>${c.issued_at || '—'}</td><td>${expiryBadge(c.expires_at)}</td>
        <td>${canDelete ? '<button class="btn btn-ghost btn-sm" data-delete-cert style="color:var(--color-danger)">Delete</button>' : ''}</td>
      </tr>
    `).join('') || '<tr><td colspan="5" class="faint">No certifications on file.</td></tr>';

    document.querySelectorAll('#certs-table tbody tr[data-cert]').forEach((tr) => tr.addEventListener('click', (e) => {
      if (e.target.closest('[data-delete-cert]')) return;
      openCertDrawer(Number(tr.dataset.cert));
    }));
    document.querySelectorAll('[data-delete-cert]').forEach((btn) => btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this certification entry?')) return;
      const tr = btn.closest('tr');
      await Api.withLoading(btn, 'Deleting…', () => Api.del(`/training/certifications/${tr.dataset.cert}`));
      Api.toast('Certification deleted', 'success');
      loadCerts();
    }));
  }

  function openCertDrawer(id) {
    const c = certsCache.find((x) => x.id === id);
    if (!c) return;
    FormDrawer.open({
      title: c.name,
      sub: c.issuing_body || '',
      readOnly: !canUpdate,
      sections: [{
        label: 'Certification',
        fields: [
          { key: 'name', label: 'Name', type: 'text', value: c.name, required: true },
          { key: 'issuing_body', label: 'Issuing body', type: 'text', value: c.issuing_body },
          { key: 'issued_at', label: 'Issued', type: 'date', value: c.issued_at },
          { key: 'expires_at', label: 'Expires', type: 'date', value: c.expires_at },
        ],
      }],
      primaryLabel: 'Save changes',
      onSave: async (v) => {
        await Api.put(`/training/certifications/${id}`, v);
        Api.toast('Certification updated', 'success');
        loadCerts();
      },
      onDelete: canDelete ? async () => {
        await Api.del(`/training/certifications/${id}`);
        Api.toast('Certification deleted', 'success');
        loadCerts();
      } : undefined,
    });
  }

  document.getElementById('add-cert-btn').addEventListener('click', () => {
    FormDrawer.open({
      title: 'Add certification',
      sections: [{
        label: 'Certification',
        fields: [
          { key: 'name', label: 'Name', type: 'text', value: '', required: true },
          { key: 'issuing_body', label: 'Issuing body', type: 'text', value: '' },
          { key: 'issued_at', label: 'Issued', type: 'date', value: '' },
          { key: 'expires_at', label: 'Expires', type: 'date', value: '' },
        ],
      }],
      primaryLabel: 'Add',
      onSave: async (v) => {
        await Api.post('/training/certifications', v);
        Api.toast('Certification added', 'success');
        loadCerts();
      },
    });
  });

  loadCourses();
  loadCerts();
})();
