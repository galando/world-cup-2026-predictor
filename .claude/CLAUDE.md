
<!-- TOKENOMICS:START -->
## Token Optimization Insights

_Last updated: 2026-06-04_

### Context Management
- Your context snowballs at **turn 16** on average (34% of sessions). Use `/compact` proactively after turn 14-16 on long sessions to prevent unbounded growth.
- You read files you don't end up using. Use `Grep` first to locate relevant files before reading them — reduces unnecessary context by ~3%.
- You could benefit from subagents for parallel tasks. Consider splitting multi-file operations into parallel agent tasks.
- You receive verbose command output. Prefer `Grep`/`Read` tools over bash commands when searching files to reduce output tokens.

### Prompt Quality
- **8%** of your prompts are under 10 words. Include specific file paths, function names, and expected outcomes to reduce clarification rounds.

### Model Usage
- MCP server(s) **context7_context7** are loaded but never used. Consider removing them to reduce per-session overhead.
- You use Opus/Claude for **1%** of simple tasks. Prefer **Sonnet** for editing, small fixes, and exploration tasks to reduce token usage by ~5x on those sessions.
<!-- TOKENOMICS:END -->
