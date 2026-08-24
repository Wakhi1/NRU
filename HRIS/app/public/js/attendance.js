(async () => {
  const shellData = await Shell.init('attendance');
  const canCorrect = !!(shellData.scope.attendance && shellData.scope.attendance.update);

  const clockBtn = document.getElementById('clock-btn');
  const clockStatus = document.getElementById('clock-status');

  async function refreshClock() {
    const { open, timer } = await Api.get('/attendance/today');
    clockBtn.disabled = false;
    if (open) {
      clockStatus.textContent = `Clocked in at ${new Date(timer.clock_in.replace(' ', 'T')).toLocaleTimeString()}`;
      clockBtn.textContent = 'Clock out';
      clockBtn.onclick = async () => { clockBtn.disabled = true; await Api.post('/attendance/clock-out'); Api.toast('Clocked out', 'success'); refreshClock(); loadGrid(); };
    } else {
      clockStatus.textContent = 'Not clocked in today';
      clockBtn.textContent = 'Clock in';
      clockBtn.onclick = async () => { clockBtn.disabled = true; await Api.post('/attendance/clock-in'); Api.toast('Clocked in', 'success'); refreshClock(); loadGrid(); };
    }
  }

  function fmtTime(v) { return v ? new Date(v.replace(' ', 'T')).toLocaleString() : '—'; }
  function toLocalInputValue(v) {
    if (!v) return '';
    const d = new Date(v.replace(' ', 'T'));
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  let gridRows = [];

  async function loadGrid() {
    const params = new URLSearchParams();
    if (document.getElementById('from-date').value) params.set('from', document.getElementById('from-date').value);
    if (document.getElementById('to-date').value) params.set('to', document.getElementById('to-date').value);
    if (document.getElementById('emp-filter').value.trim()) params.set('employee_no', document.getElementById('emp-filter').value.trim());

    const { data } = await Api.get('/attendance/timers?' + params.toString());
    gridRows = data;
    const tbody = document.querySelector('#grid-table tbody');
    document.getElementById('grid-empty').style.display = data.length ? 'none' : 'block';
    tbody.innerHTML = data.map((r) => `
      <tr>
        <td>${r.full_legal_name}</td>
        <td>${r.department_name || '—'}</td>
        <td>${fmtTime(r.clock_in)}</td>
        <td>${fmtTime(r.clock_out)}</td>
        <td>${r.hours == null ? '—' : r.hours}</td>
        <td><span class="badge ${r.status === 'Open' ? 'badge-info' : r.status === 'Late' ? 'badge-warning' : 'badge-success'}">${r.status}</span></td>
        <td>${r.source}</td>
        <td>${canCorrect ? `<button class="btn btn-ghost btn-sm" data-review="${r.id}">Review</button>` : ''}</td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-review]').forEach((btn) => {
      btn.addEventListener('click', () => openReviewDrawer(gridRows.find((r) => String(r.id) === btn.dataset.review)));
    });
  }

  // Corrections are append-only — this never edits the original row, it POSTs a new
  // correction record linked via correction_of, exactly like the backend enforces.
  function openReviewDrawer(row) {
    FormDrawer.open({
      title: `Review timesheet — ${row.full_legal_name}`,
      sub: `Original entry: ${fmtTime(row.clock_in)} → ${fmtTime(row.clock_out)} (${row.source})`,
      sections: [{
        label: 'Correction',
        fields: [
          { key: 'clock_in', label: 'Corrected clock-in', type: 'text', value: toLocalInputValue(row.clock_in), required: true, hint: 'YYYY-MM-DDTHH:MM' },
          { key: 'clock_out', label: 'Corrected clock-out', type: 'text', value: toLocalInputValue(row.clock_out), hint: 'YYYY-MM-DDTHH:MM, leave blank if still open' },
          { key: 'reason', label: 'Reason for correction', type: 'textarea', value: '', required: true, hint: 'e.g. terminal offline, forgot to clock out' },
        ],
      }],
      primaryLabel: 'Submit correction',
      onSave: async (v) => {
        await Api.post(`/attendance/timers/${row.id}/correction`, {
          clock_in: v.clock_in.replace('T', ' ') + ':00',
          clock_out: v.clock_out ? v.clock_out.replace('T', ' ') + ':00' : null,
          reason: v.reason,
        });
        Api.toast('Correction recorded', 'success');
        loadGrid();
      },
    });
  }

  const today = new Date();
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  document.getElementById('to-date').value = today.toISOString().slice(0, 10);
  document.getElementById('from-date').value = weekAgo.toISOString().slice(0, 10);
  document.getElementById('filter-btn').addEventListener('click', loadGrid);

  if (shellData.scope.worktime && shellData.scope.worktime.update) {
    document.getElementById('shift-admin-card').style.display = 'block';
    let shifts = [];

    function shiftSections(s) {
      return [{
        label: 'Timer configuration',
        fields: [
          { key: 'name', label: 'Name', type: 'text', value: s ? s.name : '', required: true },
          { key: 'pattern', label: 'Pattern', type: 'text', value: s ? s.pattern : '', required: true, hint: 'e.g. Mon-Fri 08:00-17:00' },
          { key: 'contracted_hours', label: 'Contracted hours', type: 'number', value: s ? s.contracted_hours : 40 },
          { key: 'break_rule', label: 'Break rule', type: 'text', value: s ? s.break_rule : '' },
          { key: 'grace_minutes', label: 'Grace (minutes)', type: 'number', value: s ? s.grace_minutes : 10 },
          { key: 'overtime_rule', label: 'Overtime rule', type: 'text', value: s ? s.overtime_rule : '' },
          { key: 'rounding_rule', label: 'Rounding rule', type: 'text', value: s ? s.rounding_rule : '' },
          {
            key: 'capture_source', label: 'Capture source', type: 'select', value: s ? s.capture_source : 'web',
            options: [{ value: 'web', label: 'Web' }, { value: 'terminal', label: 'Terminal' }, { value: 'mobile_gps', label: 'Mobile GPS' }, { value: 'vehicle_log', label: 'Vehicle log' }],
          },
          { key: 'auto_clock_out', label: 'Auto clock-out', type: 'checkbox', value: s ? !!s.auto_clock_out : false, hint: 'Automatically close the timer at end of shift' },
        ],
      }];
    }

    function openShift(s) {
      FormDrawer.open({
        title: s.name,
        sub: `${s.contracted_hours} hrs/wk · ${s.capture_source}`,
        sections: shiftSections(s),
        primaryLabel: 'Save changes',
        onSave: async (v) => {
          await Api.put(`/worktime/${s.id}`, v);
          Api.toast('Shift pattern updated', 'success');
          loadShifts();
        },
        onDelete: async () => {
          await Api.del(`/worktime/${s.id}`);
          Api.toast('Shift pattern deleted', 'success');
          loadShifts();
        },
        deleteLabel: 'Delete pattern',
      });
    }

    document.getElementById('new-shift-btn').addEventListener('click', () => {
      FormDrawer.open({
        title: 'Add shift pattern',
        sub: 'Applies timer rules (grace, overtime, rounding) to everyone assigned to it.',
        sections: shiftSections(null),
        primaryLabel: 'Create',
        onSave: async (v) => {
          await Api.post('/worktime', v);
          Api.toast('Shift pattern added', 'success');
          loadShifts();
        },
      });
    });

    async function loadShifts() {
      const { data } = await Api.get('/worktime');
      shifts = data;
      document.querySelector('#shift-table tbody').innerHTML = data.map((s) => `
        <tr class="clickable" data-id="${s.id}"><td>${s.name}</td><td>${s.pattern}</td><td>${s.contracted_hours}</td><td>${s.grace_minutes}</td><td>${s.capture_source}</td></tr>
      `).join('');
      document.querySelectorAll('#shift-table tbody tr[data-id]').forEach((tr) => {
        tr.addEventListener('click', () => openShift(shifts.find((s) => String(s.id) === tr.dataset.id)));
      });
    }
    loadShifts();
  }

  refreshClock();
  loadGrid();
})();
