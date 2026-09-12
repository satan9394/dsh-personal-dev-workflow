# DEV RUN STATE

## Mission
加固 runstate 的预算守卫并补最小自动化测试：非法预算行必须报错（不得静默跳过），核心行为固化为可重复的测试脚本。

## Definition of Done
- [x] `check` / `advance` 遇格式非法的预算行必须非零退出并指出该行
- [x] 新增 `tests/run-tests.mjs`（零依赖、一条命令跑完），覆盖 init / advance 正常 / 越界拒绝+原子性 / 非法行报错 / --help
- [x] `node tests/run-tests.mjs` 全绿退出 0；任一断言失败非零退出（已用 `RS_TEST_FORCE_FAIL=1` 实测失败路径）
- [x] 既有行为不回归（`--help` 0、`init` 0、合法 `check` 0、正常 `advance` 0）
- [x] `README.md` 的「已知限制」更新（非法行已改为报错）

## Out of scope
- 不改 CLI 架构与子命令集合；不引入依赖；不新增 `--dry-run`（留在 backlog）

## Mode
development

## Active Workset
- [x] T004 — 来源: planned（采纳自 audit backlog）— 非法预算行必须报错（已合入）
- [x] T005 — 来源: planned（采纳自 audit backlog）— 最小自动化测试脚本（已合入）

## Blocked
- （空）

## Deferred Backlog（是记忆，不是队列）
- （audit）0904 工作区 `.dsh/skills/personal-dev-workflow` 仍是旧版 v0.3，与 canonical v0.4.0 不一致
- （audit）`advance` 无 `--dry-run`
- （blocker）卡面验收写死现场绝对值而非相对规则（已在 Run #1 踩到、已写进 AGENTS.md 作为"别这样做"）
- （audit）缺冒号的笔误（如 `- 完成卡数 3 / 2`）不算计数行 → `check` 仍放行
- （audit）`Worker 数: 2（上限 3）` 中的"上限 3"只是备注、非硬上限，写法有歧义
- （audit）测试仅黑盒冒烟，无单元测试与覆盖率
- （audit）**运行结束后静止的状态文件会自检失败**（本文件 `check .` → exit 1「预算已达上限: Epoch 1/1，完成卡数 2/2」）——语义上正确（无剩余预算，新 run 必须先重新给预算），但 README 未说明，容易被误认为文件损坏；建议下一轮补一句说明
- （rule）测试脚本清理自建临时目录用 `fs.rmSync`（Node 零依赖无回收站 API），与"删除进回收站"铁律有张力 —— 待用户裁决
- （已在 Run #3 采纳并完成 → T004 / T005）非法行静默容忍、无自动化测试

## Budget
- Epoch: 1 / 1　← 上限
- 完成卡数: 2 / 2　← 达上限（与 DoD 达成同时发生）
- 已用 Repair: 0 / 1
- 已派子代理: 5（累计，Run #1 两个 + Run #2 一个 + Run #3 两个）
- WorkSet 规模: 2 / 8（已用 2）
- Worker 数: 2（上限 3）

## Last verified commit
非 git 项目。Run #3 结束验证（指挥侧独立复验）：`node --check` 0；测试 **9/9 全绿 exit 0**；失败注入 **8/9 exit 1**；`runstate.js` = BFEBA4C0…；`AGENTS.md` = A6F34365…；根状态文件 = 49EB5359…

## Resume From
（无 —— Mission 完成）

## Notes for the next run
- **Run #3（2026-09-12）以停止条件第 1 条（DoD 达成）收尾**；预算同时用尽（2/2）。停机 ≠ 失败。
- 三轮合计：**5 张卡全部合入**，每张都经指挥侧独立复验；**零人工逐卡签核**（无例外触发）。
- 下一轮若继续：读本文件 → 从 `Deferred Backlog` 按相关性开**新 Mission**（不要在本轮内续跑）。
- 已知需你裁决一条：测试脚本用 `fs.rmSync` 清理自建临时目录（见 backlog 的 rule 条）。
- 运行历史归档：`docs/run-002-summary.md`、`docs/run-003-summary.md`。
