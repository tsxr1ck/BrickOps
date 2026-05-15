import fs from 'fs/promises';
import path from 'path';
import { extractSymbolsFromContent } from './symbols';
import { scanWorkspace } from './scanner';
import type { SymbolEntry } from '@brickops/contracts';

export interface RepoMapOptions {
  maxFiles?: number;
  maxTokens?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
}

interface DirNode {
  name: string;
  dirs: Map<string, DirNode>;
  files: { name: string; symbols: SymbolEntry[] }[];
}

/**
 * Build a minified repository map optimized for LLM context.
 *
 * Produces a compact text representation showing:
 * - Directory tree structure
 * - File names with their exported symbols
 * - Import relationships (condensed)
 *
 * Target: < 3000 tokens for a 100-file repository.
 */
export async function buildRepoMap(
  workspaceRoot: string,
  options: RepoMapOptions = {}
): Promise<string> {
  const {
    maxFiles = 100,
    maxTokens = 3000,
    includePatterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    excludePatterns = ['**/node_modules/**', '**/dist/**', '**/.git/**'],
  } = options;

  const files = await scanWorkspace(workspaceRoot);

  // Filter to source files that match include patterns and don't match exclude patterns
  const sourceFiles = files.filter((f) => {
    const ext = path.extname(f.relativePath).toLowerCase();
    const isSource = ['.ts', '.tsx', '.js', '.jsx'].includes(ext);
    if (!isSource) return false;
    // Skip node_modules, dist, etc.
    if (f.relativePath.includes('node_modules/') || f.relativePath.includes('dist/')) return false;
    if (f.relativePath.startsWith('.')) return false;
    return true;
  });

  // Limit file count
  const limited = sourceFiles.slice(0, maxFiles);

  // Build directory tree and extract symbols
  const root: DirNode = { name: '', dirs: new Map(), files: [] };

  for (const file of limited) {
    const parts = file.relativePath.split(path.sep);
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i];
      if (!current.dirs.has(dirName)) {
        current.dirs.set(dirName, { name: dirName, dirs: new Map(), files: [] });
      }
      current = current.dirs.get(dirName)!;
    }

    // Extract symbols
    let symbols: SymbolEntry[] = [];
    try {
      const content = await fs.readFile(file.path, 'utf-8');
      symbols = extractSymbolsFromContent(content, file.relativePath);
    } catch {}

    current.files.push({ name: parts[parts.length - 1], symbols });
  }

  // Render the tree to text
  let output = '';
  renderTree(root, '', output, { maxTokens });

  // Trim to token budget
  const lines = output.split('\n');
  let result = '';
  for (const line of lines) {
    const newResult = result + (result ? '\n' : '') + line;
    if (estimateTokens(newResult) > maxTokens) break;
    result = newResult;
  }

  return result;
}

function renderTree(
  node: DirNode,
  indent: string,
  output: string,
  opts: { maxTokens: number }
): void {
  const entries: { prefix: string; name: string; isDir: boolean; symbols?: SymbolEntry[] }[] = [];

  // Sort: directories first, then files
  const dirNames = Array.from(node.dirs.keys()).sort();
  for (const name of dirNames) {
    entries.push({ prefix: '📁', name: name + '/', isDir: true });
  }

  const sortedFiles = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
  for (const file of sortedFiles) {
    entries.push({ prefix: '📄', name: file.name, isDir: false, symbols: file.symbols });
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childIndent = indent + (isLast ? '    ' : '│   ');

    let line = indent + connector + entry.prefix + ' ' + entry.name;
    output += (output ? '\n' : '') + line;

    if (!entry.isDir && entry.symbols && entry.symbols.length > 0) {
      const exported = entry.symbols.filter((s) => s.exported);
      const nonExported = entry.symbols.filter((s) => !s.exported);

      if (exported.length > 0) {
        const symStr = exported
          .slice(0, 6)
          .map((s) => {
            const sig = symbolSignature(s);
            return childIndent + '  ' + sig;
          })
          .join('\n');
        if (symStr) output += '\n' + symStr;
        if (exported.length > 6) {
          output += '\n' + childIndent + '  ... +' + (exported.length - 6) + ' more';
        }
      }
    }

    if (entry.isDir) {
      const child = node.dirs.get(entry.name.replace('/', ''))!;
      renderTree(child, childIndent, output, opts);
    }
  }
}

function symbolSignature(s: SymbolEntry): string {
  switch (s.kind) {
    case 'function':
      return `fun ${s.name}()`;
    case 'class':
      return `class ${s.name}`;
    case 'interface':
      return `interface ${s.name}`;
    case 'type':
      return `type ${s.name}`;
    case 'variable':
      return `const ${s.name}`;
    case 'enum':
      return `enum ${s.name}`;
    case 'route':
      return `route ${s.name}`;
    case 'import':
      return `import ${s.name}`;
    default:
      return s.name;
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build a condensed flat symbol map (no tree — just file→exports list).
 * Useful for shorter contexts where the tree format wastes tokens.
 */
export async function buildFlatSymbolMap(
  workspaceRoot: string,
  options: { maxFiles?: number; maxTokens?: number } = {}
): Promise<string> {
  const { maxFiles = 50, maxTokens = 1500 } = options;

  const files = await scanWorkspace(workspaceRoot);
  const sourceFiles = files.filter((f) => {
    const ext = path.extname(f.relativePath).toLowerCase();
    return ['.ts', '.tsx', '.js', '.jsx'].includes(ext) &&
      !f.relativePath.includes('node_modules/') &&
      !f.relativePath.includes('dist/');
  });

  const limited = sourceFiles.slice(0, maxFiles);
  const lines: string[] = [];

  for (const file of limited) {
    try {
      const content = await fs.readFile(file.path, 'utf-8');
      const symbols = extractSymbolsFromContent(content, file.relativePath);
      const exported = symbols.filter((s) => s.exported);

      if (exported.length > 0) {
        const sigs = exported.map(symbolSignature).join(', ');
        lines.push(`${file.relativePath}: ${sigs}`);
      } else {
        lines.push(file.relativePath);
      }
    } catch {
      lines.push(file.relativePath);
    }

    if (estimateTokens(lines.join('\n')) > maxTokens) {
      lines.pop();
      lines.push(`... (+${limited.length - lines.length} more files)`);
      break;
    }
  }

  return lines.join('\n');
}
