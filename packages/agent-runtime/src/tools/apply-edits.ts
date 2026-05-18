import type { Tool, ToolContext, ToolCallInput, ToolRunResult } from '@brickops/contracts';
import fs from 'fs/promises';
import path from 'path';

interface Edit {
  kind: 'replace_range';
  start: { line: number; column: number };
  end: { line: number; column: number };
  newText: string;
}

export class ApplyEditsTool implements Tool {
  constructor(private workspaceRoot: string) {}

  info() {
    return {
      name: 'apply_edits',
      description: 'Apply a set of precise edits to a file. Edits are applied in reverse order to keep line numbers stable.',
      schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path from workspace root' },
          edits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: ['replace_range'] },
                start: {
                  type: 'object',
                  properties: { line: { type: 'number' }, column: { type: 'number' } },
                  required: ['line', 'column'],
                },
                end: {
                  type: 'object',
                  properties: { line: { type: 'number' }, column: { type: 'number' } },
                  required: ['line', 'column'],
                },
                newText: { type: 'string' },
              },
              required: ['kind', 'start', 'end', 'newText'],
            },
          },
        },
        required: ['path', 'edits'],
      },
    };
  }

  async run(ctx: ToolContext, call: ToolCallInput): Promise<ToolRunResult> {
    const { path: relPath, edits } = call.input as any;
    if (!Array.isArray(edits) || edits.length === 0) {
      return { content: 'No edits provided', isError: true };
    }

    const safePath = this.resolveSafe(relPath);

    try {
      const content = await fs.readFile(safePath, 'utf-8');
      const lines = content.split('\n');

      // Sort edits in reverse order (bottom-up) so line numbers stay valid
      const sorted = [...edits].sort(
        (a: Edit, b: Edit) => b.start.line - a.start.line
      );

      for (const edit of sorted) {
        if (edit.kind !== 'replace_range') {
          return { content: `Unsupported edit kind: ${edit.kind}`, isError: true };
        }

        const startLine = edit.start.line - 1;
        const endLine = edit.end.line - 1;

        if (startLine < 0 || endLine >= lines.length) {
          return {
            content: `Edit out of range: lines ${edit.start.line}-${edit.end.line} (file has ${lines.length} lines)`,
            isError: true,
          };
        }

        const before = lines.slice(0, startLine);
        const after = lines.slice(endLine + 1);
        const newLines = edit.newText.split('\n');

        lines.length = 0;
        lines.push(...before, ...newLines, ...after);
      }

      await fs.writeFile(safePath, lines.join('\n'), 'utf-8');
      return { content: `Applied ${edits.length} edit(s) to ${relPath}` };
    } catch (err: any) {
      return { content: `Error applying edits: ${err.message}`, isError: true };
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
