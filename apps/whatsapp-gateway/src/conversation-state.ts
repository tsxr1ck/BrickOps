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
