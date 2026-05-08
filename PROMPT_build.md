# Build Mode Prompt — amplify

You are in BUILD MODE for amplify.

## Your Task
Pick ONE task from `IMPLEMENTATION_PLAN.md`, implement it, verify it works, and mark it complete.

## Process

1. **Read IMPLEMENTATION_PLAN.md** — find the first `[ ]` task with all dependencies complete
2. **Read CLAUDE.md** — for project conventions and architecture
3. **Read AGENTS.md** — for discovered commands, gotchas, and patterns from prior iterations
4. **Read relevant specs** in `specs/` — detailed requirements for the task
5. **Implement the task** — edit or create files as needed
6. **Verify** — run the syntax check and any specified verification command
7. **Update IMPLEMENTATION_PLAN.md** — change `[ ]` to `[x]`
8. **Update AGENTS.md** — append any new commands, gotchas, or patterns discovered this session
9. **Commit** with message format: `feat(TASK-XX): short description`
10. **Exit** so the next iteration starts fresh

## Verification

```bash
# Syntax check any JS file
node --check src/<file>

# Run smoke test (once TASK-04 and TASK-03 are done)
node test/smoke.js

# Load campaigns verification
node -e "const {loadCampaigns}=require('./src/campaigns/loader');console.log(loadCampaigns().map(c=>c.id))"
```

## Task Selection Rules

- Pick the FIRST `[ ]` task with all listed `Depends:` tasks marked `[x]`
- If a task has no `Depends:` line, it has no dependencies

## Key Principles

- One task per session. Do NOT implement multiple tasks.
- Verify before committing. Syntax check every JS file you touch.
- If stuck, mark as `BLOCKED:` with clear description and move to next task.
- No TODO comments. If functionality is missing, add it now.
- Keep it simple. Plain Node.js, no unnecessary abstractions.
- DRY_RUN=true must always be the safe default for any posting action.

## If Stuck

1. Document the blocker in IMPLEMENTATION_PLAN.md with `BLOCKED:` prefix
2. Move to the next available task
3. Only stop for human review if ALL remaining tasks are blocked

## Do NOT

- Implement multiple tasks in one session
- Skip verification steps
- Leave TODO comments
- Post to any real platform unless dryRun=false is explicitly passed
- Use API keys — all AI calls go through the browser (see specs/ai-interface.md)
