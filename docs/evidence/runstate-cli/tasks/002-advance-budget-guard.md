# 002 advance + 预算守卫

- 状态：已合入（待执行 / 执行中 / 阻塞 / 已合入）
- 优先级：P1
- 创建日期：2026-09-12
- Mission：交付零依赖 CLI runstate（创建/校验/推进 RUN_STATE.md 并强制预算）
- 来源：planned

## 目标
实现 `advance <dir> <field>`：把 `RUN_STATE.md` 的 Budget 计数器加一（支持 epoch / cards / repairs / subagents），并在**达到上限时拒绝递增**（非零退出），从而让"预算耗尽即停止"成为机械约束。

## 限制条件 / 禁止事项
- 零依赖；只允许修改 `runstate.js`（不得改动已有的 `tasks/` 与 `RUN_STATE.md` 内容结构）
- 上限解析必须来自 RUN_STATE.md 的 `x / y` 形式；字段名非法必须非零退出
- 已达上限时不得写文件（原子性：要么加一并落盘，要么拒绝且不动文件）

## 验收标准（客观门禁）
- [ ] `node --check runstate.js` 通过
- [ ] `node runstate.js advance <dir> cards` 使 `完成卡数` 从 0 → 1，退出码 0
- [ ] 再次 advance 到上限（2/2）后，第三次 advance 退出码非 0 且文件不变
- [ ] `node runstate.js advance <dir> bogus` 退出码非 0 并提示可用字段
- [ ] `node runstate.js check <dir>` 在超预算/达上限时退出码非 0

## 涉及文件
- `runstate.js`（修改）

## 依赖
- 依赖任务卡：tasks/001-cli-skeleton-init-check.md

## 预期证据（执行器回填）
- [x] 改动摘要
- [x] advance 前后文件片段 + 退出码

## 验收结论（Evaluator / 指挥会话回填）
- **PASS** → 自动合入（无需人工签核）
- 指挥侧独立复验：`node --check` 0；`advance cards` 0→1/2 exit 0；1→2/2 exit 0；第三次越界 **exit 1 且文件哈希前后一致（原子性成立）**；`advance bogus` exit 2 并列出可用字段；`check` 达上限 exit 1 并点名 `完成卡数 2 / 2`
- 受限文件核对：`AGENTS.md` / `tasks/` / 项目根 `RUN_STATE.md` 未被改动（执行器前后哈希一致），未创建 `package.json`
- 偏差处理：卡面写死的期望上限（1/2、1/1）取自项目预算，而 `init` 模板默认值是技能默认（0/3、0/6）——**模板不改**（与 v0.4.0 默认预算一致），已把"验收标准应写相对规则而非现场绝对值"记入 Deferred Backlog
- 执行器：子代理 21497f3b
