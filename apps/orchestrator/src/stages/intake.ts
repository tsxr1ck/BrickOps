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
    console.error('[intake] Failed to send WhatsApp:', err);
  }
}

async function startClarificationState(
  operatorJid: string, projectId: string, projectSlug: string, projectName: string, questions: string[]
): Promise<void> {
  try {
    await fetch(`${GATEWAY_URL}/clarification/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operatorJid, projectId, projectSlug, projectName, questions }),
    });
  } catch (err) {
    console.error('[intake] Failed to register clarification state:', err);
  }
}

/**
 * Intake stage.
 *
 * Uses the router agent to classify the project type and determine
 * which specialist roles will be needed for code generation.
 * Then generates adaptive follow-up questions (1-5) based on
 * the complexity of the project description.
 *
 * Output: stores classification as a system thread message.
 * Emits: clarification.requested if questions need to be asked.
 */

interface ClassificationResult {
  type: 'frontend-spa' | 'fullstack' | 'api-only' | 'ai-feature';
  roles: string[];
  complexity: 'low' | 'medium' | 'high';
  questions: string[];
}

export async function runIntake(ctx: PipelineContext): Promise<void> {
  console.log(`[intake] Classifying project ${ctx.projectId}`);

  // Get the project description from the first user thread
  const threads = await prisma.projectThread.findMany({
    where: { projectId: ctx.projectId, role: 'user' },
    orderBy: { createdAt: 'asc' },
    take: 1,
  });

  const description = threads[0]?.content || '';

  if (!description) {
    console.warn('[intake] No description found — using default classification');
  }

  // Classify with the router agent and generate questions
  let classification: ClassificationResult;

  try {
    const response = await executor.execute({
      role: 'router',
      taskType: 'plan-classify',
      taskPrompt: `Analyze this project description and classify it. Also determine complexity and generate follow-up questions.

Project description:
"${description}"

Respond with a JSON object:
{
  "type": "frontend-spa" | "fullstack" | "api-only" | "ai-feature",
  "roles": ["role1", "role2"],
  "complexity": "low" | "medium" | "high",
  "questions": ["question1", "question2"]
}

Complexity guidelines:
- LOW: description is very detailed, mentions specific tech stack, has clear requirements (1 question)
- MEDIUM: description has some detail but missing key decisions like DB, auth, deployment (2-3 questions)
- HIGH: description is vague or very ambitious, missing most technical details (4-5 questions)

Question guidelines:
- Ask about tech stack preferences if not specified
- Ask about auth method if auth is mentioned
- Ask about database choice if data storage is needed
- Ask about deployment target if not clear
- Ask about key features/priorities if description is vague
- Never ask more than 5 questions
- Keep questions short and specific`,
      actionSchema: `{ "type": "string", "roles": ["string"], "complexity": "string", "questions": ["string"] }`,
    });

    classification = response.parsedJson || classifyStatic(description);
  } catch (err: any) {
    console.warn('[intake] AI classification failed, using static:', err.message);
    classification = classifyStatic(description);
  }

  // Store classification as a system message
  await prisma.projectThread.create({
    data: {
      projectId: ctx.projectId,
      role: 'system',
      content: JSON.stringify(classification),
    },
  });

  console.log(
    `[intake] Classified as: ${classification.type}, complexity: ${classification.complexity}, roles: ${classification.roles.join(', ')}`
  );

  // If there are clarification questions, send them via WhatsApp
  if (classification.questions.length > 0) {
    console.log(`[intake] ${classification.questions.length} clarification questions needed`);

    // Send questions directly via WhatsApp
    const operatorJid = process.env.BRICKOPS_OPERATOR_JID;
    if (operatorJid) {
      const project = await prisma.project.findUnique({
        where: { id: ctx.projectId },
        select: { name: true, slug: true, status: true },
      });

      if (project) {
        // Format questions message
        const numbered = classification.questions.map((q, i) => `${i + 1}. ${q}`);
        const message = [
          `❓ *A few questions before I plan*`,
          `Project: ${project.name}`,
          '',
          ...numbered,
          '',
          `Reply with answers (one per line or all at once).`,
        ].join('\n');

        await sendWhatsApp(operatorJid, message);
        await startClarificationState(operatorJid, ctx.projectId, project.slug, project.name, classification.questions);
      }
    }
  }
}

/**
 * Static classifier — deterministic, no LLM call.
 * Used as fallback when AI is not available.
 */
function classifyStatic(description: string): ClassificationResult {
  const lower = description.toLowerCase();
  const wordCount = description.split(/\s+/).length;

  // Determine complexity based on description detail
  let complexity: 'low' | 'medium' | 'high' = 'medium';
  const hasStack = /react|vue|angular|svelte|next|hono|express|fastify|bun|node/i.test(description);
  const hasDb = /postgres|mysql|mongo|supabase|firebase|prisma|drizzle/i.test(description);
  const hasAuth = /auth|login|signup|passport|clerk|supabase/i.test(description);
  const hasDeploy = /vercel|netlify|docker|vps|aws|deploy/i.test(description);

  const detailScore = [hasStack, hasDb, hasAuth, hasDeploy, wordCount > 30].filter(Boolean).length;

  if (detailScore >= 4) complexity = 'low';
  else if (detailScore >= 2) complexity = 'medium';
  else complexity = 'high';

  // Detect project type
  let type: 'frontend-spa' | 'fullstack' | 'api-only' | 'ai-feature' = 'frontend-spa';
  if (lower.includes('api') && !lower.includes('frontend') && !lower.includes('ui')) {
    type = 'api-only';
  } else if (lower.includes('ai') || lower.includes('llm') || lower.includes('agent')) {
    type = 'ai-feature';
  } else if (lower.includes('backend') || lower.includes('server') || lower.includes('database') || lower.includes('auth')) {
    type = 'fullstack';
  }

  // Generate questions based on complexity
  const questions: string[] = [];

  if (!hasStack) {
    questions.push('What tech stack do you prefer? (e.g., React + TypeScript, Vue, Next.js)');
  }
  if (!hasDb && (type === 'fullstack' || type === 'api-only')) {
    questions.push('What database? (PostgreSQL, MongoDB, Supabase)');
  }
  if (!hasAuth && lower.includes('auth')) {
    questions.push('What auth method? (email/password, social login, passkeys)');
  }
  if (!hasDeploy) {
    questions.push('Where will this be deployed? (VPS, Vercel, Docker)');
  }
  if (wordCount < 15) {
    questions.push('What are the key features or pages you need?');
  }

  // Limit based on complexity
  const maxQuestions = complexity === 'low' ? 1 : complexity === 'medium' ? 3 : 5;

  return {
    type,
    roles: getDefaultRoles(type),
    complexity,
    questions: questions.slice(0, maxQuestions),
  };
}

function getDefaultRoles(type: string): string[] {
  switch (type) {
    case 'api-only':
      return ['backend-architect', 'code-reviewer'];
    case 'ai-feature':
      return ['ai-engineer', 'backend-architect', 'code-reviewer'];
    case 'fullstack':
      return ['software-architect', 'frontend-developer', 'backend-architect', 'code-reviewer'];
    default:
      return ['frontend-developer', 'code-reviewer'];
  }
}
