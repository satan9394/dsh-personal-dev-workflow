# 核心开发闭环

## 0. 模式确认

先判断 `quick / standard / bounded / audit`。没有明确授权时，不推断为 bounded。

## 1. 收敛范围

先回答四个问题：

- 要交付什么结果？
- 什么明确不做？
- 哪些约束不能破坏？
- 什么证据能证明完成？

只有需求含多个行为、跨模块或存在重要未知时才写 `assets/spec.md`。陌生代码库先做聚焦探索：入口、调用链、测试、接口、配置；找到足够证据后停止探索，不无限“再看看”。

## 2. 建卡

任务卡是**执行契约**，不是项目管理仪式。满足任一条件才建议建卡：

- 可以独立验收；
- 需要跨会话继续；
- 需要交给另一个 Worker；
- 失败时需要单独回滚/阻塞。

卡必须含：Mission、目标、Not Doing/限制、验收标准、影响面、预期证据。

## 3. 执行

默认单 Agent。派 Worker 需要满足至少一个条件：

- 子任务可独立，不会同时修改同一核心文件；
- 需要并行以缩短墙钟时间；
- 需要独立 evaluator/安全审查；
- 主 Agent 的上下文会因该子任务显著膨胀。

不要为了“像多 Agent 系统”而拆 Worker。

执行中发现问题：

- 阻塞当前卡/Mission：标记 `blocker`，在范围内处理；
- 不阻塞：写入 Deferred Backlog，不顺势扩张 Mission。

## 4. 验证

验证必须来自可复现证据，而不是执行者自评。

- 小改：允许执行者先自测；
- 中高风险/跨模块：优先独立 evaluator；
- 主观质量：使用明确 rubric；
- 可执行软件：优先 tests/build/runtime evidence。

按 `verification.md` 选择 evidence profile。

一次修复后仍无法通过关键门禁：`BLOCKED`，停止机械重试。

## 5. 记录与交接

只保存下一轮真正需要的状态：

- Task Card：任务语义与验收；
- Git diff/commit：代码事实；
- `.agent-state/run-state.json`：bounded 运行状态；
- ADR/docs：长期设计决定；
- AGENTS.md：跨任务稳定规则/真实教训；
- CHANGELOG：对用户可见的交付变化。

不要把同一个事实复制到三四个文件。详见 `memory-policy.md`。

## 6. 停或继续

- `quick`：完成并交证后结束。
- `standard`：当前卡完成/阻塞后结束，给出下一卡建议，但不自动开工。
- `bounded`：`gate` 通过、Mission 未完成、无升级条件时自动继续下一卡；Run 耗尽则 checkpoint + `new-run`；Mission 耗尽则停并交给人。
- `audit`：报告发现后结束，绝不从 Finding 自动跳到 Code。
