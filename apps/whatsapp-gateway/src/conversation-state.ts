/**
 * WhatsApp conversation state tracker.
 *
 * Manages active clarification conversations between the orchestrator
 * and the operator via WhatsApp. When the orchestrator generates
 * follow-up questions, this module tracks:
 * - Which project is awaiting answers
 * - How many questions were asked
 * - What answers have been received
 * - Whether all answers are collected
 *
 * Conversations time out after 10 minutes of inactivity.
 */

export interface ConversationContext {
  projectId: string;
  projectSlug: string;
  projectName: string;
  questions: string[];
  answers: string[];
  expectedCount: number;
  startedAt: number;
  lastActivityAt: number;
}

const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/** operatorJid → active conversation */
const activeConversations = new Map<string, ConversationContext>();

/**
 * Start a clarification conversation.
 * Called when the orchestrator sends follow-up questions.
 */
export function startClarification(
  operatorJid: string,
  projectId: string,
  projectSlug: string,
  projectName: string,
  questions: string[]
): void {
  activeConversations.set(operatorJid, {
    projectId,
    projectSlug,
    projectName,
    questions,
    answers: [],
    expectedCount: questions.length,
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
  });

  console.log(
    `[conversation] Started clarification for ${projectSlug} with ${questions.length} questions → ${operatorJid.split('@')[0]}`
  );
}

/**
 * Record an answer from the operator.
 * Returns whether all answers are now collected.
 */
export function recordAnswer(
  operatorJid: string,
  answer: string
): { complete: boolean; allAnswers: string[]; context: ConversationContext | null } {
  const ctx = activeConversations.get(operatorJid);
  if (!ctx) {
    return { complete: false, allAnswers: [], context: null };
  }

  // Check timeout
  if (Date.now() - ctx.lastActivityAt > TIMEOUT_MS) {
    activeConversations.delete(operatorJid);
    console.log(`[conversation] Timed out for ${ctx.projectSlug}`);
    return { complete: false, allAnswers: [], context: null };
  }

  ctx.answers.push(answer);
  ctx.lastActivityAt = Date.now();

  const complete = ctx.answers.length >= ctx.expectedCount;

  if (complete) {
    // Don't auto-delete — let the handler clear after successful API call
    console.log(
      `[conversation] All ${ctx.expectedCount} answers collected for ${ctx.projectSlug}`
    );
  } else {
    console.log(
      `[conversation] Answer ${ctx.answers.length}/${ctx.expectedCount} for ${ctx.projectSlug}`
    );
  }

  return { complete, allAnswers: ctx.answers, context: ctx };
}

/**
 * Get the active conversation for an operator, if any.
 * Returns null if no active conversation or if timed out.
 */
export function getActiveConversation(operatorJid: string): ConversationContext | null {
  const ctx = activeConversations.get(operatorJid);
  if (!ctx) return null;

  // Check timeout
  if (Date.now() - ctx.lastActivityAt > TIMEOUT_MS) {
    activeConversations.delete(operatorJid);
    return null;
  }

  return ctx;
}

/**
 * Clear a conversation (completed or cancelled).
 */
export function clearConversation(operatorJid: string): void {
  activeConversations.delete(operatorJid);
}

/**
 * Get all active conversations (for debugging/monitoring).
 */
export function getAllActiveConversations(): Map<string, ConversationContext> {
  // Clean up expired entries
  for (const [jid, ctx] of activeConversations) {
    if (Date.now() - ctx.lastActivityAt > TIMEOUT_MS) {
      activeConversations.delete(jid);
    }
  }
  return new Map(activeConversations);
}

// --- Project selection state ---

export interface ProjectSelection {
  projectId: string;
  projectSlug: string;
  projectName: string;
  selectedAt: number;
}

const SELECTION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/** operatorJid → selected project */
const selectedProjects = new Map<string, ProjectSelection>();

/**
 * Set the operator's selected project.
 */
export function selectProject(
  operatorJid: string,
  projectId: string,
  projectSlug: string,
  projectName: string
): void {
  selectedProjects.set(operatorJid, {
    projectId,
    projectSlug,
    projectName,
    selectedAt: Date.now(),
  });
  console.log(
    `[conversation] Project selected: ${projectSlug} → ${operatorJid.split('@')[0]}`
  );
}

/**
 * Get the operator's currently selected project, if any.
 * Returns null if no selection or if timed out.
 */
export function getSelectedProject(operatorJid: string): ProjectSelection | null {
  const sel = selectedProjects.get(operatorJid);
  if (!sel) return null;

  if (Date.now() - sel.selectedAt > SELECTION_TIMEOUT_MS) {
    selectedProjects.delete(operatorJid);
    return null;
  }

  return sel;
}

/**
 * Clear the operator's selected project.
 */
export function clearSelectedProject(operatorJid: string): void {
  selectedProjects.delete(operatorJid);
  console.log(
    `[conversation] Project deselected → ${operatorJid.split('@')[0]}`
  );
}

// --- Active session tracking ---

export interface ActiveSession {
  sessionId: string;
  projectId: string;
  startedAt: number;
}

const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

/** operatorJid → active session */
const activeSessions = new Map<string, ActiveSession>();

/**
 * Set the operator's active session for a project.
 * If they already have a session for this project, it's reused.
 */
export function setActiveSession(operatorJid: string, sessionId: string, projectId: string): void {
  activeSessions.set(operatorJid, { sessionId, projectId, startedAt: Date.now() });
}

/**
 * Get the operator's active session, if any.
 * Returns null if timed out.
 */
export function getActiveSession(operatorJid: string): ActiveSession | null {
  const s = activeSessions.get(operatorJid);
  if (!s) return null;
  if (Date.now() - s.startedAt > SESSION_TIMEOUT_MS) {
    activeSessions.delete(operatorJid);
    return null;
  }
  return s;
}

/**
 * Clear the operator's active session.
 */
export function clearActiveSession(operatorJid: string): void {
  activeSessions.delete(operatorJid);
}

/**
 * Get or create an active session for an operator + project.
 * If the operator already has a session for a different project, returns null
 * (caller should clear first).
 */
export function getSessionForProject(operatorJid: string, projectId: string): ActiveSession | null {
  const s = activeSessions.get(operatorJid);
  if (!s) return null;
  if (Date.now() - s.startedAt > SESSION_TIMEOUT_MS) {
    activeSessions.delete(operatorJid);
    return null;
  }
  if (s.projectId !== projectId) return null;
  return s;
}
