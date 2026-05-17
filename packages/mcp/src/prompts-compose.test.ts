// ---------------------------------------------------------------------------
// prompts-compose.test.ts — 6G regression tests
// ---------------------------------------------------------------------------
//
// SPEC v0.7a Phase 6G. Asserts that each workflow prompt now includes
// the *substance* of the skills it composes, so future drift between
// SKILL.md and prompts.ts can't happen silently.
//
// The 11 existing `prompts.test.ts` assertions cover tool-name checks
// (e.g. `text.toContain('t2000_overview')`). Those still pass but ONLY
// confirm framing prose. These tests confirm the SKILL BODIES landed
// in the rendered prompt — the actual point of 6G.
//
// Strategy per prompt:
//   1. Pick a sentence from the composed skill body that is distinctive
//      to that skill (won't accidentally appear in a different skill).
//   2. Assert the workflow prompt's rendered text contains that
//      sentence verbatim.
//   3. Also assert the workflow's OWN framing prose is present (so we
//      don't accidentally lose the framing while debugging the skill
//      injection).
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPrompts } from './prompts.js';
import { loadSkillsFromDisk } from './test-load-skills.js';
import type { SkillData } from './skills-prompts.js';

describe('prompts — 6G skill composition', () => {
  let server: McpServer;
  let prompts: Map<string, Function>;
  let skills: SkillData[];

  beforeAll(() => {
    skills = loadSkillsFromDisk();
  });

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '0.0.1' });
    prompts = new Map();
    const origPrompt = server.prompt.bind(server) as (...args: any[]) => any;
    server.prompt = ((...args: any[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as Function;
      prompts.set(name, handler);
      return origPrompt(...args);
    }) as any;
    registerPrompts(server, { skills });
  });

  async function renderText(promptName: string, args: object = {}): Promise<string> {
    const handler = prompts.get(promptName);
    if (!handler) throw new Error(`prompt '${promptName}' not registered`);
    const result = await handler(args);
    return result.messages[0].content.text as string;
  }

  function findSkillBody(name: string): string {
    const s = skills.find((s) => s.name === name);
    if (!s) throw new Error(`fixture missing skill '${name}'`);
    return s.body;
  }

  /** Pull a distinctive line from a skill body by header. Used to assert
   * that a specific skill section landed in the prompt verbatim. */
  function getSectionBody(skillName: string, header: string): string {
    const body = findSkillBody(skillName);
    const regex = new RegExp(
      `^## ${escapeRegExp(header)}\\n([\\s\\S]*?)(?=\\n## |$)`,
      'm',
    );
    const m = regex.exec(body);
    if (!m) throw new Error(`section '${header}' not found in ${skillName}`);
    return m[1]!.trim();
  }

  function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ---------------------------------------------------------------------
  // ADVISOR PROMPTS
  // ---------------------------------------------------------------------

  it('financial-report composes t2000-account-report Purpose + Engine orchestration', async () => {
    const text = await renderText('financial-report');
    const purpose = getSectionBody('t2000-account-report', 'Purpose');
    const orchestration = getSectionBody('t2000-account-report', 'Engine orchestration (audric/web)');
    // Pick a distinctive line from each.
    expect(text).toContain(purpose.split('\n')[0]!);
    expect(text).toContain(orchestration.split('\n')[0]!);
    // Framing-specific advisor layer must still be present.
    expect(text).toContain('RECOMMENDATIONS');
  });

  it('optimize-yield composes t2000-save Purpose', async () => {
    const text = await renderText('optimize-yield');
    const purpose = getSectionBody('t2000-save', 'Purpose');
    expect(text).toContain(purpose.split('\n')[0]!);
    expect(text).toContain('YIELD ANALYSIS');
  });

  it('savings-strategy composes t2000-save Purpose', async () => {
    const text = await renderText('savings-strategy');
    const purpose = getSectionBody('t2000-save', 'Purpose');
    expect(text).toContain(purpose.split('\n')[0]!);
  });

  it('sweep composes t2000-save Purpose + framing', async () => {
    const text = await renderText('sweep', { keepBuffer: 10 });
    const purpose = getSectionBody('t2000-save', 'Purpose');
    expect(text).toContain(purpose.split('\n')[0]!);
    expect(text).toContain('SWEEP PLAN');
    expect(text).toContain('$10'); // arg interpolation
  });

  it('risk-check composes t2000-borrow Pre-borrow safety check + account-report orchestration', async () => {
    const text = await renderText('risk-check');
    const preBorrow = getSectionBody('t2000-borrow', 'Pre-borrow safety check (always runs)');
    const orchestration = getSectionBody('t2000-account-report', 'Engine orchestration (audric/web)');
    expect(text).toContain(preBorrow.split('\n')[0]!);
    expect(text).toContain(orchestration.split('\n')[0]!);
    expect(text).toContain('RISK REPORT');
  });

  it('weekly-recap composes t2000-account-report Engine orchestration', async () => {
    const text = await renderText('weekly-recap');
    const orchestration = getSectionBody('t2000-account-report', 'Engine orchestration (audric/web)');
    expect(text).toContain(orchestration.split('\n')[0]!);
    expect(text).toContain('WEEKLY RECAP');
  });

  // ---------------------------------------------------------------------
  // ACTION PROMPTS
  // ---------------------------------------------------------------------

  it('send-money composes t2000-send Purpose + Pre-flight checks + Recipient resolution flow', async () => {
    const text = await renderText('send-money', { to: '0xabc', amount: 25 });
    const purpose = getSectionBody('t2000-send', 'Purpose');
    const preflight = getSectionBody('t2000-send', 'Pre-flight checks (automatic)');
    const recipient = getSectionBody('t2000-send', 'Recipient resolution flow');
    expect(text).toContain(purpose.split('\n')[0]!);
    expect(text).toContain(preflight.split('\n')[0]!);
    expect(text).toContain(recipient.split('\n')[0]!);
    expect(text).toContain('0xabc');
    expect(text).toContain('$25');
  });

  it('budget-check composes t2000-check-balance Purpose + t2000-safeguards Controls', async () => {
    const text = await renderText('budget-check', { amount: 100 });
    const balancePurpose = getSectionBody('t2000-check-balance', 'Purpose');
    const safeguardControls = getSectionBody('t2000-safeguards', 'Controls');
    expect(text).toContain(balancePurpose.split('\n')[0]!);
    expect(text).toContain(safeguardControls.split('\n')[0]!);
    expect(text).toContain('$100');
  });

  it('what-if composes all three scenario skills (save, borrow, withdraw)', async () => {
    const text = await renderText('what-if', { scenario: 'borrow $200' });
    const saveBody = getSectionBody('t2000-save', 'Purpose');
    const borrowBody = getSectionBody('t2000-borrow', 'Pre-borrow safety check (always runs)');
    const withdrawBody = getSectionBody('t2000-withdraw', 'Safety check (active when debt exists)');
    expect(text).toContain(saveBody.split('\n')[0]!);
    expect(text).toContain(borrowBody.split('\n')[0]!);
    expect(text).toContain(withdrawBody.split('\n')[0]!);
    expect(text).toContain('borrow $200');
    expect(text).toContain('Before    After');
  });

  // ---------------------------------------------------------------------
  // OPERATIONAL + CUSTOMER PROMPTS
  // ---------------------------------------------------------------------

  it('claim-rewards has no skill composition (operational only) but covers the flow', async () => {
    const text = await renderText('claim-rewards');
    expect(text).toContain('t2000_claim_rewards');
    expect(text).toContain('t2000_pending_rewards');
    expect(text).toContain('t2000_harvest_rewards');
  });

  it('safeguards composes the FULL t2000-safeguards skill body', async () => {
    const text = await renderText('safeguards');
    const fullBody = findSkillBody('t2000-safeguards');
    // The full body should appear inline (modulo prompt-specific framing
    // before and after). Check distinctive lines from multiple sections.
    expect(text).toContain(getSectionBody('t2000-safeguards', 'Controls').split('\n')[0]!);
    expect(text).toContain(getSectionBody('t2000-safeguards', 'Commands').split('\n')[0]!);
    expect(text.length).toBeGreaterThan(fullBody.length * 0.7);
  });

  it('onboarding composes receive + save + safeguards Purpose sections', async () => {
    const text = await renderText('onboarding');
    expect(text).toContain(getSectionBody('t2000-receive', 'Purpose').split('\n')[0]!);
    expect(text).toContain(getSectionBody('t2000-save', 'Purpose').split('\n')[0]!);
    expect(text).toContain(getSectionBody('t2000-safeguards', 'Purpose').split('\n')[0]!);
    expect(text).toContain('WELCOME TO T2000');
  });

  it('emergency composes t2000-safeguards Controls', async () => {
    const text = await renderText('emergency');
    const controls = getSectionBody('t2000-safeguards', 'Controls');
    expect(text).toContain(controls.split('\n')[0]!);
    expect(text).toContain('EMERGENCY PROTOCOL');
    expect(text).toContain('t2000_lock');
  });

  it('optimize-all composes account-report + save Purpose + rebalance When-to-use', async () => {
    const text = await renderText('optimize-all');
    expect(text).toContain(getSectionBody('t2000-account-report', 'Engine orchestration (audric/web)').split('\n')[0]!);
    expect(text).toContain(getSectionBody('t2000-save', 'Purpose').split('\n')[0]!);
    expect(text).toContain(getSectionBody('t2000-rebalance', 'When to use').split('\n')[0]!);
    expect(text).toContain('FULL OPTIMIZATION');
  });

  // ---------------------------------------------------------------------
  // SAFETY NET — drift detection
  // ---------------------------------------------------------------------

  it('every composed prompt fails LOUDLY if a referenced skill is missing', async () => {
    // Simulate a deleted skill — rebuild with skills array minus
    // t2000-save and confirm every prompt that uses it throws.
    const trimmed = skills.filter((s) => s.name !== 't2000-save');
    const broken = new McpServer({ name: 'broken', version: '0.0.1' });
    const brokenPrompts = new Map<string, Function>();
    const orig = broken.prompt.bind(broken) as (...args: any[]) => any;
    broken.prompt = ((...args: any[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as Function;
      brokenPrompts.set(name, handler);
      return orig(...args);
    }) as any;
    registerPrompts(broken, { skills: trimmed });

    // Every prompt that composes t2000-save should throw at render time.
    const dependents = ['optimize-yield', 'savings-strategy', 'sweep', 'what-if', 'onboarding', 'optimize-all'];
    for (const name of dependents) {
      const handler = brokenPrompts.get(name)!;
      await expect(handler({})).rejects.toThrow(/Unknown skill 't2000-save'/);
    }
  });
});
