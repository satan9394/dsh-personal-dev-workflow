# Personal Dev Workflow v1.0.0

这是对 v0.5.3 的结构性重构版：目标不是增加更多规则，而是把 Skill 恢复为**按需加载的工作流能力**，把运行时控制、状态和平台适配分层。

## 这版解决了什么

1. **自治不再默认开启**：`standard` 完成一张卡后停；只有显式 `bounded` 才自动续跑。
2. **Skill 与 Harness 分层**：通用 Skill 不再宣称自己能做 host hard gate；DSH 等强制面放到 adapter。
3. **机器状态从 Markdown 剥离**：`.agent-state/run-state.json` 是真相源；`RUN_STATE.md` 只是渲染视图。
4. **Worker 语义修正**：`workers.active` 是 gauge，可 start/stop；`workersSpawned` 是 counter，避免“历史累计数冒充并发数”。
5. **验证按任务类型选择**：文档、后端、前端、基础设施、安全任务各自使用最相关证据。
6. **记忆去重**：AGENTS / ADR/docs / Task Card / machine state / changelog 各有职责，不再强制每张小卡写多份散文。
7. **模型解耦**：核心只定义 planner/executor/evaluator 的能力画像；具体型号进入可选 preset。
8. **行为 Evals**：新增 trigger / workflow / autonomy / recovery cases，防止以后只验证格式、不验证行为。

## 目录

```text
personal-dev-workflow/
├── SKILL.md
├── references/
├── assets/
├── scripts/
└── evals/
```

符合 Agent Skills 的常见结构：`SKILL.md` 为入口，`references/` 按需加载，`scripts/` 放确定性动作，`assets/` 放模板。

## 快速验证

```bash
python scripts/validate-skill.py .
node scripts/runstate.test.js
```

> `validate-skill.py` 只验证结构、frontmatter 和本地引用，不证明工作流语义正确。行为正确性必须看 `evals/` 和真实项目回放。

## 安装思路

保持**单一可发现 Skill**。不要同时安装中文版和英文版两个同职责 Skill，否则路由阶段会看到两个高度重叠的 description。

## 从 v0.5.3 迁移

见 `references/migration-v0.5.3.md`。
