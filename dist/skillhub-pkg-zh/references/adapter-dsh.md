# DSH Adapter

本 Skill 的通用层不把 Markdown 纪律冒充“硬拦截”。如果在 DeepSeek Harness 中需要真正 hard gate，应由 DSH 的 `tools/pre-execute` 或等价 host hook 在派发前调用状态控制器。

## 推荐边界

- Skill：决定何时进入 bounded、Mission/DoD/任务卡语义。
- `scripts/runstate.js`：维护与校验机器状态。
- DSH plugin/hook：在工具派发前执行 enforcement。
- Host registry：记录哪些 canonical project roots 已 opt-in bounded。

## 关键原则

1. **受管项目列表不要仅由项目内 `RUN_STATE.md` 决定。** 否则 Agent 删除一个文件就能从“受管”变成“未管理”。
2. 已注册项目若状态文件丢失/损坏：对受保护的派活动作应 fail-closed，并要求恢复状态或由用户解除注册。
3. 未注册项目：不要运行 bounded gate，避免把所有目录锁死。
4. `write/edit/shell` 是否拦截属于独立安全策略，不要和预算 gate 混在一起。
5. hard gate 必须可观测：至少记录 tool、project root、decision、reason、state revision。

## 派活建议

对 `subagent / subagent_fork / workflow / ralph` 等派活动作：

1. host 确认 project root 在 registry；
2. 调用 `node <skill>/scripts/runstate.js gate <root>`；
3. 若要启动 Worker，再原子调用 `worker-start`；
4. Worker 完成/异常退出后调用 `worker-stop`；
5. controller 异常时对**已注册**项目拒绝派活。

## 本包没有伪造 DSH 插件实现

不同 DSH 版本的 hook API 可能变化，因此 v1.0.0 只给出稳定的 controller contract，不把未经当前宿主验证的插件代码打包成“可直接硬拦截”。接入时应针对目标 DSH 版本做冒烟测试。
