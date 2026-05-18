1. Product Model and Flows (New Mental Model)
   1.1 Core entities
   Redefine the domain around a few stable entities that both web and WhatsApp use:

Workspace: A concrete codebase on disk (path, git URL, branch).

Project: High‑level artifact tying a workspace + configuration (agent persona, model, environment).

Session: A single conversational coding “thread” inside a project (like opencode sessions).

Run: One execution of the agent loop inside a session (a single user request and all tool calls it triggered).

Event: Atomic things that happen within runs: LLM deltas, tool executions, file edits, tests, errors.

Channels:

Web: Full workspace UI (chat + editor + preview + timeline).

WhatsApp: Text‑first interface mapped onto the same Session and Event stream.

1.2 High‑level flow for both channels
For both web and WhatsApp, the flow should be:

Choose or create a project:

Web: Projects dashboard, “New project” dialog.

WhatsApp: “Create project {name} from repo {url}” → gateway calls the API to create.

Start or continue a session:

Web: Pick a project → open workspace → choose an existing session or “New session”.

WhatsApp: Message like “Continue last session” or “Start new session for {project}”.

User asks for changes:

Web: Type in chat input; optionally select files in the editor before sending.

WhatsApp: Send message; gateway parses intent and forwards to orchestrator.

Agent loop runs:

Orchestrator calls agent runtime, which:

Streams LLM thinking/content deltas and tool events as Events.

Applies file edits via the execution/workspace layer.

Emits test runs, errors, etc.

Stream events back to user:

Web: Live chat message updates + timeline + diff/preview pane.

WhatsApp: Periodic text updates summarizing key steps (“Reading files…”, “Applied patch to X”, “Tests passed”).

User iterates: Ask follow‑ups, refine instructions, or approve changes (possibly tying into approvals page).

2. Backend Architecture Re‑shape
   Your backend already has apps/orchestrator, packages/agent-runtime, packages/events, packages/execution, and apps/whatsapp-gateway; the plan is to make them cooperate around a shared Event stream and Session model.

2.1 Agent runtime as opencode‑style loop
Refine packages/agent-runtime to behave like opencode’s agent:

Implement a Runtime / AgentExecutor that:

Takes sessionId, projectId, prompt, and optional attachments.

Fetches previous messages for the session.

Creates a new user message.

Calls the provider’s streaming API and processes events (thinking, content, toolUseStart, toolUseStop, complete, error).

Executes tools (workspace read/write, search, tests).

Re‑enters the loop when finish reason is tool use, until final completion.

Emit Events to the events bus for every significant thing:

llm_thinking_delta, llm_content_delta, tool_started, tool_finished, file_changed, run_completed, error.

This mirrors opencode’s processGeneration and streamAndHandleEvents, but done in TypeScript.

2.2 Orchestrator as pipeline manager
Reposition apps/orchestrator as:

A thin wrapper around agent-runtime + events:

HTTP endpoints for:

POST /projects/:id/sessions (new session).

POST /sessions/:id/run (start loop).

POST /sessions/:id/cancel.

SSE or WebSocket endpoints for:

GET /sessions/:id/events – stream all events in that session.

Internally:

Build a Pipeline that:

Validates permissions/project state.

Calls AgentExecutor.execute and forwards each internal event to events bus and SSE/WebSocket clients.

2.3 Events bus as unified stream
Use packages/events as the central bus:

Define a normalized event type:

ts
type Event = {
id: string;
sessionId: string;
projectId: string;
runId: string;
timestamp: number;
channel?: 'web' | 'whatsapp';
kind:
| 'user_message'
| 'assistant_message'
| 'llm_thinking_delta'
| 'llm_content_delta'
| 'tool_started'
| 'tool_finished'
| 'file_read'
| 'file_written'
| 'diff_applied'
| 'tests_started'
| 'tests_finished'
| 'error'
| 'run_completed';
payload: any;
};
Web app subscribes to these events via SSE/WebSocket.

WhatsApp gateway subscribes via HTTP/SSE or a lightweight polling API, pulling summarized events to push out to the user.

2.4 Execution/workspace layer
Leverage packages/execution as the workspace engine:

workspace.ts:

Manage mapping from project → workspace root (on disk or in a container).

fs.ts:

Implement tools: read_file, write_file, apply_diff, list_files.

runner.ts:

Tools for running tests, linters, or custom commands.

Agent runtime tools call this layer, and every operation produces an Event (e.g. file_written, tests_finished) that feeds the timeline.

3. Web UI Re‑definition: Desktop and Mobile
   The web app should become a three‑pane workspace: navigation, workspace (chat+editor), and preview/timeline, with adaptive behavior for mobile. This design can follow Material 3 patterns for top app bar, navigation rail, and bottom nav.

3.1 App shell and navigation
Refactor AppShell (from @brickops/ui) and apps/web/src/App.tsx:

Top App Bar (M3):

Left: logo + project selector.

Center: current session name and status indicator (idle/running/error).

Right: channel status (Web + WhatsApp icons), theme toggle, user menu.

Navigation Rail / Bottom Nav:

Desktop: M3-style vertical navigation rail on the left for:

Projects

Workspace

Approvals

Settings

Mobile: M3 bottom navigation bar with same destinations.

Page layout:

Desktop grid: nav rail | main workspace | side panel:

minmax(280px, 320px) left panel (project/session list & timeline).

1fr main workspace (chat + editor).

minmax(320px, 420px) right panel (preview, run details, tests).

Mobile:

Only main workspace visible by default.

Left and right panels accessible as sliding drawers or via tabs.

3.2 Workspace page structure
Rebuild ProjectPage as a full “Workspace”:

Left panel (Project & Sessions):

Project summary (name, repo, branch).

Sessions list with status & channel icons.

Maybe a mini timeline of recent runs.

Center panel (Chat + Editor):

Split vertically or horizontally:

Top: chat history and input.

Bottom: single-file editor or file diff view.

Use WorkspaceLayout and ChatBubble primitives from @brickops/ui (you already reference them in ProjectPage, so bring them fully in).

Right panel (Preview & Timeline):

Tabs:

“Timeline”: timeline of Events (file edits, tool calls, tests) using your Timeline component.

“Changes”: list/diff of files changed in this run/session.

“Tests”: latest test run outputs/status cards.

The feel should be: “Bolt/Base44 but with a visible event timeline for everything the agent is doing,” not just hidden logs.

3.3 Timeline UX
Tie the event bus into the timeline:

For each event type:

Render as a TimelineEntry (you already have Timeline and TimelineEntry types in @brickops/ui).

Use icons:

User message → person.

Assistant message → bot.

Tool started → wrench.

File changed → file.

Tests finished → check/alert.

Show relative time (“Just now”, “2m ago”) using your timeAgo util.

The timeline should be filterable by event type and run.

3.4 Editor integration
Introduce an editor into the central workspace:

Start with a simple editor component:

Monaco or CodeMirror, integrated via a CodeEditor component.

Bound to a “current file” in the workspace state.

Data flow:

When the user selects a file in a file tree (left panel or center overlay), load its content via API (which calls read_file tool).

When the agent modifies a file, mark it as “changed” and show diff (using a side-by-side diff or inline view).

Allow the user to edit locally (manual corrections) and either:

Save directly (writing to workspace), or

Instruct the agent to integrate their edits.

Conflict resolution:

If a file changed on disk while user is editing, show a small “file changed on disk” warning and offer to reload or show diff.

3.5 Mobile UI behavior
On mobile:

Default view: Chat + minimal context:

Chat on top.

A “Files” button to open a modal list.

A “Timeline” button to open the timeline as a full-screen sheet.

Editor:

Allow quick, simple edits (e.g. small snippets).

For heavy editing, you may prefer to keep the editor read‑only and encourage desktop for full edits.

Use M3 adaptive guidelines: Navigation bar at bottom for primary sections, top app bar for context and actions.

4. Web <-> Backend Streaming
   4.1 API endpoints
   Implement in apps/api:

POST /projects/:id/sessions – create session.

POST /sessions/:id/run – start an agent run:

Body: { prompt: string, attachments?: Attachment[] }.

POST /sessions/:id/cancel – cancel active run.

GET /sessions/:id/events/stream – SSE or WebSocket stream of events:

Push increments as Event objects from the bus.

4.2 Frontend streaming client
In apps/web:

Create a useSessionEvents(sessionId) hook:

Opens SSE/WebSocket.

Maintains internal state:

messages[] (user/assistant messages for chat).

timeline[] (all events).

runStatus (idle/running/error).

changedFiles (for diff view).

Updates React state as events arrive.

Chat UI uses messages[] for rendering.

Timeline uses timeline[].

Editor/preview uses changedFiles and specific file_written and diff_applied payloads.

5. WhatsApp Flow Integration
   Your apps/whatsapp-gateway already has a parsing and handler pipeline; rewire it to use the same API and events as the web.

5.1 Inbound messages
For each incoming WhatsApp message:

Map senderJid → user and project:

Use conversation-state.ts to store which project/session the user is currently in; allow commands to change project.

Call orchestrator’s POST /sessions/:id/run:

Body includes channel: 'whatsapp' for observability.

prompt is the WhatsApp message text.

Optionally, send an immediate “Working…” message back to ACK.

5.2 Outbound streaming
You can’t stream tokens individually to WhatsApp, but you can mirror major events:

The gateway subscribes to events for that session:

Either via:

SSE from /sessions/:id/events/stream, or

Polling GET /sessions/:id/events?since=....

For selected event types (to avoid spam):

tool_started, diff_applied, tests_finished, run_completed:

Summarize to messages like:

“Analyzing files related to X…”

“Applied changes to 3 files.”

“Tests passed.”

“Here’s what I changed: …”

For the final assistant_message:

Send a summarized response back.

Messages include small statuses so WhatsApp users feel the same interactivity as web, just at a coarser granularity.

5.3 Session linking in UI
In the web workspace:

Show WhatsApp avatars and channel tags on messages that originate from WhatsApp.

Show channel chips for each session:

Web only, WhatsApp only, or Mixed.

Allow operators to reply from the web (assistant or human operator messages), which still go through the same run pipeline and produce WhatsApp replies.

6. Bringing Back Timeline, Workspace, Editor (Concrete UI Tasks)
   6.1 Timeline
   Re‑use Timeline component from @brickops/ui and wire it to events; ensure it supports:

Icons based on kind.

Grouping by runId.

Filtering (checkboxes: “File changes”, “Tools”, “Tests”, “LLM”).

6.2 Workspace layout
Enhance WorkspaceLayout (if it exists) or build one:

Props:

sidebar, main, aside React children.

Uses CSS Grid:

Desktop: three columns, full-height.

Mobile: main visible; sidebar/aside accessible via icon buttons.

Refactor ProjectPage so it becomes a composition of:

<WorkspaceLayout sidebar={<ProjectSidebar />} main={<ChatAndEditor />} aside={<PreviewTabs />} />

6.3 Editor
Introduce CodeEditor to @brickops/ui or as local apps/web component.

Add FileTree component to left panel using project workspace file list.

Use events to update file status (dirty, changed, etc).

7. Implementation Phasing (Step-by-step Roadmap)
   Phase 0 – Stabilize and Simplify
   Clean out unused mock data and dead code paths in apps/web so that pages reflect actual backend data.

Ensure apps/api + packages/db have a single, coherent schema for Project, Session, Run, Event.

Make start.sh start the orchestrator, API, web, and WhatsApp gateway consistently.

Phase 1 – Backend Loop & Events
Finalize AgentExecutor in packages/agent-runtime using opencode’s loop as reference.

Integrate packages/execution tools for file operations.

Emit events to packages/events bus from runtime and execution layer.

Add /sessions/:id/run, /sessions/:id/cancel, and /sessions/:id/events/stream in apps/api/apps/orchestrator.

Phase 2 – Web Streaming & Basic Workspace
Implement useSessionEvents hook in apps/web.

Refactor ProjectPage to:

Display real chat messages from events.

Show a minimal timeline on the side.

Show a placeholder editor/preview pane.

Phase 3 – UI Shell & Navigation Rework
Move AppShell to M3‑style app shell:

Top app bar, nav rail (desktop) / bottom nav (mobile).

Organize routes: /projects, /projects/:id/workspace, /approvals, /settings.

Adjust pages to fit within the new layout.

Phase 4 – Editor & File Navigation
Build FileTree + CodeEditor and wire them to backend APIs.

Load file contents and diffs based on events.

Handle simple local edits and saves.

Phase 5 – WhatsApp Integration on New Flow
Update apps/whatsapp-gateway to call new /sessions/:id/run endpoint.

Subscribe to events and push summarized updates to WhatsApp.

Store conversation-state mapping from WhatsApp to Project and Session.

Phase 6 – Polish: Timeline, Preview, Approvals
Expand timeline: filter, group, rich icons.

Build preview tabs: diffs, test status, summary.

Integrate Approvals page with real runs and diffs.

Phase 7 – DX, Observability, and Docs
Add logs/traces to orchestrator and runtime (with run IDs).

Document:

How flows work (diagrams).

How to add new tools.

How web and WhatsApp channels connect.

This is a big refactor, but you are not rebuilding everything—you’re reorganizing and wiring existing pieces (runtime, execution, events, UI kit, WhatsApp gateway) around a clear flow and a streaming event model, exactly like opencode’s agent loop but with a richer workspace surface
