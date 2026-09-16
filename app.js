const STORAGE_KEY = 'twr_submissions_v1';

const QUADRANTS = [
  { key: 'standardize_scale', title: 'Standardize & Scale', subtitle: 'Long-Term · Perform', desc: 'Make what works repeatable and scalable', term: 'long', mode: 'perform', color: 'blue' },
  { key: 'build_future', title: 'Build the Future', subtitle: 'Long-Term · Transform', desc: "Create what's next", term: 'long', mode: 'transform', color: 'green' },
  { key: 'run_business', title: 'Run the Business', subtitle: 'Short-Term · Perform', desc: 'Keep the engine running', term: 'short', mode: 'perform', color: 'gray' },
  { key: 'pilot_improve', title: 'Pilot & Improve', subtitle: 'Short-Term · Transform', desc: 'Test, learn and iterate', term: 'short', mode: 'transform', color: 'purple' },
];

function aggregatePerformTransform(submissions) {
  let performHours = 0, transformHours = 0;
  submissions.forEach(s => {
    const quadrants = s.quadrants || {};
    QUADRANTS.forEach(q => {
      const hours = Number((quadrants[q.key] || {}).hours) || 0;
      if (q.mode === 'perform') performHours += hours;
      else transformHours += hours;
    });
    performHours += Number(s.adminHours) || 0;
  });
  return { performHours, transformHours };
}

function classifyBalance(performHours, transformHours) {
  const total = performHours + transformHours;
  if (!total) return { zone: 'none', label: 'No data', transformPct: 0 };
  const transformPct = Math.round((transformHours / total) * 100);
  if (transformPct >= 25) return { zone: 'green', label: 'Balanced', transformPct };
  if (transformPct >= 10) return { zone: 'yellow', label: 'Leaning Perform', transformPct };
  return { zone: 'red', label: 'Heavy Perform', transformPct };
}

function loadSubmissions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveSubmissions(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function submissionKey(contributor, week) {
  return (contributor || '').trim().toLowerCase() + '|' + week;
}

function deleteSubmission(contributor, week) {
  const id = submissionKey(contributor, week);
  saveSubmissions(loadSubmissions().filter(s => s.id !== id));
  if (currentSubmission && currentSubmission.id === id) {
    currentSubmission = newEmptySubmission(contributor, week);
    renderQuadrants();
  }
}

// Submissions are keyed by the Monday of the reporting week, stored as "YYYY-MM-DD"
// (sortable as plain strings) and always displayed to users as DD/MM/YYYY.
function parseISODate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toCanonical(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDMY(date) {
  if (!date) return '';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function weekRangeLabel(monday) {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return `Week: ${formatDMY(monday)} – ${formatDMY(sunday)}`;
}

function formatWeekCell(canonicalWeek) {
  return formatDMY(parseISODate(canonicalWeek));
}

let currentSubmission = null;

// ---------- Tabs ----------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'team-input') renderTeamInputTable();
  });
});

// ---------- Submission form: create/load current draft ----------
function defaultWeekValue() {
  return toCanonical(new Date());
}

// Reads the picked calendar date, snaps it to that week's Monday, writes the
// canonical "YYYY-MM-DD" key + a DD/MM/YYYY range hint, then reloads the draft.
function onWeekFieldChange() {
  const raw = document.getElementById('f-week').value;
  if (!raw) {
    document.getElementById('f-week-canonical').value = '';
    document.getElementById('f-week-range').textContent = '';
    loadOrCreateCurrent();
    return;
  }
  const monday = mondayOf(parseISODate(raw));
  document.getElementById('f-week-canonical').value = toCanonical(monday);
  document.getElementById('f-week-range').textContent = weekRangeLabel(monday);
  loadOrCreateCurrent();
}

function newEmptySubmission(contributor, week) {
  const quadrants = {};
  QUADRANTS.forEach(q => { quadrants[q.key] = { activity: '', hours: 0 }; });
  return {
    id: submissionKey(contributor, week),
    contributor: contributor || '',
    week: week,
    status: 'Draft',
    createdAt: new Date().toISOString(),
    submittedAt: null,
    quadrants,
    adminNotes: '',
    adminHours: 0,
  };
}

function ensureQuadrant(key) {
  if (!currentSubmission.quadrants) currentSubmission.quadrants = {};
  if (!currentSubmission.quadrants[key]) currentSubmission.quadrants[key] = { activity: '', hours: 0 };
  return currentSubmission.quadrants[key];
}

function loadOrCreateCurrent() {
  const contributor = document.getElementById('f-contributor').value.trim();
  const week = document.getElementById('f-week-canonical').value;
  if (!contributor || !week) {
    currentSubmission = newEmptySubmission(contributor, week || defaultWeekValue());
    renderQuadrants();
    return;
  }
  const all = loadSubmissions();
  const found = all.find(s => s.id === submissionKey(contributor, week));
  currentSubmission = found ? JSON.parse(JSON.stringify(found)) : newEmptySubmission(contributor, week);
  updateStatusBadge();
  renderQuadrants();
}

function updateStatusBadge() {
  const badge = document.getElementById('submission-status-badge');
  const submitted = currentSubmission.status === 'Submitted';
  badge.textContent = currentSubmission.status;
  badge.className = 'badge ' + (submitted ? 'submitted' : 'draft');
  document.getElementById('btn-submit-week').style.display = submitted ? 'none' : '';
  document.getElementById('btn-reopen').style.display = submitted ? '' : 'none';
  setFormDisabled(submitted);
}

function setFormDisabled(disabled) {
  QUADRANTS.forEach(q => {
    document.getElementById(`q-activity-${q.key}`).disabled = disabled;
    document.getElementById(`q-hours-${q.key}`).disabled = disabled;
  });
  document.getElementById('admin-notes').disabled = disabled;
  document.getElementById('admin-hours').disabled = disabled;
}

function renderAdminBox() {
  document.getElementById('admin-notes').value = currentSubmission.adminNotes || '';
  document.getElementById('admin-hours').value = currentSubmission.adminHours || '';
}

document.getElementById('admin-notes').addEventListener('input', () => {
  currentSubmission.adminNotes = document.getElementById('admin-notes').value.trim();
});
document.getElementById('admin-hours').addEventListener('input', () => {
  currentSubmission.adminHours = Number(document.getElementById('admin-hours').value) || 0;
  updateAllocationBar();
});

document.getElementById('f-contributor').addEventListener('change', loadOrCreateCurrent);
document.getElementById('f-week').addEventListener('change', onWeekFieldChange);

// ---------- Render quadrants (submission tab) ----------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

function renderQuadrants() {
  const grid = document.getElementById('quadrant-grid');
  grid.innerHTML = QUADRANTS.map(q => {
    const qd = ensureQuadrant(q.key);
    return `
      <div class="quadrant-box ${q.color}" data-quadrant="${q.key}">
        <div class="quadrant-head">
          <div>
            <span class="subtitle">${q.subtitle}</span>
            <h3>${q.title}</h3>
            <span class="desc">${q.desc}</span>
          </div>
          <div class="quadrant-side-fields">
            <label class="mini-field">Hours spent
              <input type="number" id="q-hours-${q.key}" min="0" step="0.5" placeholder="e.g. 4" value="${qd.hours || ''}" />
            </label>
          </div>
        </div>
        <label>Activity
          <textarea id="q-activity-${q.key}" rows="3" placeholder="Describe the activity / deliverable">${escapeHtml(qd.activity)}</textarea>
        </label>
      </div>`;
  }).join('');

  QUADRANTS.forEach(q => {
    document.getElementById(`q-activity-${q.key}`).addEventListener('input', () => {
      ensureQuadrant(q.key).activity = document.getElementById(`q-activity-${q.key}`).value.trim();
    });
    document.getElementById(`q-hours-${q.key}`).addEventListener('input', () => {
      ensureQuadrant(q.key).hours = Number(document.getElementById(`q-hours-${q.key}`).value) || 0;
      updateAllocationBar();
    });
  });

  renderAdminBox();
  updateAllocationBar();
  updateStatusBadge();
}

function updateAllocationBar() {
  const total = QUADRANTS.reduce((sum, q) => sum + (Number(ensureQuadrant(q.key).hours) || 0), 0)
    + (Number(currentSubmission.adminHours) || 0);
  document.getElementById('allocation-label').textContent = `Total hours logged: ${total}h`;
}

// ---------- Footer actions ----------
function persistCurrent() {
  if (!currentSubmission.contributor || !currentSubmission.week) {
    alert("Contributor's name and reporting week are required.");
    return false;
  }
  currentSubmission.id = submissionKey(currentSubmission.contributor, currentSubmission.week);
  const all = loadSubmissions();
  const idx = all.findIndex(s => s.id === currentSubmission.id);
  if (idx >= 0) all[idx] = currentSubmission; else all.push(currentSubmission);
  saveSubmissions(all);
  return true;
}

document.getElementById('btn-save-draft').addEventListener('click', () => {
  currentSubmission.contributor = document.getElementById('f-contributor').value.trim();
  currentSubmission.week = document.getElementById('f-week-canonical').value;
  currentSubmission.status = currentSubmission.status === 'Submitted' ? 'Submitted' : 'Draft';
  if (persistCurrent()) {
    updateStatusBadge();
    alert('Draft saved.');
  }
});

document.getElementById('btn-submit-week').addEventListener('click', () => {
  currentSubmission.contributor = document.getElementById('f-contributor').value.trim();
  currentSubmission.week = document.getElementById('f-week-canonical').value;
  const hasAnyActivity = QUADRANTS.some(q => ensureQuadrant(q.key).activity) || currentSubmission.adminNotes;
  if (!hasAnyActivity) {
    if (!confirm('No activities added yet. Submit anyway?')) return;
  }
  currentSubmission.status = 'Submitted';
  currentSubmission.submittedAt = new Date().toISOString();
  if (persistCurrent()) {
    updateStatusBadge();
    alert('Week submitted.');
  }
});

document.getElementById('btn-reopen').addEventListener('click', () => {
  currentSubmission.status = 'Draft';
  currentSubmission.submittedAt = null;
  persistCurrent();
  updateStatusBadge();
});

document.getElementById('btn-copy-prev').addEventListener('click', () => {
  const contributor = document.getElementById('f-contributor').value.trim();
  const week = document.getElementById('f-week-canonical').value;
  if (!contributor || !week) { alert("Enter the contributor's name and reporting week first."); return; }
  const all = loadSubmissions();
  const candidate = all
    .filter(s => s.contributor.trim().toLowerCase() === contributor.toLowerCase() && s.week < week)
    .sort((a, b) => b.week.localeCompare(a.week))[0];
  if (!candidate) { alert('No previous submission found for this contributor.'); return; }
  currentSubmission.quadrants = JSON.parse(JSON.stringify(candidate.quadrants || {}));
  currentSubmission.adminNotes = candidate.adminNotes || '';
  currentSubmission.adminHours = candidate.adminHours || 0;
  renderQuadrants();
});

function downloadCSV(headers, rows, filenamePrefix) {
  const csv = [headers, ...rows].map(r =>
    r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ---------- Team Input tab: one row per contributor's weekly submission, summarized ----------
const teamInputSort = { field: 'week', dir: 'desc' };

function buildSubmissionSummary(s) {
  const quadrants = s.quadrants || {};
  const qTitle = k => (QUADRANTS.find(q => q.key === k) || {}).title || k;
  const entries = QUADRANTS
    .map(q => ({ ...(quadrants[q.key] || {}), quadrant: q.key }))
    .filter(e => e.activity && e.activity.trim());
  const n = entries.length;
  const quadrantHours = QUADRANTS.reduce((sum, q) => sum + (Number((quadrants[q.key] || {}).hours) || 0), 0);
  const { performHours, transformHours } = aggregatePerformTransform([s]);
  const balance = classifyBalance(performHours, transformHours);

  return {
    contributor: s.contributor,
    week: s.week,
    status: s.status,
    activitiesCount: n,
    hoursTotal: quadrantHours + (Number(s.adminHours) || 0),
    zone: balance.zone,
    zoneLabel: balance.label,
    transformPct: balance.transformPct,
    summaryText: [
      ...entries.map(a => `[${qTitle(a.quadrant)}] ${a.activity}`),
      s.adminNotes ? `[Administrative activity] ${s.adminNotes}` : null,
    ].filter(Boolean).join('; '),
  };
}

function getTeamInputSummaryRows(includeDrafts, search) {
  let rows = loadSubmissions()
    .filter(s => includeDrafts || s.status === 'Submitted')
    .map(buildSubmissionSummary);
  if (search) {
    rows = rows.filter(r =>
      [r.contributor, r.summaryText].some(v => (v || '').toLowerCase().includes(search))
    );
  }
  return rows;
}

function filterSubmissionsForReport(includeDrafts, search) {
  let submissions = loadSubmissions().filter(s => includeDrafts || s.status === 'Submitted');
  if (search) {
    submissions = submissions.filter(s => {
      const summary = buildSubmissionSummary(s);
      return [s.contributor, summary.summaryText].some(v => (v || '').toLowerCase().includes(search));
    });
  }
  return submissions;
}

function getTeamZone(includeDrafts, search) {
  const submissions = filterSubmissionsForReport(includeDrafts, search);
  const { performHours, transformHours } = aggregatePerformTransform(submissions);
  return classifyBalance(performHours, transformHours);
}

function getQuadrantHoursBreakdown(includeDrafts, search) {
  const submissions = filterSubmissionsForReport(includeDrafts, search);

  const totals = QUADRANTS.map(q => ({
    title: q.title,
    hours: submissions.reduce((sum, s) => sum + (Number((s.quadrants && s.quadrants[q.key] || {}).hours) || 0), 0),
  }));
  totals.push({
    title: 'Administrative activity',
    hours: submissions.reduce((sum, s) => sum + (Number(s.adminHours) || 0), 0),
  });

  const grandTotal = totals.reduce((sum, t) => sum + t.hours, 0);
  return { totals, grandTotal };
}

function buildTeamNarrative(includeDrafts, search) {
  const submissions = filterSubmissionsForReport(includeDrafts, search);
  if (submissions.length === 0) return 'No data yet — once contributors submit their hours, a summary will appear here.';

  const contributors = new Set(submissions.map(s => s.contributor)).size;
  const weeks = new Set(submissions.map(s => s.week)).size;
  const submittedCount = submissions.filter(s => s.status === 'Submitted').length;
  const draftCount = submissions.length - submittedCount;

  const quadrantTotals = QUADRANTS.map(q => ({
    ...q,
    hours: submissions.reduce((sum, s) => sum + (Number((s.quadrants && s.quadrants[q.key] || {}).hours) || 0), 0),
  }));
  const adminHours = submissions.reduce((sum, s) => sum + (Number(s.adminHours) || 0), 0);
  const grandTotal = quadrantTotals.reduce((sum, q) => sum + q.hours, 0) + adminHours;

  const performHours = quadrantTotals.filter(q => q.mode === 'perform').reduce((sum, q) => sum + q.hours, 0) + adminHours;
  const transformHours = quadrantTotals.filter(q => q.mode === 'transform').reduce((sum, q) => sum + q.hours, 0);
  const performPct = grandTotal ? Math.round((performHours / grandTotal) * 100) : 0;
  const transformPct = grandTotal ? Math.round((transformHours / grandTotal) * 100) : 0;

  const topQuadrant = [...quadrantTotals, { title: 'Administrative activity', hours: adminHours }]
    .sort((a, b) => b.hours - a.hours)[0];

  const perContributor = {};
  submissions.forEach(s => {
    const total = (s.quadrants ? Object.values(s.quadrants).reduce((sum, q) => sum + (Number(q.hours) || 0), 0) : 0)
      + (Number(s.adminHours) || 0);
    perContributor[s.contributor] = (perContributor[s.contributor] || 0) + total;
  });
  const topContributor = Object.entries(perContributor).sort((a, b) => b[1] - a[1])[0];

  const sentences = [];
  sentences.push(`Across ${contributors} contributor${contributors === 1 ? '' : 's'} and ${weeks} week${weeks === 1 ? '' : 's'}, the team logged ${grandTotal}h total (${submittedCount} submitted, ${draftCount} in draft).`);
  sentences.push(`The largest share of time went to "${topQuadrant.title}" (${topQuadrant.hours}h) — overall, ${performPct}% of hours were spent on running/scaling the business ("Perform") versus ${transformPct}% on future-focused work ("Transform").`);
  if (topContributor) {
    sentences.push(`${topContributor[0]} logged the most hours this period (${topContributor[1]}h).`);
  }
  if (performPct - transformPct >= 30) {
    sentences.push(`The team is heavily weighted toward day-to-day execution — worth checking whether transformation initiatives are getting enough runway.`);
  } else if (transformPct - performPct >= 30) {
    sentences.push(`The team is investing heavily in future-focused work relative to day-to-day execution.`);
  }
  return sentences.join(' ');
}

function renderTeamSummary() {
  const includeDrafts = document.getElementById('ti-include-drafts').checked;
  const search = document.getElementById('ti-search').value.trim().toLowerCase();
  const { totals, grandTotal } = getQuadrantHoursBreakdown(includeDrafts, search);
  const sorted = [...totals].sort((a, b) => b.hours - a.hours);

  document.getElementById('team-summary-narrative').textContent = buildTeamNarrative(includeDrafts, search);

  const teamZone = getTeamZone(includeDrafts, search);
  const badgeEl = document.getElementById('team-balance-badge');
  badgeEl.textContent = '';
  if (teamZone.zone !== 'none') {
    const span = document.createElement('span');
    span.className = `badge zone-${teamZone.zone}`;
    span.textContent = `${teamZone.label} — ${teamZone.transformPct}% Transform`;
    badgeEl.appendChild(span);
  }

  document.getElementById('team-summary').innerHTML = sorted.map(t => {
    const pct = grandTotal ? Math.round((t.hours / grandTotal) * 100) : 0;
    return `
      <div class="summary-row">
        <div class="summary-row-label">${escapeHtml(t.title)}</div>
        <div class="summary-bar-wrap"><div class="summary-bar-fill" style="width:${pct}%"></div></div>
        <div class="summary-row-value">${t.hours}h · ${pct}%</div>
      </div>`;
  }).join('') || '<div class="empty-hint">No data yet</div>';
}

function renderTeamInputTable() {
  const includeDrafts = document.getElementById('ti-include-drafts').checked;
  const search = document.getElementById('ti-search').value.trim().toLowerCase();
  renderTeamSummary();
  const rows = getTeamInputSummaryRows(includeDrafts, search);

  const field = teamInputSort.field;
  const dir = teamInputSort.dir === 'asc' ? 1 : -1;
  const numericFields = ['activitiesCount', 'hoursTotal', 'transformPct'];
  rows.sort((a, b) => {
    if (numericFields.includes(field)) return ((a[field] || 0) - (b[field] || 0)) * dir;
    return String(a[field] ?? '').localeCompare(String(b[field] ?? '')) * dir;
  });

  document.querySelectorAll('#team-input-table th').forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (th.dataset.sort === field) th.classList.add(teamInputSort.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
  });

  document.querySelector('#team-input-table tbody').innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.contributor)}</td>
      <td>${formatWeekCell(r.week)}</td>
      <td>${r.status}</td>
      <td>${r.activitiesCount}</td>
      <td>${r.hoursTotal}h</td>
      <td><span class="badge zone-${r.zone}">${escapeHtml(r.zoneLabel)} (${r.transformPct}%)</span></td>
      <td class="wrap-cell">${escapeHtml(r.summaryText) || '—'}</td>
      <td class="row-actions">
        <button class="btn btn-ghost ti-open-btn" data-contributor="${escapeHtml(r.contributor)}" data-week="${r.week}">Open</button>
        <button class="btn btn-danger ti-delete-btn" data-contributor="${escapeHtml(r.contributor)}" data-week="${r.week}">Delete</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="7" class="empty-hint">No submissions yet</td></tr>';

  document.querySelectorAll('.ti-open-btn').forEach(btn => {
    btn.addEventListener('click', () => openSubmissionInForm(btn.dataset.contributor, btn.dataset.week));
  });

  document.querySelectorAll('.ti-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const { contributor, week } = btn.dataset;
      if (!confirm(`Delete the submission for ${contributor} (week of ${formatDMY(parseISODate(week))})? This cannot be undone.`)) return;
      deleteSubmission(contributor, week);
      renderTeamInputTable();
    });
  });
}

function openSubmissionInForm(contributor, week) {
  document.getElementById('f-contributor').value = contributor;
  document.getElementById('f-week').value = week;
  onWeekFieldChange();
  document.querySelector('.tab-btn[data-tab="submission"]').click();
}

document.querySelectorAll('#team-input-table th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    if (teamInputSort.field === th.dataset.sort) {
      teamInputSort.dir = teamInputSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      teamInputSort.field = th.dataset.sort;
      teamInputSort.dir = 'asc';
    }
    renderTeamInputTable();
  });
});

document.getElementById('ti-search').addEventListener('input', renderTeamInputTable);
document.getElementById('ti-include-drafts').addEventListener('change', renderTeamInputTable);

document.getElementById('btn-export-csv-team').addEventListener('click', () => {
  const includeDrafts = document.getElementById('ti-include-drafts').checked;
  const search = document.getElementById('ti-search').value.trim().toLowerCase();
  const rows = getTeamInputSummaryRows(includeDrafts, search);
  const headers = ['Contributor', 'Week', 'Submission Status', 'Activities', 'Hours', 'Balance', 'Summary'];
  const csvRows = rows.map(r => [
    r.contributor, formatWeekCell(r.week), r.status, r.activitiesCount, r.hoursTotal,
    `${r.zoneLabel} (${r.transformPct}% Transform)`, r.summaryText
  ]);
  downloadCSV(headers, csvRows, 'team-input-summary-export');
});

// ---------- Init ----------
document.getElementById('f-week').value = defaultWeekValue();
onWeekFieldChange();
