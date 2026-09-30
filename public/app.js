const statusPill = document.getElementById('statusPill');
const gallery = document.getElementById('gallery');
const entryCount = document.getElementById('entryCount');
const searchInput = document.getElementById('searchInput');
const newEntryBtn = document.getElementById('newEntryBtn');

const entryModal = document.getElementById('entryModal');
const closeEntryBtn = document.getElementById('closeEntryBtn');
const entryForm = document.getElementById('entryForm');
const storeInput = document.getElementById('storeInput');
const zoneInput = document.getElementById('zoneInput');
const oclInput = document.getElementById('oclInput');
const selectorInput = document.getElementById('selectorInput');
const olpnInput = document.getElementById('olpnInput');
const notesInput = document.getElementById('notesInput');
const palletPhotosInput = document.getElementById('palletPhotosInput');
const labelPhotoInput = document.getElementById('labelPhotoInput');
const palletPreview = document.getElementById('palletPreview');
const labelPreview = document.getElementById('labelPreview');

const scanBtn = document.getElementById('scanBtn');
const scanModal = document.getElementById('scanModal');
const closeScanBtn = document.getElementById('closeScanBtn');
const scanVideo = document.getElementById('scanVideo');
const scanError = document.getElementById('scanError');

const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const closeLightboxBtn = document.getElementById('closeLightboxBtn');

const toast = document.getElementById('toast');

const STATUS_CLASS = {
  'Needs Follow-up': 'status-followup',
  'Followed up with': 'status-done',
  'Needs more training': 'status-training',
  'Repeat Offender': 'status-repeat'
};
let STATUSES = Object.keys(STATUS_CLASS);

let entries = [];
let searchTimer = null;

function setStatus(msg) { if (statusPill) statusPill.textContent = msg; }

function showToast(msg) {
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2400);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data;
}

async function loadConfig() {
  try {
    const data = await api('/api/config');
    if (Array.isArray(data.statuses) && data.statuses.length) STATUSES = data.statuses;
  } catch { /* fall back to defaults */ }
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  } catch { return iso; }
}

function statusClass(status) {
  return STATUS_CLASS[status] || 'status-followup';
}

function renderCard(entry) {
  const images = entry.images || [];
  const pallet = images.filter(i => i.kind === 'pallet');
  const label = images.filter(i => i.kind === 'label');
  const allPhotos = [...pallet, ...label];

  const photoHtml = allPhotos.length
    ? `<div class="card-photos">${allPhotos.map(img => `
        <button type="button" class="photo-thumb" data-src="/uploads/${encodeURIComponent(img.filename)}" title="${img.kind === 'label' ? 'Label' : 'Pallet'} photo">
          <img src="/uploads/${encodeURIComponent(img.filename)}" alt="${img.kind === 'label' ? 'Label' : 'Pallet'} photo" loading="lazy" />
          
        </button>
      `).join('')}</div>`
    : `<div class="card-photos empty-photos">No photos attached</div>`;

  const statusOptions = STATUSES.map(s => `<option value="${escapeHtml(s)}" ${s === entry.status ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');

  const card = document.createElement('article');
  card.className = `entry-card ${statusClass(entry.status)}`;
  card.dataset.id = entry.id;
  card.innerHTML = `
    ${photoHtml}
    <div class="card-body">
      <div class="card-head">
        <span><strong>Selector</strong> ${escapeHtml(entry.selector)}</span>
</div>
<div>
        <span class="timestamp">${formatDate(entry.created_at)}</span>
      </div>
      <div class="card-meta">
        <span><strong>Store</strong> ${escapeHtml(entry.store)}</span>
        <span><strong>Zone</strong> ${escapeHtml(entry.zone)}</span>
        ${entry.ocl ? `<span><strong>OCL</strong> ${escapeHtml(entry.ocl)}</span>` : ''}
        <span class="olpn">${escapeHtml(entry.olpn)}</span>
        
      </div>
      ${entry.notes ? `<p class="card-notes">${escapeHtml(entry.notes)}</p>` : ''}
      <div class="card-footer">
        <select class="status-select" data-action="status" data-id="${entry.id}">
          ${statusOptions}
        </select>
        <button class="btn danger" type="button" data-action="delete" data-id="${entry.id}">Delete</button>
      </div>
    </div>
  `;
  return card;
}

function render() {
  gallery.innerHTML = '';
  entryCount.textContent = entries.length ? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}` : '';
  if (entries.length === 0) {
    gallery.innerHTML = '<p class="muted">No entries yet. Tap "+ New Entry" to log a pallet issue.</p>';
    return;
  }
  const frag = document.createDocumentFragment();
  for (const entry of entries) frag.appendChild(renderCard(entry));
  gallery.appendChild(frag);
}

async function loadEntries(q = '') {
  setStatus('Loading…');
  const data = await api(`/api/entries${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  entries = data.entries || [];
  render();
  setStatus('Ready');
}

function clearPreview(el) { el.innerHTML = ''; }

function renderFilePreview(el, files) {
  clearPreview(el);
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const div = document.createElement('div');
    div.className = 'pending-picture';
    div.innerHTML = `<img src="${url}" alt="${escapeHtml(file.name)}" />`;
    el.appendChild(div);
  }
}

palletPhotosInput?.addEventListener('change', () => {
  const files = Array.from(palletPhotosInput.files || []).slice(0, 2);
  renderFilePreview(palletPreview, files);
});

labelPhotoInput?.addEventListener('change', () => {
  const files = Array.from(labelPhotoInput.files || []).slice(0, 1);
  renderFilePreview(labelPreview, files);
});

function openEntryModal() {
  entryForm.reset();
  clearPreview(palletPreview);
  clearPreview(labelPreview);
  entryModal.classList.remove('hidden');
  olpnInput.focus();
}

function closeEntryModal() {
  entryModal.classList.add('hidden');
}

newEntryBtn?.addEventListener('click', openEntryModal);
closeEntryBtn?.addEventListener('click', closeEntryModal);
entryModal?.addEventListener('click', e => { if (e.target === entryModal) closeEntryModal(); });

entryForm?.addEventListener('submit', async e => {
  e.preventDefault();
  const store = storeInput.value.trim();
  const zone = zoneInput.value.trim();
  const ocl = oclInput.value.trim();
  const selector = selectorInput.value.trim();
  const olpn = olpnInput.value.trim();
  const notes = notesInput.value.trim();
  if (!store || !olpn || !zone || !selector) {
    setStatus('Need Store + oLPN + Zone + Selector');
    return;
  }
  const fd = new FormData();
  fd.append('store', store);
  fd.append('zone', zone);
  fd.append('ocl', ocl);
  fd.append('selector', selector);
  fd.append('olpn', olpn);
  fd.append('notes', notes);
  for (const file of Array.from(palletPhotosInput.files || []).slice(0, 2)) fd.append('palletPhotos', file);
  const labelFile = (labelPhotoInput.files || [])[0];
  if (labelFile) fd.append('labelPhoto', labelFile);

  try {
    setStatus('Saving…');
    const data = await api('/api/entries', { method: 'POST', body: fd });
    entries.unshift(data.entry);
    render();
    closeEntryModal();
    setStatus('Saved');
    showToast('Entry saved');
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Save failed');
    showToast(err.message || 'Save failed');
  }
});

gallery.addEventListener('click', async e => {
  const photoBtn = e.target.closest('.photo-thumb');
  if (photoBtn) {
    lightboxImg.src = photoBtn.dataset.src;
    lightbox.classList.remove('hidden');
    return;
  }
  const deleteBtn = e.target.closest('button[data-action="delete"]');
  if (deleteBtn) {
    const id = deleteBtn.dataset.id;
    if (!confirm('Delete this entry and its photos?')) return;
    try {
      setStatus('Deleting…');
      await api(`/api/entries/${encodeURIComponent(id)}`, { method: 'DELETE' });
      entries = entries.filter(en => String(en.id) !== String(id));
      render();
      setStatus('Deleted');
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'Delete failed');
      showToast(err.message || 'Delete failed');
    }
  }
});

gallery.addEventListener('change', async e => {
  const select = e.target.closest('select[data-action="status"]');
  if (!select) return;
  const id = select.dataset.id;
  const status = select.value;
  const card = select.closest('.entry-card');
  try {
    const data = await api(`/api/entries/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const idx = entries.findIndex(en => String(en.id) === String(id));
    if (idx !== -1) entries[idx] = data.entry;
    if (card) {
      card.className = `entry-card ${statusClass(status)}`;
    }
    showToast('Status updated');
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Status update failed');
  }
});

closeLightboxBtn?.addEventListener('click', () => lightbox.classList.add('hidden'));
lightbox?.addEventListener('click', e => { if (e.target === lightbox) lightbox.classList.add('hidden'); });

searchInput?.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    loadEntries(searchInput.value.trim()).catch(err => {
      console.error(err);
      setStatus(err.message || 'Search failed');
    });
  }, 250);
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (scanModal && !scanModal.classList.contains('hidden')) closeScan();
  else if (!entryModal.classList.contains('hidden')) closeEntryModal();
  else if (!lightbox.classList.contains('hidden')) lightbox.classList.add('hidden');
});

// --- QR / barcode scanning (native BarcodeDetector) ---
let scanStream = null;
let scanRAF = null;
let detector = null;

function normalizeScan(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';

  // Remove whitespace and common GS1 parentheses
  const compact = s.replace(/\s+/g, '').replace(/[()]/g, '');

  // Digits only (SSCC-18 is 18 digits; AI(00)+SSCC often yields 20 digits starting with 00)
  const digits = compact.replace(/[^0-9]/g, '');

  // If we have AI(00)+SSCC (20+ digits) -> take last 18
  if (digits.length >= 20 && digits.startsWith('00')) {
    return digits.slice(-18);
  }

  // If we have at least 18 digits, take the last 18 (robust across scanners/cameras)
  if (digits.length >= 18) {
    return digits.slice(-18);
  }

  // Fallback: allow alphanumerics for edge cases
  const alnum = compact.replace(/[^0-9A-Za-z_-]/g, '');
  return alnum || compact;
}

function openScan() {
  if (!scanModal) return;
  if (scanError) scanError.textContent = '';
  scanModal.classList.remove('hidden');
  startScan().catch(err => {
    console.error(err);
    if (scanError) scanError.textContent = (err && err.message) ? err.message : 'Unable to start camera';
  });
}

function closeScan() {
  if (!scanModal) return;
  scanModal.classList.add('hidden');
  stopScan();
}

async function startScan() {
  if (!('BarcodeDetector' in window)) {
    throw new Error('Camera barcode scanning not supported on this device/browser. Use a hardware scanner or update Chrome.');
  }

  const formats = await window.BarcodeDetector.getSupportedFormats?.() || [];
  const want = ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar', 'qr_code', 'data_matrix'];
  const useFormats = formats.length ? want.filter(f => formats.includes(f)) : want;
  detector = new window.BarcodeDetector({ formats: useFormats });

  scanStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false
  });
  scanVideo.srcObject = scanStream;
  await scanVideo.play();

  const tick = async () => {
    try {
      if (!detector || !scanVideo || scanVideo.readyState < 2) {
        scanRAF = requestAnimationFrame(tick);
        return;
      }
      const barcodes = await detector.detect(scanVideo);
      if (barcodes && barcodes.length) {
        const raw = barcodes[0].rawValue || '';
        const val = normalizeScan(raw);
        if (val) {
          olpnInput.value = val;
          olpnInput.focus();
          closeScan();
          return;
        }
      }
    } catch {}
    scanRAF = requestAnimationFrame(tick);
  };
  scanRAF = requestAnimationFrame(tick);
}

function stopScan() {
  if (scanRAF) { cancelAnimationFrame(scanRAF); scanRAF = null; }
  if (scanVideo) { scanVideo.pause?.(); scanVideo.srcObject = null; }
  if (scanStream) {
    for (const t of scanStream.getTracks()) {
      try { t.stop(); } catch {}
    }
    scanStream = null;
  }
  detector = null;
}

scanBtn?.addEventListener('click', openScan);
closeScanBtn?.addEventListener('click', closeScan);
scanModal?.addEventListener('click', e => { if (e.target === scanModal) closeScan(); });

// Live sync via Server-Sent Events (SSE)
function connectSSE() {
  try {
    const es = new EventSource('/api/stream');
    es.onopen = () => setStatus('Ready');
    es.onmessage = evt => {
      if (evt.data === 'changed') {
        loadEntries(searchInput.value.trim()).catch(() => {});
      }
    };
    es.onerror = () => {
      setStatus('Reconnecting…');
    };
  } catch {
    setStatus('Polling…');
    setInterval(() => loadEntries(searchInput.value.trim()).catch(() => {}), 10000);
  }
}

loadConfig()
  .then(() => loadEntries())
  .then(connectSSE)
  .catch(err => {
    console.error(err);
    setStatus('API offline');
  });


// PWA service worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
