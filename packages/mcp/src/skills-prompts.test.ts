import { describe, it, expect, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerSkillPrompts,
  toPromptName,
  type SkillData,
} from './skills-prompts.js';

describe('toPromptName', () => {
  it('strips t2000- prefix and prepends skill-', () => {
    expect(toPromptName('t2000-borrow')).toBe('skill-borrow');
    expect(toPromptName('t2000-account-report')).toBe('skill-account-report');
    expect(toPromptName('t2000-check-balance')).toBe('skill-check-balance');
  });

  it('handles names without t2000- prefix gracefully', () => {
    expect(toPromptName('custom-skill')).toBe('skill-custom-skill');
  });

  it('keeps mpp- prefix as-is (S.326 — MPP recipes share the skill- namespace)', () => {
    // mpp-* skills only strip the t2000- prefix (which isn't present), so the
    // mpp- prefix is preserved → `skill-mpp-image-gen` (unambiguous + scannable).
    expect(toPromptName('mpp-image-gen')).toBe('skill-mpp-image-gen');
    expect(toPromptName('mpp-gpt4o')).toBe('skill-mpp-gpt4o');
    expect(toPromptName('mpp-transcription')).toBe('skill-mpp-transcription');
    expect(toPromptName('mpp-index')).toBe('skill-mpp-index');
  });
});

describe('registerSkillPrompts', () => {
  let server: McpServer;
  let prompts: Map<string, { description: string; handler: Function }>;

  const fixtureSkills: SkillData[] = [
    {
      name: 't2000-borrow',
      description: 'Borrow USDC or USDsui against savings collateral.',
      body: '# t2000: Borrow USDC or USDsui\n\nTake a collateralized loan...',
    },
    {
      name: 't2000-account-report',
      description: 'Render a complete account snapshot.',
      body: '# t2000: Account Report\n\nMulti-tool orchestration...',
    },
  ];

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '0.0.1' });
    prompts = new Map();

    const origPrompt = server.prompt.bind(server) as (...args: any[]) => any;
    server.prompt = ((...args: any[]) => {
      const name = args[0] as string;
      const description = args[1] as string;
      const handler = args[args.length - 1] as Function;
      prompts.set(name, { description, handler });
      return origPrompt(...args);
    }) as any;
  });

  it('registers one MCP prompt per skill with the skill- prefix', () => {
    registerSkillPrompts(server, fixtureSkills);

    expect(prompts.size).toBe(2);
    expect(prompts.has('skill-borrow')).toBe(true);
    expect(prompts.has('skill-account-report')).toBe(true);
  });

  it('uses the skill description as the MCP prompt description', () => {
    registerSkillPrompts(server, fixtureSkills);

    expect(prompts.get('skill-borrow')?.description).toBe(
      'Borrow USDC or USDsui against savings collateral.',
    );
  });

  it('handler returns the skill body as a user-role text message', async () => {
    registerSkillPrompts(server, fixtureSkills);

    const { handler } = prompts.get('skill-borrow')!;
    const result = await handler({});

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content.type).toBe('text');
    expect(result.messages[0].content.text).toContain('t2000: Borrow USDC');
  });

  it('passing an empty skills array registers no prompts', () => {
    registerSkillPrompts(server, []);
    expect(prompts.size).toBe(0);
  });

  it('falls back to baked skills (an empty array during dev/typecheck) when no arg given', () => {
    // During vitest runs the `__BAKED_SKILLS__` define-injected symbol
    // doesn't exist (we're not going through tsup). `getBakedSkills` returns
    // `[]` and `registerSkillPrompts` registers nothing — verifies the
    // fallback path doesn't throw.
    expect(() => registerSkillPrompts(server)).not.toThrow();
    expect(prompts.size).toBe(0);
  });
});
