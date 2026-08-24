(async () => {
  const shellData = await Shell.init('performance');
  const me = shellData.user.employeeNo;
  const scope = shellData.scope.performance || {};

  if (scope.create) {
    document.getElementById('new-cycle-btn').style.display = '';
    document.getElementById('new-review-btn').style.display = '';
  }
  if (scope.delete) document.getElementById('delete-cycle-btn').style.display = '';

  const cycleSelect = document.getElementById('cycle-select');
  let cyclesCache = [];
  let reviewsCache = [];
  let peopleOptions = null;

  async function getPeopleOptions() {
    if (!peopleOptions) {
      try {
        const { data } = await Api.get('/people');
        peopleOptions = data.map((p) => ({ value: p.employee_no, label: `${p.preferred_name || p.full_legal_name} (${p.employee_no})` }));
      } catch (e) { peopleOptions = []; }
    }
    return peopleOptions;
  }

  async function loadCycles(selectId) {
    const { data: cycles } = await Api.get('/performance/cycles');
    cyclesCache = cycles;
    cycleSelect.innerHTML = cycles.map((c) => `<option value="${c.id}">${c.name} (${c.status})</option>`).join('');
    const target = selectId || (cycles.find((c) => c.status === 'open') || {}).id;
    if (target) cycleSelect.value = String(target);
  }
  await loadCycles();

  function statusBadge(status) {
    const cls = status === 'completed' ? 'badge-success' : status === 'not_started' ? 'badge-neutral' : 'badge-warning';
    return `<span class="badge ${cls}">${status.replace('_', ' ')}</span>`;
  }

  async function load() {
    const cycleId = cycleSelect.value;
    if (!cycleId) return;
    const { data } = await Api.get(`/performance/reviews?cycle_id=${cycleId}`);
    reviewsCache = data;
    const tbody = document.querySelector('#reviews-table tbody');
    document.getElementById('reviews-empty').style.display = data.length ? 'none' : 'block';
    tbody.innerHTML = data.map((r) => `
      <tr class="clickable" data-review="${r.id}">
        <td>${r.full_legal_name}</td>
        <td>${r.reviewer_name || '—'}</td>
        <td>${r.self_rating != null ? r.self_rating : '—'}</td>
        <td>${r.manager_rating != null ? r.manager_rating : '—'}</td>
        <td>${statusBadge(r.status)}</td>
      </tr>
    `).join('');
    tbody.querySelectorAll('[data-review]').forEach((tr) => tr.addEventListener('click', () => openReviewDrawer(tr.dataset.review)));
  }

  function openReviewDrawer(reviewId) {
    const r = reviewsCache.find((x) => String(x.id) === String(reviewId));
    if (!r) return;
    const isEmployee = r.employee_no === me;
    const isReviewer = r.reviewer_employee_no === me;

    FormDrawer.open({
      title: r.full_legal_name,
      sub: `Reviewer: ${r.reviewer_name || 'unassigned'} · ${statusBadge(r.status).replace(/<[^>]+>/g, '')}`,
      readOnly: !isEmployee && !isReviewer,
      sections: [
        {
          label: 'Self-assessment',
          fields: [{ key: 'self_rating', label: 'Self rating (0–5)', type: 'number', value: r.self_rating, editable: isEmployee, hint: isEmployee ? 'Only you can submit your own self-rating' : undefined }],
        },
        {
          label: 'Manager assessment',
          fields: [
            { key: 'manager_rating', label: 'Manager rating (0–5)', type: 'number', value: r.manager_rating, editable: isReviewer, hint: isReviewer ? 'Only the assigned reviewer can submit this' : undefined },
            { key: 'comments', label: 'Comments', type: 'textarea', value: r.comments, editable: isReviewer },
          ],
        },
      ],
      primaryLabel: 'Submit',
      onSave: async (v) => {
        if (isEmployee && v.self_rating != null) {
          await Api.put(`/performance/reviews/${reviewId}/self`, { self_rating: Number(v.self_rating) });
        }
        if (isReviewer && v.manager_rating != null) {
          await Api.put(`/performance/reviews/${reviewId}/manager`, {
            manager_rating: Number(v.manager_rating), comments: v.comments || null, status: 'completed',
          });
        }
        Api.toast('Rating submitted', 'success');
        load();
      },
    });
  }

  cycleSelect.addEventListener('change', load);
  if (cycleSelect.value) load();

  document.getElementById('new-cycle-btn').addEventListener('click', () => {
    FormDrawer.open({
      title: 'New review cycle',
      sub: 'Opens a cycle so reviews can be added and rated against it.',
      sections: [{
        label: 'Cycle',
        fields: [
          { key: 'name', label: 'Name', type: 'text', value: '', required: true, hint: 'e.g. Annual 2026' },
          { key: 'period', label: 'Period', type: 'text', value: '', required: true, hint: 'e.g. 2026' },
          { key: 'start_date', label: 'Start date', type: 'date', value: '' },
          { key: 'end_date', label: 'End date', type: 'date', value: '' },
        ],
      }],
      primaryLabel: 'Create',
      onSave: async (v) => {
        const { data } = await Api.post('/performance/cycles', v);
        Api.toast('Review cycle created', 'success');
        await loadCycles(data.id);
        load();
      },
    });
  });

  document.getElementById('new-review-btn').addEventListener('click', async () => {
    if (!cycleSelect.value) { Api.toast('Select a cycle first', 'error'); return; }
    const people = await getPeopleOptions();
    FormDrawer.open({
      title: 'Add review',
      sub: 'Opens a review record for a person in the selected cycle so ratings can be submitted.',
      sections: [{
        label: 'Assignment',
        fields: [
          { key: 'employee_no', label: 'Employee', type: 'select', value: '', required: true, options: people },
          { key: 'reviewer_employee_no', label: 'Reviewer (evaluator)', type: 'select', value: '', options: [{ value: '', label: '— Unassigned —' }, ...people] },
        ],
      }],
      primaryLabel: 'Add review',
      onSave: async (v) => {
        await Api.post('/performance/reviews', { cycle_id: Number(cycleSelect.value), employee_no: v.employee_no, reviewer_employee_no: v.reviewer_employee_no || null });
        Api.toast('Review added', 'success');
        load();
      },
    });
  });

  document.getElementById('delete-cycle-btn').addEventListener('click', async (e) => {
    if (!cycleSelect.value) return;
    const cycle = cyclesCache.find((c) => String(c.id) === cycleSelect.value);
    if (!cycle) return;
    if (!confirm(`Delete cycle "${cycle.name}"? This also removes its review records.`)) return;
    await Api.withLoading(e.currentTarget, 'Deleting…', () => Api.del(`/performance/cycles/${cycle.id}`));
    Api.toast('Review cycle deleted', 'success');
    await loadCycles();
    if (cycleSelect.value) load(); else document.querySelector('#reviews-table tbody').innerHTML = '';
  });
})();
