# 001 CLI 骨架 + init / check

- 状态：已合入（待执行 / 执行中 / 阻塞 / 已合入）
- 优先级：P1
- 创建日期：2026-09-12
- Mission：交付零依赖 CLI runstate（创建/校验/推进 RUN_STATE.md 并强制预算）
- 来源：planned

## 目标
新建 `runstate.js`：子命令分派骨架 + `init <dir>`（生成 RUN_STATE.md 骨架）+ `check <dir>`（校验必填节并汇总预算），并支持 `--help`。

## 限制条件 / 禁止事项
- 零依赖：只用 `node:fs` / `node:path` / `process.argv`
- 只允许创建或修改 `runstate.js` 与由 init 生成的 `RUN_STATE.md`
- 不得改动 `tasks/` 下已有卡；不得引入 npm 包
- 失败必须非零退出并打印原因（不静默通过）

## 验收标准（客观门禁）
- [ ] `node --check runstate.js` 通过
- [ ] `node runstate.js --help` 列出 init / check / advance，退出码 0
- [ ] `node runstate.js init <dir>` 生成 `RUN_STATE.md`，含 Mission / Definition of Done / Active Workset / Budget / Resume From 节
- [ ] `node runstate.js check <dir>` 对合法文件退出 0 并打印预算汇总；对缺节的目录非零退出

## 涉及文件
- `runstate.js`（新建）
- `RUN_STATE.md`（由 init 生成）

## 依赖
- 无

## 预期证据（执行器回填）
- [x] 改动摘要
- [x] 新文件要点 / diff
- [x] 上述命令的实际输出

## 验收结论（Evaluator / 指挥会话回填）
- **PASS** → 自动合入（命令门禁全过，无需人工签核）
- 指挥侧独立验证：`node --check` 0；`--help` 列出 init/check/advance 0；`init` 生成 11 节 0；`check` 合法 0；`check` 空目录 1（非零）
- 受限文件核对：`RUN_STATE.md` 哈希与执行器报告一致（D56F2B91…），无 `package.json`，`tasks/` 仍 3 张
- 执行器：子代理 eb5037e1；退出码约定 0/1/2 已写入 `--help`，供卡 002/003 沿用
