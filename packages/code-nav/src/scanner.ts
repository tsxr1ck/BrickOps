import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import type { FileEntry } from '@brickops/contracts';

const IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  'coverage',
  '.bun',
  '.cache',
  '__pycache__',
]);

const IGNORE_FILES = new Set(['.DS_Store', 'thumbs.db']);

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript-react',
  '.js': 'javascript',
  '.jsx': 'javascript-react',
  '.json': 'json',
  '.md': 'markdown',
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.sql': 'sql',
  '.prisma': 'prisma',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.sh': 'shell',
  '.env': 'env',
  '.graphql': 'graphql',
  '.svelte': 'svelte',
  '.vue': 'vue',
};

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] || 'unknown';
}

async function hashFile(content: Buffer): Promise<string> {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Recursively scans a workspace directory and returns metadata for every source file.
 */
export async function scanWorkspace(workspaceRoot: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];

  async function walk(dir: string) {
    const dirEntries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of dirEntries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) {
          await walk(fullPath);
        }
      } else if (entry.isFile()) {
        if (IGNORE_FILES.has(entry.name)) continue;

        const stat = await fs.stat(fullPath);
        // Skip very large files (>1MB) to avoid blowing up context
        if (stat.size > 1_000_000) continue;

        const content = await fs.readFile(fullPath);
        const hash = await hashFile(content);

        entries.push({
          path: fullPath,
          relativePath: path.relative(workspaceRoot, fullPath),
          language: detectLanguage(fullPath),
          sizeBytes: stat.size,
          hash,
        });
      }
    }
  }

  await walk(workspaceRoot);
  return entries;
}
