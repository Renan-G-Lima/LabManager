/* ============================================================
   MAIN.JS — Global: sidebar, nav, utils, clock
   ============================================================ */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  // Sidebar toggle (mobile)
  const sidebar   = document.getElementById('sidebar');
  const toggleBtn = document.querySelector('.sidebar-toggle');
  const overlay   = document.getElementById('sidebar-overlay');

  toggleBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
    overlay?.classList.toggle('show');
  });

  overlay?.addEventListener('click', () => {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('show');
  });

  // Active nav link
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('#sidebar nav a').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (href && (href === currentPage || href.startsWith(currentPage.split('?')[0]))) {
      link.classList.add('active');
    }
  });

  // Live clock
  const clockEl = document.getElementById('topbar-clock');
  if (clockEl) {
    const updateClock = () => {
      const now = new Date();
      clockEl.textContent =
        now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) +
        ' ' +
        now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
    };
    updateClock();
    setInterval(updateClock, 60000);
  }
});

// ── Toast notification ────────────────────────────────────────
function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText =
      'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
  }

  const bgMap = { success:'#198754', error:'#dc3545', warning:'#e6a817', info:'#0d6efd' };
  const toast = document.createElement('div');
  toast.style.cssText = `
    background:${bgMap[type]||'#333'};color:#fff;
    padding:10px 18px;border-radius:8px;font-size:0.82rem;font-weight:500;
    box-shadow:0 4px 12px rgba(0,0,0,0.2);max-width:300px;
    opacity:0;transform:translateY(10px);transition:all 0.25s;
  `;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Adicione/confirme em frontend/js/main.js se estiverem faltando:

function statusBadge(status) {
  const map = {
    'Ativo':      ['badge-green',  'Ativo'],
    'Em Estoque': ['badge-yellow', 'Em Estoque'],
    'MDA':        ['badge-yellow', 'MDA'],
    'Depreciado': ['badge-red',    'Depreciado'],
    'Baixa':      ['bg-dark text-white', '🔒 Baixa'],
    'in_lab':     ['badge-yellow', 'In Lab'],
    'returned':   ['badge-green',  'Returned'],
    'overdue':    ['badge-red',    'Overdue'],
  };
  const [cls, label] = map[status] || ['bg-secondary text-white', status];
  return `<span class="badge ${cls}" style="font-size:0.7rem;padding:3px 8px;">${label}</span>`;
}

function daysBadge(days) {
  let cls = 'badge-green';
  if (days >= 10 && days <= 14) cls = 'badge-yellow';
  if (days > 14) cls = 'badge-red';
  return `<span class="days-badge ${cls}" style="display:inline-block;padding:2px 8px;border-radius:50px;font-size:0.7rem;font-weight:700;">${days}d</span>`;
}