# 落位与分发流程（Skill → 库 → 各 agent → 项目副本）

> 本文件是**操作手册**：以后做"更新 skill / 挂到某个 agent / 升级某个项目里的副本"这类事，
> 按本文件执行，不要每次重新讨论口径。方针依据见 `Notes/DECISIONS.md` 的 D-0081（落位定案）
> 与本文件写作时的 D-0082；治理规则见仓库根 `AGENTS.md`。
> 最后核对日期：2026-10-17。

## 1. 四层职责（唯一权威只有一处）

```
本仓库 skills/personal-dev-workflow/          ← 唯一开发位与权威内容（agent 不直接读它）
        │  skills update（skills-manager 从本地源重导入）
        ▼
~/.skills-manager/skills/personal-dev-workflow ← 库：检索入口 + 挂载开关（受管实体，链接的落点）
        │  skills deploy --agent <key>
        ▼
各 agent 全局技能目录里的 Junction              ← 使用位（四 agent 同一份，不各自存副本）
        │  项目需要时复制（install --project）
        ▼
<项目>/.agents/skills/personal-dev-workflow/    ← 项目级真副本（长期项目自带一份）
```

- 改内容只改仓库那份；库与使用位都由命令刷新，**不手工编辑库或使用位**。
- 使用位是**链接**：库路径一变就断，因此链接指向库、不指向仓库。

## 2. 版本口径

- 发布号 = `package.json` 的 `version`（现 `2.0.1`）；研究版 = `pdwSkillVersion`（现 `1.3.2-local`）。
- Skill `SKILL.md` frontmatter **只有 `name` + `description`**（skill-creator 规则），正文写研究版。
- 校验器口径：源版本比 `pdwSkillVersion`，发布号比 `package.json`。

## 3. 与研究发布包的关系（对照基准，不覆盖）

研究项目 `E:\Code_file\Projects\人机协作开发工作流研究` 冻结在其最后一代（现 `1.3.2-local`），
交付包在 `artifacts/releases/<version>/`（ZIP + `manifest.json`，逐文件 SHA-256）。

- **规则：releases 只当对照基准，不覆盖本项目**。本项目是研究包的超集（研究包同名文件 + 项目侧修复：
  角色 JSON 恢复、最终响应口径、仓库/安装布局两用的路径探测及其回归用例）。
  覆盖会把项目侧修复连同用例一起抹掉。
- 需要核实时做**文件级比对**（不比测试）：按 `manifest.json` 的 sha256 逐文件比库/仓库，
  再对差异文件做行级 diff，判断"项目侧新增"还是"研究侧有而项目没有"。
- 比对结论写进 `.pdw/`（本地证据，gitignore），不往仓库塞跨仓库脚本（releases 在别的仓库，
  把它的绝对路径写死会把两处绑死）。
- 只有当用户明确要求"以研究包为准"时才覆盖，且必须先备份 + 逐文件确认差异。

## 4. 标准更新流程

### 步骤 0 · 前置检查（只读）

```powershell
cd E:\Code_file\Projects\personal-dev-workflow
git status --short
node scripts/validate-skills.mjs
node --test scripts/validate-skills.test.mjs
node --test skills/personal-dev-workflow/scripts/drivers.test.mjs
node skills/personal-dev-workflow/scripts/pdw.test.mjs
node archive/tools/run-tests.mjs
```

全绿再往下。注意：**仓库有未提交改动不影响部署**——库是从工作区路径导入的；
但要确认 `skills/personal-dev-workflow/` 自身没有半成品（不要留 `.bak`、临时文件，导入会把它们带进库）。

### 步骤 1 · 库对齐

```powershell
$cli = "$env:USERPROFILE\.skills-manager\bin\skills-manager-cli.exe"
& $cli skills update personal-dev-workflow        # 从本地源重导入
& $cli skills status personal-dev-workflow        # 看 source_ref / deployed_to
```

校验库与本仓库逐文件一致（8 个文件 SHA-256；`manifest` 式比对脚本见 `.pdw/migrations/` 里既有记录）。
参考值（2026-10-17，内容基线变动时同步更新）：

| 文件 | 研究包 1.3.2-local | 本项目 / 库 |
| --- | --- | --- |
| SKILL.md | `1233d5dc…` | 同（未改） |
| agents/openai.yaml | `f8cfe876…` | 同（未改） |
| assets/audit-task.json | `fe2d91b6…` | 同（未改） |
| references/runtime.md | `a21fa734…` | `db5abe72…`（项目侧新增一段口径） |
| scripts/drivers.mjs | `74186254…` | `c8dff120…`（项目侧新增 JSON 恢复） |
| scripts/pdw.mjs | `2f75b319…` | 同内容（仅行尾 CRLF→LF） |
| scripts/drivers.test.mjs | `4faa9318…` | `a0e0a4cf…`（项目侧新增回归用例） |
| scripts/pdw.test.mjs | `688a7819…` | `a9aefdea…`（项目侧布局适配） |

### 步骤 2 · 四个 agent 的全局位

四个 agent（cc、oc、dsh、agy）用**同一处**：库的受管链接。

```powershell
# Claude Code 与 OpenCode 共用 ~/.claude/skills（OpenCode 兼容读它），因此只挂 claude_code
& $cli skills deploy --agent claude_code personal-dev-workflow

# DSH：先确认该位置不是"野"真副本，是就先备份再进回收站，然后 deploy
& $cli skills deploy --agent deepseek_harness personal-dev-workflow

# Antigravity
& $cli skills deploy --agent antigravity personal-dev-workflow
```

- **不要** deploy 到 `opencode`：那会写 `~/.config/opencode/skills/`，让 OpenCode 可能同时看到两份。
- `--dry-run` 先看要改几对（`changed_pairs`）；`claude_code` 已挂时不会重复动。
- 目标位置若已有**非受管的同名真副本**（管理器不认它），必须先备份 → 送回收站 → 再 deploy，
  否则存在覆盖/冲突风险。
- dsh 那份**曾经**是 2.0.0 真副本（`~/.dsh/skills/personal-dev-workflow`），属上一条的情形；2026-10-17 已按该流程处理完（备份 → 回收站 → deploy 成 Junction）。

各 agent 的 key 与路径（`& $cli agents list`——`agents list` 是**顶层**子命令，`skills agents list` 不存在）：

| agent | key | 技能目录 |
| --- | --- | --- |
| Claude Code | `claude_code` | `~/.claude/skills` |
| OpenCode | `opencode` | `~/.config/opencode/skills`（本机不使用，靠 `~/.claude/skills` 兼容读） |
| DeepSeek Harness | `deepseek_harness` | `~/.dsh/skills` |
| Antigravity | `antigravity` | `~/.gemini/antigravity/skills` |

### 步骤 3 · 项目级副本升级（长期项目）

项目级是**真副本**，`skills deploy` 管不到（它只写各 agent 的全局目录），由 skill 自带机制或人工复制负责。

```powershell
# 新项目首次装入：把整份复制到 <项目>/.agents/skills/personal-dev-workflow
node <skill>/scripts/pdw.mjs install --project <项目绝对路径>
```

`install` 只用于**新项目首次装入**。升级已有副本时**不要**跑它——同名副本已存在它本就拒绝，
而且它还有连带副作用：写项目根 `pdw.ps1`、往项目 `AGENTS.md` 追加 `<!-- pdw-entry -->` 标记、跑 `initialize`。
升级按这个顺序做（只动技能目录，不碰项目的 `.pdw/`、`pdw.ps1`、`AGENTS.md`）：

1. 备份旧副本（进 `.pdw/skill-upgrade-<日期>/` 或项目自己的证据位，不放回收站就算备份）；
2. 对比：确认旧副本是否有项目本地改动（与原发布包逐文件散列比），有则单独保存差异；
3. 移走旧目录（**回收站**，不彻底删除）；
4. 装入新版：从**库**逐文件复制全部 8 个文件（保留 `agents/`、`assets/`、`references/`、`scripts/` 四层）；
5. **保留项目自己的 `.pdw/config.json`**——里面是该项目的角色/模型/可执行文件路径，属项目级设置，
   任何情况下不得用默认值覆盖；
6. 跑 `node <skill>/scripts/pdw.mjs doctor --project <项目>` 复核，证据留在该项目的 `.pdw/`；
7. 该项目的 `AGENTS.md` 若描述了技能目录内容（文件清单、references 名称），随代际变化同步更新。

### 步骤 4 · 验证

```powershell
& $cli skills status personal-dev-workflow          # deployed_to 应含 claude_code / deepseek_harness / antigravity
Get-ChildItem ~\.dsh\skills, ~\.gemini\antigravity\skills -Force | Where-Object Name -like '*personal*' |
  Select-Object FullName,LinkType,Target            # 应为 Junction，Target = 库路径
```

- 逐文件散列：各使用位读到的 8 个文件应与仓库一致（穿透链接读）。
- 项目副本：8 文件与库一致 + 该项目 `.pdw/config.json` 前后哈希不变 + doctor 通过。
- **能证明的边界**：文件层与命令层可证；dsh / agy 客户端里的实际加载要各自打开一次才算实测。
  2026-10-17 用户决定本轮**不做客户端实测**，因此 `~/.dsh` 与 `~/.gemini/antigravity` 两处仅"文件层已验证"，
  客户端层是**已知未验项**（不是已验证）。

### 步骤 5 · 记录

- 跨会话日记：`E:\Code_file\Claude_code\Notes\2026\10\NOTES_20261017.md`（追加，不新建文件）。
- 会约束未来的决定：`E:\Code_file\Claude_code\Notes\DECISIONS.md` 追加一条（取当前最大号 +1）。
- 机器清单有变动时同步本文件第 5 节。

## 5. 机器现状（2026-10-17 实测）

全局位：cc `~/.claude/skills/personal-dev-workflow`、dsh `~/.dsh/skills/...`、agy `~/.gemini/antigravity/skills/...`
均为 Junction → 库，穿透链接 8/8 与库逐字节一致；`~/.config/opencode/skills/personal-dev-workflow` 不存在（刻意不挂，oc 兼容读 `~/.claude/skills`）。
dsh 原来的 2.0.0 真副本已备份到本仓库 `.pdw/migrations/dsh-skill-copy-2.0.0-20261017/` 后进回收站。

项目级真副本（2026-10-17 已从 1.3.1-local 升级到 8 文件当前版，逐文件与库一致，各自 `.pdw/config.json` 未被改动）：

| 项目 | 路径 | 备份 |
| --- | --- | --- |
| finquant-hub | `E:\Code_file\Projects\finquant-hub\.agents\skills\personal-dev-workflow` | `<项目>\.pdw\skill-upgrade-20261017\personal-dev-workflow-1.3.1-local\` |
| Vessel_Harness | `E:\Code_file\Projects\Vessel_Harness\.agents\skills\personal-dev-workflow` | 同上（各自项目内） |
| model-infra-kit | `E:\DeepSeek_Harness\workspace\2026_09_08\model-infra-kit\.agents\skills\personal-dev-workflow` | 同上（各自项目内） |

升级后 `doctor` 结果：model-infra-kit `exit 0`（5 角色 ready）；finquant-hub 与 Vessel_Harness 初次 `exit 1`，
原因是这两个项目 `.pdw/config.json` 里 `implement` 的 codex 路径指向已消失的版本化 bin 目录
（`...\OpenAI\Codex\bin\e78bad9887fa50cf\codex.exe`）。这是升级前既有的项目配置漂移（用 1.3.1 旧副本跑同一命令
同样 exit 1），**不是**替换引入的。2026-10-17 经用户授权已修复：先备份 `config.json` 到各自的
`.pdw/skill-upgrade-20261017/`，再把 `implement.executable` 改指实测可用的 `...\bin\896a0166b774037a\codex.exe`
（同级 `ce4759538b7f2f1a\` 里只有 `rg.exe`，不是 codex），改后两份 `doctor` 均 `exit 0`、5 角色 ready。

各项目文档里钉扎的版本串同轮按"改现行描述、历史不动"更新：finquant-hub 的 `AGENTS.md` / `CLAUDE.md` /
`.gitignore` 注释、Vessel_Harness 的 `pdw-entry` 块、model-infra-kit 的 `AGENTS.md` 与 `.agents/skills/README.md`
已改到 `1.3.2-local`；历史/证据类文件（`HANDOFF.md`、`CHANGELOG.md`、`evidence/**`、`docs/decisions.md`、
model-infra-kit `AGENTS.md` 里那条带日期的 2026-10-16 验证记录）保持原样。

另有一处是**首次装入**而非升级（2026-10-17）：`E:\Code_file\Claude_code\projects\remote-job-aggregator`
原本没有任何内嵌副本，也没有 `AGENTS.md` / `pdw.ps1`（它的 12 个 PDW 历史任务是靠外部路径跑的）。
按首次装入路径执行 `node <库>/scripts/pdw.mjs install --project <项目>`，得到：8 文件副本、项目根 `pdw.ps1`、
`AGENTS.md`（install 写的 `<!-- pdw-entry -->` 块 + 事后补的「PDW 入口与技能副本」「任务板一览」两节，现 2005 B / 25 行）；
`.pdw/config.json`（5 角色全 opencode）与 `.gitignore` 未被改动，`doctor` exit 0。

**这一处有个必须记住的坑（同日独立评审发现）**：该项目 `.agents/` **没有被 git 忽略**，而 PDW 的 `snapshot()`
把**全部 git 可见的未跟踪文件**（与契约 scope 无关）算进任务指纹，于是新装的 10 个文件（`.agents/**` 8 个 +
`AGENTS.md` + `pdw.ps1`）**改掉了该仓库每一个既有任务的指纹**——只有把这 10 个键剔除，
任务 `20261017071242-3b909d` 的指纹才与 `state.artifact` 精确相等；而 `runTask` 进 try 后第一件事是
`assertCurrent()`，所以这些任务的 `resume` 会被 `Source drift detected` 直接挡回。
2026-10-17 已按用户决定在它的 `.git/info/exclude` 本地忽略这三个路径（文件保留）。
**注意补救的边界**：忽略规则只救回"baseline 之后没有真实改动"的任务（实测 3 个里只有 `3b909d` 恢复
`evidence_current: true`）；`6629de` / `cf5a61` / `bb07f4` 仍为 false，是它们 baseline 之后确有真实内容变更。
**写进流程的教训**：给任何项目装/升级 skill 前，先确认该项目的 `.agents/`（以及新增的 `AGENTS.md` / `pdw.ps1`）
已被 git 忽略或已提交；否则会顺手改掉它所有 PDW 任务的指纹。对 0 个任务的 finquant-hub / Vessel_Harness 无影响，
但对"全未跟踪、尚无 commit"的仓库最脆。
另：`bb07f4` 的僵尸 `active`（pid 25588）已人工删除（备份 `.pdw/skill-upgrade-20261017/state-bb07f4.bak-20261017`）。

刻意不动：

- `E:\Code_file\Projects\人机协作开发工作流研究\.agents\skills\personal-dev-workflow`——研究项目的 1.3.2-local 冻结快照。
- `E:\DeepSeek_Harness\workspace\2026_09_08\model-infra-kit-internal\.agents\skills\personal-dev-workflow`——v1.0.0 老代际（27 文件结构，非 git，2026-10-06 后未动），留作老代际存档。
- `E:\AI_ALL\Agent_备份\`——备份仓（22 直接子项 / 约 9.5 万文件 / 约 48.9 GB，含 10 个日期快照、`git-config` 五份 agent 配置的 git 仓库、zips），由它自己的 Backup/GitCommit/Pack 脚本维护。
- `E:\DeepSeek_Harness\_recovery\` 里的恢复备份，以及各处 `.pdw/`、`artifacts/`、`evidence/` 下的历史副本（测试证据，非使用位）。

## 6. 不变式与禁区

1. **不提交、不推送、不发布**，除非用户当轮明确授权。
2. **删除一律进回收站**（`FileSystem::DeleteFile/DeleteDirectory ... SendToRecycleBin` 或回收站工具），禁止 `rm` / `Remove-Item` / `rmdir` 等彻底删除。
3. **不覆盖项目级 `.pdw/config.json`**（角色、模型、exe 路径是项目自己的）。
4. 不动研究冻结快照、备份仓、老代际存档（见第 5 节）。
5. 不用 legacy 的 `skills sync`（按 active preset 批量刷所有 agent，会顺手动别的部署）。
6. 禁止 `npx skills add`（会与 skills-manager 抢同一批目录）；安装的唯一写入者是 skills-manager。
7. 库或使用位里出现 `.bak` / 临时文件时先清掉再导入（导入会把杂文件一起带进库）。
8. 只在 `skills/personal-dev-workflow/` 里改 Skill 本体；不放插件、不生成派生副本（`AGENTS.md` 的「产物范围」）。
