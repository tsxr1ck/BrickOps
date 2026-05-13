# AI Build System Blueprint

## Executive overview

This document defines a new system built from scratch that borrows the strongest ideas from `hq.byrick.net` and `agency-agents`, but is redesigned around three constraints: low token burn, safe code editing, and a minimal mobile-first operator experience.[cite:5][cite:13][web:15] The intended result is a self-hosted build control plane that can create projects, plan them, generate code, patch existing codebases, request approvals, and communicate through both a lightweight web UI and WhatsApp.[cite:48][cite:42][cite:43]

The architectural principle is simple: never use one giant model prompt when a smaller specialized role can solve one bounded step.[cite:5][web:15] Instead of a monolithic coding assistant, the system should use a router plus a few narrow specialist agents, stable prompt prefixes, semantic code navigation, minimal diffs, and approval checkpoints so that cost and hallucination risk stay controlled.[cite:51][web:23][web:21]

---

## Product goal

The product is an **AI project operator** for one primary human owner. It should let the owner:

- Start new projects from web or WhatsApp.[cite:48]
- Ask for project status, recent actions, blockers, and summaries from WhatsApp.[cite:48]
- Approve plan changes, risky commands, and deployments from mobile-first UI or WhatsApp.[cite:48]
- Let the system inspect code, edit files surgically, run builds/tests, and recover from failures with minimal model usage.[cite:5][cite:11][cite:12]
- Maintain a clean dashboard optimized for phone use first, desktop second.[cite:43]

This is not a generic team chat app. It is an operator console around a code-execution pipeline, with WhatsApp acting as a command and notification surface rather than the primary rendering layer.[cite:48][cite:52]

---

## Design principles

### 1. Token discipline first

The biggest lesson from `hq.byrick.net` is that single-pass, high-context codegen is the main waste vector.[cite:5] Every architectural choice should prefer smaller prompts, stable prefixes, deterministic pre-processing, and specialist delegation so the system only pays for the exact reasoning it needs.[cite:51][web:23][web:21]

### 2. Edit, do not rewrite

The system should default to file-aware patching rather than full file regeneration, because small diffs are cheaper, safer, and easier to validate.[cite:11][cite:51] Full-file regeneration should be treated as a fallback reserved for new files, low-risk scaffolds, or cases where the current file is too broken for surgical edits.[cite:11]

### 3. Human-in-the-loop at risk boundaries

Commands with elevated risk, architecture shifts, dependency additions, secret handling, and deployments should all require explicit approval.[cite:12][cite:13] WhatsApp approval should be supported for speed, but the web UI remains the best place to inspect details before accepting changes.[cite:48]

### 4. Minimal operator UI

The UI should feel more like a clean control panel than a feature-rich PM suite.[cite:43] Mobile-first means fast access to project lists, latest activity, pending approvals, and one-tap actions; the system should avoid dense dashboards, heavy charts, or excessive configuration screens.[cite:43]

### 5. One owner, many projects

The initial product can assume a single trusted operator identity. That simplifies auth, permissions, project routing, and WhatsApp account binding, and is the right tradeoff for a first serious build.[cite:48][cite:46]

---

## High-level architecture

The system should be split into six major subsystems:

1. **Operator surfaces**: web app and WhatsApp interface.[cite:48][cite:43]
2. **API gateway**: authentication, project APIs, approvals, event delivery.
3. **Orchestrator**: state machine that moves projects through intake, planning, coding, validation, build, preview, and deploy.[cite:13]
4. **Code intelligence layer**: workspace indexing, symbol graph, file navigator, semantic context slicer.
5. **Execution layer**: safe filesystem edits, command runner, install/build/test execution, sandbox policies.[cite:11][cite:12]
6. **Agent runtime**: router, specialist prompts, prompt caching policy, evaluation and review agents.[cite:51][web:15][web:21]

A strong first implementation is a TypeScript monorepo with separate apps and shared packages, similar in spirit to `hq.byrick.net`, because that structure already matches your preferred stack and makes shared contracts easy to enforce.[cite:1][cite:2][cite:6][cite:44]

Recommended package layout:

```text
apps/
  api/
  orchestrator/
  web/
  whatsapp-gateway/
packages/
  agent-runtime/
  agent-policy/
  code-nav/
  contracts/
  db/
  events/
  execution/
  indexing/
  notifications/
  ui/
```

---

## Core product flows

### A. New project from WhatsApp

The user sends a WhatsApp message like “start a project for a landing page for my sneaker marketplace with auth and admin panel.”[cite:48] The WhatsApp gateway normalizes the message, resolves operator identity, creates an intake job, and stores the raw message as the project seed.[cite:52][cite:48]

The orchestrator then runs intake clarification. If enough detail exists, it creates a draft project immediately; if not, it asks one or two follow-up questions back through WhatsApp and waits for reply before planning starts.[cite:13][cite:48] Once a plan is ready, the user receives a concise approval card in WhatsApp and a richer version in the web app.[cite:48]

### B. Project creation from web

The web UI offers a single primary CTA: “New project.” The creation screen should ask for goal, stack preference, repo mode (new or existing), and deployment target, then submit into the same intake pipeline used by WhatsApp.[cite:43][cite:44]

### C. Ask for status from WhatsApp

The user can send messages like:

- “list my projects”
- “status of relationship os”
- “what failed in the last build?”
- “show pending approvals”
- “deploy the latest successful build”

The system should map these to structured intents, query the project store, and respond with short operator-focused summaries optimized for chat.[cite:48] Detailed logs or diffs should be linked back to the web UI rather than dumped into WhatsApp.[cite:48]

### D. Code editing request

The user asks from web or WhatsApp: “add a settings page” or “fix the auth redirect loop.” The system should attach the request to a project thread, load semantic context, choose a narrow specialist, generate a plan of edits, optionally ask for approval if risk is medium/high, then patch files and validate.[cite:5][cite:11][cite:12][cite:51]

---

## Monorepo recommendation

A TypeScript/Bun monorepo is the best fit because your existing ecosystem, Node-first execution model, and Baileys work already align with it.[cite:44][cite:45][cite:52] Recommended stack:

| Layer | Recommendation | Why |
|---|---|---|
| Runtime | Bun or Node.js 22+ | Fast local tooling and strong TS ecosystem.[cite:44] |
| API | Fastify or Hono | Lean, fast, mobile-facing JSON APIs. |
| Web | React + Vite + TypeScript | Already aligned with your preferred approach.[cite:44] |
| UI | Tailwind + shadcn/ui or a smaller custom token layer | Minimal, fast, mobile-first UI.[cite:43][cite:44] |
| DB | PostgreSQL | Best fit for jobs, events, projects, approvals, and indexing metadata.[cite:46] |
| Queue | Postgres-backed jobs first, Redis optional later | Simpler first version. |
| Realtime | SSE first, WebSocket optional | Minimal UI does not need heavy socket complexity. |
| WhatsApp | Baileys service | Already aligned with your experience.[cite:42][cite:45][cite:52] |
| Search/index | Tree-sitter + ripgrep + custom symbol store | Cheap local code intelligence. |
| AI providers | OpenAI + Anthropic abstraction | Lets you route cheap vs strong models and exploit caching.[web:23][web:21] |

---

## Data model

The database should be event-centric but not overcomplicated. Suggested entities:

### projects
- `id`
- `name`
- `slug`
- `status`
- `source` (`web`, `whatsapp`, `imported`)
- `repo_url`
- `workspace_path`
- `created_at`
- `updated_at`

### project_threads
- stores human requests, assistant responses, approvals, and notifications

### runs
- one orchestrator run per project attempt
- includes current stage, started_at, finished_at, failure_reason

### run_steps
- classification, planning, coding batch 1, review, build, preview, deploy

### approvals
- title, summary, risk_level, payload, channel, status, approved_at

### workspaces
- local path, git branch, repo mode, lock state

### file_index
- file path, hash, language, symbols, imports, exports, last indexed at

### prompt_usage
- provider, model, prompt tokens, cached tokens, completion tokens, step id

### whatsapp_accounts
- operator phone, session id, connection state

### notifications
- channel, type, message, delivery status

This schema keeps auditing and cost analysis first-class, which matters if the whole product promise is “use AI without burning quota blindly.”[web:23][web:21]

---

## Agent system design

The `agency-agents` idea should be used as **persona modules**, not as a giant imported universe used everywhere.[web:15] The system should start with a very small curated set of roles that map to concrete execution stages:

- Software Architect
- Frontend Developer
- Backend Architect
- AI Engineer
- Code Reviewer
- Reality Checker
- Minimal Change Engineer (or your own equivalent patch-focused role)
- Project Shepherd or Product Manager for planning summaries[web:15]

The reason to keep this set small is that role explosion hurts routing quality and increases maintenance. `agency-agents` is valuable because it proves that role-specific prompts can outperform one broad prompt, but your system should operationalize only the roles that align with your pipeline.[web:15][cite:51]

### Agent categories in your system

1. **Router agent**: classifies request type, risk, and required role.
2. **Planning agent**: turns idea into implementation plan.
3. **Edit agent**: makes precise code changes.
4. **Scaffold agent**: creates new files or modules.
5. **Review agent**: reviews change set before execution finalization.
6. **Reality checker**: verifies production readiness before preview/release.[web:15]

### Prompt policy

Every agent prompt should be layered:

1. Stable persona block.
2. Stable HQ runtime rules.
3. Stable action schema/tool schema.
4. Dynamic task context.
5. Minimal relevant file slices.

This ordering matters because both OpenAI and Anthropic prompt caching benefit from stable prompt prefixes and repeated long context blocks.[web:23][web:21] OpenAI prompt caching relies on identical leading tokens for long prompts, and Anthropic prompt caching is especially useful for stable system prompts and tool definitions.[web:23][web:21]

---

## Token efficiency strategy

This is the most important subsystem after execution safety.

### 1. Never send the whole workspace

The system should only send the exact files or line ranges relevant to the task, using a navigator/indexer before any generation call.[cite:5] `hq.byrick.net` already hints at this with `navigateContext()`, but the new system should make semantic selection mandatory for every edit request.[cite:5]

### 2. Distinguish planning from editing

Planning prompts can read the brief, stack preference, and high-level architecture. Edit prompts should read only the request plus the file graph needed for the diff. Mixing both wastes tokens and raises hallucination risk.[cite:5][cite:51]

### 3. Patch-based edits first

When changing existing files, the preferred action should be a structured patch with explicit anchors, not “rewrite the full file.”[cite:11] This cuts tokens, produces cleaner diffs, and makes validation easier.[cite:11][cite:51]

### 4. Cache stable prompt prefixes

The persona, tool schemas, runtime rules, and unchanged project context should live in stable top-of-prompt blocks. Reusing those blocks allows prompt caching to reduce cost and latency on long repeated prefixes.[web:23][web:21]

### 5. Use a cheap router

Classification, intent detection, agent selection, and approval risk scoring should run on a cheaper model. Only code synthesis and hard review should hit stronger models.[cite:51][web:23][web:21]

### 6. Build a context budgeter

Before every model call, compute a token budget and prune context by importance:

- Current target file
- Direct imports/dependencies
- Related tests
- Relevant config file
- Plan excerpt
- Recent failure logs

Everything else should be summarized or omitted.

---

## Code navigation and editing subsystem

This subsystem is what makes the product truly useful instead of just another wrapper around chat completion.

### Responsibilities

- Parse workspace tree.
- Build symbol index for functions, classes, exports, routes, schemas.
- Resolve imports and reverse references.
- Extract line-level slices.
- Produce task-focused context manifests.
- Support surgical patches.

### Recommended implementation

Use a combination of:

- `ripgrep` for text search
- Tree-sitter for structural parsing
- TypeScript compiler API for TS/JS symbol resolution
- local file hash map for change detection

This should be its own package, such as `packages/code-nav`, with a clean API:

```ts
interface ContextManifest {
  summary: string
  targetFiles: Array<{
    path: string
    reason: string
    fromLine?: number
    toLine?: number
    symbols?: string[]
  }>
  relatedFiles: Array<{
    path: string
    reason: string
  }>
  warnings: string[]
}
```

### Edit flow

1. Request arrives: “fix auth redirect loop.”
2. Router classifies as `edit-auth-flow`.
3. Navigator searches route middleware, auth hooks, login page, protected layout, session provider.
4. Model receives only the request, the relevant slices, and action schema.
5. Model returns `patch_file` actions plus maybe one test update.
6. Reviewer checks patch scope.
7. Executor applies patch and runs tests/build.
8. Reality checker decides if preview is trustworthy.[cite:11][cite:12][web:15]

---

## Execution and safety layer

The execution engine should look similar in spirit to `hq.byrick.net` but more structured around idempotency and auditability.[cite:11][cite:12] It should support these core actions:

- `create_file`
- `patch_file`
- `delete_file`
- `move_file`
- `install_package`
- `run_command`
- `read_file`
- `list_directory`
- `search_codebase`
- `request_approval`
- `execution_complete`

### Safety rules

- Path traversal must be impossible.[cite:12]
- Protected paths should be blocked unless explicitly approved.[cite:12]
- Commands should run through allowlists and approval tiers.[cite:12]
- Each action should produce an execution record.
- Every run should be reproducible from event log + git diff.

### Git integration

Every run should occur on an isolated branch:

- `project/<slug>/run/<id>`

At completion, the system should create a git summary with:

- files changed
- packages added
- commands run
- tests status
- build result

This makes rollback and audit easy, and also helps generate WhatsApp status summaries.

---

## Orchestrator state machine

The state model from `hq.byrick.net` is a good starting point because it already reflects a practical build pipeline.[cite:13] The new system should keep that spirit but extend it for edit requests and chat-driven approvals.

Recommended states:

1. `draft`
2. `awaiting_clarification`
3. `planning`
4. `awaiting_plan_approval`
5. `provisioning_workspace`
6. `indexing_workspace`
7. `routing_task`
8. `coding`
9. `reviewing`
10. `awaiting_approval`
11. `installing`
12. `testing`
13. `building`
14. `capturing_preview`
15. `awaiting_user_feedback`
16. `ready_to_deploy`
17. `deploying`
18. `deployed`
19. `failed`

### Why add indexing and routing states?

Because in the new architecture, navigation and routing are first-class cost-control steps, not hidden implementation details.[cite:5][cite:51] They deserve visibility in logs and in the mobile UI.

---

## WhatsApp integration architecture

This is one of the highest-value differentiators for your use case.[cite:48] Since you already have experience with Baileys, the cleanest path is a dedicated `apps/whatsapp-gateway` service using Baileys sessions and an internal event bus.[cite:42][cite:45][cite:52]

### Responsibilities of the WhatsApp gateway

- Maintain authenticated WhatsApp session.
- Receive inbound messages.
- Parse operator commands.
- Forward structured intents into the API/orchestrator.
- Deliver outbound notifications.
- Handle approval replies.
- Rate-limit outbound notifications to avoid spam.

### Command patterns to support

#### Project creation
- “start project for X”
- “new app: X”
- “create a fullstack app for X using React and Node”

#### Status and listing
- “list projects”
- “show active projects”
- “status of byrick hq”
- “what is waiting for me?”

#### Approvals
- “approve latest plan”
- “reject deploy for relationship os”
- “approve command for project X”

#### Info requests
- “what files changed?”
- “why did the build fail?”
- “show blockers”
- “summarize latest run”

### Notification patterns

The system should push WhatsApp messages when:

- a plan needs approval
- a risky command needs approval
- a build fails
- preview is ready
- deployment is successful
- user input is needed

### Message style

WhatsApp responses should be compact and operator-oriented. Example:

```text
Project: relationship-os
State: awaiting_plan_approval
Summary: Full-stack app with auth, dashboard, couple questionnaire engine
Waiting on: your approval
Reply: APPROVE relationship-os
```

Detailed plan, logs, previews, and diffs should include a short web link rather than large pasted blobs.[cite:48]

---

## Web UI and UX blueprint

The UI should be intentionally sparse and optimized for one-handed mobile use.[cite:43] It should feel calm, operational, and fast.

### Core screens only

1. **Projects list**
2. **Project detail**
3. **Run detail**
4. **Pending approvals**
5. **Create project**
6. **Settings / WhatsApp connection**

### Projects list

Mobile-first cards with:

- project name
- current state
- latest event timestamp
- one-line summary
- badge if waiting on you

Primary actions:

- open
- approve pending
- ask AI

### Project detail

Sections in order:

1. Current state
2. Primary action block
3. Timeline
4. Latest code changes
5. Build/preview/deploy status
6. Chat/request composer

### Pending approvals

This should be one of the most important screens. Each card should show:

- title
- risk level
- project
- concise reason
- approve / reject
- open details

### Visual system

- neutral surfaces
- minimal accent color
- large tap targets
- strong typographic hierarchy
- no overloaded graphs
- no complex sidebars on mobile

Your remembered preference for a clean Samsung One UI–style mobile experience fits this well.[cite:43]

---

## Mobile-first interaction model

The mobile UI should prioritize **triage and approvals**, not deep code inspection.[cite:43] On phone, you should be able to:

- create a project
- review project list
- see blockers
- approve or reject pending items
- read concise run summaries
- open preview links
- ask a quick follow-up question

Desktop can expose more detailed diffs and logs, but the design should remain simple. Mobile is the control surface; desktop is the inspection surface.

---

## Planning system

Planning should be a dedicated phase that produces a concise implementation document, not a bloated spec. The plan should include:

- architecture overview
- stack choice
- routes/screens
- data model
- key files/modules
- milestones
- risk notes

This resembles the strengths already present in `hq.byrick.net`, where plan parsing drives later stages.[cite:5] The difference is that the new system should use plans as routing metadata for specialist agents rather than feeding the whole plan into one giant codegen prompt.[cite:5][cite:51]

---

## Build-from-scratch vs edit-existing modes

The system needs two operating modes.

### Mode 1: New project build

This is closer to the original `hq.byrick.net` flow.[cite:13] It creates workspace, generates scaffold, installs deps, tests, builds, previews, and deploys.

### Mode 2: Existing repo edit

This mode is equally important. Flow:

1. Import or clone repo.
2. Index workspace.
3. Accept natural-language change request.
4. Navigate relevant context.
5. Generate small patches.
6. Review and validate.
7. Build/test affected scope.
8. Summarize and request approval if needed.

Because quota control matters, edit-existing mode should become the product’s strongest path. Small targeted edits are where specialist prompts and patch-based execution have the best ROI.[cite:11][cite:51]

---

## Prompt caching strategy

### OpenAI

Prompt caching reduces cost and latency when the beginning of the prompt is identical across long requests, with caching activating on long prompt prefixes and reporting cached token usage for supported models.[web:23] This means your system should keep persona text, tool schema, runtime policy, and stable repo summary in the same order at the start of repeated requests.[web:23]

### Anthropic

Anthropic prompt caching is well-suited for stable system prompts, tool definitions, and repeated conversation prefixes, with explicit caching strategies designed around unchanged prompt prefixes.[web:21] This fits perfectly with specialist personas and repeated code-edit flows where the same instructions are reused over many turns.[web:21]

### Practical implementation

Each agent invocation should build prompts like this:

```text
[stable persona]
[stable HQ runtime policy]
[stable tool/action schema]
[stable project summary]
[dynamic task request]
[dynamic file slices]
```

Only the last two sections should change frequently. That gives caching the best chance to pay off.[web:23][web:21]

---

## Suggested model routing

| Task | Model class | Reason |
|---|---|---|
| Intent parsing | Cheap fast model | Low complexity. |
| Plan classification | Cheap fast model | Structured output only. |
| Simple status summaries | Cheap fast model | Mostly formatting and retrieval. |
| Code patch generation | Mid/strong model | Needs precision. |
| Architecture planning | Strong model | Higher-level reasoning. |
| Reality checking | Strong model | Needs careful review. |
| WhatsApp message phrasing | Cheap fast model | Small response surface. |

This separation is what prevents “every message burns premium-model budget.”[cite:51][web:23][web:21]

---

## Review and validation system

The current `hq.byrick.net` validator is mostly mechanical: command allowlist, file-path constraints, and size limits.[cite:12] The new system should keep that layer and add a second semantic validation layer.

### Mechanical validation

- path safety
- protected files
- command allowlist
- file size limits
- diff sanity

### Semantic validation

- imports resolved
- changed files consistent with request
- no placeholder code
- no unexplained package additions
- route consistency
- test/build expectations met

### Reality-check stage

A review persona inspired by the `Reality Checker` from `agency-agents` should run before preview or deploy to reject changes that look superficially correct but are not production-ready.[web:15] That role should be given explicit success criteria and fail reasons, not vague “review the code” instructions.[web:15]

---

## Deployment and preview

Keep preview generation lightweight. For most web projects, a local build artifact preview or a temporary deployment URL is enough. The system should send WhatsApp only a concise notification like:

```text
Preview ready for relationship-os
Build: success
Open: https://...
Reply INFO relationship-os for summary
```

Deployment should always be approval-gated unless a project is explicitly marked auto-deploy safe.

---

## Observability

To truly control quota and performance, track these metrics from day one:

- requests per project
- model used per step
- input/output tokens
- cached tokens
- prompt cost estimate
- success/failure by step
- first-pass build rate
- patch success rate
- approvals required vs automatic
- WhatsApp response latency

Without this telemetry, “token efficiency” stays a guess instead of becoming an optimization loop.[web:23][web:21]

---

## Security and identity

This should be a single-owner system first.

### Identity

- Web auth via passkey or magic link.
- WhatsApp binding by explicit pairing and operator whitelist.[cite:52]
- All WhatsApp commands should verify sender identity before action execution.[cite:52]

### Secrets

- Keep provider keys in encrypted env or secret manager.
- Never expose secrets to model prompts.
- Strip env files from navigable context by default.[cite:12]

### Workspace isolation

- One workspace root per project.
- Optional sandbox/containers for command execution.
- Git branch isolation per run.

---

## MVP definition

The MVP should be smaller than the full vision.

### MVP scope

- Web app with project list, project detail, pending approvals, create project.[cite:43]
- WhatsApp gateway via Baileys for project creation, status, and approvals.[cite:48][cite:52]
- Planning pipeline.
- Existing repo import and edit mode.
- Code navigator.
- Patch-based execution.
- Review + reality-check gate.
- Build/test commands for JS/TS projects.
- Token/cost telemetry.

### Not in MVP

- Multi-user teams
- Rich collaborative comments
- broad deployment target matrix
- large plugin ecosystem
- non-code business workflows

That narrower MVP already delivers your highest-value use case: operate software projects from phone or web with minimal UI while keeping token costs under control.[cite:48][cite:43]

---

## Suggested implementation phases

### Phase 1 — Foundation

- Create monorepo.
- Build shared contracts.
- Set up PostgreSQL schema.
- Build API skeleton.
- Build minimal web shell.
- Implement project and run entities.

### Phase 2 — Workspace and execution

- Workspace provisioning.
- Safe file actions.
- Command runner.
- Git branch isolation.
- Run event logging.

### Phase 3 — Code intelligence

- File tree scanner.
- Search API.
- symbol extraction.
- context manifest generator.
- patch application engine.

### Phase 4 — Agent runtime

- small persona registry inspired by `agency-agents`.[web:15]
- router model.
- planning agent.
- patch/edit agent.
- reviewer and reality checker.[web:15]
- provider abstraction with caching-aware prompt builder.[web:23][web:21]

### Phase 5 — WhatsApp gateway

- Baileys session service.[cite:52]
- inbound command parsing.
- outbound notification templates.
- approval replies.
- project listing and status lookup.[cite:48]

### Phase 6 — UX polish

- mobile-first cards and approval flow.[cite:43]
- timeline readability.
- concise notification design.
- preview/deploy experience.

### Phase 7 — Hardening

- retries and idempotency
- better indexing
- richer validations
- cost dashboards
- deploy integrations

---

## Concrete package responsibilities

### `packages/contracts`
Zod schemas for actions, run states, approvals, events, WhatsApp intents, and API DTOs.

### `packages/agent-policy`
Persona files, runtime rules, action schemas, risk policies. This is where the adapted `agency-agents` prompts live in curated form.[web:15]

### `packages/agent-runtime`
Prompt builder, model router, provider adapters, caching hints, JSON parsing, retry logic.

### `packages/code-nav`
Workspace search, AST parsing, symbol references, context manifests.

### `packages/execution`
Safe file edits, patch engine, command runner, protected path policy.

### `packages/events`
Typed event emitters and storage helpers.

### `packages/notifications`
WhatsApp and web notifications.

### `apps/whatsapp-gateway`
Baileys adapter, operator command parser, outbound delivery.[cite:52]

### `apps/orchestrator`
State machine, job workers, run scheduling, validations.

### `apps/api`
REST endpoints for web app and internal gateway communication.

### `apps/web`
Minimal operator UI.[cite:43]

---

## Example request lifecycle

User from WhatsApp: “start a new app for tracking lifting sessions and PRs.”

1. Gateway receives message and authenticates operator.[cite:52]
2. API creates project draft.
3. Orchestrator runs intake classification.
4. Planner generates short implementation plan.
5. User gets approval request in WhatsApp and web.[cite:48]
6. After approval, workspace is provisioned.
7. Indexer creates baseline manifest.
8. Router determines roles: architect + frontend + backend.
9. Scaffold agent creates initial files.
10. Review agent checks action bundle.
11. Executor writes files and installs deps.[cite:11]
12. Build/test runs.
13. Reality checker evaluates result.[web:15]
14. Preview link is generated.
15. WhatsApp says preview ready.[cite:48]

---

## Example edit lifecycle

User from WhatsApp: “in relationship os, add a compatibility history page.”[cite:47][cite:48]

1. Gateway maps message to project and intent.
2. Orchestrator creates edit run.
3. Navigator finds routes, compatibility domain logic, navigation UI, and related tests.
4. Router picks frontend developer + minimal change editor.
5. Model receives only relevant slices plus patch schema.[cite:51]
6. System applies small diffs.
7. Reviewer checks request coverage.
8. Build/tests run.
9. WhatsApp sends concise summary and preview link.[cite:48]

---

## Why this system is better than just extending hq.byrick.net

Starting fresh lets you keep the strongest ideas from `hq.byrick.net`—clear pipeline stages, monorepo structure, safe execution, and workspace-first design—without inheriting the main weakness of its current monolithic generation pattern.[cite:5][cite:13][cite:11] The new build makes routing, indexing, patching, caching, WhatsApp control, and mobile-first operator UX first-class concerns from day one, which is exactly what your use case needs.[cite:48][cite:43][cite:51]

---

## Final recommendation

Build the first version as a **single-owner AI project operator** with:

- TypeScript monorepo
- PostgreSQL-backed event model
- minimal React mobile-first dashboard
- dedicated Baileys WhatsApp gateway
- curated agency-style specialist prompts
- semantic code navigation
- patch-first editing
- caching-aware provider layer
- approval-first safety model

That combination best fits your current skills, your WhatsApp automation goals, your preference for a minimal interface, and your need to keep model quota under control while still allowing the system to work directly on code.[cite:42][cite:43][cite:44][cite:48][cite:51][web:23][web:21]
