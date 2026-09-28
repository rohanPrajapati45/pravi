# M8 — Documents

## What was built
- **Storage:** private Supabase bucket `documents` (created on demand by the API). Files go **straight from the browser to storage** using a one-time signed upload token; the database stores only metadata (`documents` table, migration `008_documents.sql`). Downloads use signed links that expire after 1 hour. The secret key stays on the backend.
- **Allowed files:** PDF, JPEG/PNG/WebP, Word (.docx), Excel (.xlsx), up to 20 MB. Document types: DPR, Drawing, As-built, Contract, Completion certificate, Inspection report, Test report, Invoice, Warranty, Photo, Other.
- **API:**
  - `POST /documents/sign` — checks scope, type and size, and returns `{path, token, bucket}`.
  - `POST /documents` — registers the file. The server checks that the path belongs to this record and that the file exists in storage, so a forged or never-uploaded path gets a 400. It writes `DOCUMENT_ADDED` on the asset timeline (for a work, on each asset it creates or repairs) and an audit entry.
  - `GET /documents?asset_id=|work_id=` — the asset view also includes documents of the work that built the asset (the DPR, drawings and contract follow the asset). Each row has the uploader, size, timestamp, a signed `url` and `can_delete`.
  - `DELETE /documents/:id` — soft delete, allowed for the uploader or HQ/EE in scope. It writes `DOCUMENT_REMOVED` and an audit entry.
- **Access:** jurisdiction rules match the asset and work screens. A contractor can upload to and see only their own contracts; the other firm gets a 403.
- **Screens:** the Asset 360 → **Documents** tab and a **Documents** card on the work journey page. Both group documents by type, show file type, size, uploader and upload time, and have Open and Remove (by permission) buttons. The upload dialog takes a file, document type, title and description.
- **Seed:** 17 generated PDFs. The hero bridge has DPR, drawing, contract, completion certificate, as-built and inspection report; the Sanand–Dholka road work has DPR, contract and test report; handed-over works have completion certificates.

## How to test
```bash
cd backend && node --experimental-websocket scripts/smoke-m8.mjs   # 21 checks; removes its own files afterwards
```
In the UI:
1. Log in as the Daskroi AE and open `RDB-BR-000001` → Documents.
2. Open the DPR, then upload a PDF. It appears under its type and on the Timeline.
3. As the EE, remove it.

## DoD
Upload, list, preview/download and delete-by-permission all work ✔ · no file bytes stored in the DB ✔ · secrets never reach the frontend ✔ · jurisdiction and contractor isolation ✔.
