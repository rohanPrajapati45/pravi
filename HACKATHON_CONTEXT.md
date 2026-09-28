# Hackathon Context — Read This First

This file is background for whichever AI coding agent (or human) is working in this
repo. **Nothing about the actual problem statement is known yet.** Everything below
is preparation context, not a spec. When the real problem is announced, re-read this
file, map the problem onto the closest pattern described here, and build inside the
existing folder structure — don't restructure the repo from scratch.

---

## 1. The event, in one paragraph

This is a recruitment-linked hackathon run by **Pravi Research** (a governance
consulting firm — "A KCL Group Company" — that builds digital public
infrastructure and process-reengineering solutions for state governments and
multilateral agencies) at Nirma University, as part of their **Build for Billions
Hackathon (Campus Placement Drive Edition)**. Process: resume submission → shortlist
→ hackathon → placement interview → offer of a final-semester internship followed
by a full-time **Associate - Tech** role based in Gandhinagar.

**Duration — ** One communication described it as an 8-hour
hackathon
Don't hardcode a fixed duration into the timeline below — confirm on the day and
scale the phase plan in Section 6 proportionally.

## 2. What Pravi is actually evaluating

From the official "Associate - Tech" JD, they're looking for, in rough priority order:

- **System design instinct** — data structures, APIs, databases, modern dev practices
- **Speed of iteration** — prototype fast, test assumptions, ship working solutions
- **Comfort with ambiguity** — high ownership across the whole project lifecycle
- **Bias for action** — turn vague functional/domain requirements into working UX
- **Ability to ask the right questions**, not just produce code
- Ability to **explain** the architecture and how it would scale to population level

Key responsibilities they list for the actual role: design/build/test/maintain
features across the full stack, contribute a well-informed view on scalable
architecture, integrate internal/external systems, and document what's shipped.

**Read for this:** they are not grading a polished UI. They are grading whether you
can take an ambiguous governance problem, reduce it to an MVP, build the core
workflow, and *talk convincingly* about how it scales to millions of users. A
working core loop + a clear scalability story beats a half-finished feature list.

## 3. Likely problem space (unconfirmed — pattern-matching only)

Pravi's hackathon brief frames the challenge around "systems that work at scale, for
people, for Bharat" and explicitly expects full-stack development, system design,
integrations, and documentation. Their broader service lines (from their own
materials) are: strategy consulting, government process re-engineering, project
management, technology/data-led transformation, market research, and public
outreach — so problems are likely to be **citizen-facing or government-internal
service/workflow systems**, e.g.:

- Citizen grievance / complaint management
- Government scheme discovery & beneficiary eligibility
- Document / application tracking
- Healthcare or education service access
- Urban infrastructure / transportation / public works tracking
- Welfare scheme eligibility & disbursement
- Government employee workflow tools
- Public infrastructure monitoring / dashboards

Two **illustrative** problem statements Pravi has given to other colleges in this
same recruitment format (not confirmed for this cohort, but useful as calibration):

1. **Family ID in Gujarat** — a common family-level identity/data layer so multiple
   welfare schemes can determine eligibility and manage beneficiaries without
   re-collecting the same information from citizens.
2. **Construction / infrastructure workflow management** — an enhanced project and
   workflow management system for improved infrastructure delivery (planning →
   execution → inspection → approval → completion).

Whatever the real problem is tomorrow, it will very likely reduce to some version
of: **Actor(s) + Process/Workflow + Data**, with roles, approvals, and an audit
trail. Section 4 gives the reusable model for this.

## 4. Reusable mental model for governance-style problems

Almost any problem in this space decomposes into the same shape:

```
                USERS (roles)
                   │
              USER JOURNEY
                   │
             REQUIREMENTS
                   │
            CORE ENTITIES
                   │
               DATABASE
                   │
                  APIs
                   │
               FRONTEND
                   │
               WORKFLOW
                   │
              SCALABILITY STORY
                   │
                  DEMO
```

Four mechanisms show up in almost every governance system and are worth having
ready as reusable patterns (not pre-built — just mentally rehearsed):

- **RBAC** — a small set of roles (e.g. Citizen/Applicant, Officer/Admin, Approver)
  each with a defined set of permissions.
- **Workflow / status state machine** — e.g.
  `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED/REJECTED → COMPLETED`, with each
  transition tied to a role and an action.
- **Audit trail** — every state-changing action logs `user, action, entity,
  entity_id, timestamp`. Cheap to build, and it's the kind of thing that visibly
  signals "I understand governance software," not just "I can CRUD."
- **Eligibility / rules pattern** (if the problem involves determining who
  qualifies for something) — separate `entity data` + `rules` so eligibility is
  computed, not hardcoded per user:
  `Data + Rules → Eligibility Engine → Eligible/Not Eligible`.

## 5. Default architecture & stack

Chosen for speed of setup over "impressive" tech — the goal is to spend hackathon
hours on the problem, not the environment.

**Primary stack:**
- Frontend: **Next.js + TypeScript + Tailwind CSS**
- Backend: **Node.js + Express**
- Database: **PostgreSQL via Supabase** (relational — fits family/scheme/project
  data well) + **Supabase Auth** (don't hand-roll auth unless the problem itself is
  about auth)
- File storage (only if the problem needs uploads): **Supabase Storage** or
  **Cloudinary** — never store files in the database directly
- API testing: **Postman**
- Deployment (optional, local-first is fine): **Vercel** (frontend), **Render**
  (backend)

**NoSQL fallback**, only if the actual problem is clearly document-shaped rather
than relational: **MongoDB Atlas** + **JWT + bcrypt** for auth.

**High-level flow:**
```
USERS → FRONTEND → REST API → BUSINESS LOGIC + AUTH/RBAC → DATABASE
                                        │
                          ┌─────────────┼──────────────┐
                          ↓             ↓               ↓
                        Cache        Storage      External/Gov APIs
                        (Redis)     (S3/etc.)
```

**If asked "how would this scale to the whole state?" — the answer, conceptually:**
keep it a modular monolith to move fast; keep the API layer stateless so it can sit
behind a load balancer; add DB indexes on commonly-filtered fields, then read
replicas as read traffic grows; use Redis for frequently-read data and rate
limiting; move heavy/slow operations (notifications, report generation, bulk
processing) to an async queue + workers; keep files in object storage, never in the
transactional DB; and don't duplicate other departments' data — integrate via APIs
and treat a shared ID (like a Family ID) as a reference layer, not a copy.

**AI/ML, if the problem calls for it:** bolt it on as a separate service, don't
weave it into the core workflow.
```
Node/Express API → Python/FastAPI service → model/LLM → result → Postgres/Mongo
```
If the AI call fails, the core app must still work.

## 6. Time-boxing template (scale to actual confirmed duration)

Treat this as percentages of total time, not fixed hours — confirm the real
duration on the day and redo the math.

| Phase | % of total time | What happens |
|---|---|---|
| Understand | ~5–8% | Write down users, current workflow, pain points, requirements, constraints, success metric |
| Design | ~5–8% | Draw the flow (Section 4), design the DB schema |
| Setup | ~10% | Git, DB, env, frontend/backend boot — should be near-zero if this boilerplate is ready |
| Build core | ~35–45% | Database → API → frontend → the single main user journey, end to end |
| Secondary features | ~10–15% | RBAC, search/filters, notifications, documents — only if P0 is done |
| Dashboard & polish | ~10% | Make the demo visually convincing; seed realistic sample data |
| Test | ~5% | Walk the full user journey once, end to end |
| Scalability pass | ~5% | Add what's realistic (indexes, pagination) + rehearse the scaling explanation |
| Demo prep | ~5% | Problem → solution → architecture → features → stack → scalability → impact → future |

**MVP discipline — classify features before building anything:**
- **P0 (must work):** login, dashboard, core entity creation, core workflow, main
  user journey, database
- **P1 (should work):** search, filters, role-based views, notifications, documents
- **P2 (if time):** analytics, AI, advanced visualization, maps, automation

Rule: if P0 isn't done, don't touch P2.

## 7. Demo data

An empty dashboard demos badly. Before the demo pass, generate realistic fake seed
data proportional to the domain (tens of entities, not thousands) so charts and
lists aren't empty. Don't hand-write this — generate it programmatically once the
schema is known.
just keep this in context only generate whenever it is reuired only after asking 

## 8. What NOT to do

Don't introduce, in an 8–24 hour window: Kubernetes, Kafka, a microservices split,
GraphQL, a Redis cluster, a full ML pipeline, Terraform, or a real CI/CD pipeline.
Explain how you *would* evolve toward these — don't try to build them. MVP first,
architecture explanation second, advanced scaling talk third.

## 9. Env vars this project will need (values filled in once known, never committed)

```
# Supabase
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
DATABASE_URL=

# MongoDB (fallback path only)
MONGODB_URI=

# Cloudinary (only if file uploads are needed)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# App
PORT=
JWT_SECRET=
```

## 10. Instructions for the coding agent

- Treat this file as living context, not a spec to implement literally — nothing
  above is the confirmed problem statement.
- When the real problem is given, fill in `docs/requirements-template.md`,
  `docs/architecture-template.md`, `docs/schema-template.md`, and
  `docs/api-endpoints-template.md` first, in that order, before writing feature code.
- Reuse the folder structure and stub components already in the repo — don't
  regenerate the skeleton.
- Prefer the primary stack (Section 5) unless the announced problem is clearly
  better suited to the NoSQL fallback.
- Keep RBAC, workflow states, and audit logging in mind as default patterns for
  whatever entities the real problem turns out to need (Section 4).
