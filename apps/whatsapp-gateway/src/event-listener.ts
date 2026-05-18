import { sendText } from './sender';

/**
 * Event listener for WhatsApp — subscribes to session SSE events
 * and pushes summarized updates to the operator.
 *
 * Run summary events are mapped to concise WhatsApp messages:
 * - tool_started   → "Analyzing files..."
 * - file_written / diff_applied → "Applied changes to N files so far"
 * - tests_finished → "Tests passed ✓" or "Tests failed ❌"
 * - run_completed  → "Done! Here's a summary..."
 * - error          → "Something went wrong..."
 */

const API_BASE = process.env.BRICKOPS_API_URL || 'http://localhost:3001';

interface EventListenerOptions {
  recipientJid: string;
  sessionId: string;
  projectId: string;
}

interface SessionEvent {
  type: string;
  sessionId: string;
  projectId: string;
  runId: string;
  timestamp: number;
  [key: string]: unknown;
}

interface ActiveConnections {
  [key: string]: AbortController;
}

const activeConnections: ActiveConnections = {};

/**
 * Start listening to session events, pushing summarized updates
 * to the specified WhatsApp recipient.
 */
export function startEventListener({ recipientJid, sessionId, projectId }: EventListenerOptions): void {
  // Clean up any existing listener for this session
  stopEventListener(sessionId);

  console.log(`[event-listener] Starting SSE for session ${sessionId} → ${recipientJid.split('@')[0]}`);

  const controller = new AbortController();
  activeConnections[sessionId] = controller;

  let fileCount = 0;
  let toolSummary = '';
  let hasError = false;
  let hasTestResults = false;

  const run = async () => {
    try {
      const url = `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/events`;
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'text/event-stream' },
      });

      if (!response.ok || !response.body) {
        console.error(`[event-listener] SSE connection failed: ${response.status}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        let eventData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6).trim();
          } else if (line === '' && eventType && eventData) {
            // Process the complete event
            try {
              const evt = JSON.parse(eventData) as SessionEvent;
              await handleEvent(evt, recipientJid);
            } catch {
              // skip unparseable events
            }
            eventType = '';
            eventData = '';
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(`[event-listener] SSE error: ${err.message}`);
      }
    }
  };

  async function handleEvent(evt: SessionEvent, jid: string) {
    switch (evt.type) {
      case 'llm_thinking_delta':
        if (!toolSummary) {
          toolSummary = 'thinking';
          await sendText(jid, '🤔 Analyzing your request...');
        }
        break;

      case 'tool_started': {
        const toolName = (evt as any).toolName || '';
        if (toolName) {
          await sendText(jid, `🔧 ${toolName}...`);
        }
        break;
      }

      case 'file_written':
      case 'diff_applied': {
        fileCount++;
        break;
      }

      case 'tests_finished': {
        hasTestResults = true;
        const passed = (evt as any).passed;
        const total = (evt as any).total;
        if (passed !== undefined) {
          await sendText(jid, `🧪 Tests ${passed ? 'passed ✓' : 'failed ❌'}${total ? ` (${passed}/${total})` : ''}`);
        } else {
          await sendText(jid, '🧪 Tests finished');
        }
        break;
      }

      case 'session.run_completed': {
        const summary = (evt as any).summary || '';
        let msg = `✅ Done!`;
        if (fileCount > 0) msg += ` Changed ${fileCount} file${fileCount > 1 ? 's' : ''}.`;
        await sendText(jid, msg);
        if (summary) {
          const trimmed = summary.length > 300 ? summary.slice(0, 300) + '...' : summary;
          await sendText(jid, trimmed);
        }
        stopEventListener(sessionId);
        break;
      }

      case 'session.error': {
        if (!hasError) {
          hasError = true;
          const errMsg = (evt as any).message || 'Something went wrong';
          await sendText(jid, `❌ Error: ${errMsg.slice(0, 200)}`);
        }
        stopEventListener(sessionId);
        break;
      }

      case 'heartbeat':
        // ignore
        break;
    }
  }

  run().catch((err) => {
    console.error(`[event-listener] Fatal: ${err.message}`);
  });
}

/**
 * Stop listening to events for a session.
 */
export function stopEventListener(sessionId: string): void {
  const controller = activeConnections[sessionId];
  if (controller) {
    controller.abort();
    delete activeConnections[sessionId];
    console.log(`[event-listener] Stopped SSE for session ${sessionId}`);
  }
}
