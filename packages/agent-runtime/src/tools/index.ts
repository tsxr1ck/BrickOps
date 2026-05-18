export { ReadFileTool } from './read-file';
export { WriteFileTool } from './write-file';
export { ApplyEditsTool } from './apply-edits';
export { ListFilesTool } from './list-files';
export { SearchFilesTool } from './search-files';

import type { Tool } from '@brickops/contracts';
import { ReadFileTool } from './read-file';
import { WriteFileTool } from './write-file';
import { ApplyEditsTool } from './apply-edits';
import { ListFilesTool } from './list-files';
import { SearchFilesTool } from './search-files';

/**
 * Create all workspace tools for the agent runtime.
 */
export function createWorkspaceTools(workspaceRoot: string): Tool[] {
  return [
    new ReadFileTool(workspaceRoot),
    new WriteFileTool(workspaceRoot),
    new ApplyEditsTool(workspaceRoot),
    new ListFilesTool(workspaceRoot),
    new SearchFilesTool(workspaceRoot),
  ];
}
