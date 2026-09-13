# Agent Skills 标准符合性审查 — `personal-dev-workflow` v0.5.2

> 审查日期：2026-09-13 · 审查对象：`skills/personal-dev-workflow` 与 `skills/personal-dev-workflow-zh`（发布仓库 `dsh-personal-dev-workflow`）
> 方式：**官方参考校验器实跑**（非人工比对）+ 规范原文逐条核对 + 与 DSH 本机加载器实现对照

## 结论

**不符合（2 项阻断）**。官方参考校验器 `skills-ref validate` 对两个 skill 均判 **FAIL**。修法已在**沙盒副本**上验证到 **PASS**（英文 + 中文各一次），未改动真文件。

## 审查依据（三层，均取自权威来源）

1. **Agent Skills 官方规范** `https://agentskills.io/specification`（Anthropic 官方仓库 `anthropics/skills` 亲口指向的"The Agent Skills standard"）。
2. **Claude Code 技能文档**（`code.claude.com/docs/en/skills`）：`Keep SKILL.md under 500 lines`、frontmatter 语义、`allowed-tools` 走正常权限流、description 会被消毒（控制字符剥离、尖括号转义）。
3. **本机 DSH 加载器实现**（`@deepseek-ai/dsh-skill-filesystem/lib/index.js`，代码级）：只要求 `name` + `description` 两个字符串字段，缺失则**忽略该 skill 并告警**；`whenToUse` / `invocation` / `metadata` 被透传；**额外顶层字段被忽略、不报错**。⇒ 这解释了"DSH 里能用"与"标准上不合格"可以并存。

## 阻断项

**F-1 `metadata.tags` 用了流式数组** `tags: [development, workflow, task-card, dsh, bounded-autonomy]`
- 官方解析器直接在这一行失败：`Invalid YAML in frontmatter: … Found ugly disallowed JSONesque flow mapping`
- 且规范规定 `metadata` 是 **string → string 的映射**，数组类型本身就不合规。

**F-2 顶层出现规范外的字段** `slug` / `displayName` / `version`
- 官方校验器逐字拒绝：`Unexpected fields in frontmatter: displayName, slug, version. Only ['allowed-tools', 'compatibility', 'description', 'license', 'metadata', 'name'] are allowed.`

## 已验证的修法（沙盒 PASS，官方输出 `Valid skill` / exit 0）

```yaml
---
name: personal-dev-workflow
description: "A lean personal development workflow: … and bug fixes."
metadata:
  type: instruction
  version: "0.5.2"
  displayName: Personal Dev Workflow
  tags: "development, workflow, task-card, dsh, bounded-autonomy"
---
```

要点：把 `slug` 删掉（与 `name` 重复）、`displayName` / `version` **并入 `metadata`**（规范示例中 `version` 正是放在 `metadata` 里）、`tags` 改成**字符串**。中文版同款改法，同样 PASS。

**连带影响（必须同批改）**：本仓库 `scripts/validate-skills.mjs` 的版本一致性检查读的是**顶层 `version:`**；一旦并入 `metadata`，它必须改为读 `metadata.version`，否则立即报"missing version"。

## 非阻断发现

- **F-3 失效引用（三方都漏）**：`SKILL.md:111` 写"中文版见 `SKILL.zh-CN.md`（模板在 `references.zh-CN/`）"，但发布树里这两个路径**都不存在**（中文版实际是独立 skill 目录 `personal-dev-workflow-zh/`）。我们的校验脚本抓不到它（正则只匹配 `references/<file>`）；官方校验器**也不检查正文引用**——实测故意写 `references/NOPE.md` 仍判 `Valid skill`。
- **F-4 版本叙事不一致**：正文标题写 `Personal Dev Workflow v4`，frontmatter 是 `0.5.2`。
- **F-5 未用可选字段**：`license`（仓库根有 `LICENSE`）与 `compatibility`（本 skill 有真实环境要求：DSH + `tools/runstate.js` + `pre-execute` 插件）都没写。
- **F-6 官方校验器自身的 locale 缺陷**：其 `read_text()` 走系统默认编码，本机（zh-CN）下用 GBK 解码 UTF-8 的 SKILL.md **直接崩**（`UnicodeDecodeError: 'gbk' codec`）。绕过方式：`PYTHONUTF8=1`。⇒ 若把官方校验接进 CI，Windows runner 上必须设这个环境变量，Linux 无此问题。
- **F-7 本已合规（实测确认）**：`name` 合规（≤64、纯小写+连字符、无首尾/连续连字符、与父目录同名）；`description` **295 字符** < 1024 且同时说了"做什么"与"何时用"；`SKILL.md` **119 行** < 500；`references/` **一层深**、无深层引用链；渐进披露结构正确（元数据 ≈ 一句话、正文薄、细节在 `references/`）。

## 我们自建校验脚本的缺口（建议补齐）

`scripts/validate-skills.mjs` 现有 5 条规则之外，按规范应加：

1. frontmatter **字段白名单**（仅官方 6 字段；`metadata` 内任意 string→string）
2. **禁止流式集合**写法（`[a, b]` / `{k: v}`）——F-1 的根因
3. `name` 字符集/长度/连字符规则（≤64、`[a-z0-9-]`、无首尾与连续连字符）
4. `description` ≤1024 且非空
5. 正文引用检查**扩展**到 `*.md` 与 `references.<x>/` 形态（覆盖 F-3 这类）
6. （可选）CI 里加一步**官方** `skills-ref validate`（Windows 上带 `PYTHONUTF8=1`），与本仓校验互为对照

## 可复现命令

```powershell
# 一次性：取官方参考库并装进独立 venv（不污染 Anaconda）
$audit='E:\DeepSeek_Harness\workspace\2026_09_04\skill-audit'
git -c http.proxy=http://127.0.0.1:7897 clone --depth 1 https://github.com/agentskills/agentskills $audit\agentskills
& 'D:\Technology_application\Anconda_All\Anaconda3\envs\claude\python.exe' -m venv $audit\venv
& "$audit\venv\Scripts\python.exe" -m pip install --proxy http://127.0.0.1:7897 -e "$audit\agentskills\skills-ref"

# 每次校验（PYTHONUTF8 必设，否则本机 GBK 崩溃）
$env:PYTHONUTF8='1'
& "$audit\venv\Scripts\skills-ref.exe" validate 'E:\DeepSeek_Harness\workspace\2026_09_06\release\dsh-personal-dev-workflow\skills\personal-dev-workflow'
& "$audit\venv\Scripts\skills-ref.exe" validate 'E:\DeepSeek_Harness\workspace\2026_09_06\release\dsh-personal-dev-workflow\skills\personal-dev-workflow-zh'
```

沙盒验证副本（改法已 PASS，可直接对照）：`E:\DeepSeek_Harness\workspace\2026_09_04\skill-audit\probe\{personal-dev-workflow, personal-dev-workflow-zh}`
