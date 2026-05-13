import type { WhatsAppIntent } from '@brickops/contracts';

/**
 * WhatsApp intent parser.
 *
 * Maps natural-language operator commands to structured intents
 * using regex + keyword matching. This runs on the cheap — no LLM call.
 *
 * Command patterns from the blueprint:
 *   - "start project for X" / "new app: X" / "create a fullstack app for X"
 *   - "list projects" / "show active projects"
 *   - "status of X" / "what is waiting for me?"
 *   - "approve latest plan" / "approve X"
 *   - "reject deploy for X"
 *   - "what files changed?" / "why did the build fail?" / "show blockers"
 */

// --- Matchers (order matters — first match wins) ---

const CREATE_PATTERNS = [
  /^(?:start|create|new)\s+(?:a\s+)?(?:\w+\s+)*(?:project|app)\s*(?:for|:)?\s*(.+)/i,
  /^(?:build|make)\s+(?:me\s+)?(?:a\s+)?(?:new\s+)?(.+)/i,
];

const LIST_PATTERNS = [
  /^(?:list|show)\s+(?:all\s+)?(?:active\s+)?projects?$/i,
  /^(?:my\s+)?projects?$/i,
  /^what(?:'s|\s+is)\s+(?:active|running)\??$/i,
];

const STATUS_PATTERNS = [
  /^status\s+(?:of\s+)?(.+)/i,
  /^(?:how\s+is|how's)\s+(.+?)(?:\s+doing)?\??$/i,
  /^what(?:'s|\s+is)\s+(?:the\s+)?(?:status|state)\s+(?:of\s+)?(.+?)\??$/i,
  /^what\s+is\s+waiting\s+for\s+me\??$/i,
];

const APPROVE_PATTERNS = [
  /^approve\s+(.+)$/i,
  /^approve\s*$/i,
  /^(?:yes|lgtm|go|ship\s+it)\s*$/i,
];

const REJECT_PATTERNS = [
  /^reject\s+(?:deploy\s+)?(?:for\s+)?(.+?)(?:\s+because\s+(.+))?$/i,
  /^(?:no|nope|stop|cancel)\s*$/i,
];

const INFO_PATTERNS = [
  /^what\s+files?\s+changed\??$/i,
  /^why\s+did\s+(?:the\s+)?build\s+fail\??$/i,
  /^show\s+blockers?\??$/i,
  /^summarize?\s+(?:latest\s+)?run$/i,
  /^(?:what|show|tell\s+me)\s+(.+)/i,
];

export function parseIntent(text: string): WhatsAppIntent {
  const trimmed = text.trim();

  // --- Create project ---
  for (const pattern of CREATE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return { type: 'create_project', description: match[1].trim() };
    }
  }

  // --- List projects ---
  for (const pattern of LIST_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { type: 'list_projects' };
    }
  }

  // --- Approve ---
  for (const pattern of APPROVE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const query = match[1]?.trim();
      return { type: 'approve', projectQuery: query || undefined };
    }
  }

  // --- Reject ---
  for (const pattern of REJECT_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const query = match[1]?.trim();
      const reason = match[2]?.trim();
      return {
        type: 'reject',
        projectQuery: query || undefined,
        reason: reason || undefined,
      };
    }
  }

  // --- Status (checked after approve/reject to avoid conflicts) ---
  for (const pattern of STATUS_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      // "what is waiting for me?" → no project query
      if (/waiting\s+for\s+me/i.test(trimmed)) {
        return { type: 'project_status', projectQuery: '__pending__' };
      }
      return { type: 'project_status', projectQuery: match[1]?.trim() || '' };
    }
  }

  // --- Info request ---
  for (const pattern of INFO_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        type: 'info_request',
        query: trimmed,
        projectQuery: undefined,
      };
    }
  }

  // --- Unknown ---
  return { type: 'unknown', rawText: trimmed };
}
