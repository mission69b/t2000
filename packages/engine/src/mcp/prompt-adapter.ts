// ---------------------------------------------------------------------------
// MCP prompt adapter — exposes prompts discovered on an MCP server as
// engine-native string blocks for `prepareStep.system` concatenation.
//
// **SPEC 37 v0.7a Phase 4 (2026-05-17, engine v2.1.0):** Phase 4 ships
// the adapter + tests. Phase 6 will wire `t2000-skills/skills/` through
// `@t2000/mcp` into the engine's system-prompt assembly. Adding the
// adapter in Phase 4 separates the WIRE (proven works) from the
// REGISTRY (Phase 6 audit + migration) per surgical-changes principle.
//
// The adapter wraps the `experimental_listPrompts` +
// `experimental_getPrompt` slice of `@ai-sdk/mcp`'s `MCPClient`. The
// `experimental_*` prefix on those methods reflects the upstream MCP
// spec status; this adapter is the engine's stable boundary.
// ---------------------------------------------------------------------------

import type { MCPClient as AISDKMcpClient } from '@ai-sdk/mcp';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptArgumentDescriptor {
  name: string;
  description?: string;
  required?: boolean;
}

export interface PromptDescriptor {
  name: string;
  description?: string;
  arguments?: PromptArgumentDescriptor[];
}

/**
 * Minimal MCP client shape required for prompt operations. Matches the
 * `experimental_listPrompts` + `experimental_getPrompt` slice of
 * `@ai-sdk/mcp`'s `MCPClient`. Decoupled here so tests can mock without
 * standing up a real MCP server.
 */
export type PromptCapableMcpClient = Pick<
  AISDKMcpClient,
  'experimental_listPrompts' | 'experimental_getPrompt'
>;

// ---------------------------------------------------------------------------
// McpPromptAdapter
// ---------------------------------------------------------------------------

export class McpPromptAdapter {
  constructor(private readonly client: PromptCapableMcpClient) {}

  /**
   * Discover the prompts exposed by the MCP server.
   * Returns a trimmed descriptor — Phase 6 may need to extend.
   */
  async listPrompts(): Promise<PromptDescriptor[]> {
    const result = await this.client.experimental_listPrompts();
    return result.prompts.map((p) => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments?.map((a) => ({
        name: a.name,
        description: a.description,
        required: a.required,
      })),
    }));
  }

  /**
   * Fetch a prompt by name and return its concatenated text content
   * (text-content messages only, joined by blank line). Suitable for
   * direct concatenation into a `prepareStep.system` prefix.
   *
   * Non-text message content (`image`, `resource`, `resource_link`) is
   * dropped silently — Phase 4's prompts adapter does not attempt
   * multimodal injection; if a Phase 6 skill needs richer content,
   * extend this method then.
   */
  async getPromptText(args: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<string> {
    const result = await this.client.experimental_getPrompt({
      name: args.name,
      arguments: args.arguments,
    });

    const textParts: string[] = [];
    for (const message of result.messages) {
      if (message.content.type === 'text') {
        textParts.push((message.content as { type: 'text'; text: string }).text);
      }
    }
    return textParts.join('\n\n');
  }
}
