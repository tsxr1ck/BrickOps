import path from 'path';
import fs from 'fs/promises';
import { CommandRunner } from './runner';

export class WorkspaceManager {
  private baseDir: string;

  constructor(baseDir?: string) {
    // Default to <cwd>/workspaces (project-root adjacent, visible to user)
    this.baseDir = baseDir || process.env.WORKSPACE_DIR || path.join(process.cwd(), 'workspaces');
  }

  async provisionWorkspace(projectId: string): Promise<string> {
    const workspacePath = path.join(this.baseDir, projectId);
    await fs.mkdir(workspacePath, { recursive: true });

    console.log(`[workspace] Provisioned: ${workspacePath}`);

    // Initialize git repo if it doesn't exist
    const runner = new CommandRunner(workspacePath);
    try {
      await fs.stat(path.join(workspacePath, '.git'));
    } catch {
      await runner.run('git init');
    }

    return workspacePath;
  }

  async isolateRun(workspacePath: string, runId: string): Promise<void> {
    const runner = new CommandRunner(workspacePath);
    const branchName = `run/${runId}`;
    
    try {
      await runner.run('git checkout -b ' + branchName);
    } catch {
      await runner.run('git checkout ' + branchName);
    }
  }
}
