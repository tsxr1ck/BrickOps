import path from 'path';
import fs from 'fs/promises';

export class FileSystemSandbox {
  constructor(private workspaceRoot: string) {}

  /**
   * Resolves a path and ensures it does not escape the workspace root.
   */
  private resolveSafePath(relativePath: string): string {
    const resolvedPath = path.resolve(this.workspaceRoot, relativePath);
    if (!resolvedPath.startsWith(this.workspaceRoot)) {
      throw new Error(`Path traversal detected: ${relativePath} escapes workspace root.`);
    }
    return resolvedPath;
  }

  async createFile(relativePath: string, content: string): Promise<void> {
    const safePath = this.resolveSafePath(relativePath);
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, content, 'utf-8');
  }

  async patchFile(relativePath: string, search: string, replace: string): Promise<void> {
    const safePath = this.resolveSafePath(relativePath);
    let content = await fs.readFile(safePath, 'utf-8');
    if (!content.includes(search)) {
      throw new Error(`Search string not found in ${relativePath}`);
    }
    content = content.replace(search, replace);
    await fs.writeFile(safePath, content, 'utf-8');
  }

  async deleteFile(relativePath: string): Promise<void> {
    const safePath = this.resolveSafePath(relativePath);
    await fs.unlink(safePath);
  }

  async readFile(relativePath: string): Promise<string> {
    const safePath = this.resolveSafePath(relativePath);
    return await fs.readFile(safePath, 'utf-8');
  }
}
