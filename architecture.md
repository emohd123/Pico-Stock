# pCloud Intelligence System — Architecture

## Overview

pCloud is a smart file indexing, understanding, and retrieval system built inside the Pico Stock admin dashboard. It scans a local pCloud sync drive (default: `P:\`), indexes every file, extracts text from supported types, and uses multi-layer analysis to classify each file with confidence scoring.

## Directory Structure

```
lib/pcloud/
├── store.js              # Supabase CRUD for all 6 tables
├── scanner.js            # Recursive file system scanner
├── fileTypeResolver.js   # Extension → MIME/category mapper
├── pathAnalyzer.js       # Folder structure → context inference
├── filenameAnalyzer.js   # Filename tokens → metadata inference
├── contentExtractor.js   # Text extraction (PDF, DOCX, XLSX, PPTX, TXT, CSV)
├── providers.js          # OCR/STT/Vision stubs (plug in later)
├── orchestrator.js       # 5-layer understanding pipeline
└── demo.js               # 21 realistic demo file records

app/api/pcloud/
├── scan/route.js         # POST — trigger scan + indexing
├── files/route.js        # GET — list/search files
├── files/[id]/route.js   # GET — file details
├── review/route.js       # GET/PUT — review queue
├── stats/route.js        # GET — dashboard stats
└── seed/route.js         # POST — load demo data

app/admin/pcloud/
├── page.js               # Dashboard
├── inventory/page.js     # File inventory table
├── files/[id]/page.js    # File detail view
└── review/page.js        # Review queue

supabase/
└── pcloud_schema.sql     # 6 tables with RLS
```

## Understanding Pipeline

```
File on Disk
  → Layer 1: fs.stat() metadata (size, dates, MIME)
  → Layer 2: Path context (folder names → client/project/campaign)
  → Layer 3: Filename tokens (type, version, status, date)
  → Layer 4: Content extraction (PDF/DOCX/XLSX/PPTX/CSV/TXT)
  → Layer 5: Classification (merge signals → confidence 0–1)
  → Persist to Supabase
  → If confidence < 0.6 → add to review queue
```

## Supported File Types

| Type | Extraction | Notes |
|------|-----------|-------|
| PDF | ✅ Text extraction | via pdf-parse |
| DOCX | ✅ Text extraction | via jszip (XML parsing) |
| XLSX | ✅ Sheet content | via xlsx library |
| PPTX | ✅ Slide text | via jszip |
| TXT/CSV/MD/JSON | ✅ Direct read | Native fs |
| JPG/PNG/WEBP | 📋 Metadata only | OCR stub ready |
| MP3/WAV/M4A | 📋 Metadata only | STT stub ready |
| MP4/MOV | 📋 Metadata only | Vision stub ready |
| PSD/AI/INDD | 📋 Metadata only | Design files indexed |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PCLOUD_SOURCE_ROOT` | `P:\` | Root path for file scanning |

## How to Run Locally

1. Run the schema SQL in Supabase Dashboard → SQL Editor
2. Add `PCLOUD_SOURCE_ROOT=P:\` to `.env.local`
3. Start the dev server: `npm run dev`
4. Navigate to `/admin/pcloud`
5. Click "Load Demo Data" (or "Scan" if P:\ is connected)

## How to Point to Real P:\ Drive

1. Ensure pCloud is synced and mounted at `P:\`
2. Set `PCLOUD_SOURCE_ROOT=P:\` in `.env.local`
3. Click "Scan P:\ Drive" on the pCloud dashboard
4. The system will recursively index all files

## What's Stubbed for Later

- **OCR Provider** — ready for Tesseract.js or cloud vision
- **Speech-to-Text Provider** — ready for Whisper API
- **Vision Provider** — ready for GPT-4o/Gemini vision
- **AI Search** — semantic search over indexed content
- **Audit Logs** — user action tracking
