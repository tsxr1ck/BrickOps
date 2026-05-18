import type { Tool, ToolContext, ToolCallInput, ToolRunResult } from '@brickops/contracts';
import { scanWorkspace } from '@brickops/code-nav';

export class ListFilesTool implements Tool {
  constructor(private workspaceRoot: string) {}

  info() {
    return {
      name: 'list_files',
      description: 'List files in the workspace matching optional glob patterns.',
      schema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Optional glob pattern to filter files' },
        },
      },
    };
  }

  async run(ctx: ToolContext, call: ToolCallInput): Promise<ToolRunResult> {
    try {
      const files = await scanWorkspace(this.workspaceRoot);
      const { pattern } = call.input as any;

      let filtered = files;
      if (pattern) {
        const globMatch = (f: { relativePath: string }) => {
          const parts = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
          return new RegExp(`^${parts}$`).test(f.relativePath);
        };
        filtered = files.filter(globMatch);
      }

      const listing = filtered
        .map((f) => `${f.relativePath} (${f.language}, ${f.sizeBytes}b)`)
        .join('\n');

      return {
        content: listing || 'No files matched.',
        metadata: { totalFiles: filtered.length },
      };
    } catch (err: any) {
      return { content: `Error listing files: ${err.message}`, isError: true };
    }
  }
}
