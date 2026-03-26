/**
 * Preset agent templates — default roles with predefined steps.
 */

import type { WorkspaceAgentConfig } from './types';

type PresetTemplate = Omit<WorkspaceAgentConfig, 'id'>;

export const AGENT_PRESETS: Record<string, PresetTemplate> = {
  pm: {
    label: 'PM',
    icon: '📋',
    role: 'You are a Product Manager. Analyze requirements, write clear PRDs, and define user stories. Do NOT write code or modify source files. Focus only on documentation under docs/.',
    backend: 'cli',
    agentId: 'claude',
    dependsOn: [],
    outputs: ['docs/prd.md'],
    steps: [
      { id: 'analyze', label: 'Analyze Requirements', prompt: 'Read existing documentation and project structure. Identify the key requirements and constraints.' },
      { id: 'write-prd', label: 'Write PRD', prompt: 'Based on your analysis, write a detailed PRD (Product Requirements Document) to docs/prd.md. Include: overview, goals, user stories, acceptance criteria, and technical constraints.' },
      { id: 'review', label: 'Self-Review', prompt: 'Review the PRD you wrote. Check for completeness, clarity, and feasibility. Make any necessary improvements.' },
    ],
  },

  engineer: {
    label: 'Engineer',
    icon: '🔨',
    role: 'You are a Senior Software Engineer. Design architecture and implement features based on the PRD. Write clean, tested code.',
    backend: 'cli',
    agentId: 'claude',
    dependsOn: [],  // Will be set to ['pm'] when used in a workspace
    outputs: ['src/', 'docs/architecture.md'],
    steps: [
      { id: 'design', label: 'Architecture Design', prompt: 'Read the PRD and existing codebase. Design the architecture and write it to docs/architecture.md. Include: component diagram, data flow, API design, and key technical decisions.' },
      { id: 'implement', label: 'Implementation', prompt: 'Implement the features based on your architecture design. Write clean, well-documented code.' },
      { id: 'self-test', label: 'Self-Test', prompt: 'Review your implementation. Run any existing tests. Fix any obvious issues.' },
    ],
  },

  qa: {
    label: 'QA',
    icon: '🧪',
    role: 'You are a QA Engineer. Write comprehensive test cases and execute tests. Report bugs clearly. Do NOT fix bugs — only report them.',
    backend: 'cli',
    agentId: 'claude',
    dependsOn: [],  // Will be set to ['engineer'] when used in a workspace
    outputs: ['tests/', 'docs/test-plan.md'],
    steps: [
      { id: 'plan', label: 'Test Planning', prompt: 'Read the PRD and implementation. Write a test plan to docs/test-plan.md covering: unit tests, integration tests, edge cases.' },
      { id: 'write-tests', label: 'Write Tests', prompt: 'Implement the test cases defined in your test plan. Write them in the tests/ directory.' },
      { id: 'execute', label: 'Execute Tests', prompt: 'Run all tests. Document results and any failures found. Write a summary to docs/test-results.md.' },
    ],
  },

  reviewer: {
    label: 'Reviewer',
    icon: '🔍',
    role: 'You are a Code Reviewer. Review code changes for quality, security, and best practices. Provide actionable feedback. Do NOT modify code directly.',
    backend: 'cli',
    agentId: 'claude',
    dependsOn: [],  // Will be set to ['engineer'] or ['qa'] when used
    outputs: ['docs/review.md'],
    steps: [
      { id: 'review-code', label: 'Code Review', prompt: 'Review all source code changes. Check for: code quality, security issues, performance, naming conventions, and adherence to the architecture design.' },
      { id: 'report', label: 'Write Report', prompt: 'Write a detailed review report to docs/review.md. Include: summary, issues found (critical/major/minor), suggestions for improvement, and overall assessment.' },
    ],
  },
};

/**
 * Create a full delivery pipeline preset: PM → Engineer → QA → Reviewer
 * Returns configs with proper dependsOn wiring.
 */
export function createDeliveryPipeline(): WorkspaceAgentConfig[] {
  const ts = Date.now();
  return [
    { ...AGENT_PRESETS.pm, id: `pm-${ts}`, dependsOn: [] },
    { ...AGENT_PRESETS.engineer, id: `engineer-${ts}`, dependsOn: [`pm-${ts}`] },
    { ...AGENT_PRESETS.qa, id: `qa-${ts}`, dependsOn: [`engineer-${ts}`] },
    { ...AGENT_PRESETS.reviewer, id: `reviewer-${ts}`, dependsOn: [`engineer-${ts}`, `qa-${ts}`] },
  ];
}

/** Get a preset by key, assigning a unique ID */
export function createFromPreset(key: string, overrides?: Partial<WorkspaceAgentConfig>): WorkspaceAgentConfig {
  const preset = AGENT_PRESETS[key];
  if (!preset) throw new Error(`Unknown preset: ${key}`);
  return {
    ...preset,
    id: `${key}-${Date.now()}`,
    ...overrides,
  };
}
