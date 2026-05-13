import { type Subprocess, spawn } from 'bun';
import path from 'path';
import fs from 'fs/promises';

/**
 * Preview Manager
 *
 * Manages local preview servers for each project.
 * Each project gets its own static file server on a unique port.
 * Also handles screenshot capture using Playwright + system Chrome.
 */

const WORKSPACES_ROOT = process.env.WORKSPACES_ROOT || path.join(process.env.HOME || '~', '.brickops', 'workspaces');
const PREVIEW_PORT_START = Number(process.env.PREVIEW_PORT_RANGE_START) || 5500;
const PREVIEW_PORT_END = Number(process.env.PREVIEW_PORT_RANGE_END) || 5600;

interface PreviewInstance {
  projectId: string;
  port: number;
  process: Subprocess;
  startedAt: number;
  url: string;
}

/** Active preview servers keyed by projectId */
const activePreviews = new Map<string, PreviewInstance>();

/** Port allocation tracker */
const usedPorts = new Set<number>();

function allocatePort(): number | null {
  for (let port = PREVIEW_PORT_START; port <= PREVIEW_PORT_END; port++) {
    if (!usedPorts.has(port)) {
      usedPorts.add(port);
      return port;
    }
  }
  return null;
}

function releasePort(port: number) {
  usedPorts.delete(port);
}

/**
 * Start a preview server for a project.
 * Serves the dist/ folder (or workspace root if no dist) on a local port.
 */
export async function startPreview(projectId: string): Promise<{ port: number; url: string }> {
  // Stop existing preview if running
  if (activePreviews.has(projectId)) {
    await stopPreview(projectId);
  }

  const port = allocatePort();
  if (!port) {
    throw new Error('No available ports for preview');
  }

  const workspacePath = path.join(WORKSPACES_ROOT, projectId);
  const distPath = path.join(workspacePath, 'dist');

  // Check if dist exists, otherwise serve workspace root
  let servePath = workspacePath;
  try {
    await fs.stat(distPath);
    servePath = distPath;
  } catch {
    // No dist, serve workspace root
  }

  // Start Bun static file server
  const serverScript = `
const servePath = ${JSON.stringify(servePath)};
const server = Bun.serve({
  port: ${port},
  async fetch(req) {
    const url = new URL(req.url);
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const fullPath = servePath + filePath;
    
    try {
      const file = Bun.file(fullPath);
      if (await file.exists()) {
        return new Response(file);
      }
    } catch {}
    
    // SPA fallback
    try {
      const index = Bun.file(servePath + '/index.html');
      if (await index.exists()) {
        return new Response(index);
      }
    } catch {}
    
    return new Response('Not found', { status: 404 });
  },
});
console.log('Preview server running on http://localhost:${port}');
`;

  // Write script to temp file
  const tmpScript = `/tmp/brickops-preview-${projectId}.ts`;
  await fs.writeFile(tmpScript, serverScript);

  const proc = spawn({
    cmd: ['bun', 'run', '--hot', tmpScript],
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const url = `http://localhost:${port}`;

  activePreviews.set(projectId, {
    projectId,
    port,
    process: proc,
    startedAt: Date.now(),
    url,
  });

  // Wait a moment for server to start
  await new Promise((r) => setTimeout(r, 500));

  console.log(`[preview] Started preview for ${projectId} on ${url}`);
  return { port, url };
}

/**
 * Stop a preview server for a project.
 */
export async function stopPreview(projectId: string): Promise<void> {
  const instance = activePreviews.get(projectId);
  if (!instance) return;

  try {
    instance.process.kill();
  } catch {}

  releasePort(instance.port);
  activePreviews.delete(projectId);
  console.log(`[preview] Stopped preview for ${projectId}`);
}

/**
 * Get preview info for a project.
 */
export function getPreview(projectId: string): PreviewInstance | null {
  return activePreviews.get(projectId) || null;
}

/**
 * List all active previews.
 */
export function listPreviews(): PreviewInstance[] {
  return Array.from(activePreviews.values());
}

/**
 * Capture a screenshot of a preview URL using Puppeteer.
 */
export async function captureScreenshot(
  url: string,
  options?: { width?: number; height?: number; fullPage?: boolean }
): Promise<Buffer> {
  const width = options?.width || 1280;
  const height = options?.height || 800;
  const fullPage = options?.fullPage ?? false;

  console.log(`[preview] Attempting screenshot with Puppeteer for ${url}...`);

  try {
    const puppeteer = require('puppeteer');
    console.log('[preview] Puppeteer loaded, launching Chromium...');

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    console.log('[preview] Chromium launched, navigating...');
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1000));

    console.log('[preview] Taking screenshot...');
    const screenshot = Buffer.from(await page.screenshot({
      type: 'png',
      fullPage,
    }));

    await browser.close();
    console.log(`[preview] Screenshot captured: ${screenshot.length} bytes`);
    return screenshot;
  } catch (err: any) {
    console.error('[preview] Puppeteer screenshot failed:', err.message);
    return generatePlaceholderScreenshot(url, width, height);
  }
}

/**
 * Generate a placeholder screenshot when Playwright is not available.
 */
function generatePlaceholderScreenshot(url: string, width: number, height: number): Buffer {
  // Simple SVG placeholder
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#1a1a2e"/>
    <text x="50%" y="45%" text-anchor="middle" fill="#e2e8f0" font-family="system-ui" font-size="24" font-weight="bold">Preview Available</text>
    <text x="50%" y="55%" text-anchor="middle" fill="#94a3b8" font-family="system-ui" font-size="14">${url}</text>
    <rect x="${width / 2 - 60}" y="${height * 0.65}" width="120" height="40" rx="8" fill="#6366f1"/>
    <text x="50%" y="${height * 0.65 + 26}" text-anchor="middle" fill="white" font-family="system-ui" font-size="14" font-weight="bold">Open</text>
  </svg>`;

  return Buffer.from(svg);
}

/**
 * Save a screenshot to the project's workspace.
 */
export async function saveScreenshot(projectId: string, screenshot: Buffer): Promise<string> {
  const workspacePath = path.join(WORKSPACES_ROOT, projectId);
  const screenshotsDir = path.join(workspacePath, '.brickops', 'screenshots');

  await fs.mkdir(screenshotsDir, { recursive: true });

  const filename = `preview-${Date.now()}.png`;
  const filePath = path.join(screenshotsDir, filename);

  await fs.writeFile(filePath, screenshot);

  return filePath;
}

/**
 * Get the latest screenshot for a project.
 */
export async function getLatestScreenshot(projectId: string): Promise<Buffer | null> {
  const workspacePath = path.join(WORKSPACES_ROOT, projectId);
  const screenshotsDir = path.join(workspacePath, '.brickops', 'screenshots');

  try {
    const files = await fs.readdir(screenshotsDir);
    const pngFiles = files.filter((f) => f.endsWith('.png')).sort().reverse();

    if (pngFiles.length === 0) return null;

    return await fs.readFile(path.join(screenshotsDir, pngFiles[0]));
  } catch {
    return null;
  }
}
