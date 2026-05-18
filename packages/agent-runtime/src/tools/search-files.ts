import type { Tool, ToolContext, ToolCallInput, ToolRunResult } from '@brickops/contracts';
import { searchWorkspace } from '@brickops/code-nav';

export class SearchFilesTool implements Tool {
  constructor(private workspaceRoot: string) {}

  info() {
    return {
      name: 'search_in_files',
      description: 'Search for text across files in the workspace using regex or literal matching.',
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (regex supported)' },
          pattern: { type: 'string', description: 'Optional file glob to narrow search (e.g., *.ts)' },
          maxResults: { type: 'number', description: 'Maximum results (default 20)' },
        },
        required: ['query'],
      },
    };
  }

  async run(ctx: ToolContext, call: ToolCallInput): Promise<ToolRunResult> {
    const { query, pattern, maxResults } = call.input as any;

    try {
      const results = await searchWorkspace(this.workspaceRoot, query, {
        fileGlob: pattern,
        maxResults: maxResults || 20,
      });

      if (results.length === 0) {
        return { content: `No matches found for: ${query}` };
      }

      const formatted = results
        .map((r) => `${r.filePath}:${r.line}:${r.column} — ${r.matchText}`)
        .join('\n');

      return {
        content: formatted,
        metadata: { totalMatches: results.length },
      };
    } catch (err: any) {
      return { content: `Error searching files: ${err.message}`, isError: true };
    }
  }
}
