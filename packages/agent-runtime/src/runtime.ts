import type { Provider, Tool, Message } from '@brickops/contracts';
import type { MessageService, SessionService } from '@brickops/db';
import { logger } from './logger';

export interface AgentEvent {
  type: 'response' | 'error' | 'summarize';
  message?: Message;
  error?: Error;
  done?: boolean;
}

export interface ExecuteAgentOptions {
  sessionId: string;
  content: string;
  attachments?: { path: string; mimeType: string; data?: Uint8Array }[];
  emit?: (event: Record<string, unknown>) => void;
}

/**
 * AgentRuntime — singleton that manages active agent sessions.
 *
 * Mirrors opencode's activeRequests sync.Map and cancellation behaviour.
 */
export class AgentRuntime {
  private activeRequests = new Map<string, AbortController>();

  isBusy(): boolean {
    return this.activeRequests.size > 0;
  }

  isSessionBusy(sessionId: string): boolean {
    return this.activeRequests.has(sessionId);
  }

  cancel(sessionId: string): void {
    logger.info('cancel requested', { sessionId });
    const ac = this.activeRequests.get(sessionId);
    if (ac) {
      ac.abort();
      this.activeRequests.delete(sessionId);
    }
    const acSumm = this.activeRequests.get(sessionId + '-summarize');
    if (acSumm) {
      acSumm.abort();
      this.activeRequests.delete(sessionId + '-summarize');
    }
  }

  private trackRequest(sessionId: string, controller: AbortController): void {
    this.activeRequests.set(sessionId, controller);
  }

  private untrackRequest(sessionId: string): void {
    this.activeRequests.delete(sessionId);
  }

  /**
   * Execute an agent round-trip with the opencode-style streaming loop.
   */
  execute(
    provider: Provider,
    tools: Tool[],
    sessions: SessionService,
    messages: MessageService,
    options: ExecuteAgentOptions
  ): AsyncGenerator<AgentEvent> {
    return this.executeStream(provider, tools, sessions, messages, options);
  }

  private async *executeStream(
    provider: Provider,
    tools: Tool[],
    sessions: SessionService,
    messages: MessageService,
    options: ExecuteAgentOptions
  ): AsyncGenerator<AgentEvent> {
    const { sessionId, content, emit } = options;
    const runId = sessionId;

    logger.info('execute start', { runId, sessionId, contentLength: content.length });

    // Check session busy
    if (this.isSessionBusy(sessionId)) {
      logger.warn('session busy, rejecting', { runId, sessionId });
      yield {
        type: 'error',
        error: new Error(`Session ${sessionId} is busy`),
        done: true,
      };
      return;
    }

    const controller = new AbortController();
    this.trackRequest(sessionId, controller);

    const startedAt = Date.now();

    try {
      // Ensure session exists
      let session = sessions.get(sessionId);
      if (!session) {
        session = sessions.create({ id: sessionId });
        logger.info('created new session', { runId, sessionId });
      }

      // Ensure a message history starting point
      let history = messages.list(sessionId);

      // Handle summarization pivot: if session has a summary message,
      // slice history from that point and flip its role to user
      if (session.summaryMessageId) {
        const summaryIdx = history.findIndex(
          (m) => m.id === session.summaryMessageId
        );
        if (summaryIdx !== -1) {
          history = history.slice(summaryIdx);
          if (history.length > 0 && history[0].role === 'assistant') {
            history[0] = { ...history[0], role: 'user' as const };
          }
        }
      }

      // Create the user's new message
      const userMsg = messages.create(sessionId, {
        role: 'user',
        parts: [{ type: 'text', text: content }],
      });
      history = [...history, userMsg];

      // Main agent loop (re-enters on tool_use)
      while (true) {
        if (controller.signal.aborted) {
          break;
        }

        // Call the provider and stream events
        const { assistantMsg, toolMsg } = await this.streamAndHandleEvents(
          provider,
          tools,
          sessionId,
          history,
          messages,
          controller.signal,
          emit
        );

        if (controller.signal.aborted) {
          break;
        }

        // Check finish reason
        const finishPart = assistantMsg.parts.find((p) => p.type === 'finish');
        const finishReason = finishPart?.type === 'finish' ? finishPart.reason : 'end_turn';

        if (finishReason === 'tool_use' && toolMsg) {
          history = [...history, assistantMsg, toolMsg];
          yield { type: 'response', message: toolMsg };
          continue;
        }

        const durationMs = Date.now() - startedAt;
        logger.info('execute complete', { runId, sessionId, durationMs, finishReason });
        yield {
          type: 'response',
          message: assistantMsg,
          done: true,
        };
        break;
      }
    } catch (error: any) {
      const durationMs = Date.now() - startedAt;
      logger.error('execute failed', { runId, sessionId, durationMs, error: error.message });
      if (controller.signal.aborted) {
        yield { type: 'response', done: true };
      } else {
        yield { type: 'error', error, done: true };
      }
    } finally {
      this.untrackRequest(sessionId);
      const durationMs = Date.now() - startedAt;
      logger.info('execute exit', { runId, sessionId, durationMs });
    }
  }

  /**
   * Summarize session history using a non-streaming provider call.
   * Creates a summary message and sets it as the session pivot point.
   */
  async summarize(
    summarizeProvider: Provider,
    sessions: SessionService,
    messages: MessageService,
    sessionId: string
  ): Promise<Message | undefined> {
    const runId = sessionId + '-summarize';
    if (this.isSessionBusy(sessionId)) {
      logger.warn('summarize skipped — session busy', { runId, sessionId });
      return undefined;
    }

    const startedAt = Date.now();
    logger.info('summarize start', { runId, sessionId });

    const controller = new AbortController();
    this.trackRequest(runId, controller);

    try {
      const history = messages.list(sessionId);
      if (history.length === 0) {
        logger.info('summarize skipped — empty history', { runId, sessionId });
        return undefined;
      }

      const summarizePrompt: Message = {
        id: 'summarize-prompt',
        sessionId,
        role: 'user' as const,
        parts: [
          {
            type: 'text' as const,
            text: 'Provide a detailed but concise summary of the above conversation. Include all key decisions, file changes, errors encountered, and the current state of work. This summary will be used as context for future requests in this session.',
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = await summarizeProvider.sendMessages([
        ...history,
        summarizePrompt,
      ]);

      const summaryMsg = messages.create(sessionId, {
        role: 'assistant',
        parts: [
          { type: 'text', text: result.content },
          { type: 'finish', reason: 'end_turn', time: Date.now() },
        ],
        modelId: summarizeProvider.model().id,
      });

      sessions.setSummaryMessageId(sessionId, summaryMsg.id);
      sessions.trackUsage(sessionId, summarizeProvider.model().id, result.usage);

      const durationMs = Date.now() - startedAt;
      logger.info('summarize complete', { runId, sessionId, durationMs });
      return summaryMsg;
    } catch (err: any) {
      const durationMs = Date.now() - startedAt;
      logger.error('summarize failed', { runId, sessionId, durationMs, error: err.message });
      return undefined;
    } finally {
      this.untrackRequest(runId);
    }
  }

  private async streamAndHandleEvents(
    provider: Provider,
    tools: Tool[],
    sessionId: string,
    history: Message[],
    messages: MessageService,
    abortSignal: AbortSignal,
    emit?: (event: Record<string, unknown>) => void
  ): Promise<{ assistantMsg: Message; toolMsg: Message | undefined }> {
    const runId = sessionId;
    const startedAt = Date.now();
    logger.info('streamAndHandleEvents start', { runId, sessionId });

    const assistantMsg = messages.create(sessionId, {
      role: 'assistant',
      parts: [],
    });

    const filteredTools = tools.filter((t) => {
      const info = t.info();
      return info.name !== '' || info.description !== '';
    });

    const eventStream = provider.streamResponse(history, filteredTools);
    let toolCalls: import('@brickops/contracts').ToolCall[] = [];
    let usage: import('@brickops/contracts').TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
    };
    let finishReason: import('@brickops/contracts').FinishReason = 'end_turn';

    try {
      for await (const event of eventStream) {
        if (abortSignal.aborted) break;

        const ts = Date.now();
        switch (event.type) {
          case 'thinking_delta':
            messages.appendReasoningDelta(sessionId, assistantMsg.id, event.content);
            emit?.({ type: 'llm_thinking_delta', sessionId, runId: sessionId, content: event.content, timestamp: ts });
            break;

          case 'content_delta':
            messages.appendContentDelta(sessionId, assistantMsg.id, event.content);
            emit?.({ type: 'llm_content_delta', sessionId, runId: sessionId, content: event.content, timestamp: ts });
            break;

          case 'tool_use_start':
            toolCalls.push(event.toolCall);
            messages.setToolCalls(sessionId, assistantMsg.id, [...toolCalls]);
            emit?.({ type: 'tool_started', sessionId, runId: sessionId, toolName: event.toolCall.name, toolCallId: event.toolCall.id, input: event.toolCall.input as Record<string, unknown>, timestamp: ts });
            break;

          case 'tool_use_stop':
            break;

          case 'error':
            messages.setFinishReason(sessionId, assistantMsg.id, 'error');
            throw event.error;

          case 'complete':
            finishReason = event.response.finishReason;
            toolCalls = event.response.toolCalls;
            usage = event.response.usage;
            messages.setToolCalls(sessionId, assistantMsg.id, toolCalls);
            messages.setFinishReason(sessionId, assistantMsg.id, finishReason);
            break;
        }
      }
    } catch (error: any) {
      messages.setFinishReason(sessionId, assistantMsg.id, 'error');
      throw error;
    }

    const updatedMsg = messages.get(sessionId, assistantMsg.id) || assistantMsg;

    // If no tool calls, done
    if (toolCalls.length === 0) {
      return { assistantMsg: updatedMsg, toolMsg: undefined };
    }

    // Execute tool calls
    const toolResults: import('@brickops/contracts').ToolResultContent[] = [];

    const toolStart = Date.now();
    logger.info('tool calls start', { runId, sessionId, toolCount: toolCalls.length, toolNames: toolCalls.map(t => t.name) });

    for (const tc of toolCalls) {
      const toolTs = Date.now();
      if (abortSignal.aborted) {
        toolResults.push({
          type: 'tool_result',
          toolCallId: tc.id,
          content: 'Tool execution canceled by user',
          isError: true,
        });
        emit?.({ type: 'tool_finished', sessionId, runId: sessionId, toolName: tc.name, toolCallId: tc.id, result: 'canceled', isError: true, timestamp: toolTs });
        continue;
      }

      const tool = filteredTools.find((t) => t.info().name === tc.name);
      if (!tool) {
        logger.warn('tool not found', { runId, sessionId, toolName: tc.name, toolCallId: tc.id });
        toolResults.push({
          type: 'tool_result',
          toolCallId: tc.id,
          content: `Tool not found: ${tc.name}`,
          isError: true,
        });
        emit?.({ type: 'tool_finished', sessionId, runId: sessionId, toolName: tc.name, toolCallId: tc.id, result: `Tool not found: ${tc.name}`, isError: true, timestamp: toolTs });
        continue;
      }

      const toolRunStart = Date.now();
      logger.info('tool run start', { runId, sessionId, toolName: tc.name, toolCallId: tc.id });
      try {
        const result = await tool.run(
          { sessionId, messageId: assistantMsg.id, abortSignal },
          { id: tc.id, name: tc.name, input: tc.input }
        );
        const toolDuration = Date.now() - toolRunStart;
        toolResults.push({
          type: 'tool_result',
          toolCallId: tc.id,
          content: result.content,
          metadata: result.metadata,
          isError: result.isError || false,
        });
        emit?.({ type: 'tool_finished', sessionId, runId: sessionId, toolName: tc.name, toolCallId: tc.id, result: result.content, isError: result.isError || false, timestamp: toolTs });
        logger.info('tool run complete', { runId, sessionId, toolName: tc.name, toolCallId: tc.id, durationMs: toolDuration, isError: result.isError || false });
      } catch (err: any) {
        const toolDuration = Date.now() - toolRunStart;
        logger.error('tool run failed', { runId, sessionId, toolName: tc.name, toolCallId: tc.id, durationMs: toolDuration, error: err.message });
        toolResults.push({
          type: 'tool_result',
          toolCallId: tc.id,
          content: `Tool execution error: ${err.message}`,
          isError: true,
        });
        emit?.({ type: 'tool_finished', sessionId, runId: sessionId, toolName: tc.name, toolCallId: tc.id, result: `Tool execution error: ${err.message}`, isError: true, timestamp: toolTs });
      }
    }

    const toolDuration = Date.now() - toolStart;
    logger.info('tool calls complete', { runId, sessionId, toolCount: toolCalls.length, totalDurationMs: toolDuration });

    // Create tool role message with results
    const toolMsg =
      toolResults.length > 0
        ? messages.create(sessionId, {
            role: 'tool',
            parts: toolResults,
          })
        : undefined;

    const durationMs = Date.now() - startedAt;
    logger.info('streamAndHandleEvents complete', { runId, sessionId, durationMs, hasToolMsg: !!toolMsg });
    return { assistantMsg: updatedMsg, toolMsg };
  }
}
