import type { PipelineContext } from '../pipeline';
import { prisma } from '@brickops/db';
import { executor } from '../executor';

const GATEWAY_URL = process.env.BRICKOPS_GATEWAY_URL || 'http://localhost:3002';

async function sendWhatsApp(recipientJid: string, message: string): Promise<void> {
  try {
    await fetch(`${GATEWAY_URL}/outbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientJid, message }),
    });
  } catch (err) {
    console.error('[planning] Failed to send WhatsApp:', err);
  }
}

/**
 * Planning stage.
 *
 * Generates an implementation plan from the project description
 * and classification. Uses the software-architect persona.
 *
 * After generating the plan, emits plan.generated so the
 * notification dispatcher can send it via WhatsApp.
 */

export async function runPlanning(ctx: PipelineContext): Promise<void> {
  console.log(`[planning] Generating plan for project ${ctx.projectId}`);

  // Get the description and classification
  const threads = await prisma.projectThread.findMany({
    where: { projectId: ctx.projectId },
    orderBy: { createdAt: 'asc' },
  });

  const description = threads.find((t) => t.role === 'user')?.content || '';
  const classificationThread = threads.find((t) => t.role === 'system');
  let classification: { type: string; roles: string[] } = { type: 'fullstack', roles: [] };

  if (classificationThread?.content) {
    try {
      classification = JSON.parse(classificationThread.content);
    } catch {}
  }

  // Collect any clarification answers for enriched context
  const clarificationAnswers = threads
    .filter((t) => t.role === 'user')
    .slice(1) // Skip the initial description
    .map((t) => t.content)
    .join('\n');

  const enrichedDescription = clarificationAnswers
    ? `${description}\n\nAdditional details:\n${clarificationAnswers}`
    : description;

  // Generate plan with AI
  let plan: string;

  try {
    const response = await executor.execute({
      role: 'software-architect',
      taskType: 'architecture-plan',
      taskPrompt: `Create a detailed implementation plan for this project.

Type: ${classification.type}
Roles: ${classification.roles.join(', ')}

Description:
${enrichedDescription}

The plan should include:
1. Architecture overview
2. Tech stack choices (specific versions)
3. Project structure (key files and directories)
4. Data model (if applicable)
5. Routes/pages/endpoints
6. Key milestones (numbered, actionable)
7. Dependencies to install
8. Build and run instructions

Be specific and actionable. This plan will be used to generate code.`,
    });

    plan = response.content || generateStaticPlan(enrichedDescription, classification);
  } catch (err: any) {
    console.warn('[planning] AI planning failed, using static:', err.message);
    plan = generateStaticPlan(enrichedDescription, classification);
  }

  // Store the plan as an assistant message
  await prisma.projectThread.create({
    data: {
      projectId: ctx.projectId,
      role: 'assistant',
      content: plan,
    },
  });

  // Send plan summary via WhatsApp directly
  const operatorJid = process.env.BRICKOPS_OPERATOR_JID;
  if (operatorJid) {
    const project = await prisma.project.findUnique({
      where: { id: ctx.projectId },
      select: { name: true, slug: true, status: true },
    });
    if (project) {
      try {
        const { templates } = await import('@brickops/notifications');
        const planInfo = extractPlanInfo(plan);
        const summaryMsg = templates.planSummary(project, planInfo);
        await sendWhatsApp(operatorJid, summaryMsg);
      } catch (err) {
        console.error('[planning] Failed to send plan summary:', err);
      }
    }
  }

  console.log(`[planning] Plan generated (${plan.length} chars)`);
}

/**
 * Generate a structured plan without AI.
 * This serves as both a fallback and a template for AI-generated plans.
 */
function generateStaticPlan(
  description: string,
  classification: { type: string; roles: string[] }
): string {
  const projectType = classification.type;

  const sections: string[] = [
    `## Architecture Overview`,
    `Project type: ${projectType}`,
    `Specialist roles: ${classification.roles.join(', ')}`,
    '',
    `## Stack`,
  ];

  switch (projectType) {
    case 'frontend-spa':
      sections.push(
        '- React 19 + TypeScript + Vite',
        '- CSS Modules or Tailwind CSS',
        '- React Router for navigation',
        '- Zustand for state management'
      );
      break;
    case 'fullstack':
      sections.push(
        '- Frontend: React 19 + TypeScript + Vite',
        '- Backend: Hono on Bun',
        '- Database: PostgreSQL with Prisma',
        '- Auth: Session-based or passkey',
        '- Styling: Tailwind CSS'
      );
      break;
    case 'api-only':
      sections.push(
        '- Runtime: Bun',
        '- Framework: Hono',
        '- Database: PostgreSQL with Prisma',
        '- Validation: Zod'
      );
      break;
    case 'ai-feature':
      sections.push(
        '- Runtime: Bun',
        '- AI Provider: OpenAI / Anthropic',
        '- Backend: Hono',
        '- Database: PostgreSQL with Prisma'
      );
      break;
  }

  sections.push(
    '',
    `## Project Structure`,
    '```',
    'src/',
    '  index.ts        — Entry point',
    '  routes/         — API routes',
    '  components/     — UI components (if frontend)',
    '  lib/            — Shared utilities',
    'package.json',
    'tsconfig.json',
    '```',
    '',
    `## Key Files`,
    '- package.json — Dependencies and scripts',
    '- tsconfig.json — TypeScript configuration',
    '- src/index.ts — Application entry point',
    '',
    `## Description`,
    description,
    '',
    `## Milestones`,
    '1. Project scaffold and dependencies',
    '2. Core data model and configuration',
    '3. Main features implementation',
    '4. Testing and validation',
    '5. Build and preview',
    '',
    `## Dependencies`,
    '```json',
    '{',
    '  "dependencies": {',
    projectType === 'fullstack' || projectType === 'api-only'
    ? '    "hono": "^4.0.0",\n    "@prisma/client": "^5.0.0",\n    "zod": "^3.22.0"'
    : '    "react": "^19.0.0",\n    "react-dom": "^19.0.0",\n    "react-router": "^7.0.0"',
    '  }',
    '}',
    '```',
    '',
    `## Build & Run`,
    '```bash',
    'bun install',
    'bun run dev      # Development server',
    'bun run build    # Production build',
    '```'
  );

  return sections.join('\n');
}

function extractPlanInfo(plan: string) {
  const lines = plan.split('\n');
  let projectType = 'fullstack';
  const stack: string[] = [];
  const milestones: string[] = [];
  const stackKeywords = ['react', 'vue', 'angular', 'svelte', 'next', 'hono', 'express', 'fastify', 'bun', 'node', 'typescript', 'prisma', 'drizzle', 'postgres', 'mysql', 'mongo', 'redis', 'tailwind'];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('project type:')) projectType = line.split(':')[1]?.trim() || projectType;
    for (const kw of stackKeywords) {
      if (lower.includes(kw) && !stack.includes(kw)) stack.push(kw.charAt(0).toUpperCase() + kw.slice(1));
    }
  }

  let inMilestones = false;
  for (const line of lines) {
    if (line.toLowerCase().includes('milestone')) { inMilestones = true; continue; }
    if (inMilestones) {
      const match = line.match(/^\d+\.\s+(.+)/);
      if (match) milestones.push(match[1].trim());
      else if (line.startsWith('#')) break;
    }
  }

  const moduleCount = lines.filter((l) => l.startsWith('## ')).length || 3;

  return {
    projectType,
    stack: stack.slice(0, 5),
    milestoneCount: milestones.length || 5,
    milestones: milestones.length > 0 ? milestones : ['Scaffold', 'Core features', 'Testing', 'Build', 'Deploy'],
    moduleCount,
  };
}
