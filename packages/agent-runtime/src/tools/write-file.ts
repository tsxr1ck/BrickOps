import type { Tool, ToolContext, ToolCallInput, ToolRunResult } from '@brickops/contracts';
import fs from 'fs/promises';
import path from 'path';

export class WriteFileTool implements Tool {
  constructor(private workspaceRoot: string) {}

  info() {
    return {
      name: 'write_file',
      description: 'Write content to a file. Creates parent directories if needed. Overwrites existing content.',
      schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path from workspace root' },
          content: { type: 'string', description: 'File content to write' },
        },
        required: ['path', 'content'],
      },
    };
  }

  async run(ctx: ToolContext, call: ToolCallInput): Promise<ToolRunResult> {
    const { path: relPath, content } = call.input as any;
    const safePath = this.resolveSafe(relPath);

    try {
      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, content, 'utf-8');
      return { content: `File written: ${relPath}` };
    } catch (err: any) {
      return { content: `Error writing file: ${err.message}`, isError: true };
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
