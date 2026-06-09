/* ============================================================
   MACHINE.JS — Machine detail with End of Life support
   ============================================================ */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const tag    = params.get('tag');

  if (!tag) {
    showNotFound('No TAG specified in URL.');
    return;
  }

  const machine = await DataAPI.getMachineByTag(tag);
  if (!machine) {
    showNotFound(`TAG "${tag}" not found in the system.`);
    return;
  }

  renderMachineHeader(machine);
  renderDaysCounter(machine);
  renderMachineActions(machine);
  await renderTimeline(machine);
  renderMDAAlertsPanel(machine);
  document.title = `${machine.machine_tag || machine.tag} — Lab Manager`;
});

// ── Header ────────────────────────────────────────────────────
function renderMachineHeader(m) {
  const tag      = m.machine_tag || m.tag    || '—';
  const days     = m.days_since_entry ?? calcDaysInLab(m.entry_date || m.entryDate);
  const color    = m.mda_color || mdaColor(days);

  setEl('mh-tag',      tag);
  setEl('mh-model',    m.model    || 'Unknown model');
  setEl('mh-quarter',  m.location || '—');
  setEl('mh-location', m.location || '—');
  setEl('mh-obs',      m.obs      || '—');

  // Status with lock indicator
  const statusEl = document.getElementById('mh-status');
  if (statusEl) {
    if (m.is_locked) {
      statusEl.innerHTML = `
        <span class="badge" style="background:#212529;color:#fff;font-size:0.78rem;padding:5px 12px;">
          🔒 Baixa Definitiva
        </span>`;
    } else {
      statusEl.innerHTML = statusBadge(m.status || 'Ativo');
    }
  }

  setEl('meta-entry',    formatDate(m.entry_date || m.entryDate));
  setEl('meta-deprec',   formatDate(m.depreciation_date || m.deprecDate) || 'Not set');
  setEl('meta-warranty', formatDate(m.mda_deadline) || '—');
  setEl('meta-quarter',  m.location || '—');
  setEl('meta-model',    m.model || '—');
  setEl('meta-location', m.location || '—');

  // Header tint
  const headerEl = document.getElementById('machine-header');
  if (headerEl) {
    if (m.is_locked) {
      headerEl.style.background  = '#f8f9fa';
      headerEl.style.borderColor = '#6c757d';
      headerEl.style.opacity     = '0.92';
    } else {
      const tints = { green:'#f0fff4', yellow:'#fffef0', red:'#fff8f8' };
      headerEl.style.borderColor = getColorHex(color);
      headerEl.style.background  = tints[color] || '#fff';
    }
  }
}

// ── Days counter ──────────────────────────────────────────────
function renderDaysCounter(m) {
  const days  = m.days_since_entry ?? calcDaysInLab(m.entry_date || m.entryDate);
  const color = m.mda_color || mdaColor(days);
  const pct   = Math.min((days / 14) * 100, 100);

  setEl('dc-num',   days);
  setEl('dc-label', 'days in lab (MDA limit: 14)');

  const fill = document.getElementById('dc-bar-fill');
  if (fill) {
    fill.style.width      = `${pct}%`;
    fill.style.background = m.is_locked ? '#6c757d' : getColorHex(color);
  }

  const statusText = document.getElementById('dc-status-text');
  if (statusText) {
    if (m.is_locked) {
      statusText.textContent      = '🔒 Machine in Baixa — MDA tracking ended';
      statusText.style.color      = '#6c757d';
      statusText.style.fontWeight = '600';
    } else {
      const msgs = {
        green:  `✓ OK — ${14 - days} days remaining`,
        yellow: `⚠ Warning — ${14 - days} day${14 - days !== 1 ? 's' : ''} remaining`,
        red:    `✗ Overdue — ${days - 14} day${days - 14 !== 1 ? 's' : ''} past MDA limit`
      };
      statusText.textContent      = msgs[color];
      statusText.style.color      = getColorHex(color);
      statusText.style.fontWeight = '600';
    }
  }
}

// ── Action buttons (with EOL) ─────────────────────────────────
function renderMachineActions(m) {
  const actionsEl = document.getElementById('machine-actions');
  if (!actionsEl) return;

  // ── LOCKED: machine in Baixa — show banner only ──
  if (m.is_locked || m.status === 'Baixa') {
    actionsEl.innerHTML = `
      <div style="
        background: #f8d7da;
        border: 1px solid #dc3545;
        border-left: 4px solid #dc3545;
        border-radius: 8px;
        padding: 14px 18px;
        font-size: 0.85rem;
        color: #842029;
        width: 100%;
      ">
        🔒 <strong>Baixa Definitiva</strong> —
        Esta máquina foi enviada à fábrica em
        <strong>${formatDate(m.eol_date)}</strong>
        por <strong>${m.eol_analista || '—'}</strong>.
        Nenhuma edição é permitida.
        ${m.eol_notes ? `<div style="margin-top:6px;font-size:0.8rem;font-weight:400;">
          <strong>Notas:</strong> ${m.eol_notes}
        </div>` : ''}
      </div>`;
    return;
  }

  // ── ACTIVE machine: show normal actions + EOL button ──
  actionsEl.innerHTML = '';

  const actions = [
    {
      label: '↩ Register Return',
      style: 'background:#d1e7dd;color:#198754;border:1px solid #19875433;',
      href:  `register_return.html?tag=${m.machine_id || m.tag}`,
      show:  m.status === 'Ativo' || m.status === 'MDA',
    },
    {
      label: '📦 Move to Storage',
      style: 'background:#e8d5ff;color:#6f42c1;border:1px solid #6f42c133;',
      href:  '#',
      show:  m.status === 'Ativo',
      onclick: () => moveToStorage(m),
    },
    {
      label: '📋 Edit Details',
      style: 'background:#f0f0f0;color:#6c757d;border:1px solid #6c757d33;',
      href:  `add_tag.html?tag=${m.machine_id || m.tag}`,
      show:  true,
    },
    {
      // ── End of Life — botão vermelho, à direita ──
      label: '🗑 Baixa Definitiva',
      style: 'background:#f8d7da;color:#dc3545;border:1px solid #dc354555;margin-left:auto;font-weight:600;',
      href:  '#',
      show:  true,
      onclick: () => openEOLModal(m),
    },
  ];

  actions.filter(a => a.show).forEach(a => {
    const btn = document.createElement('a');
    btn.href          = a.href;
    btn.className     = 'btn-action';
    btn.style.cssText = a.style;
    btn.innerHTML     = a.label;
    if (a.onclick) {
      btn.addEventListener('click', e => { e.preventDefault(); a.onclick(); });
    }
    actionsEl.appendChild(btn);
  });
}

// ── Timeline ──────────────────────────────────────────────────
async function renderTimeline(m) {
  const container = document.getElementById('timeline');
  if (!container) return;

  let history = [];
  try {
    history = await DataAPI.getHistory(m.machine_id || m.tag);
  } catch (e) { history = []; }

  // Auto-generate if empty
  const events = history.length > 0 ? history : generateAutoTimeline(m);

  container.innerHTML = '';

  if (events.length === 0) {
    container.innerHTML = `
      <div style="font-size:0.82rem;color:var(--color-muted);">
        No history recorded yet.
      </div>`;
    return;
  }

  events.forEach(ev => {
    const evType = (ev.event_type || ev.type || '').toLowerCase();
    let typeClass = '';
    if (evType.includes('descarte') || evType.includes('baixa'))       typeClass = 'event-overdue';
    else if (evType.includes('retorn') || evType.includes('return'))   typeClass = 'event-return';
    else if (evType.includes('vencid') || evType.includes('expir'))    typeClass = 'event-overdue';
    else if (evType.includes('alerta') || evType.includes('warning'))  typeClass = 'event-warning';

    const item = document.createElement('div');
    item.className = `timeline-item ${typeClass}`;
    item.innerHTML = `
      <div class="tl-date">${formatDate(ev.event_date || ev.date)}</div>
      <div class="tl-event">${ev.event_desc || ev.event || '—'}</div>
      ${ev.note || ev.notes
        ? `<div class="tl-note">${ev.note || ev.notes}</div>`
        : ''}
    `;
    container.appendChild(item);
  });
}

function generateAutoTimeline(m) {
  const events = [];
  const days = m.days_since_entry ?? calcDaysInLab(m.entry_date || m.entryDate);

  if (m.entry_date || m.entryDate) {
    events.push({
      event_date: m.entry_date || m.entryDate,
      event_type: 'Criação',
      event_desc: `Machine registered — ${m.entry_reason || 'Refresh'}`,
      note:       m.obs || `Location: ${m.location || '—'}`
    });
  }

  // If locked, show EOL event and skip MDA
  if (m.is_locked && m.eol_date) {
    events.push({
      event_date: m.eol_date,
      event_type: 'Descarte',
      event_desc: `🔒 BAIXA DEFINITIVA — Sent to factory`,
      note:       `By: ${m.eol_analista || '—'}${m.eol_notes ? ' | ' + m.eol_notes : ''}`
    });
    return events.sort((a, b) => new Date(b.event_date) - new Date(a.event_date));
  }

  if (days >= 10 && days <= 14) {
    events.push({
      event_date: new Date().toISOString().split('T')[0],
      event_type: 'Alerta MDA',
      event_desc: `⚠ MDA Warning — ${days} days in lab`,
      note:       `${14 - days} day${14 - days !== 1 ? 's' : ''} until limit`
    });
  }

  if (days > 14) {
    events.push({
      event_date: new Date().toISOString().split('T')[0],
      event_type: 'MDA Vencido',
      event_desc: `✗ MDA Exceeded — ${days} days in lab`,
      note:       `${days - 14} day${days - 14 !== 1 ? 's' : ''} past limit`
    });
  }

  if (m.depreciation_date || m.deprecDate) {
    events.push({
      event_date: m.depreciation_date || m.deprecDate,
      event_type: 'Depreciação',
      event_desc: 'Scheduled depreciation date',
      note:       `Location: ${m.location || '—'}`
    });
  }

  return events.sort((a, b) => new Date(b.event_date) - new Date(a.event_date));
}

// ── MDA Alert Panel ───────────────────────────────────────────
function renderMDAAlertsPanel(m) {
  const panel = document.getElementById('mda-panel');
  if (!panel) return;

  if (m.is_locked) {
    panel.style.background   = '#f8f9fa';
    panel.style.borderColor  = '#6c757d';
    panel.style.borderLeft   = '4px solid #6c757d';
    panel.style.borderRadius = '8px';
    panel.style.padding      = '14px 16px';
    panel.innerHTML = `
      <div style="font-weight:700;color:#6c757d;font-size:0.85rem;margin-bottom:4px;">
        🔒 End of Life Status
      </div>
      <div style="font-size:0.82rem;color:#333;">
        Esta máquina está em <strong>Baixa Definitiva</strong>.
        O rastreamento de MDA foi encerrado.
      </div>`;
    return;
  }

  const days  = m.days_since_entry ?? calcDaysInLab(m.entry_date || m.entryDate);
  const color = m.mda_color || mdaColor(days);
  const hexes = { green:'#198754', yellow:'#e6a817', red:'#dc3545' };
  const bgs   = { green:'#d1e7dd', yellow:'#fff3cd', red:'#f8d7da' };

  panel.style.background   = bgs[color];
  panel.style.borderColor  = hexes[color];
  panel.style.borderLeft   = `4px solid ${hexes[color]}`;
  panel.style.borderRadius = '8px';
  panel.style.padding      = '14px 16px';

  const msgs = {
    green:  `✓ MDA OK: Machine has been in lab for ${days} days. ${14 - days} days remaining.`,
    yellow: `⚠ MDA WARNING: ${days} days in lab — ${14 - days} day${14 - days !== 1 ? 's' : ''} left.`,
    red:    `✗ MDA EXPIRED: Machine exceeded 14-day limit by ${days - 14} day${days - 14 !== 1 ? 's' : ''}. Immediate action required.`
  };

  panel.innerHTML = `
    <div style="font-weight:700;color:${hexes[color]};font-size:0.85rem;margin-bottom:4px;">
      MDA Status
    </div>
    <div style="font-size:0.82rem;color:#333;">${msgs[color]}</div>
  `;
}

// ── EOL Modal ─────────────────────────────────────────────────
function openEOLModal(m) {
  const tag = m.machine_tag || m.tag;

  // Remove existing modal
  document.getElementById('eol-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'eol-modal';
  modal.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  `;

  modal.innerHTML = `
    <div style="
      background: #fff;
      border-radius: 12px;
      padding: 28px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-height: 90vh;
      overflow-y: auto;
    ">
      <!-- Header -->
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:18px;">
        <span style="font-size:1.6rem;line-height:1;">⚠️</span>
        <div>
          <h5 style="margin:0;font-weight:700;color:#dc3545;">Baixa Definitiva</h5>
          <p style="margin:2px 0 0;font-size:0.78rem;color:#6c757d;">
            Esta ação é <strong>irreversível</strong>.
          </p>
        </div>
      </div>

      <!-- Warning -->
      <div style="
        background:#fff3cd;border:1px solid #ffc107;border-radius:8px;
        padding:12px 14px;margin-bottom:20px;font-size:0.82rem;color:#664d03;
      ">
        A máquina
        <strong style="font-family:'JetBrains Mono','Courier New',monospace;">${tag}</strong>
        será marcada como <strong>Baixa Definitiva</strong> e enviada à fábrica.
        Após a confirmação, <strong>nenhum dado poderá ser editado</strong>.
        O histórico permanecerá disponível somente para consulta.
      </div>

      <!-- Date -->
      <div style="margin-bottom:14px;">
        <label style="font-size:0.78rem;font-weight:600;display:block;margin-bottom:4px;">
          Data da Baixa <span style="color:#dc3545;">*</span>
        </label>
        <input type="date" id="eol-date"
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
        <input type="text" id="eol-analista"
          placeholder="Nome do analista"
          autocomplete="off"
          style="width:100%;padding:8px 12px;border:1px solid #dee2e6;
                 border-radius:6px;font-size:0.85rem;font-family:var(--font-body);"
        />
      </div>

      <!-- Notes -->
      <div style="margin-bottom:20px;">
        <label style="font-size:0.78rem;font-weight:600;display:block;margin-bottom:4px;">
          Observações
        </label>
        <textarea id="eol-notes"
          placeholder="Motivo da baixa, número de chamado, etc..."
          rows="3"
          style="width:100%;padding:8px 12px;border:1px solid #dee2e6;
                 border-radius:6px;font-size:0.85rem;resize:vertical;font-family:var(--font-body);"
        ></textarea>
      </div>

      <!-- Confirm TAG -->
      <div style="margin-bottom:18px;">
        <label style="font-size:0.78rem;font-weight:600;display:block;margin-bottom:4px;color:#dc3545;">
          Digite a TAG para confirmar:
          <code style="background:#f8d7da;padding:1px 6px;border-radius:3px;">${tag}</code>
        </label>
        <input type="text" id="eol-confirm-tag"
          placeholder="Digite a TAG exata"
          autocomplete="off"
          style="width:100%;padding:8px 12px;border:2px solid #dee2e6;
                 border-radius:6px;font-size:0.85rem;
                 font-family:'JetBrains Mono','Courier New',monospace;
                 text-transform:uppercase;letter-spacing:1px;"
        />
        <div id="eol-tag-feedback" style="font-size:0.72rem;margin-top:4px;"></div>
      </div>

      <!-- Buttons -->
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button onclick="document.getElementById('eol-modal').remove()"
          style="padding:9px 20px;border:1px solid #dee2e6;border-radius:8px;
                 background:#fff;cursor:pointer;font-size:0.82rem;
                 font-family:var(--font-body);font-weight:500;">
          Cancelar
        </button>
        <button id="eol-confirm-btn"
          onclick="confirmEOL('${m.machine_id || m.tag}', '${tag}')"
          disabled
          style="padding:9px 20px;border:none;border-radius:8px;
                 background:#dc3545;color:#fff;cursor:pointer;
                 font-size:0.82rem;font-weight:600;opacity:0.4;
                 font-family:var(--font-body);">
          ✓ Confirmar Baixa Definitiva
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Enable button only when typed TAG matches
  const confirmInput = document.getElementById('eol-confirm-tag');
  const confirmBtn   = document.getElementById('eol-confirm-btn');
  const feedback     = document.getElementById('eol-tag-feedback');

  confirmInput.addEventListener('input', () => {
    const val = confirmInput.value.trim().toUpperCase();
    if (val === tag.toUpperCase()) {
      confirmBtn.disabled        = false;
      confirmBtn.style.opacity   = '1';
      confirmInput.style.borderColor = '#198754';
      feedback.textContent       = '✓ TAG confirmada';
      feedback.style.color       = '#198754';
      feedback.style.fontWeight  = '600';
    } else {
      confirmBtn.disabled        = true;
      confirmBtn.style.opacity   = '0.4';
      confirmInput.style.borderColor = val.length > 0 ? '#dc3545' : '#dee2e6';
      feedback.textContent       = val.length > 0 ? '✗ TAG não confere' : '';
      feedback.style.color       = '#dc3545';
    }
  });

  // Close on outside click
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.remove();
  });

  // Focus first input
  setTimeout(() => document.getElementById('eol-date')?.focus(), 100);
}

// ── Execute EOL ──────────────────────────────────────────────
async function confirmEOL(machineId, tag) {
  const eolDate  = document.getElementById('eol-date')?.value;
  const analista = document.getElementById('eol-analista')?.value.trim();
  const notes    = document.getElementById('eol-notes')?.value.trim();

  if (!eolDate) {
    showToast('Data da baixa é obrigatória.', 'error');
    return;
  }
  if (!analista || analista.length < 2) {
    showToast('Nome do analista é obrigatório (min. 2 chars).', 'error');
    return;
  }

  const btn = document.getElementById('eol-confirm-btn');
  if (btn) {
    btn.disabled       = true;
    btn.textContent    = 'Processando...';
    btn.style.opacity  = '0.7';
  }

  try {
    await DataAPI.registerEndOfLife(machineId, {
      machine_id: machineId,
      eol_date:   eolDate,
      analista,
      notes: notes || null,
    });

    document.getElementById('eol-modal')?.remove();
    showToast(`✓ Baixa definitiva registrada para ${tag}`, 'success');

    // Reload after 1.5s to reflect lock
    setTimeout(() => window.location.reload(), 1500);

  } catch (err) {
    showToast(`❌ Erro: ${err.message}`, 'error');
    if (btn) {
      btn.disabled       = false;
      btn.textContent    = '✓ Confirmar Baixa Definitiva';
      btn.style.opacity  = '1';
    }
  }
}

// ── Move to storage ───────────────────────────────────────────
async function moveToStorage(m) {
  if (m.is_locked) {
    showToast('Esta máquina está em Baixa — movimentações bloqueadas.', 'error');
    return;
  }

  if (!confirm(`Move ${m.machine_tag || m.tag} to storage?`)) return;

  try {
    if (typeof API !== 'undefined') {
      await API.createMovement({
        machine_id:    m.machine_id || m.tag,
        movement_type: 'Entrada em Estoque',
        to_location:   'ARM01',
        notes:         'Moved to storage from machine detail view',
      });
    } else {
      // Mock fallback
      m.location = 'ARM01';
      m.status   = 'Em Estoque';
    }
    showToast(`${m.machine_tag || m.tag} moved to storage.`, 'success');
    setTimeout(() => window.location.reload(), 1000);
  } catch (err) {
    showToast(`❌ Error: ${err.message}`, 'error');
  }
}

// ── Not found state ───────────────────────────────────────────
function showNotFound(msg) {
  const content = document.getElementById('machine-content');
  if (content) {
    content.innerHTML = `
      <div class="text-center py-5">
        <div style="font-size:3rem;">🔍</div>
        <h4 class="mt-3 text-muted">Machine not found</h4>
        <p class="text-muted" style="font-size:0.85rem;">${msg}</p>
        <a href="index.html" class="btn btn-outline-primary btn-sm mt-2">
          ← Back to Home
        </a>
      </div>
    `;
  }
}

// ── Helpers ───────────────────────────────────────────────────
function setEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getColorHex(color) {
  const map = { green:'#198754', yellow:'#e6a817', red:'#dc3545' };
  return map[color] || '#6c757d';
}