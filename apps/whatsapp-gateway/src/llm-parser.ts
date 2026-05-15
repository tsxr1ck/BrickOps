import type { WhatsAppIntent } from '@brickops/contracts';
import { parseIntent as regexParseIntent } from './parser';

/**
 * LLM-based intent parser.
 *
 * Calls the AI directly (bypasses agent-runtime personas)
 * for focused WhatsApp intent classification.
 */

const API_URL = process.env.OPENAI_BASE_URL || 'https://opencode.ai/zen/go/v1';
const API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = 'deepseek-v4-flash';

const INTENT_PROMPT = `You are a WhatsApp message classifier for BrickOps, an AI project builder. Classify the user's message into ONE intent type.

Intent types:
- "create_project": wants to build/start/create something new. Field: description (the project idea)
- "list_projects": wants to see/list projects. No fields
- "select_project": wants to select/switch to/focus on a specific project. Field: projectQuery (the project name or slug)
- "deselect_project": wants to deselect/clear/unset the current project. No fields
- "project_status": wants status/info about a specific project. Field: projectQuery
- "approve": wants to approve something. Field: projectQuery (optional)
- "reject": wants to reject/cancel. Fields: projectQuery (optional), reason (optional)
- "info_request": wants info (files changed, build status, blockers). Fields: query, projectQuery (optional)
- "clarification_answer": answering a follow-up question about a project. Field: answer (their response text)
- "modify_project": wants to change/update/fix/improve/rework/redo an existing project. Fields: projectQuery, request
- "chat": greeting, casual talk, asking how things work, or anything that doesn't fit above. Field: message
- "unknown": only if truly unparseable. Field: rawText

Examples:
"start project for a todo app" → {"type":"create_project","description":"a todo app"}
"build me a landing page" → {"type":"create_project","description":"a landing page"}
"list projects" → {"type":"list_projects"}
"select my app" → {"type":"select_project","projectQuery":"my app"}
"switch to landing page" → {"type":"select_project","projectQuery":"landing page"}
"focus on todo project" → {"type":"select_project","projectQuery":"todo project"}
"deselect" → {"type":"deselect_project"}
"clear project" → {"type":"deselect_project"}
"unset project" → {"type":"deselect_project"}
"status of my app" → {"type":"project_status","projectQuery":"my app"}
"status" → {"type":"project_status","projectQuery":""}
"approve" → {"type":"approve"}
"React with TypeScript" → {"type":"clarification_answer","answer":"React with TypeScript"}
"what files changed" → {"type":"info_request","query":"what files changed"}
"hello" → {"type":"chat","message":"hello"}
"rework the aesthetics" → {"type":"modify_project","projectQuery":"","request":"rework the aesthetics"}
"update landing page styling" → {"type":"modify_project","projectQuery":"landing page","request":"update styling"}
"fix the header on my project" → {"type":"modify_project","projectQuery":"my project","request":"fix the header"}
"change the color scheme" → {"type":"modify_project","projectQuery":"","request":"change the color scheme"}
"improve the design" → {"type":"modify_project","projectQuery":"","request":"improve the design"}
"redo the whole home page" → {"type":"modify_project","projectQuery":"","request":"redo the whole home page"}

Key rules:
- "select", "switch to", "focus on", "work on" + project name → select_project
- "deselect", "clear", "unset", "unfocus" → deselect_project
- If the user mentions rework/update/fix/change/modify/improve/redesign/edit/redo/rebuild an existing thing → modify_project
- If the user mentions build/create/start/make something NEW → create_project
- For modify_project, try to extract projectQuery from the message. If not clear, leave empty
"how does this work" → {"type":"chat","message":"how does this work"}
"hey" → {"type":"chat","message":"hey"}
"can you help me" → {"type":"chat","message":"can you help me"}
"what can you do" → {"type":"chat","message":"what can you do"}

Output ONLY valid JSON. No markdown fences, no explanation.`;

export async function parseIntent(text: string): Promise<WhatsAppIntent> {
  const trimmed = text.trim();

  if (!trimmed) {
    return { type: 'unknown', rawText: '' };
  }

  try {
    const response = await fetch(`${API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: INTENT_PROMPT },
          { role: 'user', content: trimmed },
        ],
        max_tokens: 300,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[llm-parser] API error ${response.status}: ${errBody}`);
      return regexParseIntent(text);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content || '';

    if (!content.trim()) {
      return regexParseIntent(text);
    }

    // Parse JSON from response (strip markdown fences if present)
    const cleaned = content
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      try {
        parsed = repairJson(cleaned);
      } catch {
        console.error('[llm-parser] Could not parse, raw:', content.slice(0, 200));
        return regexParseIntent(text);
      }
    }

    return normalizeIntent(parsed, trimmed);
  } catch (err: any) {
    console.error('[llm-parser] Failed:', err.message);
    return regexParseIntent(text);
  }
}

function repairJson(text: string): any {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('No JSON object found');

  let json = text.slice(start);
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escape = false;

  for (const char of json) {
    if (escape) { escape = false; continue; }
    if (char === '\\') { escape = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === '{') braces++;
    if (char === '}') braces--;
    if (char === '[') brackets++;
    if (char === ']') brackets--;
  }

  if (inString) json += '"';
  for (let i = 0; i < brackets; i++) json += ']';
  for (let i = 0; i < braces; i++) json += '}';

  return JSON.parse(json);
}

function normalizeIntent(raw: any, originalText: string): WhatsAppIntent {
  const type = raw.type;

  switch (type) {
    case 'create_project':
      return { type: 'create_project', description: raw.description || originalText };
    case 'list_projects':
      return { type: 'list_projects' };
    case 'project_status':
      return { type: 'project_status', projectQuery: raw.projectQuery || '' };
    case 'approve':
      return { type: 'approve', projectQuery: raw.projectQuery || undefined };
    case 'reject':
      return { type: 'reject', projectQuery: raw.projectQuery || undefined, reason: raw.reason || undefined };
    case 'info_request':
      return { type: 'info_request', query: raw.query || originalText, projectQuery: raw.projectQuery || undefined };
    case 'modify_project':
      return { type: 'modify_project', projectQuery: raw.projectQuery || '', request: raw.request || originalText };
    case 'select_project':
      return { type: 'select_project', projectQuery: raw.projectQuery || originalText };
    case 'deselect_project':
      return { type: 'deselect_project' };
    case 'clarification_answer':
      return { type: 'clarification_answer', answer: raw.answer || originalText, projectQuery: raw.projectQuery || undefined };
    case 'chat':
      return { type: 'chat', message: raw.message || originalText };
    case 'unknown':
      return { type: 'unknown', rawText: raw.rawText || originalText };
    default:
      return { type: 'chat', message: originalText };
  }
}
