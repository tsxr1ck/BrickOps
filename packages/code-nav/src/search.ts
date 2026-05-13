import { exec } from 'child_process';
import { promisify } from 'util';
import type { SearchResult } from '@brickops/contracts';

const execAsync = promisify(exec);

/**
 * Check if ripgrep (rg) is available on the system.
 */
async function hasRipgrep(): Promise<boolean> {
  try {
    await execAsync('which rg');
    return true;
  } catch {
    return false;
  }
}

/**
 * Search a workspace using ripgrep for speed. Falls back to grep if rg isn't installed.
 */
export async function searchWorkspace(
  workspaceRoot: string,
  query: string,
  options: {
    fileGlob?: string;
    maxResults?: number;
    caseSensitive?: boolean;
  } = {}
): Promise<SearchResult[]> {
  const { fileGlob, maxResults = 50, caseSensitive = false } = options;
  const useRg = await hasRipgrep();

  let cmd: string;

  if (useRg) {
    // ripgrep: fast, respects .gitignore by default
    const parts = ['rg', '--json', '--line-number'];
    if (!caseSensitive) parts.push('--ignore-case');
    if (maxResults) parts.push(`--max-count=${maxResults}`);
    if (fileGlob) parts.push(`--glob='${fileGlob}'`);
    parts.push(`'${escapeShell(query)}'`);
    parts.push(`'${workspaceRoot}'`);
    cmd = parts.join(' ');
  } else {
    // Fallback: grep -rn
    const parts = ['grep', '-rn', '--include="*"'];
    if (!caseSensitive) parts.push('-i');
    parts.push(`'${escapeShell(query)}'`);
    parts.push(`'${workspaceRoot}'`);
    cmd = parts.join(' ');
  }

  try {
    const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });

    if (useRg) {
      return parseRipgrepJson(stdout, maxResults);
    } else {
      return parseGrepOutput(stdout, workspaceRoot, maxResults);
    }
  } catch (error: any) {
    // grep/rg exit code 1 means no matches — that's not an error
    if (error.code === 1) return [];
    throw error;
  }
}

function escapeShell(str: string): string {
  return str.replace(/'/g, "'\\''");
}

function parseRipgrepJson(stdout: string, max: number): SearchResult[] {
  const results: SearchResult[] = [];
  const lines = stdout.trim().split('\n');

  for (const line of lines) {
    if (results.length >= max) break;
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'match') {
        const data = parsed.data;
        results.push({
          filePath: data.path?.text || '',
          line: data.line_number || 0,
          column: data.submatches?.[0]?.start || 0,
          matchText: data.lines?.text?.trim() || '',
          contextBefore: '',
          contextAfter: '',
        });
      }
    } catch {
      // skip malformed JSON lines
    }
  }

  return results;
}

function parseGrepOutput(stdout: string, workspaceRoot: string, max: number): SearchResult[] {
  const results: SearchResult[] = [];
  const lines = stdout.trim().split('\n');

  for (const line of lines) {
    if (results.length >= max) break;
    // grep format: filename:linenum:content
    const match = line.match(/^(.+?):(\d+):(.*)$/);
    if (match) {
      results.push({
        filePath: match[1],
        line: parseInt(match[2], 10),
        column: 0,
        matchText: match[3].trim(),
        contextBefore: '',
        contextAfter: '',
      });
    }
  }

  return results;
}
