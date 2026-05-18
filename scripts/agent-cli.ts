#!/usr/bin/env bun
/**
 * Agent CLI — interactive terminal for the BrickOps streaming agent loop.
 *
 * Usage:
 *   bun run scripts/agent-cli.ts
 *   bun run scripts/agent-cli.ts --session my-session
 *   bun run scripts/agent-cli.ts --single "List all .ts files in the project"
 */

import { AgentRuntime, OpenAIStreamingProvider, createWorkspaceTools } from '@brickops/agent-runtime';
import { MessageService, SessionService } from '@brickops/db';
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const WORKSPACE = process.cwd();

async function main() {
  const args = process.argv.slice(2);
  const sessionIdx = args.indexOf('--session');
  const singleIdx = args.indexOf('--single');
  const sessionId = sessionIdx !== -1 ? args[sessionIdx + 1] : crypto.randomUUID();
  const singlePrompt = singleIdx !== -1 ? args.slice(singleIdx + 1).join(' ') : null;

  const runtime = new AgentRuntime();
  const messages = new MessageService();
  const sessions = new SessionService();

  sessions.create({ id: sessionId });

  const provider = new OpenAIStreamingProvider({
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://opencode.ai/zen/go/v1',
    modelId: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
  });

  const tools = createWorkspaceTools(WORKSPACE);

  console.log(`\n  BrickOps Agent CLI`);
  console.log(`  Session: ${sessionId}`);
  console.log(`  Model:   ${provider.model().id}`);
  console.log(`  Tools:   ${tools.map((t) => t.info().name).join(', ')}`);
  console.log(`  Workspace: ${WORKSPACE}`);
  console.log();

  if (singlePrompt) {
    console.log(`> ${singlePrompt}\n`);
    for await (const event of runtime.execute(provider, tools, sessions, messages, {
      sessionId,
      content: singlePrompt,
    })) {
      if (event.type === 'error') {
        console.error(`Error: ${event.error?.message}`);
        process.exit(1);
      }
      if (event.message) {
        const text = event.message.parts.filter((p) => p.type === 'text').map((p) => (p as any).text).join('');
        if (text) process.stdout.write(text);
        if (event.done) console.log('\n');
      }
    }
    process.exit(0);
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });

  while (true) {
    const input = await rl.question('\x1b[32m>\x1b[0m ');
    if (!input.trim()) continue;
    if (input === '/quit' || input === '/exit') break;
    if (input === '/cancel') { runtime.cancel(sessionId); console.log('Canceled'); continue; }
    if (input === '/session') { console.log(`Session: ${sessionId}`); continue; }

    for await (const event of runtime.execute(provider, tools, sessions, messages, {
      sessionId,
      content: input,
    })) {
      if (event.type === 'error') {
        console.error(`\nError: ${event.error?.message}`);
        break;
      }
      if (event.message) {
        const text = event.message.parts.filter((p) => p.type === 'text').map((p) => (p as any).text).join('');
        if (text) process.stdout.write(text);
      }
    }
    console.log('\n');
  }

  rl.close();
}

main().catch(console.error);
