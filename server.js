const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();

const PORT = process.env.PORT || 3026;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'plb.sqlite');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const STATUSES = ['Needs Follow-up', 'Followed up with', 'Needs more training', 'Repeat Offender'];
const DEFAULT_STATUS = STATUSES[0];

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL;');
  db.run('PRAGMA synchronous = NORMAL;');
  db.run(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store TEXT NOT NULL,
      zone TEXT NOT NULL,
      ocl TEXT,
      olpn TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  // Migrate older databases that predate photos/status/notes/selector.
  db.all('PRAGMA table_info(entries)', [], (err, columns) => {
    if (err) return console.error('Could not inspect schema', err);
    const names = new Set(columns.map(c => c.name));
    const migrations = [];
    if (!names.has('notes')) migrations.push("ALTER TABLE entries ADD COLUMN notes TEXT DEFAULT ''");
    if (!names.has('status')) migrations.push(`ALTER TABLE entries ADD COLUMN status TEXT DEFAULT '${DEFAULT_STATUS}'`);
    if (!names.has('images')) migrations.push("ALTER TABLE entries ADD COLUMN images TEXT DEFAULT '[]'");
    if (!names.has('updated_at')) migrations.push('ALTER TABLE entries ADD COLUMN updated_at TEXT');
    if (!names.has('selector')) migrations.push("ALTER TABLE entries ADD COLUMN selector TEXT DEFAULT ''");
    db.serialize(() => {
      for (const sql of migrations) db.run(sql, err2 => { if (err2) console.error('Migration failed:', sql, err2); });
      db.run("UPDATE entries SET status = ? WHERE status IS NULL OR status = ''", [DEFAULT_STATUS]);
      db.run("UPDATE entries SET images = '[]' WHERE images IS NULL");
      db.run('UPDATE entries SET updated_at = created_at WHERE updated_at IS NULL');
    });
  });
});

const imageExtensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, done) => done(null, `${crypto.randomUUID()}${imageExtensions[file.mimetype] || ''}`)
  }),
  fileFilter: (req, file, done) => {
    if (!imageExtensions[file.mimetype]) return done(new Error('Only JPG, PNG, WEBP, or HEIC pictures are supported.'));
    return done(null, true);
  },
  limits: { fileSize: 12 * 1024 * 1024, files: 3 }
});

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));

// If you iframe this app from another subdomain, set CORS via env:
// CORS_ORIGIN=https://superdash.andytalbert.com
const CORS_ORIGIN = process.env.CORS_ORIGIN;
if (CORS_ORIGIN) {
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR, {
  index: false,
  fallthrough: false,
  maxAge: '1d',
  setHeaders: response => response.setHeader('X-Content-Type-Options', 'nosniff')
}));

// --- simple SSE broadcast (single server instance) ---
const sseClients = new Set();
function broadcastChanged() {
  for (const res of sseClients) {
    try { res.write('data: changed\n\n'); } catch {}
  }
}

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write('data: changed\n\n'); // initial ping

  sseClients.add(res);
  req.on('close', () => {
    sseClients.delete(res);
  });
});

// --- helpers ---
function rowToEntry(row) {
  let images = [];
  try { images = JSON.parse(row.images || '[]'); } catch { images = []; }
  return {
    id: row.id,
    store: row.store,
    zone: row.zone,
    ocl: row.ocl ?? '',
    olpn: row.olpn,
    selector: row.selector ?? '',
    notes: row.notes ?? '',
    status: row.status || DEFAULT_STATUS,
    images,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at
  };
}

function removeUploadedFiles(files) {
  const all = Object.values(files || {}).flat();
  for (const file of all) fs.rm(file.path, { force: true }, () => {});
}

function removeImageFile(image) {
  if (!image?.filename) return;
  const resolved = path.join(UPLOAD_DIR, path.basename(image.filename));
  fs.rm(resolved, { force: true }, () => {});
}

function imageRecords(files, kind) {
  return (files || []).map(file => ({
    id: crypto.randomUUID(),
    filename: file.filename,
    kind,
    originalName: String(file.originalname || 'picture').slice(0, 180),
    mimeType: file.mimetype,
    size: file.size
  }));
}

// --- API ---
app.get('/api/config', (req, res) => res.json({ statuses: STATUSES }));

app.get('/api/entries', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  db.all('SELECT * FROM entries ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    let entries = rows.map(rowToEntry);
    if (q) {
      entries = entries.filter(e => [e.store, e.zone, e.ocl, e.olpn, e.selector, e.notes, e.status]
        .some(value => String(value || '').toLowerCase().includes(q)));
    }
    res.json({ ok: true, entries });
  });
});

app.post('/api/entries', upload.fields([
  { name: 'palletPhotos', maxCount: 2 },
  { name: 'labelPhoto', maxCount: 1 }
]), (req, res) => {
  try {
    const { store, olpn, zone, ocl, selector, notes } = req.body || {};
    if (!store || !olpn || !zone || !selector) {
      removeUploadedFiles(req.files);
      return res.status(400).json({ ok: false, error: 'Store, oLPN, Zone, and Selector are required' });
    }
    const images = [
      ...imageRecords(req.files?.palletPhotos, 'pallet'),
      ...imageRecords(req.files?.labelPhoto, 'label')
    ];
    const now = new Date().toISOString();
    db.run(
      'INSERT INTO entries (store, zone, ocl, olpn, selector, notes, status, images, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [
        String(store).trim(),
        String(zone).trim(),
        ocl ? String(ocl).trim() : '',
        String(olpn).trim(),
        String(selector).trim().slice(0, 120),
        notes ? String(notes).trim().slice(0, 1000) : '',
        DEFAULT_STATUS,
        JSON.stringify(images),
        now,
        now
      ],
      function (err) {
        if (err) {
          removeUploadedFiles(req.files);
          return res.status(500).json({ ok: false, error: err.message });
        }
        const entry = rowToEntry({
          id: this.lastID,
          store, zone, ocl, olpn, selector, notes,
          status: DEFAULT_STATUS,
          images: JSON.stringify(images),
          created_at: now,
          updated_at: now
        });
        res.json({ ok: true, entry });
        broadcastChanged();
      }
    );
  } catch (error) {
    removeUploadedFiles(req.files);
    res.status(400).json({ ok: false, error: error.message || 'Request could not be completed.' });
  }
});

app.patch('/api/entries/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ ok: false, error: 'Invalid status' });
  }
  const now = new Date().toISOString();
  db.run('UPDATE entries SET status = ?, updated_at = ? WHERE id = ?', [status, now, req.params.id], function (err) {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    if (this.changes === 0) return res.status(404).json({ ok: false, error: 'Entry not found' });
    db.get('SELECT * FROM entries WHERE id = ?', [req.params.id], (err2, row) => {
      if (err2 || !row) return res.status(500).json({ ok: false, error: err2?.message || 'Entry not found' });
      res.json({ ok: true, entry: rowToEntry(row) });
      broadcastChanged();
    });
  });
});

app.delete('/api/entries/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM entries WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    if (!row) return res.status(404).json({ ok: false, error: 'Entry not found' });
    db.run('DELETE FROM entries WHERE id = ?', [id], function (err2) {
      if (err2) return res.status(500).json({ ok: false, error: err2.message });
      const entry = rowToEntry(row);
      for (const image of entry.images) removeImageFile(image);
      res.json({ ok: true, deleted: this.changes });
      broadcastChanged();
    });
  });
});

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(400).json({ ok: false, error: error.message || 'Request could not be completed.' });
});

app.listen(PORT, () => {
  console.log(`Lox PLB Log running on http://0.0.0.0:${PORT}`);
  console.log(`SQLite DB: ${DB_PATH}`);
});
