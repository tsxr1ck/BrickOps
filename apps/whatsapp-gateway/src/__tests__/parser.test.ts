import { describe, it, expect } from 'bun:test';
import { parseIntent } from '../parser';

/**
 * Tests every command pattern from the blueprint:
 *
 * Project creation:
 *   - "start project for X"
 *   - "new app: X"
 *   - "create a fullstack app for X using React and Node"
 *
 * Status and listing:
 *   - "list projects"
 *   - "show active projects"
 *   - "status of byrick hq"
 *   - "what is waiting for me?"
 *
 * Approvals:
 *   - "approve latest plan"
 *   - "reject deploy for relationship os"
 *   - "approve command for project X"
 *
 * Info requests:
 *   - "what files changed?"
 *   - "why did the build fail?"
 *   - "show blockers"
 *   - "summarize latest run"
 */

describe('parseIntent', () => {
  // --- Create project ---
  describe('create_project', () => {
    it('should parse "start project for X"', () => {
      const intent = parseIntent('start project for a landing page for sneakers');
      expect(intent.type).toBe('create_project');
      if (intent.type === 'create_project') {
        expect(intent.description).toBe('a landing page for sneakers');
      }
    });

    it('should parse "new app: X"', () => {
      const intent = parseIntent('new app: fitness tracker with auth');
      expect(intent.type).toBe('create_project');
      if (intent.type === 'create_project') {
        expect(intent.description).toBe('fitness tracker with auth');
      }
    });

    it('should parse "create a fullstack app for X"', () => {
      const intent = parseIntent('create a fullstack app for inventory management using React and Node');
      expect(intent.type).toBe('create_project');
      if (intent.type === 'create_project') {
        expect(intent.description).toContain('inventory management');
      }
    });

    it('should parse "build me a new X"', () => {
      const intent = parseIntent('build me a new CRM dashboard');
      expect(intent.type).toBe('create_project');
      if (intent.type === 'create_project') {
        expect(intent.description).toContain('CRM dashboard');
      }
    });
  });

  // --- List projects ---
  describe('list_projects', () => {
    it('should parse "list projects"', () => {
      expect(parseIntent('list projects').type).toBe('list_projects');
    });

    it('should parse "show active projects"', () => {
      expect(parseIntent('show active projects').type).toBe('list_projects');
    });

    it('should parse "my projects"', () => {
      expect(parseIntent('my projects').type).toBe('list_projects');
    });
  });

  // --- Status ---
  describe('project_status', () => {
    it('should parse "status of byrick hq"', () => {
      const intent = parseIntent('status of byrick hq');
      expect(intent.type).toBe('project_status');
      if (intent.type === 'project_status') {
        expect(intent.projectQuery).toBe('byrick hq');
      }
    });

    it('should parse "how is relationship os doing?"', () => {
      const intent = parseIntent('how is relationship os doing?');
      expect(intent.type).toBe('project_status');
      if (intent.type === 'project_status') {
        expect(intent.projectQuery).toBe('relationship os');
      }
    });

    it('should parse "what is waiting for me?"', () => {
      const intent = parseIntent('what is waiting for me?');
      expect(intent.type).toBe('project_status');
      if (intent.type === 'project_status') {
        expect(intent.projectQuery).toBe('__pending__');
      }
    });
  });

  // --- Approve ---
  describe('approve', () => {
    it('should parse "approve latest plan"', () => {
      const intent = parseIntent('approve latest plan');
      expect(intent.type).toBe('approve');
      if (intent.type === 'approve') {
        expect(intent.projectQuery).toContain('latest');
      }
    });

    it('should parse "approve relationship-os"', () => {
      const intent = parseIntent('approve relationship-os');
      expect(intent.type).toBe('approve');
      if (intent.type === 'approve') {
        expect(intent.projectQuery).toBe('relationship-os');
      }
    });

    it('should parse "yes" as approve with no target', () => {
      const intent = parseIntent('yes');
      expect(intent.type).toBe('approve');
    });

    it('should parse "lgtm" as approve', () => {
      const intent = parseIntent('lgtm');
      expect(intent.type).toBe('approve');
    });
  });

  // --- Reject ---
  describe('reject', () => {
    it('should parse "reject deploy for relationship os"', () => {
      const intent = parseIntent('reject deploy for relationship os');
      expect(intent.type).toBe('reject');
      if (intent.type === 'reject') {
        expect(intent.projectQuery).toBe('relationship os');
      }
    });

    it('should parse "no" as reject', () => {
      const intent = parseIntent('no');
      expect(intent.type).toBe('reject');
    });

    it('should parse "reject X because Y"', () => {
      const intent = parseIntent('reject tracker because the auth flow is wrong');
      expect(intent.type).toBe('reject');
      if (intent.type === 'reject') {
        expect(intent.projectQuery).toBe('tracker');
        expect(intent.reason).toBe('the auth flow is wrong');
      }
    });
  });

  // --- Info requests ---
  describe('info_request', () => {
    it('should parse "what files changed?"', () => {
      const intent = parseIntent('what files changed?');
      expect(intent.type).toBe('info_request');
    });

    it('should parse "why did the build fail?"', () => {
      const intent = parseIntent('why did the build fail?');
      expect(intent.type).toBe('info_request');
    });

    it('should parse "show blockers"', () => {
      const intent = parseIntent('show blockers');
      expect(intent.type).toBe('info_request');
    });

    it('should parse "summarize latest run"', () => {
      const intent = parseIntent('summarize latest run');
      expect(intent.type).toBe('info_request');
    });
  });

  // --- Unknown ---
  describe('unknown', () => {
    it('should return unknown for gibberish', () => {
      const intent = parseIntent('asdfghjkl');
      expect(intent.type).toBe('unknown');
      if (intent.type === 'unknown') {
        expect(intent.rawText).toBe('asdfghjkl');
      }
    });
  });
});
