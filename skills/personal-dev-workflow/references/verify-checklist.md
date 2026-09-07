# Verification Checklist (run after each task card)

## Completion decision (objective gates, not "the agent feels done")
- [ ] Acceptance criteria verified one by one with executable evidence (commands / tests / screenshots), not verbal confirmation

## Baseline (every card)
- [ ] Syntax / type check passes (e.g., `node --check` / `tsc`)
- [ ] Related tests pass (`npm test` / `pytest` / whatever the stack uses)
- [ ] Build / bundle passes (e.g., `npm run build`)

## Review five things (default suspicion: assume the code is broken until proven to run)
- [ ] Out-of-scope changes (did it touch anything the card's constraints forbade?)
- [ ] Wrong files (did it modify the wrong file / module?)
- [ ] Interface compatibility (is any external interface broken?)
- [ ] Error handling (are error paths / edge cases handled?)
- [ ] Maintainability (naming / structure / comments acceptable?)

## Functional verification
- [ ] Core flow checked against each acceptance criterion
- [ ] Edge cases (empty / abnormal / large input) don't crash

## Adversarial review (large changes: dispatch a reviewer subagent)
- [ ] Reviewer gets a fresh context and sees only the diff and the acceptance criteria
- [ ] It looks for: missed branches, inconsistencies, security issues, performance problems

## UI verification (if frontend is involved)
- [ ] Browser screenshot checked for layout (no overflow / overlap)
- [ ] Responsive (desktop / tablet / mobile)

## Circuit breaker
- [ ] No problem survived more than 3 fix attempts (if it did: stop, clear the context, re-dispatch or switch executors)

## Wrap-up
- [ ] Lessons / pitfalls written into AGENTS.md ("don't do this")
- [ ] Decisions written into docs/
- [ ] Card status updated; user has accepted
