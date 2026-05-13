import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { CommandRunner } from './runner';

export class WorkspaceManager {
  private baseDir: string;

  constructor() {
    // Default to ~/.brickops/workspaces
    this.baseDir = path.join(os.homedir(), '.brickops', 'workspaces');
  }

  async provisionWorkspace(projectId: string): Promise<string> {
    const workspacePath = path.join(this.baseDir, projectId);
    await fs.mkdir(workspacePath, { recursive: true });

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
      // Check if we are already on a branch and commit any floating changes just in case
      await runner.run('git checkout -b ' + branchName);
    } catch {
      // If branch exists, just check it out
      await runner.run('git checkout ' + branchName);
    }
  }
}
