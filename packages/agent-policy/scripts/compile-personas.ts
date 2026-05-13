#!/usr/bin/env bun
/**
 * Persona Compiler
 *
 * Reads raw agency-agents markdown files from src/raw-personas/,
 * strips token-expensive boilerplate, and compiles them into a
 * deterministic JSON dictionary at src/compiled-personas.json.
 *
 * Run: bun run scripts/compile-personas.ts
 *   or: bun run build
 *
 * Why compile?
 *  1. Zero disk I/O at runtime — JSON is bundled into the module graph.
 *  2. Byte-stable prompts — identical bytes every invocation enables
 *     prompt caching on OpenAI (automatic) and Anthropic (explicit).
 *  3. Token savings — stripping frontmatter, templates, and boilerplate
 *     saves 300–3,800 tokens per agent call depending on the persona.
 */

import fs from 'fs';
import path from 'path';

const RAW_DIR = path.join(import.meta.dir, '../src/raw-personas');
const OUT_FILE = path.join(import.meta.dir, '../src/compiled-personas.json');

/**
 * Maps BrickOps pipeline roles → their agency-agents source files.
 * Only the roles we actually use in the orchestrator pipeline.
 */
const ROLE_MAP: Record<string, string> = {
  'planner': 'product-manager.md',
  'software-architect': 'software-architect.md',
  'frontend-developer': 'frontend-developer.md',
  'backend-architect': 'backend-architect.md',
  'ai-engineer': 'ai-engineer.md',
  'code-reviewer': 'code-reviewer.md',
  'reality-checker': 'reality-checker.md',
  'minimal-change-engineer': 'senior-developer.md',
  'scaffold-agent': 'senior-developer.md',
  'project-shepherd': 'project-shepherd.md',
};

/**
 * Sections to strip entirely from specific roles.
 * These are token-heavy template blocks that don't improve agent behavior.
 * Uses partial match strings (emoji variation selectors make exact match fragile).
 */
const STRIP_SECTIONS_BY_ROLE: Record<string, string[]> = {
  'planner': [
    'Technical Deliverables',  // PRD, Opportunity, Roadmap, GTM, Sprint templates (~3,800 tokens)
    'Personality Highlights',  // Quotes block
    'Workflow Process',        // Generic PM phases — not useful for coding planner
    'Success Metrics',         // Generic PM KPIs
    'Communication Style',     // Generic PM voice examples
    'Learning',                // Learning & Memory section
  ],
};

interface FrontmatterData {
  name: string;
  description: string;
}

/**
 * Parse YAML frontmatter from markdown content.
 */
function parseFrontmatter(markdown: string): { frontmatter: FrontmatterData; body: string } {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---/);
  let name = '';
  let description = '';
  let body = markdown;

  if (match) {
    const fm = match[1];
    const nameMatch = fm.match(/^name:\s*(.+)$/m);
    const descMatch = fm.match(/^description:\s*(.+)$/m);
    if (nameMatch) name = nameMatch[1].trim();
    if (descMatch) description = descMatch[1].trim();
    body = markdown.slice(match[0].length);
  }

  return { frontmatter: { name, description }, body };
}

/**
 * Strip entire markdown sections by heading text (partial match).
 * Removes from the heading through to the next real top-level ## heading or EOF.
 * Uses a line-by-line state machine to correctly handle ## headings inside
 * fenced code blocks (which the original regex approach couldn't distinguish).
 */
function stripSections(content: string, sectionTexts: string[]): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let stripping = false;
  let inCodeFence = false;

  for (const line of lines) {
    // Track code fence state
    if (line.trimStart().startsWith('```')) {
      inCodeFence = !inCodeFence;
    }

    // Only consider real headings (not inside code fences)
    if (!inCodeFence && line.startsWith('## ')) {
      // Check if this heading matches any section we want to strip
      const shouldStrip = sectionTexts.some((text) => line.includes(text));
      if (shouldStrip) {
        stripping = true;
        continue;
      } else if (stripping) {
        // We hit a new real ## heading — stop stripping
        stripping = false;
      }
    }

    if (!stripping) {
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Core token-stripping pipeline.
 * Applied to every persona regardless of role.
 */
function extractCoreInstructions(markdown: string, role?: string): string {
  let clean = markdown;

  // 1. Strip boilerplate AI self-references
  clean = clean.replace(/As an AI language model,?\s*/ig, '');
  clean = clean.replace(/I am an AI\b[^.]*\.\s*/ig, '');

  // 2. Strip role-specific heavy sections
  if (role && STRIP_SECTIONS_BY_ROLE[role]) {
    clean = stripSections(clean, STRIP_SECTIONS_BY_ROLE[role]);
  }

  // 3. Strip trailing "Instructions Reference" boilerplate
  clean = clean.replace(/---\s*\n\*\*Instructions Reference\*\*:[\s\S]*$/g, '');

  // 4. Compress triple+ newlines → double newline
  clean = clean.replace(/\n{3,}/g, '\n\n');

  // 5. Trim leading/trailing whitespace
  return clean.trim();
}

interface CompiledPersona {
  name: string;
  description: string;
  systemPrompt: string;
}

async function compile() {
  const compiled: Record<string, CompiledPersona> = {};

  for (const [role, filename] of Object.entries(ROLE_MAP)) {
    const filePath = path.join(RAW_DIR, filename);

    if (!fs.existsSync(filePath)) {
      console.warn(`[compiler] ⚠ Missing file for "${role}": ${filename}`);
      continue;
    }

    const rawContent = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(rawContent);
    const optimizedPrompt = extractCoreInstructions(body, role);

    const displayName = role.replace(/-/g, ' ').toUpperCase();

    compiled[role] = {
      name: frontmatter.name || displayName,
      description: frontmatter.description || '',
      systemPrompt: optimizedPrompt,
    };
  }

  // Inject the BrickOps-native Router (no agency-agents source)
  compiled['router'] = {
    name: 'Router',
    description: 'Classifies request type, risk level, and selects the right specialist.',
    systemPrompt: `You are the BrickOps Router. Your job is to classify incoming requests and route them to the right specialist agent.

For each request, you must output a JSON object with:
- "taskType": one of "intent-parse", "plan-classify", "status-summary", "architecture-plan", "code-edit", "code-scaffold", "code-review", "reality-check", "whatsapp-response"
- "requiredRoles": array of agent roles needed (e.g. ["frontend-developer", "code-reviewer"])
- "riskLevel": "low", "medium", "high", or "critical"
- "reasoning": one sentence explaining your classification

Be precise. Never over-classify risk. Default to "low" unless the request touches auth, secrets, deployments, or destructive operations.`,
  };

  // Write deterministic JSON (sorted keys for byte-stability)
  const sortedCompiled: Record<string, CompiledPersona> = {};
  for (const key of Object.keys(compiled).sort()) {
    sortedCompiled[key] = compiled[key];
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(sortedCompiled, null, 2) + '\n');

  // Report token savings
  console.log(`\n[compiler] ✅ Compiled ${Object.keys(sortedCompiled).length} personas → ${OUT_FILE}\n`);

  for (const [role, data] of Object.entries(sortedCompiled)) {
    const rawFile = ROLE_MAP[role];
    let rawTokens = 0;
    if (rawFile) {
      const rawPath = path.join(RAW_DIR, rawFile);
      if (fs.existsSync(rawPath)) {
        rawTokens = Math.ceil(fs.readFileSync(rawPath, 'utf-8').length / 4);
      }
    }
    const compiledTokens = Math.ceil(data.systemPrompt.length / 4);
    const saved = rawTokens > 0 ? rawTokens - compiledTokens : 0;
    const pct = rawTokens > 0 ? Math.round((saved / rawTokens) * 100) : 0;

    console.log(
      `  ${role.padEnd(25)} ${String(compiledTokens).padStart(5)} tokens` +
        (saved > 0 ? `  (saved ${saved} tokens, -${pct}%)` : '')
    );
  }

  console.log('');
}

compile();
