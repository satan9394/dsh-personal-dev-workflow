# 003 README + 冒烟

- 状态：已合入（待执行 / 执行中 / 阻塞 / 已合入）
- 优先级：P2
- 创建日期：2026-09-12
- Mission：交付零依赖 CLI runstate（创建/校验/推进 RUN_STATE.md 并强制预算）
- 来源：planned

## 目标
写 `README.md`（用法与四个子命令），并做端到端冒烟：init → check → advance ×2 → advance 越界（应拒绝）→ check。

## 限制条件 / 禁止事项
- 只允许新增 `README.md`；不得改动 `runstate.js` 逻辑（本轮不再扩大范围）
- 冒烟必须在临时目录进行，不得污染项目根的 `RUN_STATE.md`

## 验收标准（客观门禁）
- [ ] `README.md` 列出 init / check / advance / --help 的用法与退出码约定
- [ ] 冒烟脚本输出覆盖正常路径与越界拒绝路径，且越界那步退出码非 0
- [ ] 项目根 `RUN_STATE.md` 未被冒烟改动

## 涉及文件
- `README.md`（新建）

## 依赖
- 依赖任务卡：tasks/002-advance-budget-guard.md

## 预期证据（执行器回填）
- [x] 改动摘要
- [x] 冒烟输出

## 验收结论（Evaluator / 指挥会话回填）
- **PASS** → 自动合入（无需人工签核）
- 指挥侧独立复验：`README.md` 5274B，覆盖 `--help` / `init` / `check` / `advance` 四入口与退出码 0/1/2 约定；`node --check` 0；临时目录冒烟 advance×2 exit 0 → 第三次 exit 1 且**哈希前后一致**；`check` 达上限 exit 1
- 受限文件核对：`runstate.js`(419CF0E8…) / `RUN_STATE.md`(CD4D757B…) / `AGENTS.md`(A6F34365…) 哈希均未变；`tasks/` 未改
- 附带收益：README「已知限制」如实记录了"非法预算行静默跳过"这一风险，成为下一轮 Mission 的输入
- 执行器：子代理 9f14525c
