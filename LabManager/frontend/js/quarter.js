/* ============================================================
   QUARTER.JS — Quarter view with bulk EOL support
   ============================================================ */

'use strict';

const QState = {
  location:    null,
  machines:    [],
  filtered:    [],
  selected:    new Set(),   // Set of machine_id selecionados
  sortCol:     'machine_tag',
  sortDir:     'asc',
  page:        1,
  perPage:     15,
  filters: {
    status:    '',
    daysRange: '',
    month:     '',
    search:    ''
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  const params    = new URLSearchParams(window.location.search);
  QState.location = params.get('q') || 'Q1';

  setPageTitle();
  updateSidebarActive();

  await loadMachines();
  renderStats();
  initFilters();
  initTableSort();
  initBulkSelection();

  renderTable();
  renderPagination();
});

// ── Title ─────────────────────────────────────────────────────
function setPageTitle() {
  const loc = QState.location;
  const labelMap = {
    Q1:              'Q1 — January · February · March',
    Q2:              'Q2 — April · May · June',
    Q3:              'Q3 — July · August · September',
    Q4:              'Q4 — October · November · December',
    ARM01:           'ARM01 — Storage Unit 01',
    ARM02:           'ARM02 — Storage Unit 02',
    'Uso e Consumo': 'Uso e Consumo',
  };

  const titleEl = document.getElementById('quarter-title');
  const subEl   = document.getElementById('quarter-subtitle');
  const badgeEl = document.getElementById('quarter-badge');

  if (titleEl) titleEl.textContent = loc;
  if (subEl)   subEl.textContent   = labelMap[loc] || loc;
  if (badgeEl) {
    badgeEl.textContent = loc;
    badgeEl.className   = `cql-badge ${loc.toLowerCase().replace(/\s/g,'')}`;
  }

  document.title = `${loc} — Lab Manager`;
}

// ── Load machines ─────────────────────────────────────────────
async function loadMachines() {
  const tbody = document.getElementById('quarter-tbody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-4 text-muted" style="font-size:0.85rem;">
          Loading machines...
        </td>
      </tr>`;
  }

  try {
    const raw = await DataAPI.getMachinesByQuarter(QState.location);
    QState.machines = (raw || []).map(m => {
      const tag    = m.machine_tag  || m.tag || '—';
      const id     = m.machine_id   || m.tag || tag;
      const deprec = m.depreciation_date || m.deprecDate || null;
      const entry  = m.entry_date   || m.entryDate || null;
      const days   = m.days_since_entry ?? calcDaysInLab(entry);
      const mdaSt  = m.mda_color    || mdaColor(days);

      return {
        ...m,
        machine_tag:       tag,
        machine_id:        id,
        depreciation_date: deprec,
        entry_date:        entry,
        daysInLab:         days,
        mdaStatus:         mdaSt,
        location:          m.location || QState.location,
        status:            m.status   || 'Ativo',
        is_locked:         m.is_locked === true,
      };
    });
  } catch (e) {
    console.error('[quarter.js] Failed to load machines:', e);
    QState.machines = [];
  }

  QState.filtered = [...QState.machines];
}

// ── Stats cards ───────────────────────────────────────────────
function renderStats() {
  const all   = QState.machines;
  const inLab = all.filter(m => m.status === 'Ativo');

  setStatCard('stat-total',   all.length);
  setStatCard('stat-inlab',   inLab.length);
  setStatCard('stat-near',    inLab.filter(m => m.daysInLab >= 10 && m.daysInLab <= 14).length);
  setStatCard('stat-overdue', all.filter(m => m.daysInLab > 14).length);
}

function setStatCard(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Filters ───────────────────────────────────────────────────
function initFilters() {
  const months = [...new Set(
    QState.machines
      .filter(m => m.depreciation_date)
      .map(m => {
        const d = new Date(m.depreciation_date);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      })
  )].sort();

  const monthSel = document.getElementById('filter-month');
  if (monthSel) {
    monthSel.innerHTML = '<option value="">All months</option>';
    months.forEach(ym => {
      const [y, mo] = ym.split('-');
      const label = new Date(`${y}-${mo}-01`).toLocaleDateString('en-GB', {
        month:'short', year:'numeric'
      });
      const opt = document.createElement('option');
      opt.value = ym; opt.textContent = label;
      monthSel.appendChild(opt);
    });
    monthSel.addEventListener('change', () => {
      QState.filters.month = monthSel.value;
      applyFilters();
    });
  }

  document.getElementById('filter-status')?.addEventListener('change', e => {
    QState.filters.status = e.target.value;
    applyFilters();
  });

  document.getElementById('filter-days')?.addEventListener('change', e => {
    QState.filters.daysRange = e.target.value;
    applyFilters();
  });

  document.getElementById('filter-search')?.addEventListener('input', e => {
    QState.filters.search = e.target.value.trim().toUpperCase();
    applyFilters();
  });

  document.getElementById('btn-clear-filters')?.addEventListener('click', clearFilters);
}

function applyFilters() {
  let data = [...QState.machines];
  const { status, daysRange, month, search } = QState.filters;

  if (status) {
    data = data.filter(m => (m.status || '').toLowerCase() === status.toLowerCase());
  }
  if (daysRange === 'green')  data = data.filter(m => m.daysInLab < 10);
  if (daysRange === 'yellow') data = data.filter(m => m.daysInLab >= 10 && m.daysInLab <= 14);
  if (daysRange === 'red')    data = data.filter(m => m.daysInLab > 14);

  if (month) {
    data = data.filter(m => {
      if (!m.depreciation_date) return false;
      const d = new Date(m.depreciation_date);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === month;
    });
  }

  if (search) {
    data = data.filter(m =>
      (m.machine_tag || '').toUpperCase().includes(search) ||
      (m.machine_id  || '').toUpperCase().includes(search) ||
      (m.model       || '').toUpperCase().includes(search) ||
      (m.location    || '').toUpperCase().includes(search)
    );
  }

  QState.filtered = data;
  QState.page = 1;
  renderTable();
  renderPagination();
}

function clearFilters() {
  QState.filters = { status:'', daysRange:'', month:'', search:'' };
  ['filter-status','filter-days','filter-month'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const s = document.getElementById('filter-search');
  if (s) s.value = '';

  QState.filtered = [...QState.machines];
  QState.page = 1;
  renderTable();
  renderPagination();
}

// ── Table render ──────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('quarter-tbody');
  if (!tbody) return;

  const sorted   = sortMachines(QState.filtered, QState.sortCol, QState.sortDir);
  const start    = (QState.page - 1) * QState.perPage;
  const pageData = sorted.slice(start, start + QState.perPage);

  tbody.innerHTML = '';

  if (pageData.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="8" class="text-center py-4 text-muted" style="font-size:0.85rem;">
        ${QState.machines.length === 0
          ? `No machines registered in ${QState.location} yet.`
          : 'No machines match the applied filters.'}
      </td>`;
    tbody.appendChild(tr);
    updateResultCount(0, QState.filtered.length);
    updateSelectAllCheckbox();
    return;
  }

  pageData.forEach(m => {
    const tag        = m.machine_tag;
    const id         = m.machine_id;
    const days       = m.daysInLab;
    const color      = m.mdaStatus;
    const isLocked   = m.is_locked === true;
    const isSelected = QState.selected.has(id);

    const tr = document.createElement('tr');
    if (isSelected) tr.classList.add('row-selected');

    if (isLocked && !isSelected) {
      tr.style.background = '#f8f9fa';
      tr.style.opacity    = '0.75';
    } else if (!isSelected) {
      if (color === 'red')         tr.style.background = '#fff8f8';
      else if (color === 'yellow') tr.style.background = '#fffef0';
    }

    tr.innerHTML = `
      <td style="text-align:center;">
        <input type="checkbox"
               class="row-checkbox"
               data-id="${id}"
               ${isSelected ? 'checked' : ''}
               ${isLocked ? 'disabled title="Already in Baixa"' : ''}
        />
      </td>
      <td>
        <a href="machine_detail.html?tag=${encodeURIComponent(id)}"
           class="tag-mono text-decoration-none"
           style="color:var(--color-blue);">
          ${tag}${isLocked ? ' 🔒' : ''}
        </a>
      </td>
      <td>${isLocked
        ? '<span class="badge" style="background:#212529;color:#fff;font-size:0.7rem;padding:3px 8px;">🔒 Baixa</span>'
        : statusBadge(m.status)}</td>
      <td>${isLocked ? '—' : daysBadge(days)}</td>
      <td style="font-size:0.8rem;">${formatDate(m.depreciation_date) || '—'}</td>
      <td style="font-size:0.8rem;">${formatDate(m.mda_deadline) || '—'}</td>
      <td style="font-size:0.8rem;color:var(--color-muted);">${m.location || '—'}</td>
      <td>
        <div class="action-btns">
          <a href="machine_detail.html?tag=${encodeURIComponent(id)}"
             class="btn-xs"
             style="color:#0d6efd;border-color:#0d6efd;">
            🔍 View
          </a>
          ${!isLocked ? `
          <a href="register_return.html?tag=${encodeURIComponent(id)}"
             class="btn-xs"
             style="color:#198754;border-color:#198754;">
            ↩ Return
          </a>` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Re-bind row checkboxes
  tbody.querySelectorAll('.row-checkbox').forEach(cb => {
    cb.addEventListener('change', handleRowCheckbox);
  });

  updateResultCount(pageData.length, QState.filtered.length);
  updateSelectAllCheckbox();
  updateBulkBar();
}

function updateResultCount(shown, total) {
  const el = document.getElementById('result-count');
  if (el) el.textContent = `Showing ${shown} of ${total} machines`;
}

// ── Bulk selection ────────────────────────────────────────────
function initBulkSelection() {
  // Select all checkbox in table header
  const selectAll = document.getElementById('select-all-checkbox');
  if (selectAll) {
    selectAll.addEventListener('change', () => {
      const start = (QState.page - 1) * QState.perPage;
      const pageData = sortMachines(QState.filtered, QState.sortCol, QState.sortDir)
        .slice(start, start + QState.perPage);

      if (selectAll.checked) {
        pageData.forEach(m => {
          if (!m.is_locked) QState.selected.add(m.machine_id);
        });
      } else {
        pageData.forEach(m => QState.selected.delete(m.machine_id));
      }
      renderTable();
    });
  }

  // Clear selection
  document.getElementById('bab-clear')?.addEventListener('click', () => {
    QState.selected.clear();
    renderTable();
  });

  // Open bulk EOL modal
  document.getElementById('bab-eol-btn')?.addEventListener('click', openBulkEOLModal);
}

function handleRowCheckbox(e) {
  const id = e.target.dataset.id;
  if (e.target.checked) {
    QState.selected.add(id);
  } else {
    QState.selected.delete(id);
  }
  e.target.closest('tr').classList.toggle('row-selected', e.target.checked);
  updateSelectAllCheckbox();
  updateBulkBar();
}

function updateSelectAllCheckbox() {
  const selectAll = document.getElementById('select-all-checkbox');
  if (!selectAll) return;

  const start = (QState.page - 1) * QState.perPage;
  const pageData = sortMachines(QState.filtered, QState.sortCol, QState.sortDir)
    .slice(start, start + QState.perPage)
    .filter(m => !m.is_locked);

  if (pageData.length === 0) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
    return;
  }

  const selectedOnPage = pageData.filter(m => QState.selected.has(m.machine_id)).length;

  if (selectedOnPage === 0) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
  } else if (selectedOnPage === pageData.length) {
    selectAll.checked = true;
    selectAll.indeterminate = false;
  } else {
    selectAll.checked = false;
    selectAll.indeterminate = true;
  }
}

function updateBulkBar() {
  const bar     = document.getElementById('bulk-action-bar');
  const countEl = document.getElementById('bab-count');
  if (!bar || !countEl) return;

  const count = QState.selected.size;
  countEl.textContent = count;

  if (count > 0) {
    bar.classList.add('show');
  } else {
    bar.classList.remove('show');
  }
}

// ── Bulk EOL Modal ────────────────────────────────────────────
function openBulkEOLModal() {
  const ids = [...QState.selected];
  if (ids.length === 0) return;

  // Coletar os tags correspondentes (busca em todas as máquinas, não só na página atual)
  const selectedMachines = QState.machines.filter(m => QState.selected.has(m.machine_id));

  document.getElementById('bulk-eol-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'bulk-eol-modal';
  modal.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  `;

  const tagsHtml = selectedMachines.map(m =>
    `<span class="bulk-tag-chip">${m.machine_tag}</span>`
  ).join('');

  modal.innerHTML = `
    <div style="
      background: #fff;
      border-radius: 12px;
      padding: 28px;
      max-width: 560px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-height: 90vh;
      overflow-y: auto;
    ">
      <!-- Header -->
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:18px;">
        <span style="font-size:1.6rem;line-height:1;">⚠️</span>
        <div>
          <h5 style="margin:0;font-weight:700;color:#dc3545;">
            Baixa Definitiva em Massa
          </h5>
          <p style="margin:2px 0 0;font-size:0.78rem;color:#6c757d;">
            <strong>${ids.length}</strong> máquina(s) serão marcadas em lote.
            Esta ação é <strong>irreversível</strong>.
          </p>
        </div>
      </div>

      <!-- Selected TAGs -->
      <div style="margin-bottom:18px;">
        <label style="font-size:0.72rem;font-weight:700;text-transform:uppercase;
                      letter-spacing:0.05em;color:var(--color-muted);
                      display:block;margin-bottom:6px;">
          Máquinas selecionadas (${ids.length})
        </label>
        <div class="bulk-tag-list">
          ${tagsHtml}
        </div>
      </div>

      <!-- Date -->
      <div style="margin-bottom:14px;">
        <label style="font-size:0.78rem;font-weight:600;display:block;margin-bottom:4px;">
          Data da Baixa <span style="color:#dc3545;">*</span>
        </label>
        <input type="date" id="bulk-eol-date"
          style="width:100%;padding:8px 12px;border:1px solid #dee2e6;
                 border-radius:6px;font-size:0.85rem;font-family:var(--font-body);"
          value="${new Date().toISOString().split('T')[0]}"
        />
      </div>

      <!-- Analista -->
      <div style="margin-bottom:14px;">
        <label style="font-size:0.78rem;font-weight:600;display:block;margin-bottom:4px;">
          Analista Responsável <span style="color:#dc3545;">*</span>
        </label>
        <input type="text" id="bulk-eol-analista"
          placeholder="Nome do analista"
          autocomplete="off"
          style="width:100%;padding:8px 12px;border:1px solid #dee2e6;
                 border-radius:6px;font-size:0.85rem;font-family:var(--font-body);"
        />
      </div>

      <!-- Notes -->
      <div style="margin-bottom:22px;">
        <label style="font-size:0.78rem;font-weight:600;display:block;margin-bottom:4px;">
          Observações
        </label>
        <textarea id="bulk-eol-notes"
          placeholder="Motivo da baixa em lote, número de chamado, etc..."
          rows="3"
          style="width:100%;padding:8px 12px;border:1px solid #dee2e6;
                 border-radius:6px;font-size:0.85rem;resize:vertical;
                 font-family:var(--font-body);"
        ></textarea>
      </div>

      <!-- Buttons -->
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button onclick="document.getElementById('bulk-eol-modal').remove()"
          style="padding:9px 20px;border:1px solid #dee2e6;border-radius:8px;
                 background:#fff;cursor:pointer;font-size:0.82rem;
                 font-family:var(--font-body);font-weight:500;">
          Cancelar
        </button>
        <button id="bulk-eol-confirm-btn"
          onclick="confirmBulkEOL()"
          style="padding:9px 20px;border:none;border-radius:8px;
                 background:#dc3545;color:#fff;cursor:pointer;
                 font-size:0.82rem;font-weight:600;
                 font-family:var(--font-body);">
          ✓ Confirmar Baixa de ${ids.length} máquina(s)
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close on outside click
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.remove();
  });

  setTimeout(() => document.getElementById('bulk-eol-date')?.focus(), 100);
}

// ── Execute bulk EOL ──────────────────────────────────────────
async function confirmBulkEOL() {
  const eolDate  = document.getElementById('bulk-eol-date')?.value;
  const analista = document.getElementById('bulk-eol-analista')?.value.trim();
  const notes    = document.getElementById('bulk-eol-notes')?.value.trim();
  const ids      = [...QState.selected];

  if (!eolDate) {
    showToast('Data da baixa é obrigatória.', 'error');
    return;
  }
  if (!analista || analista.length < 2) {
    showToast('Nome do analista é obrigatório (min. 2 chars).', 'error');
    return;
  }
  if (ids.length === 0) return;

  const btn = document.getElementById('bulk-eol-confirm-btn');
  if (btn) {
    btn.disabled      = true;
    btn.textContent   = `Processando ${ids.length} máquina(s)...`;
    btn.style.opacity = '0.7';
  }

  // Processa em paralelo
  const results = await Promise.allSettled(
    ids.map(id => DataAPI.registerEndOfLife(id, {
      machine_id: id,
      eol_date:   eolDate,
      analista,
      notes:      notes || `Bulk EOL — ${ids.length} machines`,
    }))
  );

  const success = results.filter(r => r.status === 'fulfilled').length;
  const failed  = results.length - success;

  document.getElementById('bulk-eol-modal')?.remove();

  if (failed === 0) {
    showToast(`✓ ${success} máquina(s) marcada(s) como Baixa Definitiva`, 'success');
  } else {
    showToast(`⚠ ${success} sucesso · ${failed} falha(s). Verifique o console.`, 'warning');
    console.warn('Bulk EOL failures:', results.filter(r => r.status === 'rejected'));
  }

  QState.selected.clear();
  setTimeout(() => window.location.reload(), 1500);
}

// ── Sorting ───────────────────────────────────────────────────
function initTableSort() {
  document.querySelectorAll('.q-table th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      QState.sortDir = QState.sortCol === col
        ? (QState.sortDir === 'asc' ? 'desc' : 'asc')
        : 'asc';
      QState.sortCol = col;

      document.querySelectorAll('.q-table th[data-col] .sort-icon')
        .forEach(ic => ic.textContent = '⇅');
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.textContent = QState.sortDir === 'asc' ? '↑' : '↓';

      renderTable();
    });
  });
}

function sortMachines(list, col, dir) {
  return [...list].sort((a, b) => {
    let va = a[col] ?? '';
    let vb = b[col] ?? '';

    if (col === 'daysInLab') {
      va = Number(va) || 0;
      vb = Number(vb) || 0;
    } else if (col === 'depreciation_date') {
      va = new Date(va).getTime() || 0;
      vb = new Date(vb).getTime() || 0;
    } else {
      va = String(va).toLowerCase();
      vb = String(vb).toLowerCase();
    }

    if (va < vb) return dir === 'asc' ? -1 :  1;
    if (va > vb) return dir === 'asc' ?  1 : -1;
    return 0;
  });
}

// ── Pagination ────────────────────────────────────────────────
function renderPagination() {
  const bar = document.getElementById('pagination-bar');
  if (!bar) return;

  const total = QState.filtered.length;
  const pages = Math.ceil(total / QState.perPage);
  if (pages <= 1) { bar.innerHTML = ''; return; }

  const pg = QState.page;
  let html = `<div class="pg-btns">`;
  html += `<button class="pg-btn" onclick="goPage(${pg-1})" ${pg===1?'disabled':''}>‹</button>`;

  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || (i >= pg-1 && i <= pg+1)) {
      html += `<button class="pg-btn ${i===pg?'active':''}" onclick="goPage(${i})">${i}</button>`;
    } else if (i === pg-2 || i === pg+2) {
      html += `<span style="padding:4px 6px;color:var(--color-muted)">…</span>`;
    }
  }

  html += `<button class="pg-btn" onclick="goPage(${pg+1})" ${pg===pages?'disabled':''}>›</button>`;
  html += `</div>`;
  bar.innerHTML = html;
}

function goPage(n) {
  const pages = Math.ceil(QState.filtered.length / QState.perPage);
  if (n < 1 || n > pages) return;
  QState.page = n;
  renderTable();
  renderPagination();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Sidebar active ────────────────────────────────────────────
function updateSidebarActive() {
  const loc = QState.location;
  document.querySelectorAll('#sidebar nav a').forEach(a => {
    a.classList.remove('active');
    const href = a.getAttribute('href') || '';
    if (href.includes(`q=${encodeURIComponent(loc)}`) ||
        href.includes(`q=${loc}`)) {
      a.classList.add('active');
    }
  });
}