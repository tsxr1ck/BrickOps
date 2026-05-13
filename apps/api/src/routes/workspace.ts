import { Hono } from 'hono';
import { prisma } from '@brickops/db';
import fs from 'fs/promises';
import path from 'path';
import {
  startPreview,
  stopPreview,
  getPreview,
  listPreviews,
  captureScreenshot,
  saveScreenshot,
  getLatestScreenshot,
} from '../preview-manager';

/**
 * Workspace routes — files, preview, and deploy.
 *
 * These expose the project workspace to the web UI so the operator
 * can see generated files, preview the built app, and trigger deploys.
 */

export const workspaceRoutes = new Hono();

const WORKSPACES_ROOT = process.env.WORKSPACES_ROOT || path.join(process.env.HOME || '~', '.brickops', 'workspaces');

/**
 * List files in a project workspace.
 */
workspaceRoutes.get('/:id/files', async (c) => {
  const { id } = c.req.param();
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const workspacePath = project.workspacePath || path.join(WORKSPACES_ROOT, id);

  try {
    const files = await listFilesRecursive(workspacePath, workspacePath);
    return c.json({ workspacePath, files });
  } catch (err: any) {
    return c.json({ error: 'Workspace not found', workspacePath }, 404);
  }
});

/**
 * Read a single file from the workspace.
 */
workspaceRoutes.get('/:id/files/*', async (c) => {
  const { id } = c.req.param();
  const filePath = c.req.path.replace(`/projects/${id}/files/`, '');

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const workspacePath = project.workspacePath || path.join(WORKSPACES_ROOT, id);
  const fullPath = path.join(workspacePath, filePath);

  // Security: prevent path traversal
  if (!fullPath.startsWith(workspacePath)) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    return c.json({ path: filePath, content });
  } catch {
    return c.json({ error: 'File not found' }, 404);
  }
});

/**
 * Serve the built preview (dist/ folder).
 */
workspaceRoutes.get('/:id/preview', async (c) => {
  const { id } = c.req.param();
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return c.text('Not found', 404);

  const workspacePath = project.workspacePath || path.join(WORKSPACES_ROOT, id);
  const distPath = path.join(workspacePath, 'dist');

  // Serve index.html for the root
  const indexPath = path.join(distPath, 'index.html');
  try {
    const content = await fs.readFile(indexPath, 'utf-8');
    return c.html(content);
  } catch {
    return c.text('Preview not available — build has not completed.', 404);
  }
});

/**
 * Serve static assets from dist/.
 */
workspaceRoutes.get('/:id/preview/*', async (c) => {
  const { id } = c.req.param();
  const assetPath = c.req.path.replace(`/projects/${id}/preview/`, '');

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return c.text('Not found', 404);

  const workspacePath = project.workspacePath || path.join(WORKSPACES_ROOT, id);
  const fullPath = path.join(workspacePath, 'dist', assetPath);

  // Security: prevent path traversal
  if (!fullPath.startsWith(path.join(workspacePath, 'dist'))) {
    return c.text('Access denied', 403);
  }

  try {
    const content = await fs.readFile(fullPath);
    const ext = path.extname(fullPath);
    const mimeTypes: Record<string, string> = {
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
    };
    const mime = mimeTypes[ext] || 'application/octet-stream';
    return new Response(content, {
      headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return c.text('Not found', 404);
  }
});

/**
 * Get project workspace info.
 */
workspaceRoutes.get('/:id/workspace', async (c) => {
  const { id } = c.req.param();
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const workspacePath = project.workspacePath || path.join(WORKSPACES_ROOT, id);

  try {
    const stat = await fs.stat(workspacePath);
    const hasDist = await fileExists(path.join(workspacePath, 'dist'));
    const hasPackageJson = await fileExists(path.join(workspacePath, 'package.json'));

    let packageJson: any = null;
    if (hasPackageJson) {
      try {
        packageJson = JSON.parse(await fs.readFile(path.join(workspacePath, 'package.json'), 'utf-8'));
      } catch {}
    }

    return c.json({
      workspacePath,
      exists: stat.isDirectory(),
      hasDist,
      hasPackageJson,
      scripts: packageJson?.scripts || null,
      dependencies: packageJson?.dependencies || null,
    });
  } catch {
    return c.json({ workspacePath, exists: false });
  }
});

/**
 * Deploy project to a subdomain.
 * Copies dist/ to /var/www/projects/<slug>/ and creates nginx config.
 */
workspaceRoutes.post('/:id/deploy', async (c) => {
  const { id } = c.req.param();
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const workspacePath = project.workspacePath || path.join(WORKSPACES_ROOT, id);
  const distPath = path.join(workspacePath, 'dist');

  try {
    await fs.stat(distPath);
  } catch {
    return c.json({ error: 'No dist/ folder — build the project first' }, 400);
  }

  const DEPLOY_ROOT = process.env.DEPLOY_ROOT || '/var/www/projects';
  const deployPath = path.join(DEPLOY_ROOT, project.slug);
  const domain = `${project.slug}.byrick.net`;

  try {
    // Create deploy directory
    await fs.mkdir(deployPath, { recursive: true });

    // Copy dist/ to deploy path
    await copyDir(distPath, deployPath);

    // Create nginx config
    const nginxConfig = generateNginxConfig(project.slug, deployPath, domain);
    const nginxAvailable = process.env.NGINX_VHOST_DIR || '/etc/nginx/sites-available';
    const nginxEnabled = process.env.NGINX_ENABLED_DIR || '/etc/nginx/sites-enabled';

    await fs.mkdir(nginxAvailable, { recursive: true });
    await fs.writeFile(path.join(nginxAvailable, project.slug), nginxConfig);

    // Enable site (symlink)
    try {
      await fs.symlink(
        path.join(nginxAvailable, project.slug),
        path.join(nginxEnabled, project.slug)
      );
    } catch {
      // Symlink may already exist
    }

    // Test nginx config
    const { execSync } = await import('child_process');
    try {
      execSync('sudo nginx -t', { timeout: 5000 });
      execSync('sudo nginx -s reload', { timeout: 5000 });
    } catch (err: any) {
      return c.json({
        ok: true,
        warning: 'Files deployed but nginx reload failed — run manually: sudo nginx -s reload',
        domain,
        url: `https://${domain}`,
        deployPath,
      });
    }

    return c.json({
      ok: true,
      domain,
      url: `https://${domain}`,
      deployPath,
      message: `Deployed to ${domain}`,
    });
  } catch (err: any) {
    return c.json({ error: `Deploy failed: ${err.message}` }, 500);
  }
});

// --- Helpers ---

async function listFilesRecursive(basePath: string, currentPath: string): Promise<Array<{ path: string; size: number; isDir: boolean }>> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const files: Array<{ path: string; size: number; isDir: boolean }> = [];

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;

    const fullPath = path.join(currentPath, entry.name);
    const relativePath = path.relative(basePath, fullPath);

    if (entry.isDirectory()) {
      files.push({ path: relativePath, size: 0, isDir: true });
      const children = await listFilesRecursive(basePath, fullPath);
      files.push(...children);
    } else {
      const stat = await fs.stat(fullPath);
      files.push({ path: relativePath, size: stat.size, isDir: false });
    }
  }

  return files;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

function generateNginxConfig(slug: string, deployPath: string, domain: string): string {
  return `server {
    listen 80;
    server_name ${domain};

    root ${deployPath};
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    access_log /var/log/nginx/${slug}-access.log;
    error_log /var/log/nginx/${slug}-error.log;
}
`;
}

// --- Preview Server Endpoints ---

/**
 * Start a local preview server for a project.
 * Returns the local URL where the preview is running.
 */
workspaceRoutes.post('/:id/preview/start', async (c) => {
  const { id } = c.req.param();
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return c.json({ error: 'Project not found' }, 404);

  try {
    const result = await startPreview(id);
    return c.json({ ok: true, ...result });
  } catch (err: any) {
    return c.json({ error: `Failed to start preview: ${err.message}` }, 500);
  }
});

/**
 * Stop the preview server for a project.
 */
workspaceRoutes.post('/:id/preview/stop', async (c) => {
  const { id } = c.req.param();
  try {
    
    await stopPreview(id);
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * Get preview status for a project.
 */
workspaceRoutes.get('/:id/preview/status', async (c) => {
  const { id } = c.req.param();
  
  const preview = getPreview(id);

  if (!preview) {
    return c.json({ running: false });
  }

  return c.json({
    running: true,
    port: preview.port,
    url: preview.url,
    startedAt: preview.startedAt,
  });
});

/**
 * List all active preview servers.
 */
workspaceRoutes.get('/previews', async (c) => {
  
  const previews = listPreviews();
  return c.json(previews.map((p) => ({
    projectId: p.projectId,
    port: p.port,
    url: p.url,
    startedAt: p.startedAt,
  })));
});

// --- Screenshot Endpoints ---

/**
 * Capture a screenshot of a project's preview.
 */
workspaceRoutes.post('/:id/screenshot', async (c) => {
  const { id } = c.req.param();
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return c.json({ error: 'Project not found' }, 404);

  
  const preview = getPreview(id);

  // If no preview running, start one
  let url = preview?.url;
  if (!url) {
    
    try {
      const started = await startPreview(id);
      url = started.url;
    } catch (err: any) {
      return c.json({ error: `Cannot start preview: ${err.message}` }, 500);
    }
  }

  try {
    const body = await c.req.json().catch(() => ({}));
    const screenshot = await captureScreenshot(url!, {
      width: body.width || 1280,
      height: body.height || 800,
      fullPage: body.fullPage || false,
    });

    const savedPath = await saveScreenshot(id, screenshot);

    return new Response(screenshot, {
      headers: {
        'Content-Type': 'image/png',
        'X-Screenshot-Path': savedPath,
      },
    });
  } catch (err: any) {
    return c.json({ error: `Screenshot failed: ${err.message}` }, 500);
  }
});

/**
 * Get the latest screenshot for a project.
 */
workspaceRoutes.get('/:id/screenshot', async (c) => {
  const { id } = c.req.param();
  

  let screenshot = await getLatestScreenshot(id);

  // If no saved screenshot, capture a new one
  if (!screenshot) {
    const preview = getPreview(id);
    if (preview) {
      screenshot = await captureScreenshot(preview.url);
      await saveScreenshot(id, screenshot);
    }
  }

  if (!screenshot) {
    return c.json({ error: 'No screenshot available. Start a preview first.' }, 404);
  }

  return new Response(screenshot, {
    headers: { 'Content-Type': 'image/png' },
  });
});
