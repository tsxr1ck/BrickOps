import type { Session, TokenUsage } from '@brickops/contracts';

const COST_PER_1M_INPUT = 3.0;
const COST_PER_1M_OUTPUT = 15.0;
const COST_PER_1M_CACHE_CREATION = 3.75;
const COST_PER_1M_CACHE_READ = 0.30;

/**
 * In-memory session service.
 *
 * Tracks session state, token usage, and cost.
 * Mirrors opencode's session management behavior.
 */
export class SessionService {
  private sessions = new Map<string, Session>();

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  create(initialData?: Partial<Session>): Session {
    const now = Date.now();
    const session: Session = {
      id: crypto.randomUUID(),
      cost: 0,
      promptTokens: 0,
      completionTokens: 0,
      createdAt: now,
      updatedAt: now,
      ...initialData,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  save(session: Session): void {
    session.updatedAt = Date.now();
    this.sessions.set(session.id, session);
  }

  /**
   * Track token usage and cost for a session.
   * Mirrors opencode's TrackUsage behaviour.
   */
  trackUsage(
    sessionId: string,
    model: string,
    usage: TokenUsage
  ): void {
    const session = this.get(sessionId);
    if (!session) return;

    session.promptTokens += usage.inputTokens;
    session.completionTokens += usage.outputTokens;

    const inputCost = (COST_PER_1M_INPUT / 1_000_000) * usage.inputTokens;
    const outputCost = (COST_PER_1M_OUTPUT / 1_000_000) * usage.outputTokens;
    const cacheCreationCost = (COST_PER_1M_CACHE_CREATION / 1_000_000) * (usage.cacheCreationTokens || 0);
    const cacheReadCost = (COST_PER_1M_CACHE_READ / 1_000_000) * (usage.cacheReadTokens || 0);

    session.cost += inputCost + outputCost + cacheCreationCost + cacheReadCost;
    this.save(session);
  }

  /**
   * Set the summary message for a session (used in summarization).
   */
  setSummaryMessageId(sessionId: string, messageId: string): void {
    const session = this.get(sessionId);
    if (!session) return;
    session.summaryMessageId = messageId;
    this.save(session);
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
