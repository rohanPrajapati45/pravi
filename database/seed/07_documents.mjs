import { createClient } from "@supabase/supabase-js";

const BUCKET = "documents";
const MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];

// Minimal single-page PDF so demo documents open in any browser. ASCII only.
function makePdf(title, lines) {
  const ascii = (text) => text.replace(/[–—]/g, "-").replace(/₹/g, "Rs ").replace(/[^\x20-\x7E]/g, "");
  const esc = (text) => ascii(text).replace(/[\\()]/g, (match) => `\\${match}`);
  const body = [
    "BT", "/F1 20 Tf", "60 770 Td", `(${esc(title)}) Tj`, "/F1 11 Tf", "0 -30 Td",
    ...lines.flatMap((line, index) => (index === 0 ? [`(${esc(line)}) Tj`] : ["0 -17 Td", `(${esc(line)}) Tj`])),
    "0 -40 Td", "/F1 9 Tf", "(GujInfra 360 - fictitious demo document for the Build for Billions hackathon. Not an official record.) Tj", "ET"
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

export const documentsStep = {
  name: "demo documents (DPR, drawings, contracts, certificates)",
  async run(client, context) {
    const { rows: existing } = await client.query("select 1 from documents limit 1");
    if (existing.length) return;

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
    const bucket = await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: "20MB", allowedMimeTypes: MIME });
    if (bucket.error && !/already exists/i.test(bucket.error.message)) throw new Error(`Documents bucket: ${bucket.error.message}`);

    const ee = context.userIds?.["ee.ahmedabad@gujinfra.example"] ?? null;
    const ae = context.userIds?.["ae.daskroi@gujinfra.example"] ?? null;
    const contractor = context.userIds?.["contractor.aarav@gujinfra.example"] ?? null;

    const { rows: heroRows } = await client.query(
      `select a.id as asset_id, a.asset_code, a.name, w.id as work_id, w.work_code, w.title, w.contract_value, w.start_date, w.actual_end, c.name as contractor
         from assets a join works w on w.id = a.origin_work_id left join contractors c on c.id = w.contractor_id where a.asset_code = 'RDB-BR-000001'`
    );
    const { rows: roadRows } = await client.query(`select id as work_id, work_code, title, estimated_cost from works where title like 'Sanand–Dholka link road%' limit 1`);
    const { rows: handedOver } = await client.query(
      `select w.id as work_id, w.work_code, w.title, w.actual_end, w.contract_value, c.name as contractor, a.asset_code
         from works w join assets a on a.origin_work_id = w.id left join contractors c on c.id = w.contractor_id
        where w.status = 'HANDED_OVER' and a.asset_code <> 'RDB-BR-000001' order by w.work_code limit 10`
    );

    const docs = [];
    const add = (owner, ownerId, docType, title, lines, uploadedBy, fileName) => docs.push({ owner, ownerId, docType, title, lines, uploadedBy, fileName });

    const hero = heroRows[0];
    if (hero) {
      const facts = [`Work: ${hero.work_code} - ${hero.title}`, `Asset: ${hero.asset_code} - ${hero.name}`, `Contractor: ${hero.contractor ?? "-"}`];
      add("work", hero.work_id, "DPR", "Detailed Project Report — Daskroi River Bridge", [...facts, "Scope: 6-span PSC box girder bridge, 186 m, IRC Class AA loading.", "Hydraulic study, scour analysis and cost estimate enclosed (demo)."], ee, "DPR_Daskroi_River_Bridge.pdf");
      add("work", hero.work_id, "DRAWING", "General arrangement drawing", [...facts, "Drawing no. GA-01 Rev C - plan, elevation and cross-section (demo)."], ae, "GA-01_General_Arrangement.pdf");
      add("work", hero.work_id, "CONTRACT", "Contract agreement", [...facts, `Contract value: Rs ${Number(hero.contract_value ?? 0).toLocaleString("en-IN")}`, "Defect liability period: 24 months from completion."], ee, "Contract_Agreement.pdf");
      add("work", hero.work_id, "COMPLETION_CERTIFICATE", "Completion certificate", [...facts, `Completed on: ${hero.actual_end ?? "-"}`, "Joint final inspection held; punch list cleared."], ee, "Completion_Certificate.pdf");
      add("work", hero.work_id, "AS_BUILT", "As-built drawings", [...facts, "As-built set AB-01 to AB-12 reflecting construction changes (demo)."], contractor, "As_Built_Drawings.pdf");
      add("asset", hero.asset_id, "INSPECTION_REPORT", "Post-monsoon inspection report", [...facts, "Bearings, expansion joints and deck surveyed; minor joint seal wear noted (demo)."], ae, "Inspection_Report_Post_Monsoon.pdf");
    }
    const road = roadRows[0];
    if (road) {
      const facts = [`Work: ${road.work_code} - ${road.title}`];
      add("work", road.work_id, "DPR", "Detailed Project Report — Sanand–Dholka link road", [...facts, "Alignment, traffic survey (PCU) and pavement design enclosed (demo).", `Estimate: Rs ${Number(road.estimated_cost ?? 0).toLocaleString("en-IN")}`], ee, "DPR_Sanand_Dholka.pdf");
      add("work", road.work_id, "CONTRACT", "Contract agreement", [...facts, "Construction period 12 months; DLP 24 months (demo)."], ee, "Contract_Agreement.pdf");
      add("work", road.work_id, "TEST_REPORT", "Soil investigation report", [...facts, "CBR values at 6 test pits; subgrade design CBR 6% (demo)."], ae, "Soil_Investigation.pdf");
    }
    for (const work of handedOver) {
      add("work", work.work_id, "COMPLETION_CERTIFICATE", "Completion certificate", [`Work: ${work.work_code} - ${work.title}`, `Asset: ${work.asset_code}`, `Contractor: ${work.contractor ?? "-"}`, `Completed on: ${work.actual_end ?? "-"}`], ee, "Completion_Certificate.pdf");
    }

    for (const doc of docs) {
      const buffer = makePdf(doc.title, doc.lines);
      const path = `${doc.owner}/${doc.ownerId}/seed-${doc.docType.toLowerCase()}-${doc.fileName}`;
      const upload = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: "application/pdf", upsert: true });
      if (upload.error) throw new Error(`Upload ${path}: ${upload.error.message}`);
      await client.query(
        `insert into documents (asset_id, work_id, doc_type, title, file_path, file_name, mime_type, size_bytes, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, 'application/pdf', $7, $8) on conflict (file_path) do nothing`,
        [doc.owner === "asset" ? doc.ownerId : null, doc.owner === "work" ? doc.ownerId : null, doc.docType, doc.title, path, doc.fileName, buffer.length, doc.uploadedBy]
      );
    }
    context.insertedDocuments = docs.length;
  }
};
