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

## 为什么要"有限自治"（v0.5.0）

六步循环解决的是"**一张卡**可靠不可靠"，它对"卡最多能有多少"毫无约束——而无界运行恰恰出在这里：一个开放式 Prompt（"持续改进产品"）叠在自动续跑的 goal 上，审计发现又不断变回新卡进入执行，于是永远跑不完。

- Anthropic 的长任务指引把**结构化交接**与**一个上下文硬扛到底**分开：状态写下来、上下文重置、下一轮从文件恢复。`RUN_STATE.md` 就是这个交接文件。
- Anthropic 的 Planner → Generator → Evaluator 强调**职责分离**，不是无限增加 agent 数量——所以这里默认 2 个 Worker（上限 3），而不是 3–5。
- OpenAI 关于委派的指引同理：低风险、可重复的工作交出去；模糊设计与高风险改动留给人。因此本 skill 是"**默认自动验收，例外才升级**"。
- 审计/发现被刻意做成**没有执行权的独立模式**：只产出发现、写进 backlog，然后停止。Backlog 是记忆，不是队列。
- 默认预算是**两级**的——两级都是 `RUN_STATE.md` 里的计数器，且文件里实际写的上限优先于这里的默认值：
  - **Run 预算 —— `## Budget`**（管单次运行的上下文卫生）：Epoch ≤ 2 · 每 Epoch 完成卡 ≤ 6 · WorkSet ≤ 8 · Worker 2（上限 3）· 单卡 Repair ≤ 1 · Research pass ≤ 1 · 子代理嵌套 ≤ 1。
  - **Mission 预算 —— `## Mission Budget`**（管整个 Mission 跨 Run 的熔断；`new-run` 永不重置）：Run ≤ 3 · 总卡数 ≤ 12 · 总 Repair ≤ 3。
  - **谁来处理耗尽**：**Run** 预算耗尽由 agent 自己处理——先写状态文件，再 `node tools/runstate.js new-run` 换新上下文续跑，不找人；只有 **Mission** 预算耗尽才升级给人。
- 把它们编号，是为了把"注意节约"变成一个可检查的数字，而不是一句可以被忽略的态度。预算用尽（Run 换新 Run、Mission 停止升级）是正常结果，不是失败。

| 另有出处 | 来源 |
|---|---|
| 长任务的结构化交接 + 上下文重置 | Anthropic 长任务指引（/clear、checkpoint、全新上下文验证） |
| Planner / Generator / Evaluator 角色分离 | Anthropic 多智能体研究；打分的人不能是干活的人 |
| 可重复工作委派、模糊工作留给人 | OpenAI 关于生产环境使用编码 agent 的指引 |
| 看板 + 隔离运行即控制面 | OpenAI Symphony（每个 issue 一个隔离工作区） |

实战样例：在真项目上跑了三轮（5 张卡自动合入、两种停止条件都触发过、审计发现只进 backlog、某轮仅凭 `RUN_STATE.md` 恢复继续）——见 `docs/case-study-bounded-autonomy.md`，可复跑证据在 `docs/evidence/runstate-cli/`。
