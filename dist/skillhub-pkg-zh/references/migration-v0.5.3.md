# 从 v0.5.3 迁移到 v1.0.0

## 1. 不再安装双语两份可发现 Skill

保留一个 `personal-dev-workflow`。中文作为 canonical 指令即可；如果要英文文档，放 references，不再额外创建第二个同职责 `SKILL.md`。

## 2. RUN_STATE.md 不再是机器状态

旧版通过解析 Markdown 计数。v1 改为：

```text
.agent-state/run-state.json   # machine source of truth
RUN_STATE.md                  # generated human view
```

旧项目建议先人工把 Mission、DoD、预算、workset 迁入 JSON，再 `check`。

## 3. 默认自治行为改变

旧版“门禁通过 → 自动合入、提交、继续下一张卡”现在仅属于显式 `bounded`，且自动 commit 还需要项目规则授权。

`standard`：一张卡完成后交证并停。

## 4. Worker 计数修复

旧 `Worker 数` 同时承担累计/并发语义。v1 拆为：

- `workers.active`：当前并发，可减；
- `workersSpawned`：本 Run 累计，只增。

## 5. 记录策略改变

不再强制每卡同时写 daily log + CHANGELOG + RUN_STATE + AGENTS。按 `memory-policy.md` 各归其位。

## 6. DSH hard gate

v1 核心 Skill 不携带未经验证的 DSH hook 实现。保留 controller contract，在目标 DSH 版本上实现/测试 host adapter，避免把“规则”误称为“硬拦截”。
