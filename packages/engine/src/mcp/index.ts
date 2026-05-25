// ---------------------------------------------------------------------------
// MCP server-side adapter helpers
// ---------------------------------------------------------------------------
//
// [P4.1 / v3.0.0 / 2026-05-25] `buildMcpTools` + `registerEngineTools`
// + `McpToolDescriptor` removed. They were a documented public API for
// hosts wanting to expose engine tools through an MCP server, but had
// zero live consumers (audric/CLI/MCP all wrap their own tools directly).
// The legacy code threaded `Tool[]` + `Tool.call(input, ctx)` which
// no longer exists post-Phase C native migration.
//
// Hosts that want to wrap engine tools as MCP tools today have two
// patterns available:
//
//   1. Bring in the AI SDK `tool()` directly — every engine read tool
//      is already a native AI SDK Tool, so MCP server adapters that
//      consume AI SDK tools work without translation.
//
//   2. Use `@t2000/mcp` — the canonical MCP server for the t2000
//      tool surface. It wraps the SDK directly (not the engine) and
//      exposes the same operations with its own server-side schema.
// ---------------------------------------------------------------------------

export {};
