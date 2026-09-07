# framework —— 个人开发工作流背景与出处（可选阅读）

> 本文件是 SKILL.md 的背景注脚：解释"为什么这么做"和"数字从哪来"。
> 执行时不需要读它；只有想理解原理或怀疑某条规则时再翻。

## Agent = Model + Harness（五组件）

Harness 管 agent 单次运行的武装：给哪些工具、允许哪些动作、什么算完成、犯错了怎么纠正。
五组件按层次渐进上马，**不要五个同时上**：

| 组件 | 干什么 | 典型实现 | 层次 |
|---|---|---|---|
| 指令 | 告诉 AI 做什么 | AGENTS.md / 任务卡 | 输入端 |
| 约束 | 拦住 AI 做错事 | Hooks / Linter / CI / Sandbox | 输入端 |
| 反馈 | 检查 AI 做对没 | 测试 / 独立评审 / 可观测性 | 过程中 |
| 记忆 | 让 AI 不重复犯错 | AGENTS.md 制度记录 / docs/ | 跨时间 |
| 编排 | 让多个 AI 协作 | 子代理 / workflow | 跨空间 |

渐进顺序：先指令 + 基本反馈（让 AI 能跑测试）→ 被搞烦了加约束 → 重复解释受够了建记忆 → 编排最后。
（来源：社区 harness-engineering 实践；LangChain 数据：只改 harness，Terminal Bench 52.8% → 66.5%。）

## 关键出处

- **100 行原则**：Boris Cherny（Claude Code 创建者）的 CLAUDE.md 约 100 行；OpenAI AGENTS.md 约 100 行只做地图与指针。500-1000 行的指令文件反而更差——臃肿让 AI 忽略真正重要的指令。
- **验证提升 2-3 倍**：Boris Cherny 与 Anthropic 官方最佳实践（"Give Claude a way to verify its work"）。
- **干活的不打分**：Anthropic 官方建议"工程化一个严厉的独立评估者，远比教一个生成者自我批判容易"；评审子代理用全新上下文、只见 diff 与标准。
- **建议 vs 约束**：CLAUDE.md 规则是建议（大概率遵守）；Hooks/CI 是约束（程序级不可绕过）。约束保护底线，不保护偏好。
- **犯错驱动生长**：Mitchell Hashimoto 定义——"每次 agent 犯错，就工程化一个方案让它再也犯不了同样的错"；Ghostty 的 AGENTS.md 每行对应一次真实错误。
- **推理三明治**：规划用高推理、实现降档、验证拉满（66.5%）；全程拉满反而最差（53.9%，超时多）——资源分配比总量重要。
- **上下文是稀缺资源**：token 越多，准确回忆单条信息越差；污染三策略：compaction / context reset / 开新会话。
- **成本数字**（社区 loop-engineering 实践）：无记忆循环每轮 30k-50k token，有记忆 5k-15k；通过率 <50% 说明只是把评审垃圾变多了。
- **熔断**：同一问题修复 3 次仍不过 → 清空上下文重新派活或换执行器（防 Ralph Wiggum 空转）。
- **编排决策三问**（社区 agent-teams 实践）：谁来协调 / 子任务独立吗 / 会改同一批文件吗；能单不多。

## 规模细节（SKILL.md 一行版展开）

- 大项目/长期：并行 3-5 个 Worker 是行业共识（Anthropic 内部经验与 OpenAI Symphony 官方说明互相印证："大多数人可同时舒服地管理 3-5 个会话"）。
- 生产级：Symphony 的"护送 PR 走最后一公里"（盯 CI、rebase、解冲突）；GitHub 的 @Copilot 是核心仓库 active contributor。
- 每周复盘进 AGENTS.md：Google 把 AI 使用目标计入绩效、Meta 有 55%/80% 内部指标、OpenAI 3.5 PR/人/天——指标化是公司级常态，个人用 AGENTS.md 沉淀即可。

## 与顶级公司做法的对应

| 本 skill 规则 | 出处 |
|---|---|
| 一个指挥 + 隔离 Worker | Anthropic 并行实例；OpenAI Symphony conductor/worker |
| 文件即记忆（AGENTS.md/tasks/docs） | Anthropic CLAUDE.md 进 Git；OpenAI AGENTS.md 地图；Codex notes/history |
| 任务卡落盘（tasks/ = 看板） | OpenAI Symphony：看板即控制面，每任务隔离工作区 |
| 验证闭环 + 客观门禁 | Anthropic 官方最佳实践；Codex 可验证性（"启动 <800ms"可执行） |
| 交证含工作证明 | OpenAI Symphony review packet（CI/PR review/演示视频） |
| 人只做决策与验收 | OpenAI："Humans steer, agents execute."；Symphony："人管理工作而非监督 agent" |
