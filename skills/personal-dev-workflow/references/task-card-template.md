# Task Card Template (copy to tasks/NNN-name.md)

```markdown
# [Task title]

- Status: todo (todo / in_progress / in_review / merged / rejected)
- Priority: P0/P1/P2
- Created: YYYY-MM-DD
- Related cards: (optional)

## Goal
(One sentence: what this card delivers)

## Constraints / Do-nots (REQUIRED, most important)
- (What must NOT be changed: files / modules / interfaces / conventions)
- (External side effects are not authorized by default: send / publish / delete)

## Acceptance criteria (objective gates, executable)
- [ ] (Executable, verifiable criterion 1)
- [ ] (Criterion 2, e.g., `npm test` passes)
- [ ] (Criterion 3, e.g., screenshot shows no overflow)

## Files involved (incl. blast radius: callers / tests / interfaces / config entry points)
- `src/...`
- `docs/...`

## Dependencies
- Depends on: tasks/NNN-name.md
- Blocked by: —

## Expected evidence (filled by the executor)
- [ ] Change summary (what & why — if it can't explain what changed, don't trust the code)
- [ ] Diff provided
- [ ] Test results provided
- [ ] Screenshots / demo provided

## Acceptance decision (filled by the conductor)
- [ ] merge / rework / redirect
- Notes:
```
