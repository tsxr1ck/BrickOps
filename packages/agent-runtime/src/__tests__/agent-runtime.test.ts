import { describe, it, expect } from 'bun:test';
import { buildPrompt, estimatePromptTokens } from '../prompt-builder';
import { selectModelTier, selectDefaultRoles } from '../router';
import { parseJsonFromLLM, parseJsonFromLLMStrict } from '../json-parser';

describe('buildPrompt', () => {
  it('should produce messages in the correct layer order', () => {
    const messages = buildPrompt({
      role: 'frontend-developer',
      taskPrompt: 'Add a settings page',
      projectSummary: 'A fitness tracking app',
    });

    // Should have: persona (system), rules (system), project (system), task (user)
    expect(messages.length).toBe(4);
    expect(messages[0].role).toBe('system');
    expect(messages[0].cacheable).toBe(true);
    expect(messages[0].content).toContain('Frontend Developer');

    expect(messages[1].role).toBe('system');
    expect(messages[1].cacheable).toBe(true);
    expect(messages[1].content).toContain('BrickOps Runtime Rules');

    expect(messages[2].role).toBe('system');
    expect(messages[2].content).toContain('fitness tracking');

    expect(messages[3].role).toBe('user');
    expect(messages[3].content).toContain('settings page');
  });

  it('should append file context to user message', () => {
    const messages = buildPrompt({
      role: 'minimal-change-engineer',
      taskPrompt: 'Fix the login bug',
      context: {
        summary: 'test',
        targetFiles: [
          { path: 'src/auth.ts', reason: 'auth logic', content: 'const x = 1;' },
        ],
        relatedFiles: [
          { path: 'src/routes.ts', reason: 'references auth' },
        ],
        warnings: [],
      },
    });

    const userMsg = messages.find((m) => m.role === 'user')!;
    expect(userMsg.content).toContain('src/auth.ts');
    expect(userMsg.content).toContain('const x = 1;');
    expect(userMsg.content).toContain('src/routes.ts');
  });

  it('should estimate prompt tokens', () => {
    const messages = buildPrompt({
      role: 'router',
      taskPrompt: 'hello world',
    });
    const estimate = estimatePromptTokens(messages);
    expect(estimate).toBeGreaterThan(50); // persona + rules are substantial
  });
});

describe('selectModelTier', () => {
  it('should route cheap tasks to cheap tier', () => {
    expect(selectModelTier('intent-parse')).toBe('cheap');
    expect(selectModelTier('plan-classify')).toBe('cheap');
    expect(selectModelTier('status-summary')).toBe('cheap');
    expect(selectModelTier('whatsapp-response')).toBe('cheap');
  });

  it('should route code tasks to mid tier', () => {
    expect(selectModelTier('code-edit')).toBe('mid');
    expect(selectModelTier('code-scaffold')).toBe('mid');
    expect(selectModelTier('code-review')).toBe('mid');
  });

  it('should route architecture and reality-check to strong tier', () => {
    expect(selectModelTier('architecture-plan')).toBe('strong');
    expect(selectModelTier('reality-check')).toBe('strong');
  });
});

describe('selectDefaultRoles', () => {
  it('should return appropriate roles for code-edit', () => {
    const roles = selectDefaultRoles('code-edit');
    expect(roles).toContain('minimal-change-engineer');
    expect(roles).toContain('code-reviewer');
  });

  it('should return router for intent parsing', () => {
    expect(selectDefaultRoles('intent-parse')).toEqual(['router']);
  });
});

describe('parseJsonFromLLM', () => {
  it('should parse raw JSON', () => {
    const result = parseJsonFromLLM('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('should parse JSON from markdown code fence', () => {
    const input = 'Here is the result:\n```json\n{"key": "value"}\n```\nDone.';
    const result = parseJsonFromLLM(input);
    expect(result).toEqual({ key: 'value' });
  });

  it('should parse JSON from plain code fence', () => {
    const input = '```\n[1, 2, 3]\n```';
    const result = parseJsonFromLLM(input);
    expect(result).toEqual([1, 2, 3]);
  });

  it('should extract embedded JSON from surrounding text', () => {
    const input = 'Sure! Here is the output: {"action": "create_file", "path": "test.ts"} hope this helps.';
    const result = parseJsonFromLLM(input);
    expect(result).toEqual({ action: 'create_file', path: 'test.ts' });
  });

  it('should return null for non-JSON text', () => {
    const result = parseJsonFromLLM('This is just plain text with no JSON.');
    expect(result).toBeNull();
  });

  it('should throw in strict mode for non-JSON', () => {
    expect(() => parseJsonFromLLMStrict('not json')).toThrow('Failed to parse JSON');
  });
});
