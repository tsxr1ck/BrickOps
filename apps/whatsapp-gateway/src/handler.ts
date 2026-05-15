import type { WhatsAppIntent } from '@brickops/contracts';
import { bus } from '@brickops/events';
import { sendText, sendReply } from './sender';
import { templates } from '@brickops/notifications';
import {
  getActiveConversation,
  recordAnswer,
  clearConversation,
  selectProject,
  getSelectedProject,
  clearSelectedProject,
} from './conversation-state';

/**
 * Operator whitelist. Only the configured operator phone can issue commands.
 * Format: "1234567890@s.whatsapp.net"
 */
const OPERATOR_JID = process.env.BRICKOPS_OPERATOR_JID || '';
const API_BASE = process.env.BRICKOPS_API_URL || 'http://localhost:3001';

/**
 * Internal API fetch helper.
 */
async function apiFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers = { 'Content-Type': 'application/json', ...options?.headers };
  const body = options?.body;

  console.log(`[whatsapp:handler] API ${options?.method || 'GET'} ${url}`, body ? `body: ${String(body).slice(0, 200)}` : '');

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const respBody = await response.text();
    console.error(`[whatsapp:handler] API error ${response.status}: ${respBody}`);
    throw new Error(`API ${response.status}: ${respBody}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Command handler.
 *
 * Takes a parsed intent from the LLM parser and executes it:
 * - Calls the BrickOps API for real data
 * - Sends formatted responses back to the operator
 * - Emits events for the orchestrator
 */
export async function handleIntent(
  intent: WhatsAppIntent,
  senderJid: string,
  messageId: string
): Promise<void> {
  // Security: only accept commands from the configured operator
  if (!OPERATOR_JID || senderJid !== OPERATOR_JID) {
    if (!OPERATOR_JID) {
      console.warn('[whatsapp:handler] No operator configured — rejecting all commands');
    } else {
      console.warn(`[whatsapp:handler] Unauthorized sender: ${senderJid}`);
    }
    await sendText(senderJid, '🔒 Unauthorized. This gateway only accepts commands from the configured operator.');
    return;
  }

  // --- Check if this is a clarification answer ---
  // If the operator has an active conversation, treat any freeform text as an answer
  const activeConversation = getActiveConversation(senderJid);
  if (
    activeConversation &&
    intent.type !== 'create_project' &&
    intent.type !== 'list_projects' &&
    intent.type !== 'approve' &&
    intent.type !== 'reject'
  ) {
    // Use the raw text as the answer — LLM often returns empty 'answer' field
    const rawMsg = (intent as any).rawText
      || (intent as any).answer
      || (intent as any).message
      || (intent as any).query
      || '';
    console.log(`[whatsapp:handler] Clarification answer: intent=${intent.type}, rawMsg="${rawMsg}", intentData=${JSON.stringify(intent)}`);
    await handleClarificationAnswer(senderJid, messageId, rawMsg);
    return;
  }

  switch (intent.type) {
    case 'create_project': {
      console.log(`[whatsapp:handler] Create project: ${intent.description}`);

      try {
        const project = await apiFetch('/projects', {
          method: 'POST',
          body: JSON.stringify({
            name: intent.description.slice(0, 60),
            description: intent.description,
            source: 'whatsapp',
          }),
        });
        // Notification sent by API dispatcher — no duplicate reply here
      } catch (err: any) {
        console.error('[whatsapp:handler] Create project failed:', err.message);
        await sendReply(senderJid, `❌ Failed to create project: ${err.message}`, messageId);
      }
      break;
    }

    case 'list_projects': {
      console.log('[whatsapp:handler] List projects requested');

      try {
        const selected = getSelectedProject(senderJid);
        const projects = await apiFetch<any[]>('/projects');
        const message = templates.projectList(
          projects.map((p) => ({ name: p.name, status: p.status, slug: p.slug })),
          selected?.projectSlug
        );
        await sendReply(senderJid, message, messageId);
      } catch (err: any) {
        console.error('[whatsapp:handler] List projects failed:', err.message);
        await sendReply(senderJid, `❌ Failed to list projects: ${err.message}`, messageId);
      }
      break;
    }

    case 'project_status': {
      const query = intent.projectQuery || getSelectedProject(senderJid)?.projectSlug || '';
      console.log(`[whatsapp:handler] Status query: ${query}`);

      try {
        const project = await apiFetch(`/projects/${encodeURIComponent(query)}`);
        const message = templates.statusSummary(
          { name: project.name, slug: project.slug, status: project.status },
          project.runs?.[0]?.steps?.find((s: any) => s.status === 'active')?.name
        );
        await sendReply(senderJid, message, messageId);
      } catch (err: any) {
        if (err.message.includes('404')) {
          await sendReply(senderJid, `🔍 Project "${query}" not found.`, messageId);
        } else {
          await sendReply(senderJid, `❌ Failed to get status: ${err.message}`, messageId);
        }
      }
      break;
    }

    case 'approve': {
      const target = intent.projectQuery || getSelectedProject(senderJid)?.projectSlug || 'latest';
      console.log(`[whatsapp:handler] Approve: ${target}`);

      try {
        const approvals = await apiFetch<any[]>('/approvals?status=pending');
        const approval = findApproval(approvals, target);

        if (!approval) {
          await sendReply(senderJid, '📭 No pending approvals found.', messageId);
          break;
        }

        await apiFetch(`/approvals/${approval.id}/resolve`, {
          method: 'POST',
          body: JSON.stringify({ decision: 'approved' }),
        });
        // Notification sent by API dispatcher — no duplicate reply here
      } catch (err: any) {
        await sendReply(senderJid, `❌ Failed to approve: ${err.message}`, messageId);
      }
      break;
    }

    case 'reject': {
      const target = intent.projectQuery || getSelectedProject(senderJid)?.projectSlug || 'latest';
      console.log(`[whatsapp:handler] Reject: ${target}`);

      try {
        const approvals = await apiFetch<any[]>('/approvals?status=pending');
        const approval = findApproval(approvals, target);

        if (!approval) {
          await sendReply(senderJid, '📭 No pending approvals found.', messageId);
          break;
        }

        await apiFetch(`/approvals/${approval.id}/resolve`, {
          method: 'POST',
          body: JSON.stringify({
            decision: 'rejected',
            reason: intent.reason || 'Rejected via WhatsApp',
          }),
        });
        // Notification sent by API dispatcher — no duplicate reply here
      } catch (err: any) {
        await sendReply(senderJid, `❌ Failed to reject: ${err.message}`, messageId);
      }
      break;
    }

    case 'clarification_answer': {
      const rawAns = (intent as any).rawText || intent.answer || (intent as any).message || '';
      await handleClarificationAnswer(senderJid, messageId, rawAns);
      break;
    }

    case 'info_request': {
      console.log(`[whatsapp:handler] Info request: ${intent.query}`);

      try {
        const selected = getSelectedProject(senderJid);
        const projects = await apiFetch<any[]>('/projects');

        // Use selected project if set, otherwise first project
        let project: any = null;
        if (selected) {
          project = projects.find((p: any) => p.id === selected.projectId || p.slug === selected.projectSlug);
        }
        if (!project) {
          project = projects[0];
        }

        if (!project) {
          await sendReply(senderJid, 'ℹ️ No projects found.', messageId);
          break;
        }

        const message = templates.statusSummary(
          { name: project.name, slug: project.slug, status: project.status },
          undefined
        );
        await sendReply(senderJid, message, messageId);
      } catch (err: any) {
        await sendReply(senderJid, `❌ ${err.message}`, messageId);
      }
      break;
    }

    case 'unknown':
    case 'chat': {
      const messageText = intent.type === 'chat' ? intent.message : intent.rawText;
      console.log(`[whatsapp:handler] ${intent.type === 'chat' ? 'Chat' : 'Unknown'}: ${messageText}`);
      
      // If there's a selected project or only one project and the message sounds like a modification, treat as modify
      try {
        const selected = getSelectedProject(senderJid);
        const projects = await apiFetch<any[]>('/projects');
        const lower = messageText.toLowerCase();
        const isModifyIntent = /rework|update|fix|change|modify|improve|redesign|edit|add|remove|delete|redo|create/.test(lower);
        
        // Use selected project if available, otherwise only auto-modify when exactly one project
        if (isModifyIntent) {
          let project: any = null;
          if (selected) {
            project = projects.find((p: any) => p.id === selected.projectId || p.slug === selected.projectSlug);
          } else if (projects.length === 1) {
            project = projects[0];
          }
          
          if (project) {
            await apiFetch(`/projects/${project.id}/threads`, {
              method: 'POST',
              body: JSON.stringify({ role: 'user', content: messageText }),
            });
            await apiFetch(`/projects/${project.id}/trigger`, { method: 'POST' });
            
            await sendReply(
              senderJid,
              `✏️ *Modifying ${project.name}*\n\nWorking on your request: ${messageText.slice(0, 100)}\n\nI'll notify you when the build is done.`,
              messageId
            );
            break;
          }
        }
      } catch {}
      
      const reply = await generateChatReply(messageText, senderJid);
      await sendReply(senderJid, reply, messageId);
      break;
    }

    case 'select_project': {
      console.log(`[whatsapp:handler] Select project: ${intent.projectQuery}`);

      try {
        const projects = await apiFetch<any[]>('/projects');
        let project: any = null;

        // Try numeric index first (e.g. "select 1")
        const numMatch = intent.projectQuery.trim().match(/^(\d+)$/);
        if (numMatch) {
          const index = parseInt(numMatch[1], 10) - 1;
          project = projects[index] || null;
        }

        // Fall back to name/slug match
        if (!project) {
          project = projects.find(
            (p: any) =>
              p.slug?.toLowerCase() === intent.projectQuery.toLowerCase() ||
              p.name?.toLowerCase() === intent.projectQuery.toLowerCase() ||
              p.slug?.toLowerCase().includes(intent.projectQuery.toLowerCase()) ||
              p.name?.toLowerCase().includes(intent.projectQuery.toLowerCase())
          );
        }

        if (!project) {
          // List available projects for reference
          const names = projects.map((p: any) => `"${p.name}"`).join(', ') || 'none';
          await sendReply(senderJid, `🔍 Could not find project "${intent.projectQuery}". Available: ${names}`, messageId);
          break;
        }

        selectProject(senderJid, project.id, project.slug, project.name);
        await sendReply(
          senderJid,
          templates.projectSelected({ name: project.name, slug: project.slug, status: project.status }),
          messageId
        );
      } catch (err: any) {
        await sendReply(senderJid, `❌ Failed to select project: ${err.message}`, messageId);
      }
      break;
    }

    case 'deselect_project': {
      console.log('[whatsapp:handler] Deselect project');
      clearSelectedProject(senderJid);
      await sendReply(senderJid, templates.projectDeselected(), messageId);
      break;
    }

    case 'modify_project': {
      const selected = getSelectedProject(senderJid);
      const query = intent.projectQuery || selected?.projectSlug || '';
      console.log(`[whatsapp:handler] Modify project: ${query} — ${intent.request}`);

      try {
        // Find the project by slug/name or use selected
        const projects = await apiFetch<any[]>('/projects');
        let project: any = null;

        if (query) {
          project = projects.find(
            (p: any) =>
              p.slug?.toLowerCase().includes(query.toLowerCase()) ||
              p.name?.toLowerCase().includes(query.toLowerCase())
          );
        }

        if (!project) {
          if (selected) {
            await sendReply(senderJid, `🔍 Could not find project "${query}". Your selected project (${selected.projectName}) may have been deleted. Try "list projects".`, messageId);
          } else {
            await sendReply(senderJid, `🔍 Could not find project "${query}". Check the name with "list projects" or use "select [project]" to set a default.`, messageId);
          }
          break;
        }

        // Store the modification request as a thread
        await apiFetch(`/projects/${project.id}/threads`, {
          method: 'POST',
          body: JSON.stringify({ role: 'user', content: intent.request }),
        });

        // Trigger edit pipeline
        await apiFetch(`/projects/${project.id}/trigger`, { method: 'POST' });

        await sendReply(
          senderJid,
          `✏️ *Modification Requested*\nProject: ${project.name}\n\nRequest: ${intent.request}\n\nWorking on it — I'll let you know when it's done.`,
          messageId
        );
      } catch (err: any) {
        await sendReply(senderJid, `❌ Failed to process modification: ${err.message}`, messageId);
      }
      break;
    }
  }
}

/**
 * Handle a clarification answer from the operator.
 * Records the answer and, if all answers are collected,
 * stores them and resumes the pipeline.
 */
async function handleClarificationAnswer(
  senderJid: string,
  messageId: string,
  answer: string
): Promise<void> {
  const result = recordAnswer(senderJid, answer);

  if (!result.context) {
    await sendReply(senderJid, 'ℹ️ No active clarification session. Start a project first.', messageId);
    return;
  }

  if (!result.complete) {
    const remaining = result.context.expectedCount - result.allAnswers.length;
    await sendReply(
      senderJid,
      `✅ Got it! ${remaining} more answer${remaining > 1 ? 's' : ''} to go...`,
      messageId
    );
    return;
  }

  // All answers collected — store them and resume pipeline
  try {
    // Store answers as thread messages
    for (const ans of result.allAnswers) {
      await apiFetch(`/projects/${result.context.projectId}/threads`, {
        method: 'POST',
        body: JSON.stringify({ role: 'user', content: ans }),
      });
    }

    // Only clear conversation after successful storage
    clearConversation(senderJid);

    // Emit clarification.answered event for orchestrator
    bus.emit({
      type: 'clarification.answered',
      projectId: result.context.projectId,
      answers: result.allAnswers,
      timestamp: Date.now(),
    });

    // Trigger pipeline continuation via API (cross-process)
    try {
      await apiFetch(`/projects/${result.context.projectId}/trigger`, {
        method: 'POST',
      });
      console.log(`[whatsapp:handler] Pipeline triggered for ${result.context.projectId}`);
    } catch (triggerErr: any) {
      console.error('[whatsapp:handler] Failed to trigger pipeline:', triggerErr.message);
    }

    await sendReply(
      senderJid,
      `✅ All answers received! Generating your implementation plan...`,
      messageId
    );
  } catch (err: any) {
    console.error('[whatsapp:handler] Failed to process clarification answers:', err.message);
    // Don't clear conversation on failure — allow retry
    await sendReply(senderJid, `❌ Failed to process answers: ${err.message}. Try sending your answer again.`, messageId);
  }
}

/**
 * Find an approval by project slug/name match or return the latest.
 */
function findApproval(approvals: any[], target: string): any | null {
  if (approvals.length === 0) return null;

  if (target === 'latest') {
    return approvals[0];
  }

  return approvals.find(
    (a) =>
      a.project?.slug?.includes(target.toLowerCase()) ||
      a.project?.name?.toLowerCase().includes(target.toLowerCase())
  ) || null;
}

/**
 * Generate a natural language chat reply using the LLM.
 * Responds conversationally and guides the user toward available actions.
 */
async function generateChatReply(message: string, senderJid: string): Promise<string> {
  const API_URL = process.env.OPENAI_BASE_URL || 'https://opencode.ai/zen/go/v1';
  const API_KEY = process.env.OPENAI_API_KEY || '';
  const MODEL = 'deepseek-v4-flash';

  // Gather context about current projects for a smarter reply
  let projectContext = '';
  try {
    const selected = getSelectedProject(senderJid);
    const projects = await apiFetch<any[]>('/projects');
    if (projects.length > 0) {
      const summary = projects
        .slice(0, 5)
        .map((p) => `- ${p.name} (${p.status})`)
        .join('\n');
      let ctx = `\nCurrent projects:\n${summary}`;
      if (selected) {
        ctx += `\n\nSelected project: ${selected.projectName} (${selected.projectSlug}) — commands without a specific project target this one.`;
      }
      projectContext = ctx;
    }
  } catch {}

  const systemPrompt = `You are BrickOps, an AI project builder assistant on WhatsApp. You help users create, manage, and deploy software projects using AI.

Your capabilities:
- Create new projects from a description ("start project for...")
- List and check project status ("list projects", "status of...")
- Approve or reject plans ("approve", "reject")
- Answer questions about projects ("what files changed?")
${projectContext}

Rules:
- Be concise (WhatsApp messages should be short — max 4-5 lines)
- Be friendly but professional
- Guide users toward actions they can take
- If they describe an idea, suggest: "start project for [their idea]"
- If they greet, greet back and briefly offer help
- Don't use markdown formatting (WhatsApp doesn't render it well)
- Use emojis sparingly (1-2 max per message)
- Never make up project details you don't know`;

  try {
    const response = await fetch(`${API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return getFallbackReply(message);
    }

    const data = await response.json() as any;
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return getFallbackReply(message);
    }

    return reply;
  } catch {
    return getFallbackReply(message);
  }
}

/**
 * Fallback replies when the LLM is unavailable.
 */
function getFallbackReply(message: string): string {
  const lower = message.toLowerCase();

  if (/^(hi|hello|hey|yo|sup|hola)/i.test(lower)) {
    return "Hey! I'm BrickOps, your AI project builder. Tell me what you want to build and I'll plan it out for you.";
  }

  if (/help|how|what can/i.test(lower)) {
    return [
      "I can help you build projects with AI. Try:",
      "",
      ' "start project for a todo app with React"',
      ' "list projects"',
      ' "status of [project name]"',
      '',
      "Just describe what you want to build!",
    ].join('\n');
  }

  return [
    "I'm here to help you build projects with AI.",
    'Try: "start project for [your idea]"',
    'Or: "list projects" to see what you have.',
  ].join('\n');
}
