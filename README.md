# AI Agent Workflow Builder

> A visual, no-code automation platform for chaining AI agent steps — think a mini [n8n](https://n8n.io) powered by LLMs.

**Live Demo**: [ai-agent-workflow-pearl.vercel.app](https://ai-agent-workflow-pearl.vercel.app)

---

## Features

| Category | Details |
|---|---|
| **Visual Workflow Builder** | Drag-and-drop step sequencing with a real-time JSON config editor |
| **6 Step Types** | `LLM Call` · `HTTP Request` · `DB Write` · `Notify` · `Conditional Branch` · `Approval Gate` |
| **4 Trigger Modes** | Manual UI · Inbound Webhook · Scheduled Cron · Database Event |
| **Real-time Execution** | Watch each step execute live via GraphQL subscriptions (WebSocket) |
| **Two-Layer Security** | Row-level (Hasura permissions) + Action-level (runtime role checks in serverless functions) |
| **Quota Enforcement** | Per-organization monthly run limits with automatic period resets |
| **Multi-tenant Orgs** | Owner / Editor / Viewer roles with strict data isolation |

---

## Tech Stack

```
┌─────────────────────────────────────────────────┐
│  Frontend (Vercel)                              │
│  Next.js 14 · React 18 · Tailwind 3            │
│  Apollo Client · @nhost/nhost-js v3             │
├─────────────────────────────────────────────────┤
│  Backend (Nhost Cloud)                          │
│  PostgreSQL 14 · Hasura v2.48 GraphQL Engine    │
│  Nhost Auth · Nhost Serverless Functions (Node) │
├─────────────────────────────────────────────────┤
│  AI / LLM                                      │
│  OpenRouter API (google/gemini-2.0-flash-001)   │
└─────────────────────────────────────────────────┘
```

---

## Project Structure

```
AI_agent_workflow/
├── frontend/                   # Next.js app
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                          # Login / Sign-up
│   │   │   └── dashboard/
│   │   │       ├── page.tsx                      # Workspace selector
│   │   │       └── [orgId]/
│   │   │           ├── workflows/
│   │   │           │   ├── page.tsx              # Workflow list
│   │   │           │   └── [id]/
│   │   │           │       ├── page.tsx          # Workflow builder (steps editor)
│   │   │           │       └── run/[runId]/
│   │   │           │           └── page.tsx      # Live run viewer
│   │   │           └── settings/
│   │   │               └── page.tsx              # Org settings / quota / members
│   │   └── lib/
│   │       └── nhost.tsx                         # Nhost client + Apollo provider
│   ├── tailwind.config.ts
│   └── package.json
│
├── functions/                  # Nhost serverless functions (Express handlers)
│   ├── trigger-workflow-run.ts # Executes workflow steps sequentially
│   ├── approve-step.ts        # Resumes paused approval-gate steps
│   ├── webhook-trigger.ts     # Inbound webhook endpoint
│   ├── db-event-trigger-handler.ts  # Handles database event triggers
│   ├── scheduled-trigger-handler.ts # Handles scheduled/cron triggers
│   └── notify-handler.ts      # Notification dispatcher
│
├── nhost/                      # Nhost configuration (auto-deployed)
│   ├── nhost.toml              # Auth, Hasura, Postgres, Functions config
│   ├── config.yaml
│   ├── metadata/               # Hasura metadata (permissions, relationships, actions)
│   │   ├── actions.yaml        # GraphQL actions → serverless function handlers
│   │   └── databases/default/tables/
│   │       ├── public_organizations.yaml
│   │       ├── public_org_members.yaml
│   │       ├── public_workflows.yaml
│   │       ├── public_workflow_steps.yaml
│   │       ├── public_workflow_triggers.yaml
│   │       ├── public_workflow_runs.yaml
│   │       ├── public_step_runs.yaml
│   │       ├── public_workflow_results.yaml
│   │       ├── public_watched_events.yaml
│   │       └── public_org_usage_stats.yaml
│   ├── migrations/default/1_init/
│   │   └── up.sql              # Full database schema (tables, indexes, enums, triggers)
│   └── seeds/                  # Optional seed data
│
└── .secrets                    # Local-only Nhost secrets (DO NOT commit to public repos)
```

---

## Local Development Setup

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| **Node.js** | v20+ | [nodejs.org](https://nodejs.org) or via `nvm install 20` |
| **Docker** | Latest | [docker.com](https://www.docker.com/products/docker-desktop) |
| **Nhost CLI** | Latest | `curl -sSL https://raw.githubusercontent.com/nhost/cli/main/get.sh \| bash` |

### 1. Clone the Repository

```bash
git clone https://github.com/KiranP-06/AI_agent_workflow.git
cd AI_agent_workflow
```

### 2. Start the Nhost Backend

Make sure Docker Desktop is running, then:

```bash
nhost up
```

This will:
- Start PostgreSQL, Hasura, Nhost Auth, and Storage in Docker containers
- Apply the database migration (`nhost/migrations/default/1_init/up.sql`)
- Apply all Hasura metadata (permissions, relationships, actions)
- Deploy the serverless functions from `functions/`

Once started, you'll have:
- **Hasura Console**: `http://localhost:1337` (admin secret: `nhost-admin-secret`)
- **GraphQL API**: `http://localhost:1337/v1/graphql`
- **Auth API**: `http://localhost:1337/v1/auth`
- **Functions**: `http://localhost:1337/v1/functions`

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The frontend automatically connects to the local Nhost backend when `NEXT_PUBLIC_NHOST_SUBDOMAIN` is `local` (the default).

### 4. Create an Account

1. Open `http://localhost:3000`
2. Click **Sign Up**
3. Enter any email and password (minimum 3 characters)
4. You'll be redirected to the dashboard

> **Note**: Email verification is disabled in `nhost.toml` (`emailVerificationRequired = false`) for ease of local development.

---

## API Keys

### OpenRouter (LLM Calls)

The `LLM Call` step type uses [OpenRouter](https://openrouter.ai) to proxy requests to models like `google/gemini-2.0-flash-001`.

**For local development:**

Set the `OPENROUTER_API_KEY` environment variable in your Nhost project secrets:

```bash
# Add to .secrets file (already gitignored)
OPENROUTER_API_KEY = 'your-openrouter-api-key-here'
```

Then restart `nhost up` for the change to take effect.

**If you don't have an OpenRouter key:**

- The app will still function — you can create workspaces, build workflows, save steps, and trigger runs.
- LLM Call steps will fail at execution time with an API error, but all other step types (HTTP Request, DB Write, Notify, Conditional Branch, Approval Gate) will work normally.
- You can sign up for a free API key at [openrouter.ai/keys](https://openrouter.ai/keys).

**For Nhost Cloud (production):**

Set `OPENROUTER_API_KEY` as a secret in the Nhost Dashboard under **Settings → Secrets**.

### Other Step Types (No API Key Needed)

| Step Type | Notes |
|---|---|
| **HTTP Request** | Makes outgoing HTTP calls to any URL you configure. No key needed. |
| **DB Write** | Writes structured results to the `workflow_results` table. No key needed. |
| **Notify** | Logs a notification message (extensible to email/Slack). No key needed. |
| **Conditional Branch** | Evaluates a JSONPath condition and branches. No key needed. |
| **Approval Gate** | Pauses execution until a user manually approves. No key needed. |

---

## Deployment

### Backend → Nhost Cloud

1. Create a project on [Nhost Cloud](https://app.nhost.io)
2. Connect this GitHub repository
3. Nhost will auto-detect `nhost/` and deploy:
   - Database schema (migrations)
   - Hasura metadata (permissions, actions, relationships)
   - Serverless functions from `functions/`
4. Add `OPENROUTER_API_KEY` as a secret in Nhost Dashboard → Settings → Secrets

### Frontend → Vercel

1. Import the repo on [Vercel](https://vercel.com)
2. Set root directory to `frontend`
3. Add these environment variables:

| Variable | Value | Example |
|---|---|---|
| `NEXT_PUBLIC_NHOST_SUBDOMAIN` | Your Nhost project subdomain | `abcdefgh` |
| `NEXT_PUBLIC_NHOST_REGION` | Your Nhost project region | `us-east-1` |

4. Deploy

---

## Database Schema & Migrations

The full schema is defined in [`nhost/migrations/default/1_init/up.sql`](nhost/migrations/default/1_init/up.sql). It creates 8 tables, 1 view, 5 custom enums, and auto-`updated_at` triggers.

### Entity-Relationship Diagram

```
auth.users
     │
     ▼ (user_id FK)
organizations ──< org_members >── auth.users
     │                                ▲
     │ (org_id FK)                    │ (created_by, triggered_by, approved_by)
     ▼                                │
workflows ──< workflow_steps          │
     │   └──< workflow_triggers       │
     │                                │
     └──< workflow_runs ──< step_runs ┘
     │
     └──< workflow_results

watched_events  (standalone, for DB-event triggers)
org_usage_stats (read-only aggregation view over organizations + workflow_runs)
```

### Key Tables

| Table | Purpose | Notable Columns |
|---|---|---|
| `organizations` | Multi-tenant workspaces | `slug` (unique), `quota_limit`, `quota_used`, `quota_period_start` |
| `org_members` | Join table: users ↔ orgs | `role` (`owner` · `editor` · `viewer`), `UNIQUE(org_id, user_id)` |
| `workflows` | Automation definitions | `org_id`, `name`, `is_active`, `created_by` |
| `workflow_steps` | Ordered steps within a workflow | `step_order`, `step_type` (enum), `config` (JSONB) |
| `workflow_triggers` | How a workflow is triggered | `trigger_type` (enum), `config` (JSONB), `is_active` |
| `workflow_runs` | One execution of a workflow | `status` (enum), `triggered_by`, `started_at`, `completed_at` |
| `step_runs` | One execution of a single step | `status` (enum), `input`/`output` (JSONB), `attempt_count`, `approved_by` |
| `workflow_results` | Persistent output from `db_write` steps | `result_type`, `data` (JSONB) |

### Custom Enums

```sql
CREATE TYPE org_role    AS ENUM ('owner', 'editor', 'viewer');
CREATE TYPE step_type   AS ENUM ('llm_call', 'http_request', 'db_write',
                                 'notify', 'conditional_branch', 'approval_gate');
CREATE TYPE trigger_type AS ENUM ('manual', 'webhook', 'scheduled', 'database_event');
CREATE TYPE run_status  AS ENUM ('pending', 'running', 'paused', 'completed', 'failed');
CREATE TYPE step_status AS ENUM ('pending', 'running', 'completed', 'failed',
                                 'skipped', 'awaiting_approval');
```

### Hasura Relationships (from metadata)

Each table's metadata YAML declares `object_relationships` (many→one) and `array_relationships` (one→many) that Hasura uses to auto-generate nested GraphQL fields:

```yaml
# public_workflows.yaml — excerpt
object_relationships:
  - name: organization          # workflows.org_id → organizations.id
    using:
      foreign_key_constraint_on: org_id
array_relationships:
  - name: steps                 # workflow_steps.workflow_id → workflows.id
    using:
      foreign_key_constraint_on:
        column: workflow_id
        table: { schema: public, name: workflow_steps }
  - name: runs                  # workflow_runs.workflow_id → workflows.id
    using:
      foreign_key_constraint_on:
        column: workflow_id
        table: { schema: public, name: workflow_runs }
```

This lets the frontend write a single GraphQL query like:

```graphql
query {
  workflows {
    name
    organization { name }
    steps { name step_type }
    runs  { status started_at }
  }
}
```

---

## Design Write-Up

### Schema Reasoning

The schema follows a **multi-tenant, organization-scoped** design. Every workflow belongs to an organization, and every user belongs to one or more organizations via the `org_members` join table. This means:

- **Data isolation** is inherent: every query filters through `organization → members → user_id`, so a user can never see another organization's workflows, runs, or results.
- **Role-based access** is modelled at the join-table level (`org_role` enum) rather than on the user record, allowing one user to be an `owner` in Org A and a `viewer` in Org B.
- **Workflow steps are ordered**, not tree-structured. The `step_order` integer gives a simple linear pipeline that the execution engine iterates in ascending order. Conditional branches don't re-route to a different node — they set a `skipNext` flag that causes the engine to skip the immediately following step. This keeps the schema and execution loop simple while still enabling basic if/else semantics.
- **Runs are append-only snapshots.** Each `workflow_run` is a frozen-in-time execution. If a workflow's steps change after a run starts, the run still uses the step definitions that existed at trigger time (by virtue of `step_runs` referencing `step_id` FK).
- **Quota tracking** is co-located on the `organizations` row (`quota_used`, `quota_limit`, `quota_period_start`). The serverless function increments `quota_used` atomically after a successful run and resets it when the billing period rolls over.

### Two Permission Layers — and Why Both Exist

This project enforces authorization at **two separate layers**, each serving a distinct purpose:

#### Layer 1 — Hasura Row-Level Permissions (Declarative)

Hasura metadata YAML files define `select_permissions`, `insert_permissions`, `update_permissions`, and `delete_permissions` for every table and role. These are compiled into SQL `WHERE` clauses that Hasura appends to every query **before** it reaches PostgreSQL, meaning the application code can never accidentally bypass them.

**Example — `select` on `workflows`** (from [`public_workflows.yaml`](nhost/metadata/databases/default/tables/public_workflows.yaml)):

```yaml
select_permissions:
  - role: user
    permission:
      columns: [id, org_id, name, description, is_active, created_by, created_at, updated_at]
      filter:
        organization:
          members:
            user_id:
              _eq: X-Hasura-User-Id
```

This means: *a user can only SELECT workflow rows where they are a member of the workflow's organization.*

**Example — `insert` on `org_members`** (from [`public_org_members.yaml`](nhost/metadata/databases/default/tables/public_org_members.yaml)):

```yaml
insert_permissions:
  - role: user
    permission:
      columns: [org_id, user_id, role]
      check:
        _or:
          - user_id:
              _eq: X-Hasura-User-Id       # Users can add themselves (org creation)
          - organization:
              members:
                _and:
                  - user_id:
                      _eq: X-Hasura-User-Id
                  - role:
                      _eq: owner           # Owners can add other members
```

The `_or` here solves a "chicken-and-egg" problem: when a user creates a brand-new organization with a nested insert, the `org_members` row for the first owner is inserted simultaneously. Without the self-insert clause, the permission check would fail because the org has no members yet.

**What Layer 1 covers:** data visibility and basic write authorization — who can see what, and who can insert/update rows. It's enforced at the database-proxy level with zero application code.

#### Layer 2 — Runtime Validation in Serverless Functions (Imperative)

Hasura **Actions** route specific GraphQL mutations (like `triggerWorkflowRun` and `approveStep`) to Nhost serverless functions. These functions receive the caller's JWT claims (`session_variables`) and perform **business logic** checks that go beyond row-level filters:

**From [`functions/trigger-workflow-run.ts`](functions/trigger-workflow-run.ts), lines 459–513:**

```typescript
// Layer 2: Verify caller is owner/editor in the workflow's org
const member = workflow.organization?.members?.[0];
if (!member) return res.status(403).json({ message: 'Not a member' });
if (member.role === 'viewer')
  return res.status(403).json({ message: 'Viewers cannot trigger runs' });

// Check quota
if (org.quota_used >= org.quota_limit) {
  // Auto-reset if billing period rolled over, else reject
  if (periodStart < currentPeriod) { /* reset */ }
  else return res.status(429).json({ message: 'Quota exhausted' });
}
```

**From [`functions/approve-step.ts`](functions/approve-step.ts), lines 283–286:**

```typescript
// Layer 2: Check that approver is owner/editor in the org
const member = stepRun.step?.workflow?.organization?.members?.[0];
if (!member) return res.status(403).json({ message: 'Not a member' });
if (member.role === 'viewer')
  return res.status(403).json({ message: 'Viewers cannot approve steps' });
```

**What Layer 2 covers:** role-gated actions (viewers can't trigger runs or approve gates), quota enforcement, and period-reset logic. These are **business rules** that can't be expressed as row-level `WHERE` clauses.

**Why not just one layer?** Layer 1 alone would let any org member trigger unlimited runs (since they can `insert` into `workflow_runs`). Layer 2 alone would protect the action endpoints but leave raw GraphQL `insert_workflow_runs` mutations unguarded. Together, they form defense-in-depth: even if a user bypasses the frontend and calls the GraphQL API directly, Layer 1 prevents unauthorized reads/writes, and even if Layer 1 is loosened for a new feature, Layer 2 still enforces business constraints.

### Approval-Gate Pause/Resume Implementation

The `approval_gate` step type implements a human-in-the-loop pattern. Here is the full lifecycle:

```
┌──────────────────────────────────────────────────────────────────────┐
│                        EXECUTION ENGINE                              │
│                                                                      │
│  1. Engine iterates steps in order                                   │
│  2. Reaches an approval_gate step                                    │
│  3. Sets step_run.status = 'awaiting_approval'                       │
│  4. Sets workflow_run.status = 'paused'                              │
│  5. RETURNS — execution function exits completely                    │
│                                                                      │
│  ── Time passes (minutes, hours, days) ──                            │
│                                                                      │
│  6. User clicks "Approve" in the UI → calls approveStep action       │
│  7. approveStep function:                                            │
│     a. Validates caller is owner/editor (Layer 2)                    │
│     b. Checks step_run.status === 'awaiting_approval'                │
│     c. Sets step_run.status = 'completed', records approved_by       │
│     d. Calls resumeWorkflowFromStep(workflow_id, run_id, next_order) │
│  8. Resume function re-enters the step loop at next_order            │
│  9. Continues executing remaining steps normally                     │
│ 10. Sets workflow_run.status = 'completed' when all steps finish     │
└──────────────────────────────────────────────────────────────────────┘
```

**Key code in `trigger-workflow-run.ts` (pause):**

```typescript
// Handle approval_gate — pause and stop
if (step.step_type === 'approval_gate') {
  await updateStepRun(stepRunId, {
    status: 'awaiting_approval',
    input: { previous_output: previousOutput },
    started_at: new Date().toISOString(),
  });
  await updateWorkflowRun(runId, { status: 'paused' });
  return; // ← execution stops here, function returns to caller
}
```

**Key code in `approve-step.ts` (resume):**

```typescript
// Approve the step
await updateStepRun(stepRunId, {
  status: 'completed',
  approved_by: userId,
  approved_at: new Date().toISOString(),
  output: { approved: true, approved_by: userId },
});

// Resume workflow execution from the next step (async)
resumeWorkflowFromStep(workflowId, runId, nextStepOrder).catch(err => {
  updateWorkflowRun(runId, { status: 'failed', error: err.message });
});
```

The `resumeWorkflowFromStep` function re-fetches all steps, skips any with `step_order < startFromStepOrder` (collecting their outputs for template resolution), and then continues the normal execution loop from the gate's successor. This means you can chain multiple approval gates in sequence — each one will pause and resume independently. The frontend sees the status transition in real-time via a GraphQL subscription on `workflow_runs` and `step_runs`.

---

## Hasura Actions (GraphQL → Serverless Functions)

Defined in [`nhost/metadata/actions.yaml`](nhost/metadata/actions.yaml):

| Action | Handler | Auth | Purpose |
|---|---|---|---|
| `triggerWorkflowRun` | `functions/trigger-workflow-run.ts` | `user` role (JWT forwarded) | Validates role + quota, creates run, starts async execution |
| `approveStep` | `functions/approve-step.ts` | `user` role (JWT forwarded) | Validates role, marks gate as approved, resumes workflow |
| `webhookTrigger` | `functions/webhook-trigger.ts` | None (secret in payload) | External webhook-triggered runs with shared secret auth |

---

## License

MIT