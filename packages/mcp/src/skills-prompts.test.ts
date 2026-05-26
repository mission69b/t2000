import { describe, it, expect, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerSkillPrompts,
  toPromptName,
  type SkillData,
} from './skills-prompts.js';

describe('toPromptName', () => {
  it('strips t2000- prefix and prepends skill-', () => {
    expect(toPromptName('t2000-send')).toBe('skill-send');
    expect(toPromptName('t2000-check-balance')).toBe('skill-check-balance');
    expect(toPromptName('t2000-services')).toBe('skill-services');
  });

  it('handles names without t2000- prefix gracefully', () => {
    expect(toPromptName('custom-skill')).toBe('skill-custom-skill');
  });

  it('preserves non-t2000 namespaces (e.g. future audric-* / mpp-* prefixes)', () => {
    // `toPromptName` only strips the `t2000-` prefix; any other namespace
    // is preserved verbatim. Documented here so a future skill set in the
    // monorepo (`audric-*`, an mpp recipe revival, etc.) doesn't surprise
    // anyone with prompt-name collisions.
    expect(toPromptName('audric-some-flow')).toBe('skill-audric-some-flow');
    expect(toPromptName('mpp-image-gen')).toBe('skill-mpp-image-gen');
  });
});

describe('registerSkillPrompts', () => {
  let server: McpServer;
  let prompts: Map<string, { description: string; handler: Function }>;

  const fixtureSkills: SkillData[] = [
    {
      name: 't2000-send',
      description: 'Send USDC, USDsui, or SUI to a Sui address, SuiNS name, or saved contact.',
      body: '# t2000: Send USDC, USDsui, or SUI\n\nTransfer funds to another Sui address...',
    },
    {
      name: 't2000-check-balance',
      description: 'Check the t2000 Agent Wallet balance on Sui.',
      body: '# t2000: Check Balance\n\nReturn the wallet balance summary...',
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
    expect(prompts.has('skill-send')).toBe(true);
    expect(prompts.has('skill-check-balance')).toBe(true);
  });

  it('uses the skill description as the MCP prompt description', () => {
    registerSkillPrompts(server, fixtureSkills);

    expect(prompts.get('skill-send')?.description).toBe(
      'Send USDC, USDsui, or SUI to a Sui address, SuiNS name, or saved contact.',
    );
  });

  it('handler returns the skill body as a user-role text message', async () => {
    registerSkillPrompts(server, fixtureSkills);

    const { handler } = prompts.get('skill-send')!;
    const result = await handler({});

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content.type).toBe('text');
    expect(result.messages[0].content.text).toContain('t2000: Send USDC');
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
