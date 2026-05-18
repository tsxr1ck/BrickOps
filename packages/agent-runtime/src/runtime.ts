import type { Provider, Tool, Message } from '@brickops/contracts';
import type { MessageService, SessionService } from '@brickops/db';

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
    const { sessionId, content } = options;

    // Check session busy
    if (this.isSessionBusy(sessionId)) {
      yield {
        type: 'error',
        error: new Error(`Session ${sessionId} is busy`),
        done: true,
      };
      return;
    }

    const controller = new AbortController();
    this.trackRequest(sessionId, controller);

    try {
      // Ensure session exists
      let session = sessions.get(sessionId);
      if (!session) {
        session = sessions.create({ id: sessionId });
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
          controller.signal
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

        yield {
          type: 'response',
          message: assistantMsg,
          done: true,
        };
        break;
      }
    } catch (error: any) {
      if (controller.signal.aborted) {
        yield { type: 'response', done: true };
      } else {
        yield { type: 'error', error, done: true };
      }
    } finally {
      this.untrackRequest(sessionId);
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
    if (this.isSessionBusy(sessionId)) return undefined;

    const controller = new AbortController();
    this.trackRequest(sessionId + '-summarize', controller);

    try {
      const history = messages.list(sessionId);
      if (history.length === 0) return undefined;

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

      return summaryMsg;
    } catch (err: any) {
      return undefined;
    } finally {
      this.untrackRequest(sessionId + '-summarize');
    }
  }

  private async streamAndHandleEvents(
    provider: Provider,
    tools: Tool[],
    sessionId: string,
    history: Message[],
    messages: MessageService,
    abortSignal: AbortSignal
  ): Promise<{ assistantMsg: Message; toolMsg: Message | undefined }> {
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

        switch (event.type) {
          case 'thinking_delta':
            messages.appendContentDelta(sessionId, assistantMsg.id, event.content);
            break;

          case 'content_delta':
            messages.appendContentDelta(sessionId, assistantMsg.id, event.content);
            break;

          case 'tool_use_start':
            toolCalls.push(event.toolCall);
            messages.setToolCalls(sessionId, assistantMsg.id, [...toolCalls]);
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

    for (const tc of toolCalls) {
      if (abortSignal.aborted) {
        toolResults.push({
          type: 'tool_result',
          toolCallId: tc.id,
          content: 'Tool execution canceled by user',
          isError: true,
        });
        continue;
      }

      const tool = filteredTools.find((t) => t.info().name === tc.name);
      if (!tool) {
        toolResults.push({
          type: 'tool_result',
          toolCallId: tc.id,
          content: `Tool not found: ${tc.name}`,
          isError: true,
        });
        continue;
      }

      try {
        const result = await tool.run(
          { sessionId, messageId: assistantMsg.id, abortSignal },
          { id: tc.id, name: tc.name, input: tc.input }
        );
        toolResults.push({
          type: 'tool_result',
          toolCallId: tc.id,
          content: result.content,
          metadata: result.metadata,
          isError: result.isError || false,
        });
      } catch (err: any) {
        toolResults.push({
          type: 'tool_result',
          toolCallId: tc.id,
          content: `Tool execution error: ${err.message}`,
          isError: true,
        });
      }
    }

    // Create tool role message with results
    const toolMsg =
      toolResults.length > 0
        ? messages.create(sessionId, {
            role: 'tool',
            parts: toolResults,
          })
        : undefined;

    return { assistantMsg: updatedMsg, toolMsg };
  }
}
