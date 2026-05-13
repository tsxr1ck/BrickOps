import fs from 'fs/promises';
import type { SymbolEntry } from '@brickops/contracts';

/**
 * Regex-based symbol extractor for TypeScript/JavaScript files.
 * This is intentionally lightweight — a future version can use Tree-sitter
 * or the TS compiler API for deeper structural parsing.
 */

const PATTERNS: Array<{
  kind: SymbolEntry['kind'];
  regex: RegExp;
  exported: boolean;
}> = [
  // export function foo(
  { kind: 'function', regex: /^export\s+(?:async\s+)?function\s+(\w+)/gm, exported: true },
  // export const foo =
  { kind: 'variable', regex: /^export\s+const\s+(\w+)/gm, exported: true },
  // export class Foo
  { kind: 'class', regex: /^export\s+class\s+(\w+)/gm, exported: true },
  // export interface Foo
  { kind: 'interface', regex: /^export\s+interface\s+(\w+)/gm, exported: true },
  // export type Foo
  { kind: 'type', regex: /^export\s+type\s+(\w+)/gm, exported: true },
  // export enum Foo
  { kind: 'enum', regex: /^export\s+enum\s+(\w+)/gm, exported: true },
  // function foo( (non-exported)
  { kind: 'function', regex: /^(?:async\s+)?function\s+(\w+)/gm, exported: false },
  // class Foo (non-exported)
  { kind: 'class', regex: /^class\s+(\w+)/gm, exported: false },
  // import { foo } from ...
  { kind: 'import', regex: /^import\s+(?:type\s+)?(?:\{[^}]+\}|(\w+))\s+from/gm, exported: false },
  // Hono/Express route patterns: app.get('/path', ...) or router.post(
  { kind: 'route', regex: /(?:app|router)\.(get|post|put|delete|patch|use)\s*\(\s*['"`]([^'"`]+)['"`]/gm, exported: false },
];

/**
 * Extract symbols from a single file's content.
 */
export function extractSymbolsFromContent(content: string, filePath: string): SymbolEntry[] {
  const symbols: SymbolEntry[] = [];
  const lines = content.split('\n');

  for (const pattern of PATTERNS) {
    // Reset the regex for each file
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const matchIndex = match.index;
      // Calculate line number from character offset
      const lineNumber = content.substring(0, matchIndex).split('\n').length;

      if (pattern.kind === 'route') {
        // For routes, the name is method + path
        const method = match[1].toUpperCase();
        const routePath = match[2];
        symbols.push({
          name: `${method} ${routePath}`,
          kind: 'route',
          filePath,
          line: lineNumber,
          exported: false,
        });
      } else {
        const name = match[1];
        if (name) {
          symbols.push({
            name,
            kind: pattern.kind,
            filePath,
            line: lineNumber,
            exported: pattern.exported,
          });
        }
      }
    }
  }

  return symbols;
}

/**
 * Extract symbols from a file on disk.
 */
export async function extractSymbols(filePath: string): Promise<SymbolEntry[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  return extractSymbolsFromContent(content, filePath);
}
