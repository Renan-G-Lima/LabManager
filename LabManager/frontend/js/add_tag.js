/* ============================================================
   ADD_TAG.JS — Updated:
   - Removed Location field
   - Removed Warranty Date
   - Added Analista (required)
   - Quarter auto-detected from Depreciation Month
   ============================================================ */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
  initAddTagForm();
  initTagInput();
  initDatePreview();

  // Set entry date default to today
  const entryInput = document.getElementById('input-entry-date');
  if (entryInput) {
    entryInput.value = new Date().toISOString().split('T')[0];
  }
});

// ── Month abbr → number ───────────────────────────────────────
const MONTH_ABBR = {
  jan:'01', feb:'02', mar:'03', apr:'04',
  may:'05', jun:'06', jul:'07', aug:'08',
  sep:'09', oct:'10', nov:'11', dec:'12'
};

// ── Detect quarter from ISO date ─────────────────────────────
function detectQuarterFromDate(isoDate) {
  if (!isoDate) return null;
  const month = new Date(isoDate).getMonth() + 1;
  if (isNaN(month)) return null;
  if (month <= 3)  return 'Q1';
  if (month <= 6)  return 'Q2';
  if (month <= 9)  return 'Q3';
  return 'Q4';
}

// ── Parse "30-mar-26" → "2026-03-30" ─────────────────────────
function parseCustomDate(str) {
  if (!str) return null;
  str = str.trim().toLowerCase();

  // Format: 30-mar-26 or 30-mar-2026
  const match = str.match(/^(\d{1,2})-([a-z]{3})-(\d{2,4})$/);
  if (match) {
    const [, day, mon, yr] = match;
    const month = MONTH_ABBR[mon];
    if (!month) return null;
    const fullYear = yr.length === 2 ? '20' + yr : yr;
    return `${fullYear}-${month}-${day.padStart(2, '0')}`;
  }

  // Standard date
  const d = new Date(str);
  if (!isNaN(d)) return d.toISOString().split('T')[0];
  return null;
}

// ── Validate TAG: max 8 chars, no O/o ────────────────────────
function validateTag(tag) {
  if (!tag || tag.trim().length === 0) {
    return { valid: false, error: 'TAG cannot be empty.' };
  }
  if (tag.length > 8) {
    return { valid: false, error: 'TAG must be ≤8 characters.' };
  }
  if (/[Oo]/.test(tag)) {
    return { valid: false, error: 'Letter "O" is not allowed. Use zero "0".' };
  }
  return { valid: true };
}

// ── Live TAG input ────────────────────────────────────────────
function initTagInput() {
  const tagInput    = document.getElementById('input-tag');
  const tagFeedback = document.getElementById('tag-feedback');
  if (!tagInput) return;

  tagInput.addEventListener('input', async () => {
    const val = tagInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    tagInput.value = val;

    if (!val) {
      tagFeedback.textContent = '';
      tagInput.classList.remove('is-valid','is-invalid');
      return;
    }

    const v = validateTag(val);
    if (!v.valid) {
      tagInput.classList.add('is-invalid');
      tagInput.classList.remove('is-valid');
      tagFeedback.textContent = v.error;
      tagFeedback.className   = 'form-text text-danger';
      return;
    }

    // Check duplicate
    try {
      const existing = await DataAPI.getMachineByTag(val);
      if (existing) {
        tagInput.classList.add('is-invalid');
        tagInput.classList.remove('is-valid');
        tagFeedback.textContent = `⚠ TAG ${val} already exists in ${existing.location || existing.quarter}.`;
        tagFeedback.className   = 'form-text text-warning fw-semibold';
        return;
      }
    } catch (_) {}

    tagInput.classList.add('is-valid');
    tagInput.classList.remove('is-invalid');
    tagFeedback.textContent = '✓ Valid TAG';
    tagFeedback.className   = 'form-text text-success';
  });
}

// ── Depreciation date → auto quarter ─────────────────────────
function initDatePreview() {
  const deprecInput   = document.getElementById('input-deprec-date');
  const quarterSel    = document.getElementById('input-quarter');
  const preview       = document.getElementById('date-preview');
  const quarterHint   = document.getElementById('quarter-auto-hint');

  if (!deprecInput) return;

  deprecInput.addEventListener('input', () => {
    const raw    = deprecInput.value.trim();
    const parsed = parseCustomDate(raw);

    if (parsed) {
      const d       = new Date(parsed);
      const label   = d.toLocaleDateString('en-GB', {
        day:'2-digit', month:'short', year:'numeric'
      });
      const quarter = detectQuarterFromDate(parsed);

      if (preview) {
        preview.textContent = `→ ${label}`;
        preview.className   = 'form-text text-success';
      }

      // Auto-set quarter dropdown
      if (quarterSel && quarter) {
        quarterSel.value = quarter;
        if (quarterHint) {
          quarterHint.textContent = `Auto-detected: ${quarter}`;
          quarterHint.className   = 'form-text text-success';
        }
      }
    } else if (raw.length > 0) {
      if (preview) {
        preview.textContent = 'Format: 30-mar-26 or YYYY-MM-DD';
        preview.className   = 'form-text text-danger';
      }
      if (quarterHint) quarterHint.textContent = '';
    } else {
      if (preview)     preview.textContent = '';
      if (quarterHint) quarterHint.textContent = '';
    }
  });
}

// ── Form submit ───────────────────────────────────────────────
function initAddTagForm() {
  const form = document.getElementById('add-tag-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const tag       = document.getElementById('input-tag')?.value.trim().toUpperCase();
    const entryDate = document.getElementById('input-entry-date')?.value;
    const deprecRaw = document.getElementById('input-deprec-date')?.value.trim();
    const quarter   = document.getElementById('input-quarter')?.value;
    const model     = document.getElementById('input-model')?.value;
    const reason    = document.getElementById('input-reason')?.value;
    const analista  = document.getElementById('input-analista')?.value.trim();
    const obs       = document.getElementById('input-obs')?.value.trim();

    // Validations
    let hasError = false;

    const tagV = validateTag(tag);
    if (!tagV.valid) {
      showFieldError('input-tag', tagV.error);
      hasError = true;
    }

    if (!entryDate) {
      showFieldError('input-entry-date', 'Entry date is required.');
      hasError = true;
    }

    const deprecDate = parseCustomDate(deprecRaw);
    if (deprecRaw && !deprecDate) {
      showFieldError('input-deprec-date', 'Invalid format. Use: 30-mar-26');
      hasError = true;
    }

    if (!quarter) {
      showFieldError('input-quarter', 'Please select a quarter.');
      hasError = true;
    }

    if (!reason) {
      showFieldError('input-reason', 'Please select the entry reason.');
      hasError = true;
    }

    if (!analista) {
      showFieldError('input-analista', 'Analista name is required.');
      hasError = true;
    }

    if (hasError) return;

    // Build obs with analista prepended
    const fullObs = `Analista: ${analista}${obs ? '\n' + obs : ''}`;

    try {
      const result = await DataAPI.addMachine({
        machine_id:        tag,
        machine_tag:       tag,
        model:             model || null,
        entry_date:        entryDate,
        depreciation_date: deprecDate || null,
        location:          quarter,    // location = quarter at creation
        entry_reason:      reason,
        status:            'Ativo',
        obs:               fullObs,
      });

      showToast(`✓ TAG ${tag} registered in ${quarter}`, 'success');

      form.reset();
      document.getElementById('input-entry-date').value =
        new Date().toISOString().split('T')[0];
      document.querySelectorAll('.is-valid,.is-invalid').forEach(el =>
        el.classList.remove('is-valid','is-invalid')
      );
      const preview = document.getElementById('preview-card');
      if (preview) preview.style.display = 'none';

      setTimeout(() => {
        window.location.href = `machine_log.html?tag=${tag}`;
      }, 1200);

    } catch (err) {
      showToast(`❌ Error: ${err.message}`, 'error');
    }
  });

  // Reset button
  document.getElementById('btn-reset-form')?.addEventListener('click', () => {
    form.reset();
    document.getElementById('input-entry-date').value =
      new Date().toISOString().split('T')[0];
    document.querySelectorAll('.is-valid,.is-invalid').forEach(el =>
      el.classList.remove('is-valid','is-invalid')
    );
    const preview = document.getElementById('preview-card');
    if (preview) preview.style.display = 'none';
    const hint = document.getElementById('quarter-auto-hint');
    if (hint) hint.textContent = '';
  });
}

// ── Field error helper ────────────────────────────────────────
function showFieldError(inputId, message) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.classList.add('is-invalid');
  el.classList.remove('is-valid');

  let fb = el.parentNode.querySelector('.invalid-feedback');
  if (!fb) {
    fb = document.createElement('div');
    fb.className = 'invalid-feedback';
    el.parentNode.appendChild(fb);
  }
  fb.textContent = message;
}