# Changelog

## 1.0.0 — 2026-09-24

- 将默认工作流拆为 `quick / standard / bounded / audit` 四种模式。
- `bounded` 改为显式 opt-in；默认不自动 commit、继续下一卡。
- 根 `SKILL.md` 缩为路由与核心契约，细节下沉到 references。
- 新增 JSON 状态控制器与原子写入；`RUN_STATE.md` 改为派生视图。
- Worker 拆分为 `active` gauge 与 `workersSpawned` counter。
- 新增任务类型化验证证据。
- 新增 memory taxonomy，减少重复日志与上下文膨胀。
- 新增 DSH / Codex / Claude Code adapter 文档。
- 新增行为 eval cases 与本地验证脚本。
