/* ============================================================
   API.JS — HTTP client (with EOL support)
   Single source for all /api/* calls
   ============================================================ */

'use strict';

const API_BASE = 'http://localhost:8000';

const API = {

  // ── Generic fetch wrapper ──
  async _fetch(path, options = {}) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      if (res.status === 204) return null;
      return await res.json();
    } catch (err) {
      console.error(`API ${options.method || 'GET'} ${path} failed:`, err);
      throw err;
    }
  },

  // ─────────────── Machines ───────────────
  listMachines(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this._fetch(`/api/machines${q ? '?' + q : ''}`);
  },

  getMachine(machineId) {
    return this._fetch(`/api/machines/${encodeURIComponent(machineId)}`);
  },

  createMachine(data) {
    return this._fetch('/api/machines', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateMachine(machineId, data) {
    return this._fetch(`/api/machines/${encodeURIComponent(machineId)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteMachine(machineId) {
    return this._fetch(`/api/machines/${encodeURIComponent(machineId)}`, {
      method: 'DELETE',
    });
  },

  // ─────────────── End of Life ───────────────
  endOfLife(machineId, data) {
    return this._fetch(`/api/machines/${encodeURIComponent(machineId)}/eol`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // ─────────────── Movements ───────────────
  createMovement(data) {
    return this._fetch('/api/movements', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  listMovements(machineId = null) {
    const q = machineId ? `?machine_id=${encodeURIComponent(machineId)}` : '';
    return this._fetch(`/api/movements${q}`);
  },

  // ─────────────── History ───────────────
  getHistory(machineId) {
    return this._fetch(`/api/machines/${encodeURIComponent(machineId)}/history`);
  },

  addHistoryEvent(data) {
    return this._fetch('/api/history', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // ─────────────── Dashboard ───────────────
  getStats() {
    return this._fetch('/api/stats');
  },

  getMDAAlerts(limit = 20) {
    return this._fetch(`/api/alerts/mda?limit=${limit}`);
  },

  getLocationSummary() {
    return this._fetch('/api/locations/summary');
  },

  getCalendar(year = null) {
    const q = year ? `?year=${year}` : '';
    return this._fetch(`/api/calendar${q}`);
  },

  // ─────────────── Search ───────────────
  search(query, limit = 20) {
    return this._fetch(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  },
};