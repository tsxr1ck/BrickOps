import fs from 'fs/promises';
import path from 'path';
import type { ContextManifest, TargetFile, RelatedFile, SymbolEntry, FileEntry } from '@brickops/contracts';
import { scanWorkspace } from './scanner';
import { searchWorkspace } from './search';
import { extractSymbolsFromContent } from './symbols';

/**
 * Rough token estimator: ~4 chars per token for English/code.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Read a file and optionally slice it to a specific line range.
 */
async function readFileSlice(
  filePath: string,
  fromLine?: number,
  toLine?: number
): Promise<string> {
  const content = await fs.readFile(filePath, 'utf-8');
  if (fromLine === undefined && toLine === undefined) return content;

  const lines = content.split('\n');
  const start = (fromLine ?? 1) - 1;
  const end = toLine ?? lines.length;
  return lines.slice(start, end).join('\n');
}

/**
 * Build a context manifest for a given task.
 *
 * This is the core intelligence that decides what files and symbols
 * the agent needs to see before making a code change.
 *
 * Strategy:
 * 1. Search the workspace for keywords from the task description.
 * 2. Score files by relevance (number of hits, symbol density, imports).
 * 3. Return the top N files as target files with content slices.
 * 4. Return secondary matches as related files (metadata only).
 */
export async function buildContextManifest(
  workspaceRoot: string,
  taskDescription: string,
  options: {
    maxTargetFiles?: number;
    maxRelatedFiles?: number;
    maxTokenBudget?: number;
  } = {}
): Promise<ContextManifest> {
  const {
    maxTargetFiles = 8,
    maxRelatedFiles = 12,
    maxTokenBudget = 12000,
  } = options;

  const warnings: string[] = [];

  // 1. Extract search keywords from the task description
  const keywords = extractKeywords(taskDescription);
  if (keywords.length === 0) {
    return {
      summary: 'No meaningful keywords extracted from task description.',
      targetFiles: [],
      relatedFiles: [],
      warnings: ['Could not extract search keywords from the task.'],
    };
  }

  // 2. Search workspace for each keyword and score files
  const fileScores = new Map<string, number>();
  const fileHits = new Map<string, Set<string>>();

  for (const keyword of keywords) {
    const results = await searchWorkspace(workspaceRoot, keyword, { maxResults: 30 });
    for (const result of results) {
      const rel = path.relative(workspaceRoot, result.filePath);
      fileScores.set(rel, (fileScores.get(rel) || 0) + 1);
      if (!fileHits.has(rel)) fileHits.set(rel, new Set());
      fileHits.get(rel)!.add(keyword);
    }
  }

  // 3. Sort files by score (descending)
  const scoredFiles = Array.from(fileScores.entries())
    .sort((a, b) => b[1] - a[1]);

  // 4. Build target files with content
  const targetFiles: TargetFile[] = [];
  let tokenBudgetUsed = 0;

  for (const [relPath, score] of scoredFiles) {
    if (targetFiles.length >= maxTargetFiles) break;
    if (tokenBudgetUsed >= maxTokenBudget) {
      warnings.push(`Token budget (${maxTokenBudget}) exhausted. Some files omitted.`);
      break;
    }

    const fullPath = path.join(workspaceRoot, relPath);
    try {
      const content = await readFileSlice(fullPath);
      const contentTokens = estimateTokens(content);

      // If a single file would blow the budget, try to slice it
      if (tokenBudgetUsed + contentTokens > maxTokenBudget && content.split('\n').length > 100) {
        // Only include the first 80 lines for very large files
        const slicedContent = await readFileSlice(fullPath, 1, 80);
        const slicedTokens = estimateTokens(slicedContent);

        targetFiles.push({
          path: relPath,
          reason: `Matched keywords: ${Array.from(fileHits.get(relPath) || []).join(', ')} (score: ${score}, truncated)`,
          fromLine: 1,
          toLine: 80,
          content: slicedContent,
        });
        tokenBudgetUsed += slicedTokens;
      } else {
        targetFiles.push({
          path: relPath,
          reason: `Matched keywords: ${Array.from(fileHits.get(relPath) || []).join(', ')} (score: ${score})`,
          content,
        });
        tokenBudgetUsed += contentTokens;
      }
    } catch {
      // File may have been deleted between scan and read
      warnings.push(`Could not read file: ${relPath}`);
    }
  }

  // 5. Build related files (no content, just references)
  const relatedFiles: RelatedFile[] = [];
  const targetPaths = new Set(targetFiles.map((f) => f.path));

  for (const [relPath, score] of scoredFiles) {
    if (relatedFiles.length >= maxRelatedFiles) break;
    if (targetPaths.has(relPath)) continue;

    relatedFiles.push({
      path: relPath,
      reason: `Matched keywords: ${Array.from(fileHits.get(relPath) || []).join(', ')} (score: ${score})`,
    });
  }

  return {
    summary: `Found ${targetFiles.length} target files and ${relatedFiles.length} related files for: "${taskDescription}"`,
    targetFiles,
    relatedFiles,
    warnings,
    tokenEstimate: tokenBudgetUsed,
  };
}

/**
 * Extract meaningful keywords from a task description.
 * Strips common stop words and short tokens.
 */
function extractKeywords(description: string): string[] {
  const STOP_WORDS = new Set([
    'a', 'an', 'the', 'is', 'it', 'to', 'in', 'for', 'of', 'and', 'or', 'but',
    'with', 'on', 'at', 'by', 'from', 'that', 'this', 'be', 'are', 'was', 'were',
    'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'can', 'may', 'might', 'not', 'no', 'so', 'if', 'then', 'else', 'when',
    'up', 'out', 'about', 'into', 'through', 'just', 'also', 'add', 'fix',
    'make', 'create', 'update', 'change', 'remove', 'delete', 'get', 'set',
    'new', 'use', 'using', 'need', 'want', 'like', 'please', 'implement',
  ]);

  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}
