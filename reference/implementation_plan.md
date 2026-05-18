1. Clarify the Target Behavior (Opencode Model)
   Before touching code, lock in what “behaves like opencode” means in concrete terms. In opencode’s agent.go, the agent loop does this:

Check if the session is busy; if so, reject or queue.

Fetch prior messages for the session; maybe trim based on a summary marker.

Create a new user message with the latest content and attachments; append to history.

Call the provider’s streaming API with the message history and available tools.

While streaming:

Append thinking deltas to a reasoning buffer.

Append content deltas to an assistant message.

Track tool calls as they are announced (EventToolUseStart, EventToolUseStop).

When the stream completes:

If finish reason is ToolUse, execute the requested tools, create a tool-result message, append it to history, and loop back to step 4.

Otherwise, mark the session as done and return the final assistant message.

Also:

There is a per-session Cancel(sessionID) implemented via a sync.Map of cancel funcs and context cancellation.

Sessions track token usage and cost via TrackUsage() using the provider’s usage metadata.

Optional summarization creates a summary message and uses it as a pivot/anchor for truncating history.

That’s the exact behavior you want BrickOps to emulate.

2. High‑Level Architecture for BrickOps
   Design a clear mapping of that behavior onto BrickOps:

Agent runtime layer (packages/agent-runtime)

AgentExecutor (or AgentRuntime) is the equivalent of agent in opencode.

Responsibilities: session state orchestration, loop, streaming, tool execution, cancellation.

Provider layer

Abstractions for OpenAI/Anthropic/etc, returning streaming events like opencode’s ProviderEvent set (ThinkingDelta, ContentDelta, ToolUseStart, ToolUseStop, Error, Complete).

Tool layer

File system tools, code navigation/tools (using code-nav), command execution tools, etc.

Persistence layer (packages/db, packages/events, packages/notifications)

Sessions, messages, events, costs.

API surface

Programmatic: a TS function executeAgent(options) or a small HTTP API (POST /agent/run, POST /agent/cancel, etc.).

Optional UI: chat frontend or HQ‑style app.

Goal: you can run the entire loop headlessly via a single function call + callback/stream, before even thinking about UI.

3. Core Types and Contracts
   3.1. Message and content model
   Mirror opencode’s message.Message and ContentPart enough to represent:

Roles: user, assistant, tool, maybe system.

Parts:

TextContent { text: string }

BinaryContent / Attachment (for future file uploads)

ToolResult parts (structured content from tools)

Finish markers (reason, timestamp)

Implementation plan:

Define a MessageRole union: 'user' | 'assistant' | 'tool' | 'system'.

Define a ContentPart discriminated union in TS:

{ type: 'text'; text: string }

{ type: 'tool_result'; toolCallId: string; content: string; metadata?: any; isError?: boolean }

{ type: 'finish'; reason: FinishReason; time: number }

Later: { type: 'binary'; path: string; mimeType: string; data?: Uint8Array }, etc.

Define Message shape:

id: string

sessionId: string

role: MessageRole

parts: ContentPart[]

modelId?: string

toolCalls?: ToolCall[]

createdAt: number

updatedAt: number

3.2. Tool calls and results
Opencode represents tool calls on the assistant message and creates a separate tool-result message when tools are executed.

Define ToolCall:

id: string

name: string

input: unknown (or Record<string, any>)

status: 'pending' | 'running' | 'completed' | 'error'

Define ToolResult:

toolCallId: string

content: string

metadata?: any

isError: boolean

Define a TS interface for tools:

ts
interface ToolContext {
sessionId: string;
messageId: string;
// workspace root, logger, etc.
}

interface ToolCallInput {
id: string;
name: string;
input: unknown;
}

interface ToolRunResult {
content: string;
metadata?: any;
isError?: boolean;
}

interface BaseTool {
info(): { name: string; description: string; schema?: any };
run(ctx: ToolContext, call: ToolCallInput): Promise<ToolRunResult>;
}
This parallels opencode’s tools.BaseTool and tools.ToolCall.

3.3. Provider events
Map opencode’s ProviderEvent types into TS:

EventThinkingDelta

EventContentDelta

EventToolUseStart

EventToolUseStop

EventError

EventComplete

Define:

ts
type ProviderEvent =
| { type: 'thinking_delta'; content: string }
| { type: 'content_delta'; content: string }
| { type: 'tool_use_start'; toolCall: ToolCall }
| { type: 'tool_use_stop'; toolCallId: string }
| { type: 'error'; error: Error }
| {
type: 'complete';
response: {
toolCalls: ToolCall[];
finishReason: FinishReason;
usage: TokenUsage;
};
};

interface TokenUsage {
inputTokens: number;
outputTokens: number;
cacheCreationTokens?: number;
cacheReadTokens?: number;
}
Provider interface:

ts
interface Provider {
model(): ModelInfo;
streamResponse(
messages: Message[],
tools: BaseTool[]
): AsyncIterable<ProviderEvent>;
sendMessages(
messages: Message[],
tools: BaseTool[]
): Promise<{
content: string;
toolCalls: ToolCall[];
usage: TokenUsage;
finishReason: FinishReason;
}>;
}
sendMessages is for title generation and summarization analogues.

4. Implement the Agent Loop in agent-runtime
   This is the main part. You want an AgentExecutor whose internal behavior mirrors opencode’s agent.processGeneration + streamAndHandleEvents.

4.1. Public API shape
Design something like:

ts
interface ExecuteAgentOptions {
sessionId: string;
content: string;
attachments?: Attachment[];
// debug callbacks, etc.
}

interface AgentEvent {
type: 'response' | 'error' | 'summarize';
message?: Message;
error?: Error;
done?: boolean;
// summarization progress fields later
}

class AgentExecutor {
constructor(
private provider: Provider,
private tools: BaseTool[],
private sessions: SessionService,
private messages: MessageService
) {}

execute(
options: ExecuteAgentOptions
): AsyncIterable<AgentEvent>; // or returns { stream, cancel }
}
Under the hood, execute should:

Check isSessionBusy(sessionId); if busy, surface an ErrSessionBusy‑equivalent.

Create a AbortController and track it in an activeRequests map keyed by sessionId, like opencode’s activeRequests sync.Map.

Spawn an orchestrator that:

builds message history

runs the loop

yields events on every significant change (delta, final response).

4.2. Managing activeRequests and cancellation
Opencode:

Uses context.WithCancel and keeps CancelFunc in activeRequests.

Cancel(sessionID) calls the cancel func for both normal and summarize requests.

You can replicate with:

const activeRequests = new Map<string, AbortController>();

cancel(sessionId) finds the controller and calls .abort().

Implementation steps:

Add an AgentRuntime singleton that has activeRequests:

ts
class AgentRuntime {
private activeRequests = new Map<string, AbortController>();

isBusy(): boolean { return this.activeRequests.size > 0; }
isSessionBusy(sessionId: string): boolean {
return this.activeRequests.has(sessionId);
}
cancel(sessionId: string) {
const ac = this.activeRequests.get(sessionId);
if (ac) ac.abort();
this.activeRequests.delete(sessionId);
const acSumm = this.activeRequests.get(sessionId + '-summarize');
if (acSumm) acSumm.abort();
this.activeRequests.delete(sessionId + '-summarize');
}
}
In execute, create a new AbortController and store it keyed by sessionId. Ensure proper cleanup in finally or after the loop ends.

Wire AbortSignal into provider calls and tool execution so you can stop mid-stream.

4.3. Replicating Run + processGeneration
Opencode’s Run wraps processGeneration in a goroutine, sets up cancellation, and then sends a single final AgentEvent after the loop completes.

In TS, plan:

execute() returns an AsyncGenerator<AgentEvent>.

Inside, implement a while (true) loop very similar to processGeneration:

Fetch session and msgs from SessionService/MessageService.

If no messages yet, spawn a background title generation task (optional).

Handle session.SummaryMessageID by slicing messages so that you start at the summary, and flip its role to user (opencode uses summary as a compressed “prior conversation”).

Create a new user message for content and attachments; append to history.

Call streamAndHandleEvents with the full msgHistory.

4.4. Implement streamAndHandleEvents
Mirror opencode’s structure:

Call provider.streamResponse(history, tools) and get an AsyncIterable<ProviderEvent>.

Create an initial assistant message via MessageService.create().

For each event:

If thinking_delta: append to some reasoning part (maybe a special part type); update the message in the DB.

If content_delta: append to text parts of the assistant message; update DB.

If tool_use_start: record a new ToolCall on the assistant message; update DB.

If tool_use_stop: mark the relevant tool call as finished (you can store a status in the ToolCall object); update DB.

If error: handle context cancel specially vs other errors; break.

If complete:

Set toolCalls and finishReason on the assistant message; update DB.

Call trackUsage(sessionId, model, usage) to update session token counts and cost.

After the stream closes, build toolResults similarly to opencode:

Iterate over toolCalls in order.

If AbortSignal is aborted:

For the current and remaining tool calls, generate synthetic "Tool execution canceled by user" or similar errors, and mark message as FinishReasonCanceled.

For each tool:

Resolve the tool from the list by name.

If not found: generate a ToolResult with an error content "Tool not found: name".

Else, call tool.run(ctx, ToolCall) with session & message context.

If permission error: set FinishReasonPermissionDenied; mark remaining tool calls as cancelled.

If there are any tool results:

Create a tool role message containing each ToolResult as one ContentPart.

Return { assistantMsg, toolMsg }.

If none, return { assistantMsg, toolMsg: undefined }.

From the higher‑level processGeneration loop:

If assistantMsg.finishReason === 'tool_use' and toolMsg is present, append assistantMsg and toolMsg to msgHistory and continue.

Otherwise, yield an AgentEvent of type response with final assistant message and break.

4.5. Debug logging and traces
Opencode, when cfg.Debug is enabled, writes tool results JSON per sequence ID with WriteToolResultsJson to help debug agent behavior.

You should:

Add a debug flag to AgentExecutor and, for each loop iteration:

Write messages + toolResults to a log file/DB row.

Optionally store them in a reference folder for manual inspection.

5. Workspace Tools for Multi‑File Editing
   To get “edit multiple files from one request,” you need robust tools and a contract for how the model expresses edits.

5.1. Filesystem tools
Implement tools:

read_file

Input: { path: string; offset?: number; limit?: number }

Validations: path must be inside workspace root; handle missing files gracefully.

Output: file content, maybe truncated.

write_file

Input: { path: string; content: string }

Strategy: either overwrite or require user‑approved patch later.

Should ensure directories exist and not escape workspace.

apply_diff / apply_patch

Input: { path: string; diff: string } (unified diff or your own patch format).

Implementation: parse diff, apply to file; handle conflicts.

list_files

Input: { pattern?: string }

Output: list of candidate files for the agent to inspect.

search_in_files

Input: query string, optional glob or extension filter.

Output: matches with file/line context.

Each of these implements BaseTool and is registered with the agent runtime for coding sessions.

5.2. Code navigation tools
Use code-nav package to implement:

scan_workspace: precompute a symbol index.

search_workspace: search definitions/references.

extract_symbols: get top‑level symbols from a file.

build_context_manifest: produce a summary of relevant files for a query.

Design tools like:

find_symbol_usages

Input: language, symbol name.

Output: list of (file, line, context) hits.

get_symbol_definition

Input: symbol identifier.

Output: full definition snippet.

Those are the equivalents of opencode’s “code nav” capabilities that let the model reason cross‑file.

5.3. Edit protocol
You need a consistent protocol for file edits to avoid hallucinated diff formats.

Pick one of:

Whole file replacement (simpler to implement, riskier for big files)

Prompt the model to always return full new file content.

write_file tool just replaces content.

Patch-based (closer to opencode’s careful editing)

Define a JSON schema like:

json
{
"path": "src/foo.ts",
"edits": [
{
"kind": "replace_range",
"start": { "line": 10, "column": 0 },
"end": { "line": 20, "column": 0 },
"newText": "..."
}
]
}
Have the model call apply_edits with an array of these.

Tool implementation loads file, applies edits in reverse order (so indexes stay valid), writes back.

In both cases, embed this contract into your system prompt (agent policy) so the model adheres to it.

6. Session & State Management
   You want session behavior similar to opencode:

Sessions table: id, title, summaryMessageId, cost, promptTokens, completionTokens, created/updated timestamps.

Messages table: as defined above.

Summary mechanism: summary message acts as a “pivot” from which future history is built.

6.1. Session service
Implement a SessionService with:

get(sessionId) → session

save(session) → updated session

create(initialData) → new session

Add logic to:

Track cost and tokens using trackUsage(sessionId, model, usage), exactly like opencode:
cost = costPer1MInCached/1e6 \* cacheCreationTokens + ...

6.2. Message service
Implement a MessageService with:

list(sessionId) → messages sorted by time.

create(sessionId, params) → new message.

update(message) → persists modifications (new parts, finish reason, etc.).

Support:

Adding finish reasons (finishReason, finishTime).

Appending content and reasoning text.

Adding and updating tool calls.

6.3. Summarization
Port opencode’s summarization behavior:

Only for certain agent types (e.g., coder).

Summarization is a separate provider (summarizeProvider).

Summarize flow:

Check session not busy; create AbortController keyed by sessionId + '-summarize'.

Load all messages in session.

Append a “summarize prompt” system/user message: “Provide a detailed but concise summary...”.

Call summarize provider’s sendMessages (non-streaming is fine).

Create a new assistant message with the summary and a Finish part.

Set session.summaryMessageId = summaryMessage.id.

Update session’s token usage and cost for summarization.

In the main loop, when building history:

If summaryMessageId exists:

Find index of the summary message in msgs.

Slice msgs starting from that index.

Flip role of msgs[0] to user to treat the summary as condensed context.

7. Provider Abstraction and Model Selection
   You mentioned OpenAI/Anthropic style; opencode’s createAgentProvider chooses a model per agent and configures provider with API key, system message, max tokens, and reasoning flags.

Plan:

Configuration:

A config package that has agents[agentName] -> { modelId, maxTokens, reasoningEffort }.

A models map that defines provider, pricing, defaultMaxTokens, and canReason.

Provider creation:

createAgentProvider(agentName): look up config, find model, get provider config, create provider with:

API key

system message (from persona/agent-policy)

model ID

max tokens (from model or agent-specific override)

reasoning options (e.g., OpenAI or Anthropic thinking features).

Support switching models:

AgentRuntime.update(agentName, modelId):

Refuse if runtime is currently busy (isBusy()).

Update config and reload provider, like opencode does.

8. Exposed APIs and Integration
   To use this runtime from everywhere (CLI, web app, HQ frontend), define stable entrypoints.

8.1. In-process API
executeAgent(options): AsyncIterable<AgentEvent>

For CLI and scripts.

cancelAgent(sessionId: string): void

8.2. HTTP API
POST /api/agent/run

Body: { sessionId, content, attachments?, agentName }.

Stream SSE or chunked JSON with events (deltas, tool debug, final).

POST /api/agent/cancel

Body: { sessionId }.

8.3. UI-level integration
hq-style app or your own TUI can:

Maintain a local session ID and reuse it across requests.

Listen to streaming events; render:

thinking vs final content

tool calls & results (maybe in a sidebar)

Offer “Cancel” button mapped to /cancel.

9. Testing & Validation Strategy
   9.1. Unit tests
   Tools: each tool’s behavior (especially file edits) must be deterministic and idempotent.

Provider adapters: test parsing of model outputs into ProviderEvents.

Message and session services: verify correct ordering, updates, finish reasons.

9.2. Loop tests
Design tests to verify:

When model returns no tools, loop executes exactly once and ends with FinishReasonEndTurn equivalent.

When model returns tools:

Tools are executed in order.

Tool result message is created.

Loop re-enters with the new messages and eventually stops.

When AbortSignal is fired:

Provider streaming stops.

Tools for current cycle are marked as canceled.

FinishReasonCanceled is written.

9.3. Scenario tests
Create canned prompts and mock provider responses to simulate:

Simple single‑file edit.

Multi‑file refactor (function moved from file A to B).

Search + edit: search for symbol, find usages, patch all call-sites.

Summarization: long conversation followed by summarize call and resumed coding with compressed context.

10. Rollout Phases
    To actually implement this without getting lost, break it down:

Phase 1: Plumbing & Types
Create/complete Message, ContentPart, ToolCall, ToolResult types.

Implement MessageService and SessionService (even if in-memory at first).

Implement basic Provider interface and one real adapter (OpenAI or Anthropic).

Phase 2: Minimal Agent Loop
Implement AgentRuntime.isSessionBusy, cancel, activeRequests.

Implement AgentExecutor.execute() with:

Load history, append user message.

Call streamResponse.

Handle content deltas, thinking deltas.

Handle final completion with no tools.

No tools yet — just chat completion.

Phase 3: Tool Calls and Re‑entry
Implement tool registration and lookup.

Implement streamAndHandleEvents with tool_use_start, tool_use_stop handling.

Implement tool execution and creation of tool role message.

Implement the while (true) loop with re‑entry when finish reason is tool_use.

Phase 4: Workspace & Code Nav Tools
Implement read_file, write_file, apply_edits tools.

Implement search_workspace, extract_symbols, and other code-nav tools using code-nav.

Wire them into the runtime for a “coding” agent.

Phase 5: Summarization & Title
Implement title generation for new sessions (optional).

Implement summarization provider, summary message, and history pivoting using summary, as in opencode.

Phase 6: Observability & DX
Add debug traces (tool results JSON, message logs).

Add cost and token tracking like TrackUsage.

Add config for enabling/disabling providers and models.

Phase 7: UI / Integrations
Add CLI (e.g., bun start or node scripts/agent-cli.ts) that:

Reads user input

Calls executeAgent

Streams output to terminal
