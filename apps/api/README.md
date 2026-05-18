# BrickOps API

## Getting Started

1. Install dependencies:
   ```bash
   bun install
   ```

2. Start development server:
   ```bash
   bun run dev
   ```

3. The API will be available at http://localhost:3001

## Project Structure

- `src/index.ts` - Main server entry point
- `src/routes/` - Route handlers (projects, approvals, runs, events, sessions, workspace, whatsapp)
- `src/session-bridge.ts` - Session/agent runtime integration
- `src/preview-manager.ts` - Preview server and screenshot management
- `node_modules/@brickops/*` - Workspace package stubs (for development)

## TypeScript Configuration

The project uses TypeScript with Bun's native runtime. Configuration is in `tsconfig.json`.

## Fixed Issues

- Created stubs for missing external dependencies (`hono`, `zod`) in `node_modules/`
- These allow the server to start without running `bun install`
- To get full functionality, run `bun install` to install the real packages
