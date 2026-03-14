# pCloud Local Indexing Worker

Standalone Node.js worker that runs on the Windows machine with the pCloud sync drive mounted, indexes real company files, and pushes results to Supabase.

## Prerequisites

- Node.js 18+
- pCloud sync drive mounted at `P:\` (or set `PCLOUD_SOURCE_ROOT`)
- Supabase tables created (run `supabase/pcloud_schema.sql`)
- `.env.local` with Supabase credentials

## Environment Variables

The worker reads from `.env.local` in the project root:

```
PCLOUD_SOURCE_ROOT=P:\
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

Optional:
```
PCLOUD_BATCH_SIZE=100           # Files per batch (default: 100)
PCLOUD_MAX_FILES=50000          # Max files per scan (default: 50000)
PCLOUD_CONFIDENCE_THRESHOLD=0.6 # Below this → review queue
```

## Commands

```bash
# Check drive access + Supabase connection
npm run pcloud:check

# Full scan — index ALL files
npm run pcloud:scan

# Incremental scan — skip unchanged files
npm run pcloud:scan:incremental

# Direct usage
node worker/index.js check
node worker/index.js scan
node worker/index.js scan --incremental
node worker/index.js reset
```

## How It Works

### Scanning
The worker recursively walks `P:\`, collecting file metadata in batches of 100. It skips system folders (`$RECYCLE.BIN`, `.git`, `node_modules`, etc.) and hidden directories.

### Incremental Indexing
For each file, the worker queries Supabase by `relative_path`. If the file's size AND modification time haven't changed, it's skipped (only `last_seen_at` is updated). Changed or new files go through the full pipeline.

### Understanding Pipeline
Each file passes through 5 layers:

1. **Metadata** — size, dates, MIME type from file system
2. **Path context** — folder names → client, project, campaign, department
3. **Filename tokens** — version, status, document type, date
4. **Content extraction** — text from PDF, DOCX, XLSX, PPTX, CSV, TXT
5. **Classification** — merge all signals → confidence score (0–1)

### Confidence & Review Queue
- Files with confidence ≥ 0.6 are indexed normally
- Files with confidence < 0.6 go to the review queue
- Files with confidence < 0.3 are marked "very low confidence"

### Safety
- **Read-only**: Never moves, renames, or deletes original files
- **Resilient**: Per-file errors are logged and don't crash the scan
- **Batched**: Processes 100 files at a time, updates progress per batch

## Troubleshooting

| Error | Solution |
|-------|----------|
| `Drive not found` | Mount pCloud and ensure P:\ is accessible |
| `Permission denied` | Run PowerShell as administrator |
| `Mapped drive unavailable` | Open a new terminal after connecting pCloud |
| `Supabase connection failed` | Check `.env.local` credentials |
| `Table not found` | Run `supabase/pcloud_schema.sql` in SQL Editor |
