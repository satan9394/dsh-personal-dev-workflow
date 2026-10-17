# 004 非法预算行必须报错

- 状态：已合入（待执行 / 执行中 / 阻塞 / 已合入）
- 优先级：P1
- 创建日期：2026-09-12
- Mission：加固 runstate 的预算守卫并补最小自动化测试
- 来源：planned（**采纳自 Deferred Backlog**：审计探针实测非法行被静默跳过）

## 目标
让 `check` 与 `advance` 遇到格式非法的预算行（如 `- 完成卡数: abc / 2`）时**报错**——非零退出并在 stderr 指出该行；合法行行为保持不变。

## 限制条件 / 禁止事项
- 只允许修改 `runstate.js`；不得改 `README.md`（留给 T005 统一更新）、`AGENTS.md`、`tasks/`、项目根 `RUN_STATE.md`
- 零依赖；不新增子命令、不改整体架构
- 原子性保持：任何拒绝路径**不得写文件**
- 测试一律在系统临时目录进行，不污染项目根

## 验收标准（客观门禁）
- [ ] `node --check runstate.js` 通过
- [ ] 构造含 `- 完成卡数: abc / 2` 的骨架 → `check` 非零退出，stderr 指出该行（含行号或原行内容）
- [ ] 同一文件执行 `advance cards` 非零退出，且文件哈希与执行前一致
- [ ] 回归：`--help` 0；`init` 0；合法骨架 `check` 0；正常 `advance` 0；越界 `advance` 1 且哈希不变
- [ ] 无上限行（`- 已派子代理: 0`）仍可正常 advance

## 涉及文件
- `runstate.js`

## 依赖
- 无（基于 T001–T003 产物）

## 预期证据（执行器回填）
- [x] 改动摘要
- [x] 非法行 probe 的 stderr 输出、退出码、哈希对照

## 验收结论（Evaluator / 指挥会话回填）
- **PASS** → 自动合入（无需人工签核）
- 指挥侧独立复验：
  - `node --check` 0；`runstate.js` 哈希 = BFEBA4C0…（与执行器报告一致，仅此文件被改）
  - 当前值非法 `abc / 2` → `check` exit 1 并报「Budget 第 26 行格式非法: "- 完成卡数: abc / 2"」；`advance cards` exit 1 且**哈希前后一致**
  - 上限非法 `1 / xyz` → `check` exit 1
  - Budget 节内散文行 `- 备注: 见文档` → exit 1（证实"有意收紧"属实）
  - 无上限行 `已派子代理` 仍可 advance（exit 0）；合法骨架 `check` exit 0
  - **真实状态文件回归**：本仓 `RUN_STATE.md`（含长备注与 `Worker 数: 2（上限 3）`）→ exit 0，6 条计数行全解析
- 受限文件核对：`README.md`(347AC398…) / `AGENTS.md`(A6F34365…) / 根 `RUN_STATE.md`(0EE82CBA…) / `tasks/` 均未改
- 附带收益：执行器发现旧解析器比卡面描述更严重——`1 / xyz` 时上限被静默丢弃、会写成 `2 / xyz`（守卫彻底消失），现已改为拒绝
- 执行器：子代理 5466f071
