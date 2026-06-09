/* ============================================================
   DASHBOARD.JS — Home page: panels, search, calendar, MDA
   ============================================================ */
'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([
    renderQuarterPanels(),
    renderSummaryBar(),
    renderMDAAlerts(),
  ]);
  await renderCalendarWidget();
  initSearch();
  await populateSidebarBadges();
});

async function populateSidebarBadges() {
  const stats = await DataAPI.getStats();
  ['Q1','Q2','Q3','Q4'].forEach(q => {
    const el = document.getElementById(`sb-${q.toLowerCase()}`);
    if (el) el.textContent = stats.byQuarter[q] ?? 0;
  });
}

async function renderQuarterPanels() {
  const quarters = ['Q1','Q2','Q3','Q4'];
  for (const q of quarters) {
    const machines = await DataAPI.getMachinesByQuarter(q);
    const countEl  = document.getElementById(`count-${q}`);
    const bodyEl   = document.getElementById(`body-${q}`);

    if (countEl) countEl.textContent =
      `${machines.length} machine${machines.length !== 1 ? 's' : ''}`;
    if (!bodyEl) continue;

    bodyEl.innerHTML = '';

    if (machines.length === 0) {
      bodyEl.innerHTML = `<div style="padding:12px 16px;font-size:0.78rem;color:var(--color-muted);">No machines.</div>`;
      continue;
    }

    machines.slice(0, 5).forEach(m => {
      const tag   = m.machine_tag || m.tag || '—';
      const id    = m.machine_id  || m.tag || '—';
      const color = m.mda_color   || 'green';
      const hex   = { green:'var(--color-green)', yellow:'var(--color-yellow)', red:'var(--color-red)' }[color];

      const row = document.createElement('a');
      row.className = 'tag-row';
      row.href = `machine_detail.html?tag=${id}`;
      row.style.textDecoration = 'none';
      row.innerHTML = `
        <span class="tag-code">${tag}</span>
        <span class="tag-date" style="color:${hex};">
          ${formatDate(m.depreciation_date) || '—'}
        </span>
      `;
      bodyEl.appendChild(row);
    });

    if (machines.length > 5) {
      const more = document.createElement('div');
      more.style.cssText = `padding:4px 16px;font-size:0.7rem;
        color:var(--color-muted);text-align:center;border-top:1px solid #f5f5f5;`;
      more.textContent = `+${machines.length - 5} more`;
      bodyEl.appendChild(more);
    }
  }
}

async function renderSummaryBar() {
  const bar = document.getElementById('summary-bar');
  if (!bar) return;
  const stats = await DataAPI.getStats();
  bar.innerHTML = `
    <span>Total: <strong>${stats.total}</strong></span>
    <span style="color:var(--color-yellow);">Near: <strong>${stats.nearDeadline}</strong></span>
    <span style="color:var(--color-red);">Overdue: <strong>${stats.overdue}</strong></span>
    <span>Q1: <strong>${stats.byQuarter.Q1}</strong></span>
    <span>Q2: <strong>${stats.byQuarter.Q2}</strong></span>
    <span>Q3: <strong>${stats.byQuarter.Q3}</strong></span>
    <span>Q4: <strong>${stats.byQuarter.Q4}</strong></span>
    <span>ARM01: <strong>${stats.byQuarter.ARM01}</strong></span>
    <span>ARM02: <strong>${stats.byQuarter.ARM02}</strong></span>
    <span>U&amp;C: <strong>${stats.byQuarter.UC}</strong></span>
  `;
}

async function renderMDAAlerts() {
  const list = document.getElementById('mda-list');
  if (!list) return;
  const alerts = await DataAPI.getMDAAlerts();
  list.innerHTML = '';

  if (alerts.length === 0) {
    list.innerHTML = `<div style="font-size:0.78rem;color:var(--color-muted);padding:8px 0;">✓ No active MDA alerts.</div>`;
    return;
  }

  alerts.forEach(m => {
    const item = document.createElement('a');
    item.href  = `machine_detail.html?tag=${m.machine_id || m.tag}`;
    item.className = `mda-item ${m.mdaStatus}`;
    item.style.textDecoration = 'none';
    item.innerHTML = `
      <div style="flex:1;">
        <span class="mda-tag">${m.tag}${m.model ? ' — ' + m.model : ''}</span>
        <span class="mda-info">${m.mdaLabel} · ${m.location}</span>
      </div>
    `;
    list.appendChild(item);
  });
}

// ── Mini Calendar ─────────────────────────────────────────────
const calendarState = {
  year:  new Date().getFullYear(),
  month: new Date().getMonth()
};

async function renderCalendarWidget() {
  const gridEl  = document.getElementById('cal-grid');
  const titleEl = document.getElementById('cal-title');
  if (!gridEl) return;

  const { year, month } = calendarState;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  if (titleEl) titleEl.textContent = `${MONTHS[month]} ${year}`;

  const events = {};
  try {
    const all = await DataAPI.getAllMachines();
    all.forEach(m => {
      const ds = m.depreciation_date;
      if (!ds) return;
      const d = new Date(ds);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!events[day]) events[day] = [];
        events[day].push(m.mda_color || mdaColor(m.days_since_entry || 0));
      }
    });
  } catch (e) { /* silent */ }

  gridEl.innerHTML = '';
  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(l => {
    const c = document.createElement('div');
    c.className = 'day-label'; c.textContent = l;
    gridEl.appendChild(c);
  });

  const firstDay  = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const today     = new Date();

  for (let i = 0; i < firstDay; i++) {
    const e = document.createElement('div');
    e.className = 'cal-day'; gridEl.appendChild(e);
  }

  for (let d = 1; d <= totalDays; d++) {
    const cell    = document.createElement('div');
    const isToday = d === today.getDate() &&
                    month === today.getMonth() &&
                    year === today.getFullYear();
    cell.className = `cal-day${isToday ? ' today' : ''}`;
    cell.textContent = d;

    if (events[d]?.length > 0) {
      cell.classList.add('has-event');
      const priority = events[d].includes('red') ? 'red'
                     : events[d].includes('yellow') ? 'yellow' : 'green';
      const dot = document.createElement('div');
      dot.className = `cal-dot ${priority}`;
      cell.appendChild(dot);
      cell.title = `${events[d].length} machine(s)`;
      cell.addEventListener('click', () => {
        window.location.href = `machine_log.html`;
      });
    }
    gridEl.appendChild(cell);
  }
}

// ── Search autocomplete ───────────────────────────────────────
function initSearch() {
  const input  = document.getElementById('main-search');
  const acList = document.getElementById('autocomplete-list');
  if (!input || !acList) return;

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const val = input.value.trim().toUpperCase();
    if (val.length < 2) { closeAutocomplete(); return; }

    timer = setTimeout(async () => {
      let results = [];
      try { results = (await DataAPI.searchMachines(val)).slice(0, 8); }
      catch (_) {}

      acList.innerHTML = '';
      if (results.length === 0) {
        const li = document.createElement('li');
        li.style.cssText = 'padding:10px 20px;font-size:0.78rem;color:var(--color-muted);';
        li.textContent = `No results for "${val}"`;
        acList.appendChild(li); acList.classList.add('open'); return;
      }

      results.forEach(m => {
        const tag   = m.machine_tag || m.tag || '—';
        const id    = m.machine_id  || m.tag || '—';
        const days  = m.days_since_entry ?? 0;
        const color = m.mda_color || 'green';
        const hex   = { green:'#198754', yellow:'#e6a817', red:'#dc3545' }[color];

        const li = document.createElement('li');
        li.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <span style="font-family:'JetBrains Mono','Courier New',monospace;font-weight:700;">${tag}</span>
              <span style="font-size:0.7rem;color:var(--color-muted);margin-left:8px;">
                ${m.model||''} · ${m.location||''}
                ${m.is_locked ? ' 🔒' : ''}
              </span>
            </div>
            <span style="font-size:0.7rem;font-weight:700;color:${hex};">${days}d</span>
          </div>
        `;
        li.addEventListener('click', () => {
          window.location.href = `machine_detail.html?tag=${id}`;
        });
        acList.appendChild(li);
      });
      acList.classList.add('open');
    }, 220);
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !acList.contains(e.target))
      closeAutocomplete();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
    if (e.key === 'Escape') closeAutocomplete();
  });
}

function closeAutocomplete() {
  const ac = document.getElementById('autocomplete-list');
  if (ac) { ac.classList.remove('open'); ac.innerHTML = ''; }
}

function doSearch() {
  const val = document.getElementById('main-search')?.value.trim();
  if (val) window.location.href = `machine_log.html?tag=${val.toUpperCase()}`;
}