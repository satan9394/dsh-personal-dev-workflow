# Codex Adapter

在 Codex 中把本 Skill 当**项目工作方法**，而不是额外的无限循环 Prompt。

- 项目稳定规则放 AGENTS.md；本 Skill 只提供流程。
- `standard` 默认一张卡一交付，不自动无限续跑。
- 长任务需要连续自治时才启用 `bounded`，并让状态文件成为恢复入口。
- 使用新线程/上下文继续时，先读 Task Card、Git 与 bounded state，而不是复制整段旧聊天。
- 可让独立 Codex run 做 review，但仅在风险/规模值得时使用。

若 Codex 宿主本身没有 pre-tool hook，`runstate.js` 只能作为协作式 controller，不能声称提供 hard enforcement。
