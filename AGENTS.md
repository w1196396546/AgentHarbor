# Coding notes

This independent project, anywhereToAgent, is the public relay, web UI and server administration for agentTools.
The desktop client, agent registry and execution adapters live in agentTools/internal/remoteclient. Codex is the current adapter. Never run an agent,
read a desktop Codex home, or configure model credentials and project roots on this server.
Read docs/architecture.md before changing runtime or authorization contracts.
Clients issue pairing codes and browser grants; the relay cannot approve its own client access.
Preserve Host/Origin validation, client-side grant validation, streaming and revocation.
Test changed behavior with isolated configuration and local fake clients. No secret values in
source, logs, fixtures or deployment examples. Never overwrite unrelated runtime state.

The Go module is `anywheretoagent`, with `cmd/anywhereToAgent` as the executable.
`internal/relay` owns routing, pairing, private state and administration;
`internal/transport/tunnel` carries opaque bounded HTTP streams. Agent discovery
and selection belong inside the encrypted client API, never in public device metadata.
Keep legacy cookie names and request-header aliases compatible, and preserve existing
`codex-remote` data directories when upgrading an installation.
