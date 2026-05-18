import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { projectRoutes } from "./routes/projects";
import { approvalRoutes } from "./routes/approvals";
import { runRoutes } from "./routes/runs";
import { eventRoutes } from "./routes/events";
import { whatsappRoutes } from "./routes/whatsapp";
import { sessionRoutes } from "./routes/sessions";
import { workspaceRoutes } from "./routes/workspace";
import { createOrchestrator } from "@brickops/orchestrator";

/**
 * BrickOps API Server
 *
 * Hono-based REST API that serves the operator web UI and WhatsApp gateway.
 * Boots the orchestrator in-process for simplicity (can split later with Redis pub/sub).
 */

const app = new Hono();

// --- Middleware ---
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);
app.use("*", logger());

// --- Health check ---
app.get("/", (c) =>
  c.json({ status: "ok", service: "brickops-api", version: "0.1.0" }),
);
app.get("/health", (c) => c.json({ status: "ok" }));

// --- Mount route groups ---
app.route("/projects", projectRoutes);
app.route("/projects", workspaceRoutes);
app.route("/approvals", approvalRoutes);
app.route("/runs", runRoutes);
app.route("/sessions", sessionRoutes);
app.route("/events", eventRoutes);
app.route("/whatsapp", whatsappRoutes);

// --- Boot orchestrator in-process ---
const orchestrator = createOrchestrator();
console.log("[api] Orchestrator initialized");

// --- Manual pipeline trigger (for existing projects) ---
app.post("/projects/:id/trigger", async (c) => {
  const { id } = c.req.param();
  
  const project = await (await import("@brickops/db")).prisma.project.findUnique({
    where: { id },
    select: { status: true },
  });
  
  if (project?.status === "awaiting_clarification") {
    orchestrator.continueAfterClarification(id);
    return c.json({ ok: true, message: `Continuing pipeline for ${id} after clarification` });
  }
  
  // For any other status (ready_to_deploy, deployed, coding, etc.) trigger a new build/edit run
  orchestrator.triggerPipeline(id);
  return c.json({ ok: true, message: `Pipeline triggered for ${id}` });
});

// --- Start server ---
const port = Number(process.env.PORT) || 3001;

export default {
  port,
  idleTimeout: 255,
  fetch: app.fetch,
};

console.log(`[api] BrickOps API listening on http://localhost:${port}`);
