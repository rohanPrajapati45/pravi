// Work templates (PRD 7.5). Stage lists, tasks, checklists, durations and weights are illustrative
// and configurable — to be confirmed against the department's actual process (PRD Appendix A).
const task = (title, role, deliverables = [], extra = {}) => ({ title, role, deliverables, planned_days: 7, mandatory: true, milestone: false, weight: 0, ...extra });
const milestone = (title, weight, deliverables = ["Progress photos", "Quality test result"]) => task(title, "CONTRACTOR", deliverables, { milestone: true, weight, planned_days: 20 });

function newAssetStages(constructionMilestones) {
  return [
    {
      code: "INITIATION", name: "Initiation & mandate", kind: "GENERIC", days: 7, gate: "HQ", enter: "PROPOSED",
      checklist: ["Aligned to a programme or directive", "Responsible division assigned", "Indicative budget and target dates recorded"],
      tasks: [task("Record government mandate / order reference", "HQ", ["Order / directive reference"]), task("Assign responsible division and set target dates", "HQ", ["Initiation note"])]
    },
    {
      code: "SURVEY", name: "Survey & investigation", kind: "GENERIC", days: 30, gate: "EE",
      checklist: ["Survey complete", "Alignment / site chosen with justification", "Land, utility and environmental issues identified"],
      tasks: [
        task("Reconnaissance and alignment / site options", "AE", ["Alignment options map"]),
        task("Topographic and traffic survey", "AE", ["Survey report", "Traffic count summary"]),
        task("Soil investigation", "AE", ["Soil test report"]),
        task("Land, utility and environmental screening", "AE", ["Screening note"])
      ]
    },
    {
      code: "DESIGN", name: "Design & estimate (DPR)", kind: "DESIGN", days: 30, gate: "EE",
      checklist: ["Design meets specifications", "Estimate reconciles with BoQ", "Construction schedule is realistic"],
      tasks: [
        task("Prepare drawings and specifications", "AE", ["Drawings reference"]),
        task("Bill of quantities and cost estimate", "AE", ["BoQ reference", "Cost estimate"]),
        task("Construction schedule", "AE", ["Schedule"])
      ]
    },
    {
      code: "APPROVALS", name: "Approvals & clearances", kind: "APPROVAL", days: 21, gate: "COST_LIMIT", pass: "ADMIN_APPROVED",
      checklist: ["Technical sanction recorded", "Administrative approval within the approver's financial limit", "Clearances attached"],
      tasks: [
        task("Technical sanction note", "AE", ["TS note reference"]),
        task("Land and utility clearances", "AE", ["Clearance letters"]),
        task("Budget allocation confirmation", "HQ", ["Budget head confirmation"])
      ]
    },
    {
      code: "TENDER_AWARD", name: "Tender & award", kind: "AWARD", days: 45, gate: "HQ", enter: "TENDERED", pass: "AWARDED",
      checklist: ["Contract details complete", "Contractor linked to the work", "Defect liability period set"],
      tasks: [
        task("Publish tender (external e-procurement reference)", "EE", ["Tender reference"]),
        task("Record bid evaluation outcome", "EE", ["Evaluation minutes"]),
        task("Sign agreement and issue work order", "EE", ["Agreement number", "Work order"])
      ]
    },
    {
      code: "CONSTRUCTION", name: "Mobilisation & construction", kind: "CONSTRUCTION", days: 180, gate: "EE", enter: "IN_PROGRESS", pass: "COMPLETED",
      checklist: ["All milestones passed quality checks", "Hindrances and site instructions recorded", "Measurements recorded"],
      tasks: constructionMilestones
    },
    {
      code: "HANDOVER", name: "Completion & handover", kind: "HANDOVER", days: 30, gate: "HQ", pass: "HANDED_OVER",
      checklist: ["Punch list cleared", "As-built drawings and completion certificate attached", "Asset details verified for registration"],
      tasks: [
        task("Completion request", "CONTRACTOR", ["Completion request letter"]),
        task("Joint final inspection and punch list", "AE", ["Final inspection report"]),
        task("Punch-list rectification", "CONTRACTOR", ["Rectification photos"]),
        task("As-built drawings and completion certificate", "EE", ["As-built drawings", "Completion certificate"])
      ]
    },
    {
      // Spans the defect liability period (24 months by default).
      code: "DLP_CLOSURE", name: "DLP & closure", kind: "CLOSURE", days: 730, gate: "HQ", pass: "CLOSED",
      checklist: ["DLP defects rectified or tracked on the asset", "Contractor evaluation recorded", "Financial closure references recorded"],
      tasks: [task("End-of-DLP joint inspection", "AE", ["End-of-DLP report"]), task("Record security / retention release reference", "EE", ["Release reference"])]
    }
  ];
}

export const workTemplates = [
  {
    code: "NEW_ROAD", name: "New road", work_type: "NEW", asset_type_code: "ROAD_SEGMENT",
    description: "Government mandate → survey → DPR → approvals → tender → construction → handover → DLP & contractor closure.",
    stages: newAssetStages([
      milestone("Mobilisation and work programme", 5, ["Work programme"]),
      milestone("Earthwork and embankment", 20),
      milestone("Granular sub-base", 15),
      milestone("Base course (WMM)", 20),
      milestone("Bituminous surfacing", 25),
      milestone("Drainage and cross-drainage works", 10),
      milestone("Road markings and signage", 5)
    ])
  },
  {
    code: "NEW_BRIDGE", name: "New bridge", work_type: "NEW", asset_type_code: "BRIDGE",
    description: "As New Road, with structural design vetting and a load test before commissioning.",
    stages: newAssetStages([
      milestone("Mobilisation and work programme", 5, ["Work programme"]),
      milestone("Foundations", 25),
      milestone("Substructure", 25),
      milestone("Superstructure", 30),
      milestone("Deck, wearing coat and railings", 10),
      milestone("Load test", 5, ["Load test report"])
    ])
  },
  {
    code: "NEW_BUILDING", name: "New government building", work_type: "NEW", asset_type_code: "BUILDING",
    description: "Architectural, structural and services drawings; floor-wise milestones; equipment registered as child assets at handover.",
    stages: newAssetStages([
      milestone("Mobilisation and work programme", 5, ["Work programme"]),
      milestone("Foundation", 20),
      milestone("Structure (all floors)", 35),
      milestone("Finishing", 20),
      milestone("Electrical, lift and fire services", 20, ["Progress photos", "Services test certificate"])
    ])
  },
  {
    code: "REPAIR_REHAB", name: "Repair / rehabilitation", work_type: "REHAB", asset_type_code: null,
    description: "Short path on an existing asset: need → estimate → approval → award → execute → verify & close.",
    stages: [
      { code: "NEED_ESTIMATE", name: "Need & estimate", kind: "GENERIC", days: 14, gate: "EE", enter: "PROPOSED", checklist: ["Need established from inspection / complaint", "Estimate prepared"], tasks: [task("Condition assessment and estimate", "AE", ["Estimate reference"])] },
      { code: "APPROVALS", name: "Approval", kind: "APPROVAL", days: 14, gate: "COST_LIMIT", pass: "ADMIN_APPROVED", checklist: ["Sanction within the approver's financial limit"], tasks: [task("Sanction note", "AE", ["Sanction note reference"])] },
      { code: "TENDER_AWARD", name: "Assign / award", kind: "AWARD", days: 21, gate: "HQ", pass: "AWARDED", checklist: ["Contractor and DLP recorded"], tasks: [task("Work order", "EE", ["Work order"])] },
      { code: "CONSTRUCTION", name: "Execution", kind: "CONSTRUCTION", days: 60, gate: "EE", enter: "IN_PROGRESS", pass: "COMPLETED", checklist: ["Work executed to specification"], tasks: [milestone("Execute repair / rehabilitation", 100)] },
      { code: "HANDOVER", name: "Verify & close", kind: "HANDOVER", days: 14, gate: "EE", pass: "CLOSED", checklist: ["Asset verified and returned to service"], tasks: [task("Joint verification", "AE", ["Verification report"])] }
    ]
  },
  {
    code: "EMERGENCY", name: "Emergency works", work_type: "EMERGENCY", asset_type_code: null,
    description: "Fast track: immediate action → estimate and approval recorded after the fact → repair → close.",
    stages: [
      { code: "IMMEDIATE", name: "Immediate action", kind: "GENERIC", days: 3, gate: "EE", enter: "IN_PROGRESS", checklist: ["Site made safe", "Temporary measure in place"], tasks: [task("Make safe and record temporary measure", "AE", ["Site photos"])] },
      { code: "APPROVALS", name: "Estimate & approval (post facto)", kind: "APPROVAL", days: 7, gate: "COST_LIMIT", checklist: ["Post-facto sanction recorded"], tasks: [task("Emergency estimate", "AE", ["Estimate reference"])] },
      { code: "TENDER_AWARD", name: "Award (post facto)", kind: "AWARD", days: 7, gate: "HQ", checklist: ["Contractor and DLP recorded"], tasks: [task("Emergency work order", "EE", ["Work order"])] },
      { code: "CONSTRUCTION", name: "Repair", kind: "CONSTRUCTION", days: 30, gate: "EE", pass: "COMPLETED", checklist: ["Permanent repair complete"], tasks: [milestone("Permanent repair", 100)] },
      { code: "HANDOVER", name: "Close", kind: "HANDOVER", days: 7, gate: "EE", pass: "CLOSED", checklist: ["Asset returned to service"], tasks: [task("Joint verification", "AE", ["Verification report"])] }
    ]
  }
];

export const approvalLimits = [
  { role: "EE", work_type: null, max_amount: 20000000, label: "Executive Engineer — up to ₹2 Cr (illustrative)" },
  { role: "HQ", work_type: null, max_amount: null, label: "HQ / Chief Engineer — above ₹2 Cr (illustrative)" }
];

export async function upsertTemplates(client) {
  const ids = {};
  for (const template of workTemplates) {
    const { rows } = await client.query(
      `insert into work_templates (code, name, work_type, asset_type_code, description) values ($1, $2, $3, $4, $5)
       on conflict (code) do update set name = excluded.name, work_type = excluded.work_type, asset_type_code = excluded.asset_type_code, description = excluded.description
       returning id`,
      [template.code, template.name, template.work_type, template.asset_type_code, template.description]
    );
    ids[template.code] = rows[0].id;
    for (const [stageIndex, stage] of template.stages.entries()) {
      const { rows: stageRows } = await client.query(
        `insert into stage_templates (template_id, seq, code, name, kind, planned_days, gate_role, gate_checklist, work_status_on_enter, work_status_on_pass)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (template_id, seq) do update set code = excluded.code, name = excluded.name, kind = excluded.kind, planned_days = excluded.planned_days,
           gate_role = excluded.gate_role, gate_checklist = excluded.gate_checklist, work_status_on_enter = excluded.work_status_on_enter, work_status_on_pass = excluded.work_status_on_pass
         returning id`,
        [rows[0].id, stageIndex, stage.code, stage.name, stage.kind, stage.days, stage.gate, JSON.stringify(stage.checklist), stage.enter ?? null, stage.pass ?? null]
      );
      for (const [taskIndex, item] of stage.tasks.entries()) {
        await client.query(
          `insert into task_templates (stage_template_id, seq, title, default_assignee_role, required_deliverables, is_mandatory, planned_days, is_milestone, weight)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           on conflict (stage_template_id, seq) do update set title = excluded.title, default_assignee_role = excluded.default_assignee_role,
             required_deliverables = excluded.required_deliverables, is_mandatory = excluded.is_mandatory, planned_days = excluded.planned_days,
             is_milestone = excluded.is_milestone, weight = excluded.weight`,
          [stageRows[0].id, taskIndex, item.title, item.role, JSON.stringify(item.deliverables), item.mandatory, item.planned_days, item.milestone, item.weight]
        );
      }
    }
  }
  for (const limit of approvalLimits) {
    await client.query(
      `insert into approval_limits (role, work_type, max_amount, label) values ($1, $2, $3, $4)
       on conflict (role, work_type) do update set max_amount = excluded.max_amount, label = excluded.label`,
      [limit.role, limit.work_type, limit.max_amount, limit.label]
    );
  }
  return ids;
}
