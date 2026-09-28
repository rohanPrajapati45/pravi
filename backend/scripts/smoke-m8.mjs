// M8 documents API smoke test: node --experimental-websocket scripts/smoke-m8.mjs
// Writes a few "Smoke …" documents on non-hero records, then removes them and their files.
import { createClient } from "@supabase/supabase-js";
import { call, check, login, summary } from "./_client.mjs";

const hq = await login("hq@gujinfra.example");
const ee = await login("ee.ahmedabad@gujinfra.example");
const kiran = await login("ae.daskroi@gujinfra.example");
const pooja = await login("ae.olpad@gujinfra.example");
const aarav = await login("contractor.aarav@gujinfra.example");
const kaveri = await login("contractor.kaveri@gujinfra.example");
const created = [];

// ---- seeded documents: an asset's file includes its origin work's documents ----
const hero = (await call(hq, "/assets/lookup?code=RDB-BR-000001")).body.data;
const heroDocs = (await call(hq, `/documents?asset_id=${hero.id}`)).body.data;
const types = new Set(heroDocs.map((doc) => doc.doc_type));
check("Hero asset file: own + origin-work documents", ["DPR", "DRAWING", "CONTRACT", "COMPLETION_CERTIFICATE", "AS_BUILT", "INSPECTION_REPORT"].every((type) => types.has(type)), `${heroDocs.length} documents`);
const pdf = await fetch(heroDocs.find((doc) => doc.doc_type === "DPR").url);
const head = Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString();
check("Signed link downloads the real file (PDF)", pdf.ok && head === "%PDF-", `${pdf.status} ${head}`);
check("Secrets never reach the client (no storage keys in payload)", !JSON.stringify(heroDocs).match(/sb_secret|service_role|SUPABASE_SECRET/i));
check("Surat AE cannot see Daskroi documents -> 403", (await call(pooja, `/documents?asset_id=${hero.id}`)).status === 403);
check("Must pass exactly one owner -> 400", (await call(hq, "/documents")).status === 400);

// ---- upload flow (AE on an asset in their sub-division) ----
const target = (await call(kiran, "/assets?limit=50&sort=code")).body.data.find((row) => row.asset_code !== "RDB-BR-000001" && !row.parent_id);
const body = Buffer.from("%PDF-1.4\n% smoke test document\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
async function upload(token, ownerType, ownerId, title) {
  const sign = await call(token, "/documents/sign", { method: "POST", body: { owner_type: ownerType, owner_id: ownerId, file_name: "Smoke test.pdf", content_type: "application/pdf", size_bytes: body.length } });
  if (sign.status !== 201) return { sign };
  const put = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/upload/sign/documents/${sign.body.data.path}?token=${sign.body.data.token}`, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body });
  const saved = await call(token, "/documents", {
    method: "POST",
    body: { owner_type: ownerType, owner_id: ownerId, doc_type: "INSPECTION_REPORT", title, path: sign.body.data.path, file_name: "Smoke test.pdf", mime_type: "application/pdf", size_bytes: body.length }
  });
  if (saved.body.data?.id) created.push({ id: saved.body.data.id, path: sign.body.data.path });
  return { sign, put, saved };
}

const aeUpload = await upload(kiran, "asset", target.id, "Smoke test report");
check("AE uploads a document (sign → direct upload → register)", aeUpload.put?.ok && aeUpload.saved?.status === 201, target.asset_code);
const listed = (await call(kiran, `/documents?asset_id=${target.id}`)).body.data.find((doc) => doc.id === aeUpload.saved.body.data.id);
check("Listed with uploader, size and a working download link", listed?.uploaded_by_name === "Kiran Solanki" && listed.size_bytes === body.length && Boolean(listed.url) && listed.can_delete === true);
const timeline = (await call(kiran, `/assets/${target.id}/timeline`)).body.data.map((event) => event.event_type);
check("Upload recorded on the asset timeline", timeline.includes("DOCUMENT_ADDED"));

check("Unsupported type (text/plain) -> 400", (await call(kiran, "/documents/sign", { method: "POST", body: { owner_type: "asset", owner_id: target.id, file_name: "x.txt", content_type: "text/plain", size_bytes: 10 } })).status === 400);
check("Over 20 MB -> 400", (await call(kiran, "/documents/sign", { method: "POST", body: { owner_type: "asset", owner_id: target.id, file_name: "big.pdf", content_type: "application/pdf", size_bytes: 25 * 1024 * 1024 } })).status === 400);
const tampered = await call(kiran, "/documents", {
  method: "POST",
  body: { owner_type: "asset", owner_id: target.id, doc_type: "OTHER", title: "Tampered path", path: `asset/${hero.id}/x.pdf`, file_name: "x.pdf", mime_type: "application/pdf", size_bytes: 10 }
});
check("Path belonging to another record -> 400", tampered.status === 400);
const ghost = await call(kiran, "/documents", {
  method: "POST",
  body: { owner_type: "asset", owner_id: target.id, doc_type: "OTHER", title: "Never uploaded", path: `asset/${target.id}/never-uploaded.pdf`, file_name: "x.pdf", mime_type: "application/pdf", size_bytes: 10 }
});
check("Registering a file that was never uploaded -> 400", ghost.status === 400);
check("Surat AE cannot upload to a Daskroi asset -> 403", (await call(pooja, "/documents/sign", { method: "POST", body: { owner_type: "asset", owner_id: target.id, file_name: "x.pdf", content_type: "application/pdf", size_bytes: 10 } })).status === 403);

// ---- contractors: only their own contracts ----
const aaravWorks = (await call(aarav, "/works?limit=50&active=false")).body.data.filter((work) => !/Daskroi River|Sanand–Dholka/.test(work.title));
const ownWork = aaravWorks.find((work) => work.contractor_name?.startsWith("Aarav"));
const cUpload = ownWork ? await upload(aarav, "work", ownWork.id, "Smoke test contractor upload") : null;
check("Contractor uploads to their own contract", cUpload?.saved?.status === 201, ownWork?.work_code);
check("Other contractor cannot upload to it -> 403", ownWork ? (await call(kaveri, "/documents/sign", { method: "POST", body: { owner_type: "work", owner_id: ownWork.id, file_name: "x.pdf", content_type: "application/pdf", size_bytes: 10 } })).status === 403 : false);

// ---- delete by permission (soft delete) ----
check("Another AE cannot delete it -> 403", (await call(pooja, `/documents/${aeUpload.saved.body.data.id}`, { method: "DELETE" })).status === 403);
check("Contractor cannot delete an AE's document -> 403", (await call(aarav, `/documents/${aeUpload.saved.body.data.id}`, { method: "DELETE" })).status === 403);
const removed = await call(ee, `/documents/${aeUpload.saved.body.data.id}`, { method: "DELETE" });
check("Responsible EE removes it -> 200", removed.status === 200);
check("Removed document no longer listed", !(await call(kiran, `/documents?asset_id=${target.id}`)).body.data.some((doc) => doc.id === aeUpload.saved.body.data.id));
check("Removing twice -> 404", (await call(ee, `/documents/${aeUpload.saved.body.data.id}`, { method: "DELETE" })).status === 404);
if (cUpload?.saved?.body?.data?.id) check("Uploader removes their own document -> 200", (await call(aarav, `/documents/${cUpload.saved.body.data.id}`, { method: "DELETE" })).status === 200);

// Tidy: drop the smoke files from storage (rows stay soft-deleted for the audit trail).
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
await supabase.storage.from("documents").remove(created.map((item) => item.path));
void hq;

summary("M8");
