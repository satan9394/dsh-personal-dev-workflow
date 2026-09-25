# Claude Code Adapter

- 项目长期规则放 CLAUDE.md/AGENTS.md（按实际项目约定），保持短、稳定、犯错驱动。
- Hooks 适合放确定性政策/安全边界；Skill 适合放按需工作方法，两者不要混成一个巨型 Prompt。
- `standard` 不自动续卡；需要长时自治时显式进入 `bounded`。
- 大改动可让独立 Claude 会话/子代理只看任务卡、diff、测试证据做 evaluator。
- 若使用 hooks 做 budget enforcement，让 hook 调用同一个 `runstate.js` contract，避免 Skill 规则与 host 规则各写一套数字。
