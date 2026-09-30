# Lox PLB Log (Synced)

Quickly document a pallet issue: take a photo or two of the pallet, a photo of the shipping label, and scan the label's QR/barcode to capture the oLPN. Entries are stored in a shared SQLite database, synced live across users via SSE, and shown as a searchable card gallery you can sort through and triage.

## Included

- oLPN capture via camera QR/barcode scan (native `BarcodeDetector`) or manual entry
- Up to 2 pallet photos + 1 label photo per entry (JPG/PNG/WEBP/HEIC, 12 MB each)
- Store / Zone / OCL fields plus optional free-text issue notes
- Card gallery sorted newest-first, with photo thumbnails and a full-size lightbox viewer
- Per-card status: **Needs Follow-up**, **Followed up with**, **Needs more training**, **Repeat Offender**
- Live search across store, zone, oLPN, notes, and status
- Real-time sync across all connected users via Server-Sent Events
- Persistent SQLite storage (WAL mode) suitable for a small internal team

## Run locally / on VPS
```bash
cd scan
npm install
npm start
```

Default: http://localhost:3026

## Environment (optional)
- `PORT=3026`
- `DATA_DIR=/opt/lox-plb-log/data` (holds `plb.sqlite` and `uploads/`)
- `DB_PATH=/opt/lox-plb-log/data/plb.sqlite` (overrides the DB file location independently of `DATA_DIR`)
- `CORS_ORIGIN=https://your-dashboard-domain.com` (only if iframing from another origin)

## Deploy on your VPS (simple)
1. Copy folder to VPS (e.g. `/opt/lox-plb-log-sync`)
2. Install Node 18+
3. `npm install && npm start`

### Docker
```bash
docker compose up -d --build
```
Data (database + uploaded photos) persists in the local `data` folder.

### Nginx reverse proxy (recommended)
Point a subdomain (e.g. `plblog.andytalbert.com`) to your VPS and proxy to port 3026.
Make sure your Nginx block includes:
- `proxy_http_version 1.1;`
- `proxy_set_header Connection "";` (for SSE)
- `proxy_buffering off;` (for SSE)

## Backup

Back up the entire `data` directory — `data/plb.sqlite` (plus `-wal`/`-shm`) is the live database and `data/uploads` holds every attached photo.


## PWA installation
This build includes a web app manifest, 192px/512px icons, and a service worker.
For installation on phones/desktops, serve the app over HTTPS (or localhost). The Docker container itself runs on port 3026; put Nginx/Certbot in front of it for production HTTPS.

The service worker caches only the application shell. `/api/*` and `/uploads/*` stay network-only so database entries and evidence photos remain live.
# LOXerrorlog
