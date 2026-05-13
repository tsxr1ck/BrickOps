import { describe, it, expect } from 'bun:test';
import { FileSystemSandbox } from '../fs';
import path from 'path';

describe('FileSystemSandbox', () => {
  it('should block path traversal outside workspace', async () => {
    const sandbox = new FileSystemSandbox('/workspace');
    
    expect(async () => {
      await sandbox.readFile('../outside.txt');
    }).toThrow('Path traversal detected');

    expect(async () => {
      await sandbox.createFile('../../etc/passwd', 'hack');
    }).toThrow('Path traversal detected');
  });

  it('should allow valid paths within workspace', () => {
    const sandbox = new FileSystemSandbox('/workspace');
    // We can't actually run createFile here without mocking fs or using a real tmp dir
    // But we can test the internal resolution logic by making resolveSafePath public or testing via the thrown error
    const anySandbox = sandbox as any;
    expect(anySandbox.resolveSafePath('src/index.ts')).toBe(path.resolve('/workspace/src/index.ts'));
    expect(anySandbox.resolveSafePath('./src/index.ts')).toBe(path.resolve('/workspace/src/index.ts'));
  });
});
