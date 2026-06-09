/* ============================================================
   DATA.JS — Data layer wrapping the API (with EOL support)
   ============================================================ */

'use strict';

// ── Validation helpers ───────────────────────────────────────
function validateTagFormat(tag) {
  if (!tag) return { valid: false, error: 'TAG cannot be empty' };
  if (tag.length > 8) return { valid: false, error: 'TAG must be ≤8 characters' };
  if (/[Oo]/.test(tag)) return { valid: false, error: 'Letter "O" not allowed — use zero "0"' };
  return { valid: true };
}

// ── Helpers de data e MDA ────────────────────────────────────
function calcDaysInLab(entryDateStr) {
  if (!entryDateStr) return 0;
  const now   = new Date();
  const entry = new Date(entryDateStr);
  if (isNaN(entry)) return 0;
  return Math.max(0, Math.floor((now - entry) / (1000 * 60 * 60 * 24)));
}

function mdaColor(days) {
  if (days < 10) return 'green';
  if (days <= 14) return 'yellow';
  return 'red';
}

function getMDALabel(daysLeft) {
  if (daysLeft < 0)   return `EXPIRED — ${Math.abs(daysLeft)} days overdue`;
  if (daysLeft === 0) return `EXPIRES TODAY`;
  if (daysLeft <= 4)  return `EXPIRES IN ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
  return `OK — ${daysLeft} days remaining`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

// ── Mock data — fallback se API estiver offline ──────────────
const MOCK_MACHINES = [
  // Q1
  { id:1,  machine_id:'GQDT7S3', machine_tag:'GQDT7S3', model:'Dell Lat.5450',
    entry_date:'2026-02-01', depreciation_date:'2026-03-04',
    location:'Q1', entry_reason:'Refresh', status:'Ativo', obs:'',
    is_locked:false, eol_date:null, eol_analista:null, eol_notes:null },
  { id:2,  machine_id:'1JXDXW3', machine_tag:'1JXDXW3', model:'Dell Lat.5450',
    entry_date:'2026-02-15', depreciation_date:'2026-03-22',
    location:'Q1', entry_reason:'Refresh', status:'Ativo', obs:'new',
    is_locked:false, eol_date:null, eol_analista:null, eol_notes:null },
  { id:3,  machine_id:'78XHHW3', machine_tag:'78XHHW3', model:'Dell Lat.5450',
    entry_date:'2026-03-01', depreciation_date:'2026-03-30',
    location:'Q1', entry_reason:'Desligamento', status:'Ativo', obs:'',
    is_locked:false, eol_date:null, eol_analista:null, eol_notes:null },

  // Q2
  { id:4,  machine_id:'FVQ4JS3', machine_tag:'FVQ4JS3', model:'Dell Lat.5450',
    entry_date:'2026-06-01', depreciation_date:'2026-06-28',
    location:'Q2', entry_reason:'Refresh', status:'Ativo', obs:'',
    is_locked:false, eol_date:null, eol_analista:null, eol_notes:null },
  { id:5,  machine_id:'6SQ4JS3', machine_tag:'6SQ4JS3', model:'Dell Lat.5450',
    entry_date:'2026-06-05', depreciation_date:'2026-06-28',
    location:'Q2', entry_reason:'Refresh', status:'Ativo', obs:'',
    is_locked:false, eol_date:null, eol_analista:null, eol_notes:null },
  { id:6,  machine_id:'G641LS3', machine_tag:'G641LS3', model:'Dell Lat.5450',
    entry_date:'2026-05-01', depreciation_date:'2026-05-04',
    location:'Q2', entry_reason:'Desligamento', status:'Ativo', obs:'',
    is_locked:false, eol_date:null, eol_analista:null, eol_notes:null },
  { id:7,  machine_id:'4TPPF14', machine_tag:'4TPPF14', model:'Dell Lat.5550',
    entry_date:'2026-05-20', depreciation_date:'2027-06-04',
    location:'Q2', entry_reason:'Refresh', status:'Ativo', obs:'',
    is_locked:false, eol_date:null, eol_analista:null, eol_notes:null },

  // Q3
  { id:8,  machine_id:'8KY2MS3', machine_tag:'8KY2MS3', model:'Dell Lat.5450',
    entry_date:'2026-07-01', depreciation_date:'2026-07-21',
    location:'Q3', entry_reason:'Refresh', status:'Ativo', obs:'',
    is_locked:false, eol_date:null, eol_analista:null, eol_notes:null },
  { id:9,  machine_id:'5JY2MS3', machine_tag:'5JY2MS3', model:'Dell Lat.5450',
    entry_date:'2026-07-05', depreciation_date:'2026-07-21',
    location:'Q3', entry_reason:'Refresh', status:'Ativo', obs:'',
    is_locked:false, eol_date:null, eol_analista:null, eol_notes:null },
  { id:10, machine_id:'85H3JS3', machine_tag:'85H3JS3', model:'Dell Lat.5450',
    entry_date:'2026-08-01', depreciation_date:'2026-08-17',
    location:'Q3', entry_reason:'Desligamento', status:'Ativo', obs:'',
    is_locked:false, eol_date:null, eol_analista:null, eol_notes:null },

  // Q4
  { id:11, machine_id:'JY6JD14', machine_tag:'JY6JD14', model:'Dell Lat.5550',
    entry_date:'2026-05-13', depreciation_date:'2027-04-15',
    location:'Q4', entry_reason:'Refresh', status:'Ativo', obs:'',
    is_locked:false, eol_date:null, eol_analista:null, eol_notes:null },
  { id:12, machine_id:'GT6JD14', machine_tag:'GT6JD14', model:'Dell Lat.5550',
    entry_date:'2026-05-20', depreciation_date:'2027-04-15',
    location:'Q4', entry_reason:'Refresh', status:'Ativo', obs:'',
    is_locked:false, eol_date:null, eol_analista:null, eol_notes:null },
  { id:13, machine_id:'BB2M034', machine_tag:'BB2M034', model:'Dell Lat.5550',
    entry_date:'2026-05-10', depreciation_date:'2027-08-20',
    location:'Q4', entry_reason:'Retorno de Ativo', status:'Ativo', obs:'',
    is_locked:false, eol_date:null, eol_analista:null, eol_notes:null },
  { id:14, machine_id:'9T6JD14', machine_tag:'9T6JD14', model:'Dell Lat.5550',
    entry_date:'2026-05-01', depreciation_date:'2027-04-13',
    location:'Q4', entry_reason:'Refresh', status:'Ativo', obs:'',
    is_locked:false, eol_date:null, eol_analista:null, eol_notes:null },

  // ARM01
  { id:15, machine_id:'CX1WSW3', machine_tag:'CX1WSW3', model:'Dell Lat.5550',
    entry_date:'2026-05-25', depreciation_date:'2027-08-20',
    location:'ARM01', entry_reason:'Retorno de Ativo', status:'Em Estoque', obs:'',
    is_locked:false, eol_date:null, eol_analista:null, eol_notes:null },
  { id:16, machine_id:'95TXSW3', machine_tag:'95TXSW3', model:'Dell Lat.5550',
    entry_date:'2026-05-20', depreciation_date:'2027-08-26',
    location:'ARM01', entry_reason:'Retorno de Ativo', status:'Em Estoque', obs:'',
    is_locked:false, eol_date:null, eol_analista:null, eol_notes:null },

  // ARM02
  { id:17, machine_id:'25TXSW3', machine_tag:'25TXSW3', model:'Dell Lat.5550',
    entry_date:'2026-05-18', depreciation_date:'2027-08-26',
    location:'ARM02', entry_reason:'Retorno de Ativo', status:'Em Estoque', obs:'',
    is_locked:false, eol_date:null, eol_analista:null, eol_notes:null },

  // Uso e Consumo
  { id:18, machine_id:'4LRP2K2', machine_tag:'4LRP2K2', model:'Workstation',
    entry_date:'2022-01-01', depreciation_date:null,
    location:'Uso e Consumo', entry_reason:'Retorno de Ativo', status:'Ativo', obs:'Workstation',
    is_locked:false, eol_date:null, eol_analista:null, eol_notes:null },
];

// ── Enriquece máquina com campos calculados ──────────────────
function enrichMachine(m) {
  if (!m) return null;
  const days     = calcDaysInLab(m.entry_date);
  const daysLeft = 14 - days;
  const mda_color = mdaColor(days);
  return {
    ...m,
    days_since_entry:    days,
    days_until_deadline: daysLeft,
    mda_color,
    mda_status_label:    daysLeft < 0 ? 'VENCIDO' : daysLeft <= 4 ? 'PRÓXIMO' : 'OK',
    mdaStatus:           mda_color,
    mdaLabel:            getMDALabel(daysLeft),
  };
}

// ── DataAPI ──────────────────────────────────────────────────
const DataAPI = {

  async getAllMachines() {
    if (typeof API !== 'undefined') {
      try {
        const data = await API.listMachines({ limit: 500 });
        return data.map(enrichMachine);
      } catch (_) { /* fallback */ }
    }
    return MOCK_MACHINES.map(enrichMachine);
  },

  async getMachinesByQuarter(location) {
    if (typeof API !== 'undefined') {
      try {
        const data = await API.listMachines({ location, limit: 500 });
        return data.map(enrichMachine);
      } catch (_) { /* fallback */ }
    }
    return MOCK_MACHINES
      .filter(m => m.location === location)
      .map(enrichMachine);
  },

  async getMachineByTag(tag) {
    if (typeof API !== 'undefined') {
      try { return enrichMachine(await API.getMachine(tag)); }
      catch (_) { /* fallback */ }
    }
    const m = MOCK_MACHINES.find(
      m => m.machine_tag.toUpperCase() === tag.toUpperCase()
    );
    return m ? enrichMachine(m) : null;
  },

  async searchMachines(query) {
    if (typeof API !== 'undefined') {
      try {
        const data = await API.search(query, 20);
        return data.map(enrichMachine);
      } catch (_) { /* fallback */ }
    }
    const q = query.toUpperCase();
    return MOCK_MACHINES
      .filter(m =>
        m.machine_tag.toUpperCase().includes(q) ||
        (m.model || '').toUpperCase().includes(q) ||
        (m.location || '').toUpperCase().includes(q)
      )
      .map(enrichMachine);
  },

  async getHistory(machineId) {
    if (typeof API !== 'undefined') {
      try { return await API.getHistory(machineId); }
      catch (_) { /* fallback */ }
    }
    return [];
  },

  async addMachine(data) {
    const v = validateTagFormat(data.machine_id || data.tag);
    if (!v.valid) throw new Error(v.error);

    if (typeof API !== 'undefined') {
      try {
        return await API.createMachine({
          machine_id:        data.machine_id || data.tag,
          machine_tag:       data.machine_tag || data.tag,
          model:             data.model,
          entry_date:        data.entry_date || new Date().toISOString().split('T')[0],
          depreciation_date: data.depreciation_date || null,
          location:          data.location || 'Q1',
          entry_reason:      data.entry_reason || 'Refresh',
          status:            data.status || 'Ativo',
          obs:               data.obs || null,
        });
      } catch (e) { throw e; }
    }

    // Mock fallback
    const newM = {
      id: MOCK_MACHINES.length + 1,
      machine_id:  data.machine_id || data.tag,
      machine_tag: data.machine_tag || data.tag,
      ...data,
      is_locked: false,
    };
    MOCK_MACHINES.push(newM);
    return newM;
  },

  async registerReturn(machineId, returnData) {
    if (typeof API !== 'undefined') {
      try {
        return await API.createMovement({
          machine_id:     machineId,
          movement_type:  'Devolução Final',
          to_location:    returnData.toLocation || 'ARM01',
          notes:          `Reason: ${returnData.reason}${returnData.notes ? ' | ' + returnData.notes : ''}`,
        });
      } catch (e) { throw e; }
    }
    return null;
  },

  // ── End of Life ────────────────────────────────────────────
  async registerEndOfLife(machineId, data) {
    if (typeof API !== 'undefined') {
      try {
        return await API.endOfLife(machineId, data);
      } catch (e) { throw e; }
    }

    // Mock fallback
    const m = MOCK_MACHINES.find(
      x => (x.machine_id || x.tag).toUpperCase() === machineId.toUpperCase()
    );
    if (!m) throw new Error('Machine not found');
    if (m.is_locked) throw new Error('Machine already in Baixa');

    m.status       = 'Baixa';
    m.is_locked    = true;
    m.eol_date     = data.eol_date;
    m.eol_analista = data.analista;
    m.eol_notes    = data.notes || null;
    return m;
  },

  async getStats() {
    if (typeof API !== 'undefined') {
      try {
        const s = await API.getStats();
        const byLocation = {};
        (s.by_location || []).forEach(l => { byLocation[l.location] = l.total; });
        return {
          total:        s.total_machines || 0,
          inLab:        s.total_active   || 0,
          nearDeadline: s.mda_warning    || 0,
          overdue:      s.mda_overdue    || 0,
          byQuarter: {
            Q1:    byLocation['Q1']             || 0,
            Q2:    byLocation['Q2']             || 0,
            Q3:    byLocation['Q3']             || 0,
            Q4:    byLocation['Q4']             || 0,
            ARM01: byLocation['ARM01']          || 0,
            ARM02: byLocation['ARM02']          || 0,
            UC:    byLocation['Uso e Consumo']  || 0,
          }
        };
      } catch (_) { /* fallback */ }
    }

    // Mock fallback
    const all = MOCK_MACHINES.map(enrichMachine);
    const byQ = { Q1:0, Q2:0, Q3:0, Q4:0, ARM01:0, ARM02:0, UC:0 };
    all.forEach(m => {
      if (m.location === 'Q1')                 byQ.Q1++;
      else if (m.location === 'Q2')            byQ.Q2++;
      else if (m.location === 'Q3')            byQ.Q3++;
      else if (m.location === 'Q4')            byQ.Q4++;
      else if (m.location === 'ARM01')         byQ.ARM01++;
      else if (m.location === 'ARM02')         byQ.ARM02++;
      else if (m.location === 'Uso e Consumo') byQ.UC++;
    });
    const inLab = all.filter(m => m.status === 'Ativo');
    return {
      total:        all.length,
      inLab:        inLab.length,
      nearDeadline: inLab.filter(m => m.days_since_entry >= 10 && m.days_since_entry <= 14).length,
      overdue:      all.filter(m => m.days_since_entry > 14).length,
      byQuarter:    byQ,
    };
  },

  async getMDAAlerts() {
    if (typeof API !== 'undefined') {
      try {
        const alerts = await API.getMDAAlerts(8);
        return alerts.map(a => ({
          tag:        a.machine_tag,
          machine_id: a.machine_id,
          model:      a.model,
          location:   a.location,
          mdaStatus:  a.mda_color,
          mdaLabel:   getMDALabel(a.days_until_deadline),
        }));
      } catch (_) { /* fallback */ }
    }
    return MOCK_MACHINES
      .filter(m => m.status === 'Ativo')
      .map(enrichMachine)
      .sort((a, b) => b.days_since_entry - a.days_since_entry)
      .slice(0, 8);
  },

  async getCalendar(year = null) {
    const allMachines = await this.getAllMachines();
    return allMachines.filter(m => {
      if (!m.depreciation_date) return false;
      if (!year) return true;
      return new Date(m.depreciation_date).getFullYear() === year;
    });
  },
};