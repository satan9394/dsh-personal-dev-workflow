# 005 最小自动化测试脚本

- 状态：已合入（待执行 / 执行中 / 阻塞 / 已合入）
- 优先级：P1
- 创建日期：2026-09-12
- Mission：加固 runstate 的预算守卫并补最小自动化测试
- 来源：planned（**采纳自 Deferred Backlog**：门禁此前全靠人工命令复验）

## 目标
新增 `tests/run-tests.mjs`（零依赖）：一条命令跑完全部核心行为断言，逐条打印结果，全绿退出 0、任一失败非零退出；并把 `README.md` 的「已知限制」更新为"非法行已改为报错"。

## 限制条件 / 禁止事项
- 只允许新增 `tests/run-tests.mjs` 与更新 `README.md`；**不得修改** `runstate.js`、`AGENTS.md`、`tasks/`、项目根 `RUN_STATE.md`
- 测试必须在系统临时目录运行（不污染项目根）
- 零依赖（只用 `node:` 内置模块；可用 `child_process` 调本仓 CLI）

## 验收标准（客观门禁）
- [ ] `node --check tests/run-tests.mjs` 通过
- [ ] `node tests/run-tests.mjs` 覆盖：init 生成 11 节；advance 正常 0；越界拒绝 exit 1 且**文件哈希一致**；非法行报错 exit≠0；`--help` 0
- [ ] 全部用例通过时退出 0，并打印用例计数
- [ ] **失败路径实测**：人为制造一处失败（如临时改坏断言）时脚本退出非 0，并贴出该次输出
- [ ] `README.md`「已知限制」不再声称"非法行静默跳过"

## 涉及文件
- `tests/run-tests.mjs`（新建）
- `README.md`（更新已知限制一节）

## 依赖
- 依赖任务卡：tasks/004-invalid-budget-line-error.md

## 预期证据（执行器回填）
- [x] 改动摘要
- [x] 一次全绿输出 + 一次人为失败的输出与退出码

## 验收结论（Evaluator / 指挥会话回填）
- **PASS** → 自动合入（无需人工签核）
- 指挥侧独立复验：`node --check tests/run-tests.mjs` 0；`node tests/run-tests.mjs` **9/9 全绿 exit 0**；`RS_TEST_FORCE_FAIL=1` 注入后 **8/9、exit 1**（失败路径真实有效）
- `README.md` 已知限制已改口径（L105：「非法计数行会报错并指出行号（T004 起；此前是静默跳过）」）
- 哈希核对：`runstate.js` BFEBA4C0… / `AGENTS.md` A6F34365… / 根 `RUN_STATE.md` 49EB5359… 均未变；`README.md` 51C89970…（已更新）；`tests/run-tests.mjs` 7D635276…（新增）
- 临时目录残留数 = 0
- 记录两点偏差（均已接受）：① 测试脚本清理自建临时目录用 `fs.rmSync`（Node 零依赖无回收站 API），作用域限自建 `runstate-tests-*` 且双重前缀守卫 —— 与"删除进回收站"铁律存在张力，留待用户裁决；② README 额外如实补了"缺冒号笔误仍在 backlog""仅有黑盒冒烟、无覆盖率"两条限制
- 执行器：子代理 37d1ff94
