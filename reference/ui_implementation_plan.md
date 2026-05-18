1. Goals and UX Concept
   Make BrickOps feel like Anchor for coding agents:

Strong top app bar with project context (like Anchor’s TopAppBar).

Left “builder/stepper” style navigation for Projects / Approvals / Settings.

Central work area with chat + context (files, diffs, events).

Right preview/insights panel (run logs, cost, tools, tests).

Align visuals with Material Design 3:

M3 color system (tonal palettes, surface and surface-variant, neutral/primary separation).

Updated type roles (headline, title, body, label).

Components like NavigationBar/NavigationRail, TopAppBar, FAB, etc.

Multi‑channel UX:

Web app: primary, rich, multi‑pane environment.

WhatsApp: constrained text interface for the same sessions.

Shared semantics: “project”, “session”, “agent output” are identical regardless of channel.

2. Current UI Audit Summary
   From the repo:

apps/web/src/main.tsx:

Imports @brickops/ui/src/tokens.css and renders App with React 18.

apps/web/src/App.tsx:

BrowserRouter with AppShell from @brickops/ui and routes: /, /project/:slug, /approvals, /new, /settings.

packages/ui:

tokens.css: custom design tokens inspired by Samsung One UI (not M3).

AppShell.tsx: mobile-first layout with sticky header and bottom nav bar containing Projects, Approvals, New, Settings.

Components: Button, Card, Input, EmptyState, StatCard, FilterTabs, Timeline, etc.

Compared to Anchor:

anchor.md’s src/App.tsx uses a three-part layout:

Top app bar.

Left stepper sidebar (builder steps).

Central configuration region.

Right preview panel, plus responsive fallbacks into drawers on mobile.

So BrickOps today is closer to a simple mobile dashboard, while Anchor is a builder workspace—that’s the gap to close.

3. Design System Migration to M3
   3.1. Replace custom tokens with M3‑aligned tokens
   In packages/ui/src/tokens.css:

Introduce M3 semantic tokens:

--md-sys-color-primary, --md-sys-color-on-primary, --md-sys-color-surface, --md-sys-color-on-surface, --md-sys-color-surface-variant, etc.

Token names should mirror M3’s system color roles, not app‑specific names like --bo-bg-primary.

Map BrickOps tokens to M3:

Keep --bo-\* tokens but make them aliases to M3 tokens, e.g.:

css
:root {
--md-sys-color-surface: #fdfcfb;
--md-sys-color-surface-variant: #f1f0ec;
--md-sys-color-primary: #6750a4;
--md-sys-color-on-primary: #ffffff;
/_ ... _/

--bo-bg-primary: var(--md-sys-color-surface);
--bo-bg-elevated: var(--md-sys-color-surface-variant);
--bo-accent: var(--md-sys-color-primary);
--bo-text-primary: var(--md-sys-color-on-surface);
/_ etc. _/
}
Add dark theme:

:root[data-theme="dark"] { ... } with M3 dark scheme colors.

Implement a simple theme toggle in AppShell using data-theme="light|dark" on document.documentElement.

Typography:

Align text sizes to M3 roles (headlineSmall, titleMedium, bodyMedium, labelSmall).

Keep Inter or consider Roboto Flex to lean into M3.

3.2. Update base components to M3 look & feel
For each component in packages/ui/src/components:

Button:

Variants: filled, outlined, text, tonal.

Use M3 radius (slightly rounded, not pill for everything).

Match paddings and label sizes to labelLarge etc.

Card:

Use M3 elevation levels: surface color + shadow + optional stroked borders.

Support “outlined” and “elevated” variants.

Input:

M3 text fields: filled/outlined, label, helper text, and proper focus ring.

EmptyState, FilterTabs, StatCard:

Normalize spacing and typography to M3 tokens.

Ensure states (selected, pressed, disabled) use M3 state layers (opacity overlays, etc.).

Do this inside packages/ui first so the web app can consume a coherent M3 system.

4. Layout Rework: AppShell → Workspace / Builder
   4.1. New layout concept
   Transition AppShell from a mobile-first bottom nav layout to a workspace layout:

Desktop:

Top App Bar across top: project selector, session info, channel indicator (Web / WhatsApp), global actions.

Left Navigation Rail:

Projects

Approvals

Sessions

Settings

Main Content:

For a project: a two‑pane workspace:

Left: context (project overview, files, jobs, approvals).

Right: chat + preview (like a combined Anchor builder + preview).

Mobile:

Top App Bar persists.

NavigationBar at bottom (M3 bottom nav) for the same sections.

Workspace content collapses into stacked sections with toggles or drawers (like Anchor’s MobileSidebarDrawer and MobilePreviewPanel).

4.2. Implementing in AppShell.tsx
Step-by-step:

Split AppShell into structural components:

<Scaffold layout="desktop|mobile"> decides whether to render rail vs bottom nav based on viewport.

AppShellHeader (top app bar) with project title and actions.

AppShellNavRail (left rail) for desktop.

AppShellBottomNav for mobile.

Top App Bar:

Use M3 TopAppBar styling (outlined vs center aligned).

Sections:

Left: BrickOps + project selector.

Middle: session title or last agent action summary.

Right: theme toggle, notifications badge, channel status (e.g. “Web + WhatsApp” pill).

Navigation:

For desktop:

Left rail uses M3 NavigationRail patterns with icons + labels.

For mobile:

Bottom NavigationBar (adapt existing bottomNavStyle but re-skin as M3).

Content container:

Replace the current single mainStyle with a grid layout:

Desktop: grid-template-columns: 280px 1fr 320px (sidebar / main / preview).

Mobile: single column with reflowed modules.

Project detail layout (within ProjectPage):

Left: project outline (files, runs, approvals, environment).

Center: chat transcript, diff viewer.

Right: “preview” modules: commit plan, cost, agent logs, tool timeline.

Take inspiration from Anchor’s App.tsx composition: it orchestrates multiple panels and responsive states (sidebar open/closed, preview open/closed, done modal, toast). You’ll replicate that pattern with “Coding agent workspace” instead of “Markdown builder”.

5. Web Chat UX Design
   5.1. Core chat view
   Add a dedicated ChatWorkpane component (e.g. apps/web/src/pages/ProjectPage.tsx):

Top strip:

Breadcrumb: Project → Session.

Session context: agent model, last status (“Applied changes to 3 files”).

Main scroll area:

Chat bubbles:

User prompts: left-aligned, light surface.

Agent responses: right-aligned, surface-variant, with code blocks.

Inline tool events:

“Reading file src/foo.ts…”

“Applied patch to src/bar.ts.”

Use Timeline component from @brickops/ui for a vertical event list next to the chat.

Input area:

Text field with M3 behaviors.

Chips for quick actions: “Summarize diff”, “Run tests”, “Open file…”.

Drop zone for attachments (later).

5.2. Session list
Under Projects:

Show a list of recent sessions as cards or list items.

Each session row shows:

Title (first user prompt or generated title).

Channel icons indicating used channels (web, WhatsApp).

Status (Active, Finished, Error) using StatusDot.

Clicking a session opens the workspace view with its chat and context.

6. Multi‑Channel Coexistence: Web + WhatsApp
   You already have apps/whatsapp-gateway in the repo. The goal is not a separate product, but a channel that feeds into the same session and UI.

6.1. Session model changes
Extend your Session model to include:

primaryChannel: 'web' | 'whatsapp' | 'mixed'.

channels: array of { type: 'web' | 'whatsapp'; address: string; createdAt: number }.

Messages should carry metadata:

channel: 'web' | 'whatsapp'.

For WhatsApp, externalUserId (phone number or JID).

6.2. WhatsApp gateway behavior
In apps/whatsapp-gateway:

Incoming message:

Map WhatsApp sender → BrickOps user or “external participant”.

Find or create a BrickOps Session linked to that WhatsApp user and selected project.

Create a user message with channel='whatsapp'.

Hand off to agent runtime (your opencode‑style loop) just like a web prompt.

Outgoing messages:

Subscribe to an event stream from the agent runtime (e.g., events package) for AgentEventTypeResponse for sessions that are bound to WhatsApp.

When a new assistant message is committed, convert it to WhatsApp messages (text only or minimal formatting) and send through the gateway.

Idempotency and concurrency:

Ensure the gateway handles duplicates and message ordering.

If a user sends multiple quick messages, either:

Queue them within the same session, or

Use your IsSessionBusy flag to give “I’m still thinking” style responses.

6.3. UI representation of WhatsApp channel
In the web UI:

In session header, show channel chips:

e.g. icons: web browser + WhatsApp.

In messages:

Use a subtle badge/tag to indicate if a user message came from Web or WhatsApp.

Allow “Reply from Web”:

Operator can type into web chat; messages go through same agent runtime and are visible in WhatsApp as replies.

7. Aligning Anchor’s Feel with M3
   Anchor’s UX patterns to emulate in BrickOps (adapted):

Stepwise progression (Anchor’s builder steps):

For BrickOps, these can be phases in a coding session:

Understand request.

Analyze workspace.

Plan changes.

Apply changes.

Verify tests.

Represent them in a vertical progress indicator in the left panel (like Anchor’s StepperSidebar).

Preview panel:

Anchor shows Markdown preview of the generated summary; BrickOps should show:

A file diff preview.

A “plan” summary of upcoming actions.

Test outputs.

Responsive drawers and modals:

On mobile, context panels (files, diffs) and preview should slide in/out from edges, not always visible (this is similar to Anchor’s MobileSidebarDrawer, MobilePreviewPanel).

Toast and completion feedback:

Anchor uses Toast and DoneModal to confirm actions like copy/download; BrickOps can use the same pattern for:

“Applied patch to 3 files.”

“Tests passed/failed.”

“Session summary generated.”

All of this sits on top of M3’s foundations for color, elevation, and motion.

8. Implementation Phases for the UI Rework
   Phase 1 – Design System Refactor (M3)
   Replace or alias tokens.css to M3 color and type tokens.

Implement light/dark mode toggle.

Update Button, Card, Input, EmptyState, StatCard, FilterTabs, Timeline to M3 shapes, typography, and states.

Add new components:

TopAppBar, NavigationRail, NavigationBar, Drawer.

Phase 2 – AppShell and Page Layout
Refactor AppShell.tsx into:

AppShellHeader (M3 top app bar).

AppShellNavRail and AppShellBottomNav.

AppShellLayout that provides grid-based workspace layout.

Update apps/web/src/App.tsx to:

Wrap routes in AppShellLayout.

Reserve dedicated areas for sidebar (project/session list), main content, and preview.

Phase 3 – Chat Workspace
Implement chat timeline and input UI in ProjectPage:

Build ChatTimeline and ChatInput components (under apps/web/src/pages or apps/web/src/components).

Integrate Timeline component to show tool events horizontally or alongside chat.

Implement session list pane:

SessionsList component: filter by project, channel, status.

Add code/diff preview pane:

Minimal: always show last diff or last file the agent changed.

Later: add tabbed preview (Diff / Plan / Logs).

Phase 4 – Multi‑Channel Plumbing
Extend DB models and APIs with channel + externalUserId fields.

Update agent runtime to echo channel metadata back out in events.

Wire apps/whatsapp-gateway to:

Create messages into sessions with correct channel metadata.

Emit outgoing WhatsApp messages on assistant responses.

UI:

Add channel chips to sessions and message bubbles.

Show subtle “WhatsApp” icon when message originates there.

Phase 5 – Advanced Interactions & M3 Details
Add:

FAB for “New Session” in project workspace.

M3 motion: subtle elevation/scale on hover, ripples for clicks.

Implement:

Stepper sidebar for agent progress phases.

Toasts for file edits, test runs, failures.

Modals for risky actions (e.g. applying a large patch).

Phase 6 – Accessibility, Responsiveness, and Polish
Ensure:

Keyboard navigation across all interactive elements.

Proper ARIA for navigation, dialogs, and toasts.

Sufficient contrast in light/dark themes per M3 accessibility guidance.

Responsive:

Test 360px width up to large desktop.

Confirm side rails collapse into drawers or bottom nav correctly.

Phase 7 – Documentation and Storybook
Add a Storybook (or similar) for @brickops/ui:

Document M3-based components and tokens.

Document:

How to add new pages to AppShell.

How to integrate new channels in a consistent way.
