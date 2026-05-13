import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { scanWorkspace } from '../scanner';
import { extractSymbolsFromContent } from '../symbols';

const TEST_DIR = path.join(import.meta.dir, '__fixtures__');

beforeAll(async () => {
  await fs.mkdir(path.join(TEST_DIR, 'src'), { recursive: true });

  await fs.writeFile(
    path.join(TEST_DIR, 'src', 'app.ts'),
    `
import { Hono } from 'hono';

export class AppService {
  greet() { return 'hello'; }
}

export async function startServer(port: number) {
  const app = new Hono();
  app.get('/health', (c) => c.text('ok'));
  app.post('/projects', (c) => c.text('created'));
  return app;
}

export const VERSION = '1.0.0';
`
  );

  await fs.writeFile(
    path.join(TEST_DIR, 'package.json'),
    '{ "name": "test-fixture" }'
  );
});

afterAll(async () => {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
});

describe('scanWorkspace', () => {
  it('should discover files in a directory', async () => {
    const entries = await scanWorkspace(TEST_DIR);
    const relativePaths = entries.map((e) => e.relativePath);

    expect(relativePaths).toContain('src/app.ts');
    expect(relativePaths).toContain('package.json');
  });

  it('should detect languages correctly', async () => {
    const entries = await scanWorkspace(TEST_DIR);
    const tsFile = entries.find((e) => e.relativePath === 'src/app.ts');
    const jsonFile = entries.find((e) => e.relativePath === 'package.json');

    expect(tsFile?.language).toBe('typescript');
    expect(jsonFile?.language).toBe('json');
  });

  it('should compute hashes', async () => {
    const entries = await scanWorkspace(TEST_DIR);
    for (const entry of entries) {
      expect(entry.hash).toBeTruthy();
      expect(entry.hash.length).toBe(16);
    }
  });
});

describe('extractSymbolsFromContent', () => {
  it('should extract exported functions, classes, and variables', () => {
    const code = `
export class AppService {
  greet() { return 'hello'; }
}

export async function startServer(port: number) {
  return null;
}

export const VERSION = '1.0.0';
`;
    const symbols = extractSymbolsFromContent(code, 'test.ts');
    const names = symbols.map((s) => s.name);

    expect(names).toContain('AppService');
    expect(names).toContain('startServer');
    expect(names).toContain('VERSION');

    const appService = symbols.find((s) => s.name === 'AppService');
    expect(appService?.kind).toBe('class');
    expect(appService?.exported).toBe(true);
  });

  it('should extract route definitions', () => {
    const code = `
const app = new Hono();
app.get('/health', (c) => c.text('ok'));
app.post('/projects', (c) => c.text('created'));
`;
    const symbols = extractSymbolsFromContent(code, 'routes.ts');
    const routes = symbols.filter((s) => s.kind === 'route');

    expect(routes.length).toBe(2);
    expect(routes[0].name).toBe('GET /health');
    expect(routes[1].name).toBe('POST /projects');
  });

  it('should extract import statements', () => {
    const code = `
import { Hono } from 'hono';
import path from 'path';
`;
    const symbols = extractSymbolsFromContent(code, 'test.ts');
    const imports = symbols.filter((s) => s.kind === 'import');

    // Default import 'path' should be captured
    expect(imports.some((s) => s.name === 'path')).toBe(true);
  });
});
