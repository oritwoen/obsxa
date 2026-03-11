---
name: ai-skilld
description: 'ALWAYS use when writing code importing "ai". Consult for debugging, best practices, or modifying ai.'
metadata:
  version: 6.0.116
  generated_by: Codex · GPT-5.3 Codex
  generated_at: 2026-03-11
---

# vercel/ai `ai`

**Version:** 6.0.116 (Mar 2026)
**Deps:** @opentelemetry/api@1.9.0, @ai-sdk/gateway@3.0.66, @ai-sdk/provider@3.0.8, @ai-sdk/provider-utils@4.0.19
**Tags:** canary: 5.0.0-canary.24 (May 2025), alpha: 5.0.0-alpha.15 (Jun 2025), latest: 6.0.116 (Mar 2026), snapshot: 7.0.0-beta.1-gr2m-test (Mar 2026), beta: 7.0.0-beta.14 (Mar 2026), ai-v6: 6.0.126 (Mar 2026), ai-v5: 5.0.153 (Mar 2026)

**References:** [package.json](./.skilld/pkg/package.json) — exports, entry points • [README](./.skilld/pkg/README.md) — setup, basic usage • [Docs](./.skilld/docs/_INDEX.md) — API reference, guides • [GitHub Issues](./.skilld/issues/_INDEX.md) — bugs, workarounds, edge cases • [GitHub Discussions](./.skilld/discussions/_INDEX.md) — Q&A, patterns, recipes • [Releases](./.skilld/releases/_INDEX.md) — changelog, breaking changes, new APIs

## Search

Use `skilld search` instead of grepping `.skilld/` directories — hybrid semantic + keyword search across all indexed docs, issues, and releases. If `skilld` is unavailable, use `npx -y skilld search`.

```bash
skilld search "query" -p ai
skilld search "issues:error handling" -p ai
skilld search "releases:deprecated" -p ai
```

Filters: `docs:`, `issues:`, `releases:` prefix narrows by source type.

<!-- skilld:api-changes -->

## API Changes

- BREAKING: `downloadBlob()` and `download()` now validate URLs and reject private/internal IP ranges, localhost, and non-HTTP protocols before fetching, which can change runtime behavior for previously permissive codepaths [source](./.skilld/pkg/CHANGELOG.md:L7)
- NEW: `createDownload({ maxBytes })` was added, and `transcribe()` / `experimental_generateVideo()` now accept a `download` hook. This enables custom download handling (with defaults including a 2 GiB cap for URL-derived media) [source](./.skilld/pkg/CHANGELOG.md:L229-L231)
- DEPRECATED: `chat.addToolResult()` is replaced by `chat.addToolOutput()` [source](./.skilld/pkg/CHANGELOG.md:L874)
- BREAKING: Provider access to text embeddings changed from `model.textEmbeddingModel(modelId)` to `model.embeddingModel(modelId)` [source](./.skilld/pkg/CHANGELOG.md:L858-L872)
- BREAKING: `ToolCallOptions` was renamed to `ToolExecutionOptions` in tool execution settings [source](./.skilld/pkg/CHANGELOG.md:L940)
- BREAKING: `createAgentStreamResponse()` was renamed to `createAgentUIStreamResponse()` [source](./.skilld/pkg/CHANGELOG.md:L967)
- BREAKING: `ToolLoopAgentOnFinishCallback` now requires `experimental_context` (matching newer stream callback signatures) [source](./.skilld/pkg/CHANGELOG.md:L275-L277)
- BREAKING: `BasicAgent` was replaced by `ToolLoopAgent` (agent API move) [source](./.skilld/pkg/CHANGELOG.md:L990)
- BREAKING: `system` was renamed to `instructions` in agent settings [source](./.skilld/pkg/CHANGELOG.md:L983)
- DEPRECATED: `experimental_createMCPClient` imports moved from `ai` to `@ai-sdk/mcp` (including `Experimental_StdioMCPTransport`) [source](./.skilld/pkg/CHANGELOG.md:L887-L894)

Also changed: `Agent` renamed to `BasicAgent` and dedicated `Agent` interface introduced (v6 migration) [source](./.skilld/pkg/CHANGELOG.md:L995) · `relevanceScore` renamed to `score` (reranking output) [source](./.skilld/pkg/CHANGELOG.md:L971) · `Output.array()` and `Output.choice()` added to `Output` helper API [source](./.skilld/pkg/CHANGELOG.md:L943-L944) · `streamText` gained `elementStream` for `Output.array()` outputs [source](./.skilld/pkg/CHANGELOG.md:L659)

<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->

## Best Practices

- Configure shared model/tool defaults through `defaultSettingsMiddleware` and keep per-call settings explicit in each request so defaults are centralized but overrideable where needed, instead of duplicating base configs in every model call. [source](./.skilld/pkg/docs/07-reference/01-ai-sdk-core/68-default-settings-middleware.mdx:L41-L43)
- Add `addToolInputExamplesMiddleware` when targeting providers without native `inputExamples`, because it appends concise examples into the tool description and avoids provider-specific schema incompatibilities. [source](./.skilld/pkg/docs/07-reference/01-ai-sdk-core/69-add-tool-input-examples-middleware.mdx:L61-L65)
- Use `stepCountIs` with a helper like `hasToolCall` when defining stop conditions, because the step counter includes assistant and tool steps and must reflect actual control-flow, not just final reply count. [source](./.skilld/pkg/docs/07-reference/01-ai-sdk-core/70-step-count-is.mdx:L67-L77)
- In `ToolLoopAgent`, set an explicit `stopWhen` strategy rather than relying on defaults alone, and keep the default loop cap in mind (it is finite) when orchestrating long tool-use workflows. [source](./.skilld/pkg/docs/03-agents/04-loop-control.mdx:L19-L22)
- Use `prepareStep` to mutate model, tools, and message history per iteration in agent loops; this is the intended extension point for adaptive routing (for example, switching model/tooling after earlier tool calls). [source](./.skilld/pkg/docs/03-agents/04-loop-control.mdx:L162-L168)
- Combine `callOptionsSchema` with `prepareCall` for runtime-aware options, and keep provider option typing in one validated place instead of scattering ad-hoc params across calls. [source](./.skilld/pkg/docs/03-agents/05-configuring-call-options.mdx:L25-L27)
- When call options must be fetched or transformed asynchronously per invocation, use the async `prepareCall` hook and return the finalized payload from it rather than mutating shared call config. [source](./.skilld/pkg/docs/03-agents/05-configuring-call-options.mdx:L197-L206)
- For resumable chatbot streams, wire `resume` with `prepareSendMessagesRequest` and continue reading through `consumeSseStream` with `activeStreamId`; avoid abort-based flow control on resumptions. [source](./.skilld/pkg/docs/04-ai-sdk-ui/03-chatbot-resume-streams.mdx:L123-L147)
- Persist and replay UI messages only through `validateUIMessages` before conversion/sending to keep stored payloads schema-safe, especially when mixing legacy and new message shapes. [source](./.skilld/pkg/docs/04-ai-sdk-ui/03-chatbot-message-persistence.mdx:L120-L125)
- For `download`, `downloadBlob`, `transcribe`, and video generation paths, use new defaults and constraints (`download` URL hardening plus `createDownload` size caps) to avoid unbounded resource/SSRF exposure instead of passing through raw user-controlled links. [source](./.skilld/pkg/CHANGELOG.md:L3-L10), [source](./.skilld/pkg/CHANGELOG.md:L227-L232)
<!-- /skilld:best-practices -->
