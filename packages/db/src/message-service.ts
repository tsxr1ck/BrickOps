import type { Message, ContentPart, ToolCall, FinishReason, TextContent } from '@brickops/contracts';

/**
 * In-memory message service.
 *
 * Stores messages in a Map keyed by sessionId.
 * Easily swappable for a Prisma-backed implementation later.
 */
export class MessageService {
  private messages = new Map<string, Message[]>();

  list(sessionId: string): Message[] {
    return [...(this.messages.get(sessionId) || [])].sort(
      (a, b) => a.createdAt - b.createdAt
    );
  }

  create(
    sessionId: string,
    params: {
      role: Message['role'];
      parts?: ContentPart[];
      modelId?: string;
      toolCalls?: ToolCall[];
    }
  ): Message {
    const now = Date.now();
    const msg: Message = {
      id: crypto.randomUUID(),
      sessionId,
      role: params.role,
      parts: params.parts || [],
      modelId: params.modelId,
      toolCalls: params.toolCalls,
      createdAt: now,
      updatedAt: now,
    };
    const existing = this.messages.get(sessionId) || [];
    existing.push(msg);
    this.messages.set(sessionId, existing);
    return msg;
  }

  update(msg: Message): void {
    const existing = this.messages.get(msg.sessionId);
    if (!existing) return;
    const idx = existing.findIndex((m) => m.id === msg.id);
    if (idx === -1) return;
    msg.updatedAt = Date.now();
    existing[idx] = msg;
  }

  get(sessionId: string, messageId: string): Message | undefined {
    return (this.messages.get(sessionId) || []).find(
      (m) => m.id === messageId
    );
  }

  appendPart(sessionId: string, messageId: string, part: ContentPart): void {
    const msg = this.get(sessionId, messageId);
    if (!msg) return;
    msg.parts = [...msg.parts, part];
    this.update(msg);
  }

  setFinishReason(
    sessionId: string,
    messageId: string,
    reason: FinishReason
  ): void {
    const msg = this.get(sessionId, messageId);
    if (!msg) return;
    msg.parts = msg.parts.filter((p) => p.type !== 'finish');
    msg.parts.push({ type: 'finish', reason, time: Date.now() });
    this.update(msg);
  }

  setToolCalls(
    sessionId: string,
    messageId: string,
    toolCalls: ToolCall[]
  ): void {
    const msg = this.get(sessionId, messageId);
    if (!msg) return;
    msg.toolCalls = toolCalls;
    this.update(msg);
  }

  appendContentDelta(sessionId: string, messageId: string, delta: string): void {
    const msg = this.get(sessionId, messageId);
    if (!msg) return;
    const lastText = msg.parts.findLast(
      (p): p is TextContent => p.type === 'text'
    );
    if (lastText) {
      lastText.text += delta;
    } else {
      msg.parts.push({ type: 'text', text: delta });
    }
    this.update(msg);
  }

  clear(sessionId: string): void {
    this.messages.delete(sessionId);
  }
}
