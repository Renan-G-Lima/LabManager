/* ============================================================
   CALENDAR.JS — Full calendar page organized by quarters/months
   Corrigido: async/await correto + campos do novo schema
   ============================================================ */

'use strict';

const CalState = {
  year:     new Date().getFullYear(),
  viewMode: 'quarters'
};

const QUARTER_MONTHS = {
  Q1: [0, 1, 2],
  Q2: [3, 4, 5],
  Q3: [6, 7, 8],
  Q4: [9, 10, 11],
};

const MONTH_NAMES_FULL = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

document.addEventListener('DOMContentLoaded', async () => {
  updateYearDisplay();
  bindYearNav();
  bindViewToggle();
  await renderCalendarPage();
});

// ── Year navigation ───────────────────────────────────────────
function bindYearNav() {
  document.getElementById('btn-year-prev')?.addEventListener('click', async () => {
    CalState.year--;
    updateYearDisplay();
    await renderCalendarPage();
  });

  document.getElementById('btn-year-next')?.addEventListener('click', async () => {
    CalState.year++;
    updateYearDisplay();
    await renderCalendarPage();
  });

  document.getElementById('btn-year-today')?.addEventListener('click', async () => {
    CalState.year = new Date().getFullYear();
    updateYearDisplay();
    await renderCalendarPage();
  });
}

function updateYearDisplay() {
  const el = document.getElementById('cal-year-display');
  if (el) el.textContent = CalState.year;
}

// ── View mode toggle ──────────────────────────────────────────
function bindViewToggle() {
  const btnQ = document.getElementById('btn-view-quarters');
  const btnL = document.getElementById('btn-view-list');

  btnQ?.addEventListener('click', async () => {
    CalState.viewMode = 'quarters';
    btnQ.classList.add('active');
    btnL?.classList.remove('active');
    await renderCalendarPage();
  });

  btnL?.addEventListener('click', async () => {
    CalState.viewMode = 'list';
    btnL.classList.add('active');
    btnQ?.classList.remove('active');
    await renderCalendarPage();
  });
}

// ── Main render ───────────────────────────────────────────────
async function renderCalendarPage() {
  const container = document.getElementById('calendar-body');
  if (!container) return;

  // Show loading
  container.innerHTML = `
    <div class="text-center py-5 text-muted" style="font-size:0.85rem;">
      Loading calendar data...
    </div>`;

  // Fetch all machines
  let allMachines = [];
  try {
    allMachines = await DataAPI.getAllMachines();
  } catch (e) {
    container.innerHTML = `
      <div class="text-center py-5 text-danger" style="font-size:0.85rem;">
        Failed to load calendar data.
      </div>`;
    return;
  }

  // Build lookup: "YYYY-M" → [machines]
  // Uses depreciation_date OR deprecDate (compat)
  const byYearMonth = {};
  allMachines.forEach(m => {
    const dateStr = m.depreciation_date || m.deprecDate;
    if (!dateStr) return;
    const d = new Date(dateStr);
    if (isNaN(d)) return;
    if (d.getFullYear() !== CalState.year) return;

    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!byYearMonth[key]) byYearMonth[key] = [];
    byYearMonth[key].push({
      ...m,
      daysInLab: m.days_since_entry ?? calcDaysInLab(m.entry_date || m.entryDate),
      mdaStatus: m.mda_color || mdaColor(m.days_since_entry ?? calcDaysInLab(m.entry_date || m.entryDate)),
    });
  });

  container.innerHTML = '';

  // Check if there's any data for the year
  const hasData = Object.keys(byYearMonth).length > 0;
  if (!hasData) {
    container.innerHTML = `
      <div class="text-center py-5 text-muted" style="font-size:0.85rem;">
        No machines with depreciation dates in ${CalState.year}.
      </div>`;
    return;
  }

  if (CalState.viewMode === 'quarters') {
    renderQuarterView(container, byYearMonth);
  } else {
    renderListView(container, allMachines);
  }
}

// ── Quarter view ──────────────────────────────────────────────
function renderQuarterView(container, byYearMonth) {
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];

  quarters.forEach(q => {
    const months = QUARTER_MONTHS[q];

    // Count total machines in this quarter for the year
    const totalInQ = months.reduce((acc, monthIdx) => {
      const key = `${CalState.year}-${monthIdx}`;
      return acc + (byYearMonth[key]?.length || 0);
    }, 0);

    const section = document.createElement('div');
    section.className = 'cal-quarter-section';

    // Quarter header
    const header = document.createElement('div');
    header.className = 'cal-quarter-label';
    header.innerHTML = `
      <span class="cql-badge ${q.toLowerCase()}">${q}</span>
      <span class="cql-months">
        ${months.map(m => MONTH_NAMES_FULL[m]).join(' · ')}
      </span>
      <span class="cql-count">
        ${totalInQ} machine${totalInQ !== 1 ? 's' : ''}
      </span>
    `;
    section.appendChild(header);

    // Month cards
    const monthsRow = document.createElement('div');
    monthsRow.className = 'cal-months-row';

    months.forEach(monthIdx => {
      const key      = `${CalState.year}-${monthIdx}`;
      const machines = byYearMonth[key] || [];
      monthsRow.appendChild(buildMonthCard(monthIdx, machines));
    });

    section.appendChild(monthsRow);
    container.appendChild(section);
  });

  // ARM01 + ARM02 sections
  renderStorageSection(container, byYearMonth, 'ARM01');
  renderStorageSection(container, byYearMonth, 'ARM02');
}

// ── Storage section (ARM01 / ARM02) ──────────────────────────
function renderStorageSection(container, byYearMonth, locationCode) {
  // Find machines for this location across all months of the year
  const locationMachines = [];
  Object.values(byYearMonth).forEach(list => {
    list.forEach(m => {
      const loc = m.location || '';
      if (loc === locationCode) locationMachines.push(m);
    });
  });

  if (locationMachines.length === 0) return;

  const section = document.createElement('div');
  section.className = 'cal-quarter-section';

  section.innerHTML = `
    <div class="cal-quarter-label">
      <span class="cql-badge arm">${locationCode}</span>
      <span class="cql-months">Storage — ${locationCode}</span>
      <span class="cql-count">
        ${locationMachines.length} machine${locationMachines.length !== 1 ? 's' : ''}
      </span>
    </div>
  `;

  // Group by month
  const byMonth = {};
  locationMachines.forEach(m => {
    const dateStr = m.depreciation_date || m.deprecDate;
    const mo = new Date(dateStr).getMonth();
    if (!byMonth[mo]) byMonth[mo] = [];
    byMonth[mo].push(m);
  });

  const monthsRow = document.createElement('div');
  monthsRow.className = 'cal-months-row';

  Object.entries(byMonth)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([monthIdx, machines]) => {
      monthsRow.appendChild(buildMonthCard(Number(monthIdx), machines));
    });

  section.appendChild(monthsRow);
  container.appendChild(section);
}

// ── Month card ────────────────────────────────────────────────
function buildMonthCard(monthIdx, machines) {
  const card = document.createElement('div');
  card.className = 'cal-month-card';

  const itemsId = `month-items-${monthIdx}-${Date.now()}`;
  card.innerHTML = `
    <div class="cal-month-card-header">
      <span class="cmh-name">${MONTH_NAMES_FULL[monthIdx]}</span>
      <span class="cmh-count">${machines.length}</span>
    </div>
    <div class="cal-month-items" id="${itemsId}"></div>
  `;

  const itemsContainer = card.querySelector(`#${itemsId}`);

  if (machines.length === 0) {
    itemsContainer.innerHTML = `<div class="cal-month-empty">No machines</div>`;
  } else {
    // Sort by depreciation date
    const sorted = [...machines].sort((a, b) => {
      const da = new Date(a.depreciation_date || a.deprecDate || 0);
      const db = new Date(b.depreciation_date || b.deprecDate || 0);
      return da - db;
    });

    sorted.forEach(m => {
      const tag    = m.machine_tag  || m.tag      || '—';
      const id     = m.machine_id   || m.tag      || '—';
      const color  = m.mdaStatus    || m.mda_color || 'green';
      const dateStr = m.depreciation_date || m.deprecDate;

      const item = document.createElement('a');
      item.href      = `machine_detail.html?tag=${id}`;
      item.className = 'cal-month-item';
      item.innerHTML = `
        <span class="cmi-tag">${tag}</span>
        <span style="font-size:0.7rem;color:var(--color-muted);">
          ${formatDate(dateStr)}
        </span>
        <span class="cmi-status ${color}"></span>
      `;
      itemsContainer.appendChild(item);
    });
  }

  return card;
}

// ── List view ─────────────────────────────────────────────────
function renderListView(container, allMachines) {
  const forYear = allMachines.filter(m => {
    const dateStr = m.depreciation_date || m.deprecDate;
    if (!dateStr) return false;
    return new Date(dateStr).getFullYear() === CalState.year;
  }).sort((a, b) => {
    const da = new Date(a.depreciation_date || a.deprecDate || 0);
    const db = new Date(b.depreciation_date || b.deprecDate || 0);
    return da - db;
  });

  if (forYear.length === 0) {
    container.innerHTML = `
      <div class="text-center py-5 text-muted" style="font-size:0.85rem;">
        No machines with depreciation dates in ${CalState.year}.
      </div>`;
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'q-table-wrap';
  wrap.innerHTML = `
    <table class="q-table">
      <thead>
        <tr>
          <th>TAG</th>
          <th>Model</th>
          <th>Location</th>
          <th>Depreciation</th>
          <th>Days in Lab</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody id="cal-list-tbody"></tbody>
    </table>
  `;

  container.appendChild(wrap);
  const tbody = document.getElementById('cal-list-tbody');

  forYear.forEach(m => {
    const tag      = m.machine_tag  || m.tag      || '—';
    const id       = m.machine_id   || m.tag      || '—';
    const location = m.location     || '—';
    const days     = m.days_since_entry ?? calcDaysInLab(m.entry_date || m.entryDate);
    const color    = m.mda_color    || mdaColor(days);
    const dateStr  = m.depreciation_date || m.deprecDate;

    const tr = document.createElement('tr');
    if (color === 'red')    tr.style.background = '#fff8f8';
    if (color === 'yellow') tr.style.background = '#fffef0';

    tr.innerHTML = `
      <td>
        <a href="machine_detail.html?tag=${id}"
           class="tag-mono text-decoration-none">${tag}</a>
      </td>
      <td style="font-size:0.78rem;">${m.model || '—'}</td>
      <td style="font-size:0.78rem;">
        <span class="cql-badge ${(location||'').toLowerCase().replace(/\s/g,'')}"
              style="font-size:0.65rem;padding:2px 8px;border-radius:4px;color:#fff;background:${getLocationColor(location)}">
          ${location}
        </span>
      </td>
      <td style="font-size:0.78rem;">${formatDate(dateStr)}</td>
      <td>${daysBadge(days)}</td>
      <td>${statusBadge(m.status || 'Ativo')}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Helpers ───────────────────────────────────────────────────
function getLocationColor(loc) {
  const map = {
    'Q1': '#0d6efd', 'Q2': '#198754',
    'Q3': '#fd7e14', 'Q4': '#6f42c1',
    'ARM01': '#20c997', 'ARM02': '#20c997',
    'Uso e Consumo': '#6c757d'
  };
  return map[loc] || '#6c757d';
}

function getMDAStatusCal(days) {
  if (days < 10) return 'green';
  if (days <= 14) return 'yellow';
  return 'red';
}