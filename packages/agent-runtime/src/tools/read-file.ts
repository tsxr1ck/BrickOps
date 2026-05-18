import type { Tool, ToolContext, ToolCallInput, ToolRunResult } from '@brickops/contracts';
import fs from 'fs/promises';
import path from 'path';

export class ReadFileTool implements Tool {
  constructor(private workspaceRoot: string) {}

  info() {
    return {
      name: 'read_file',
      description: 'Read the contents of a file within the workspace. Optionally specify line offsets.',
      schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path from workspace root' },
          offset: { type: 'number', description: 'Starting line number (1-indexed)' },
          limit: { type: 'number', description: 'Max lines to read' },
        },
        required: ['path'],
      },
    };
  }

  async run(ctx: ToolContext, call: ToolCallInput): Promise<ToolRunResult> {
    const { path: relPath, offset, limit } = call.input as any;
    const safePath = this.resolveSafe(relPath);

    try {
      const content = await fs.readFile(safePath, 'utf-8');
      const lines = content.split('\n');
      const start = offset ? Math.max(0, offset - 1) : 0;
      const end = limit ? start + limit : lines.length;
      const sliced = lines.slice(start, end).join('\n');

      return {
        content: sliced,
        metadata: { totalLines: lines.length, startLine: start + 1, endLine: end },
      };
    } catch (err: any) {
      return { content: `Error reading file: ${err.message}`, isError: true };
    }
  }

  private resolveSafe(relPath: string): string {
    const resolved = path.resolve(this.workspaceRoot, relPath);
    if (!resolved.startsWith(this.workspaceRoot)) {
      throw new Error(`Path traversal detected: ${relPath}`);
    }
    return resolved;
  }
}
