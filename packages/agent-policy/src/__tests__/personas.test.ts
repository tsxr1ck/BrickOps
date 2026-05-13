import { describe, it, expect } from 'bun:test';
import { getPersona, getAllPersonas, getPersonaSystemPrompt } from '../personas';
import { detectEscalatedRisk, getRiskPolicy } from '../risk';

describe('personas (compiled from agency-agents)', () => {
  it('should load frontend-developer from compiled JSON', () => {
    const persona = getPersona('frontend-developer');
    expect(persona.name).toBe('Frontend Developer');
    expect(persona.description).toContain('frontend developer');
    // Core domain phrases must survive compilation
    expect(persona.systemPrompt).toContain('pixel-perfect');
    expect(persona.systemPrompt).toContain('Core Web Vitals');
  });

  it('should load backend-architect from compiled JSON', () => {
    const persona = getPersona('backend-architect');
    expect(persona.name).toBe('Backend Architect');
    expect(persona.systemPrompt).toContain('scalable system design');
    expect(persona.systemPrompt).toContain('Security-First');
  });

  it('should load software-architect from compiled JSON', () => {
    const persona = getPersona('software-architect');
    expect(persona.name).toBe('Software Architect');
    expect(persona.systemPrompt).toContain('bounded contexts');
    expect(persona.systemPrompt).toContain('Architecture Decision Record');
  });

  it('should load ai-engineer from compiled JSON', () => {
    const persona = getPersona('ai-engineer');
    expect(persona.name).toBe('AI Engineer');
    expect(persona.systemPrompt).toContain('machine learning');
    expect(persona.systemPrompt).toContain('MLOps');
  });

  it('should load code-reviewer from compiled JSON', () => {
    const persona = getPersona('code-reviewer');
    expect(persona.name).toBe('Code Reviewer');
    expect(persona.systemPrompt).toContain('constructive');
    expect(persona.systemPrompt).toContain('🔴 blocker');
  });

  it('should load reality-checker from compiled JSON', () => {
    const persona = getPersona('reality-checker');
    expect(persona.name).toBe('Reality Checker');
    expect(persona.systemPrompt).toContain('fantasy approvals');
    expect(persona.systemPrompt).toContain('NEEDS WORK');
  });

  it('should load project-shepherd from compiled JSON', () => {
    const persona = getPersona('project-shepherd');
    expect(persona.name).toBe('Project Shepherd');
    expect(persona.systemPrompt).toContain('cross-functional');
    expect(persona.systemPrompt).toContain('stakeholder');
  });

  it('should use inline prompt for router (BrickOps-native)', () => {
    const persona = getPersona('router');
    expect(persona.name).toBe('Router');
    expect(persona.systemPrompt).toContain('BrickOps Router');
    expect(persona.systemPrompt).toContain('taskType');
  });

  it('should load all personas without errors', () => {
    const all = getAllPersonas();
    expect(all.length).toBe(11);
    for (const p of all) {
      expect(p.systemPrompt.length).toBeGreaterThan(100);
    }
  });

  it('getPersonaSystemPrompt should return the compiled prompt', () => {
    const prompt = getPersonaSystemPrompt('reality-checker');
    expect(prompt).toContain('TestingRealityChecker');
  });

  it('compiled prompts should NOT contain YAML frontmatter', () => {
    const all = getAllPersonas();
    for (const p of all) {
      expect(p.systemPrompt).not.toMatch(/^---/);
      expect(p.systemPrompt).not.toContain('color:');
      expect(p.systemPrompt).not.toContain('emoji:');
      expect(p.systemPrompt).not.toContain('vibe:');
    }
  });

  it('planner should have stripped template blocks', () => {
    const persona = getPersona('planner');
    // Core identity and mission should survive
    expect(persona.systemPrompt).toContain('outcome');
    // Heavy template blocks should be stripped
    expect(persona.systemPrompt).not.toContain('## 5. Solution Overview');
    expect(persona.systemPrompt).not.toContain('PRD:');
    expect(persona.systemPrompt).not.toContain('Personality Highlights');
  });

  it('should throw for unknown roles', () => {
    expect(() => getPersona('nonexistent-role' as any)).toThrow(
      'Persona not compiled for role'
    );
  });
});

describe('risk policy', () => {
  it('should escalate on dangerous keywords', () => {
    expect(detectEscalatedRisk('delete the database')).toBe('medium');
    expect(detectEscalatedRisk('deploy to production with new auth')).toBe('critical');
    expect(detectEscalatedRisk('add a button to the page')).toBe('low');
  });

  it('should return correct defaults for task types', () => {
    expect(getRiskPolicy('intent-parse').defaultRisk).toBe('low');
    expect(getRiskPolicy('architecture-plan').defaultRisk).toBe('medium');
    expect(getRiskPolicy('architecture-plan').requiresApproval).toBe(true);
  });
});
