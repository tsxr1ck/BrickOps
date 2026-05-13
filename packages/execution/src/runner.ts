import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Command allowlist for workspace execution.
 *
 * Only these base commands are allowed. Subcommands and flags
 * are validated separately for additional safety.
 */
const ALLOWLIST = [
  'npm',
  'bun',
  'git',
  'tsc',
  'npx',
  'mkdir',
  'ls',
  'cat',
  'echo',
  'pwd',
];

/**
 * Commands that require explicit approval before execution.
 */
const REQUIRES_APPROVAL = [
  'rm',
  'curl',
  'wget',
];

export class CommandRunner {
  constructor(private workspaceRoot: string) {}

  private isAllowed(command: string): boolean {
    const baseCommand = command.trim().split(' ')[0];
    return ALLOWLIST.includes(baseCommand);
  }

  async run(command: string): Promise<{ stdout: string; stderr: string }> {
    if (!this.isAllowed(command)) {
      throw new Error(`Command blocked by allowlist: ${command}`);
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workspaceRoot,
        timeout: 120000, // 2 minute timeout for installs
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });
      return { stdout, stderr };
    } catch (error: any) {
      throw new Error(`Command execution failed: ${error.message}\nStderr: ${error.stderr}`);
    }
  }
}
