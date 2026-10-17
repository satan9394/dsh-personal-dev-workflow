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

## Circuit breaker & repair budget
- [ ] Inside the card: the executor did not retry the same problem more than 3 times (then it stopped and reported)
- [ ] Conductor-side: at most 1 repair re-dispatch for this card; a second FAIL → `BLOCKED`

## Budget & stop state
- [ ] `RUN_STATE.md` counters updated (epochs, cards completed, repairs, subagents)
- [ ] If a budget is exhausted or the Mission is blocked: `RUN_STATE.md` written and the run stopped (stopping is a normal outcome, not a failure)

## Wrap-up
- [ ] Lessons / pitfalls written into AGENTS.md ("don't do this")
- [ ] Decisions written into docs/
- [ ] Card status updated; objective gates pass → auto-accepted (no per-card human sign-off)
- [ ] Escalated to the human only via a listed exception (semantics / irreversible / blocked / budget)
