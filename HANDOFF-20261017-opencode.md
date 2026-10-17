# HANDOFF — 2026-10-17 · OpenCode 会话交接（新对话从这里接）

> 这是**当前状态快照 + 待办 + 踩坑**，写给下一个会话（人或 agent）。
> 开工顺序：先读仓库根 `AGENTS.md`（治理规则）→ 再读本文件 → 跑一遍文末「开工自检」。
> 本文件只记录事实。2026-10-17 晚状态：那批未提交改动**已由两次提交收口并推送到 `origin/main`**，工作区干净（见第 4 节，已从"待办"变为"已完成"）。
> 同日晚还做了一轮"落位与分发"专项（把 skill 铺到四个 agent、升级三份项目副本、给 remote-job-aggregator 首次装入），见 §2.7；本文件与之相关的段落已同步刷新。

## 1. 一句话现状

仓库现在**只产出 Skill**（v2 时代线，发布号 `2.0.1` / 研究版 `1.3.2-local`），位于
`E:\Code_file\Projects\personal-dev-workflow`；插件、派生副本、npm 发布路径都已移除，v1.x 遗留整批归档在
`archive/`；agent 实际读的是 skills-manager 库里那份，经 `~/.claude/skills/personal-dev-workflow` 的 Junction 提供。

## 2. 本会话做了什么（按主题）

### 2.1 仓库搬家 + 改名

- 原位置 `E:\DeepSeek_Harness\workspace\2026_09_06\release\dsh-personal-dev-workflow`（DSH 日期工作区）。
- 2026-10-16 迁到 `E:\Code_file\Projects\dsh-personal-dev-workflow`；2026-10-17 目录改名为 **`personal-dev-workflow`**（用户手动完成，因为顶层目录被进程当 CWD 锁住）。
- 活引用已全部改到新路径：`~/.dsh/profiles/web/cordis.patch.yml` 的 controller、`E:\Code_file\Claude_code\PROJECTS.md` 第 08 行、`E:\DeepSeek_Harness\workspace\2026_09_06\AGENTS.md`（墓碑）、本仓库的 `HANDOFF-20261016-opencode.md`、skills-manager 的本地源 `source_ref`。
- 注意：**GitHub 仓库名已于 2026-10-17 晚改为 `personal-dev-workflow`**（`gh repo rename`，旧地址保留跳转；本地 `origin` 已 `set-url` 到新地址），`package.json` 的 `name` 同步改为 `@satan9394/personal-dev-workflow`。npm 侧见第 5 节第 6 条。

### 2.2 v2.0.0 发布（旧线，已完成）

提交 `9d530b6`、tag `v2.0.0`、GitHub Release v2.0.0 都已发布，CI 四道闸门全绿。之后 Codex 在本仓继续工作。

### 2.3 Codex 接手的 3 个提交（在 v2.0.0 之上，未推）

`97bf4f8` 导入 PDW 1.3.2 guards → `04fc1e7` 校验器/版本映射对齐 → `9831739` 记录来源并保留分发暂停。
现状：**HEAD 领先 `origin/main` 4 个提交**（含 `0e06aea` 角色 JSON 修复）。

### 2.4 只保留 Skill（用户指令，已执行，未提交）

移除（进回收站）：

- `plugin/`（`dsh-personal-dev-workflow` 插件 + `dsh-budget-gate`）
- `dist/skillhub-pkg/`（发布用副本）
- `scripts/sync-copies.mjs`（副本生成器）
- `.github/workflows/publish-package.yml`（npm 发布工作流）+ `package.json` 的 `publishConfig`

归档到仓库内 `archive/`：`tools/`（v0.5.x 控制器 + 43 用例）、`demos/`、`docs/`、`taskcard-cli.js`。

连带改：`validate-skills.mjs`（去副本校验、去插件版本一致性）、`validate-skills.test.mjs`（删 2 个对应用例）、CI（去 packaging 措辞、runstate 测试改指 `archive/`）、`package.json`（`files` / `scripts`）、README / CHANGELOG / RELEASING、`AGENTS.md`（新增「产物范围 / Scope」，删掉旧的「临时状态·暂停生成副本」）。

### 2.5 使用位（agent 实际读的那份）

- 库：`~/.skills-manager/skills/personal-dev-workflow`，`source_type=local`，`source_ref = E:\Code_file\Projects\personal-dev-workflow\skills\personal-dev-workflow`；2026-10-17 重指并 `skills update` 验证（`refreshed: true`），同日再跑一次确认库与仓库 **8 文件逐字节一致**。
- 入口：`~/.claude/skills/personal-dev-workflow` 是 **Junction → 库**（Claude 与 OpenCode 共用；实测 OpenCode 能加载）。**刻意不 deploy 到 `opencode`**（`~/.config/opencode/skills`），避免同一技能出现两份。
- `~/.dsh/skills/personal-dev-workflow`：2026-10-17 由 **2.0.0 真副本**换成 **Junction → 库**（旧副本先备份到本仓 `.pdw/migrations/dsh-skill-copy-2.0.0-20261017/`，再进回收站）。
- `~/.gemini/antigravity/skills/personal-dev-workflow`：2026-10-17 **新挂** Junction → 库。
- `skills status personal-dev-workflow` 的 `deployed_to` = `["antigravity","claude_code","deepseek_harness"]`；三处使用位穿透链接读 **8/8 与库逐字节一致**。**客户端层（DSH / Antigravity 里实际加载）按用户决定本轮不测，属已知未验项。**
- 项目级：`finquant-hub` / `Vessel_Harness` / `model-infra-kit` 三份由 1.3.1-local 升到 **8 文件当前版**（旧副本备份在各自 `.pdw/skill-upgrade-20261017/`）；`E:\Code_file\Claude_code\projects\remote-job-aggregator` 2026-10-17 **首次装入**（它本来没有副本）；研究项目那份维持 1.3.2-local 冻结快照；`model-infra-kit-internal` 的 v1.0.0 老代际不动。
- 逐项流程、不变式与机器清单见仓库根 **`DEPLOYMENT.md`**。

### 2.6 记账

- `E:\Code_file\Claude_code\Notes\2026\10\NOTES_20261016.md`：本工作多条日记（迁移、清场、v2.0.0、落位、适配 Codex）。
- `E:\Code_file\Claude_code\Notes\DECISIONS.md`：**D-0079**（仓库迁出日期工作区）、**D-0080**（v2.0.0 换代）、**D-0081**（落位定案 + 双轨版本补充）。
- `E:\DeepSeek_Harness\workspace\2026_09_06\AGENTS.md`：旧工作区墓碑（已重写）。
- 归档目录：`E:\DeepSeek_Harness\workspace\2026_10_16\pdw-repo-relocate\archive-2026_09_06-dev\`。
- 一次性改名脚本（已完成使命，留档）：`E:\DeepSeek_Harness\workspace\2026_10_17\pdw-rename\rename-personal-dev-workflow.ps1`。

### 2.7 2026-10-17 晚：落位与分发专项（本文件此后新增）

- 把「更新 skill / 挂到各 agent / 升级项目副本」的口径固化成仓库根 **`DEPLOYMENT.md`**（四层职责、版本口径、对照基准规则、五步流程、机器清单、不变式），并在 `AGENTS.md` 加指针。
- 四个 agent 统一到库的受管链接：dsh 换 Junction、agy 新挂 Junction、cc/oc 共用 `~/.claude/skills`（详见 §2.5）。
- 三份项目副本升到 8 文件当前版；`remote-job-aggregator` 首次装入（`.agents/skills/` + `pdw.ps1` + `AGENTS.md`）。
- 修了两个项目里失效的 codex 路径（`...\Codex\bin\e78bad9887fa50cf\codex.exe` → `...\896a0166b774037a\codex.exe`），两处 `doctor` 由 exit 1 变 exit 0；六个"现行描述"文件的版本串改到 `1.3.2-local`（历史记录不动）。
- `DECISIONS.md`：新增 **D-0082**（本条专项的执行细则）；**D-0078 撞号已修**（cc-switch 那条重编为 **D-0083**）。
- **推送与改名（同日更晚）**：`67b13ca`（`build!`）+ `c22965e`（`docs`）推送到 `origin/main`，CI run `39038915821` success；随后 `gh repo rename` 把远端改成 **`satan9394/personal-dev-workflow`**（旧地址保留跳转），本地 `origin` 已 `set-url`，`package.json` 的 `name`（→ `@satan9394/personal-dev-workflow`）与三处 URL、README / RELEASING / SECURITY 的安装路径同步到新名。**未发版本**（无 tag、无 Release、无 npm publish）。
- 🔴 **最值钱的教训**：PDW 的 `snapshot()` 把**全部 git 可见的未跟踪文件**算进任务指纹（与 scope 无关）。给 `remote-job-aggregator`（`.agents/` 未被忽略、且尚无任何 commit）首次装入后，那 10 个新文件**改掉了该仓库每一个既有任务的指纹**；补 `.git/info/exclude` 只能救回"baseline 之后无真实改动"的任务（实测 3 个里 1 个）。**以后给项目装/升级 skill 前，先确认 `.agents/`、`AGENTS.md`、`pdw.ps1` 已被忽略或已提交。**

## 3. 当前精确状态

### 3.1 结构

```
personal-dev-workflow/
├── skills/personal-dev-workflow/   # 唯一交付物：SKILL.md + references/ + agents/ + assets/ + scripts/
├── scripts/                        # validate-skills.mjs + validate-skills.test.mjs
├── archive/                        # v1.x/v0.5.x 遗留：tools/ demos/ docs/ taskcard-cli.js
├── .github/workflows/validate-skills.yml
├── .pdw/                           # 测试证据与迁移备份（gitignored，约 11.2 MB / 9819 文件）
├── AGENTS.md                       # 治理规则（含「产物范围」）
├── DEPLOYMENT.md                   # 落位与分发操作手册（2026-10-17 新增；改使用位/升项目副本前先读）
├── HANDOFF-20261016-opencode.md    # 上一份交接（已被本文件取代，保留可查）
└── CHANGELOG.md README.md RELEASING.md SECURITY.md LICENSE package.json
```

### 3.2 版本

- `package.json.version` = **2.0.1**（发布号）；`pdwSkillVersion` = **1.3.2-local**。
- Skill frontmatter **只有 `name` + `description`**（skill-creator 规则）；正文写研究版。
- 校验器规则：源版本比 `pdwSkillVersion`、发布号比 `package.json`。

### 3.3 Git

- `HEAD = c22965e`（2026-10-17 晚已推送），与 `origin/main` **同步（0/0）**；分支只有 `main`；无 stash。
- 工作区**干净**（`git status --porcelain` 无输出）：那批 78 项（`-uall` 118 项）未提交改动已由 `67b13ca`（`build!`）与 `c22965e`（`docs`）两次提交收口并推送；`git status` 不再列任何未跟踪顶层项。

### 3.4 验证（本文件写就时全绿）

| 命令 | 结果 |
|---|---|
| `node scripts/validate-skills.mjs` | exit 0（1 canonical / 1.3.2-local / 2.0.1） |
| `node --test scripts/validate-skills.test.mjs` | exit 0 |
| `node --test skills/personal-dev-workflow/scripts/drivers.test.mjs` | exit 0 |
| `node skills/personal-dev-workflow/scripts/pdw.test.mjs` | 32 通过 / 0 失败 |
| `node archive/tools/run-tests.mjs` | 42 通过 / 1 条件跳过 / 0 失败 |

> fixture 通过 ≠ 真机登录/供应商路由已验证。

## 4. 那批改动怎么收（**已完成 2026-10-17 晚**）

已按下面这个拆法执行完并推送（`67b13ca` + `c22965e`，远端 `9d530b6..c22965e`，CI run `39038915821` **success**）。
留档备查：**发布（tag / GitHub Release / npm）仍未授权**，需要时按 `RELEASING.md` 走。

```sh
# 提交一：只保留 Skill（删插件/副本/npm + legacy 归档 + 校验与 CI 跟随）
git add -A
git commit -m "build!: ship the Skill only — drop plugin bundle, generated copies, npm publish and archive v1.x legacy"

# 提交二：文档与治理
# （若与上面拆开）git add AGENTS.md DEPLOYMENT.md HANDOFF-*.md README.md CHANGELOG.md RELEASING.md
# git commit -m "docs: record Skill-only scope, archive layout and rename"
```

然后连同 Codex 那 4 个提交一起 `git push origin main`（**要用户授权**）。发布与否由用户定：若要发，按 `RELEASING.md` 发 `v2.0.1`（发布说明写 `v2.0.0 → v2.0.1` 窗口，含 1.3.2-local 导入与 Skill-only 收口）。

## 5. 待办 / 未决

1. ~~提交 + 推送~~ **已完成（2026-10-17 晚）**：`67b13ca`（build!）、`c22965e`（docs）已推送到 `origin/main`，CI `39038915821` success。**是否发 `v2.0.1` 仍未授权**（tag / GitHub Release / npm 一律未动）。
2. ~~dsh 那份还是 2.0.0 真副本~~ **已完成（2026-10-17）**：换成 Junction → 库，旧副本备份后进回收站。
3. ~~Antigravity 未挂载~~ **已完成（2026-10-17）**：已 `skills deploy --agent antigravity`。**客户端层仍未实测**（用户决定本轮不测，属已知未验项，不是已验证）。
4. **`.pdw/` 噪音**：现约 9819 文件 / 11.2 MB，含**悬空 Junction**（`symlink-scope/dangling` 等）。清洗建议：只清悬空链接、按需裁剪 `test-runs/`（规则要求保留 `.pdw/` 证据）。
5. ~~`DECISIONS.md` 的 D-0078 撞号~~ **已完成（2026-10-17）**：cc-switch 删卡那条重编为 `D-0083`（Star 库收窄那条保持 `D-0078`——四份全局规则引用的就是它），并改了 `NOTES_20261015.md:172` 的指针。
6. ~~GitHub / npm 名字~~ **仓库名已改（2026-10-17 晚）**：`gh repo rename` 把远端改成 `satan9394/personal-dev-workflow`（旧地址保留跳转），本地 `origin` 已 `set-url`；`package.json` 的 `name`（→ `@satan9394/personal-dev-workflow`）与三处 URL、README / RELEASING / SECURITY 里的安装路径（→ `npx skills add satan9394/personal-dev-workflow`）均已同步。
   **npm 侧另说**：`registry.npmjs.org` 上从来没有过该包（`npm view` 双双 404）；历史发布工作流 `.github/workflows/publish-package.yml`（已于 2026-10-16 移除，见 `67b13ca^`）指向的是 **GitHub Packages**（`registry-url: https://npm.pkg.github.com`、`scope: @satan9394`），所以若曾有产物，它在那里。查/删需要 token 具备 `read:packages`（列表）与 `delete:packages`（删除）——当前 `gh` 凭据没有这两个 scope（`gh api /users/satan9394/packages` 返回 403；`npm view --registry=https://npm.pkg.github.com` 返回 401）。授予后可用 `gh auth refresh -s read:packages,delete:packages`，或在 GitHub 网页 `https://github.com/users/satan9394/packages/npm/dsh-personal-dev-workflow/settings` 直接删。
7. **两个被中断的 PDW 任务**（都在 Target 项目 `E:\Code_file\Claude_code\projects\remote-job-aggregator`）：
   - `7540`：排查改名阻塞时被直接杀掉的 `pdw.mjs run …`。
   - `20261017071242-3b909d`：用 `pdw.mjs cancel` 干净取消的。
   2026-10-17 复评结论：**这 6 个 blocked 任务不建议 resume**——`runTask` 进 try 后先 `assertCurrent()`，而这些任务的证据多已因真实内容漂移失效，续跑会被 `Source drift detected` 挡回；要接着做就按 harness 口径另建新任务。
8. **2026-10-17 晚新增**：`remote-job-aggregator` 的 10 个新装文件已按用户决定在 `.git/info/exclude` 里本地忽略；`bb07f4` 的僵尸 `active`（pid 25588 已不存在）已人工删除（备份 `.pdw/skill-upgrade-20261017/state-bb07f4.bak-20261017`）。但该仓库 `6629de` / `cf5a61` / `bb07f4` 三个任务的证据仍为 false——那是各自 baseline 之后的**真实内容漂移**，忽略规则救不回来。
9. **待查（新发现）**：`6629de` 的 `baseline.json` 里 `contents` 是空 `{}` 却有非空 `head`，与其余任务（`contents` 有几十项、`head` 为 null）不一致，疑似独立缺陷，值得单独立项。

## 6. 坑与教训（新会话务必先看，别重复踩）

1. **不要用脚本做多点文本替换**。本会话用 PowerShell 批量替换时，把"成对参数"传成了扁平数组，`$p[0]/$p[1]` 退化成"首字符/次字符"，于是变成 **字符级替换**（`d→s`、`p→e`、`E→:`），把 `HANDOFF`、`PROJECTS.md`、墓碑写坏。修复靠 `git checkout` + 重写。**改文本只用编辑工具，一处一处改。**
2. **改名会被"把目录当工作目录"的进程锁住**（报 Access denied，不是权限设置问题）。判据：子目录能改名、顶层不能。本机常见占位者：Codex 的 Windows 服务 `CodexSandboxService.OpenAI.Codex`（需管理员停）、正在跑的 PDW 任务（`pdw.mjs run/resume`）、OpenCode 服务端/当前会话客户端（只能退出 OpenCode 才能放开）。
3. **删除受安全闸门约束**：`rmdir` / `Remove-Item` / `[IO.Directory]::Delete` 都会被拦，统一走回收站工具。删 Junction 前先确认"删的是链接不是真身"（本会话曾先备份再删）。
4. **skills-manager 的本地源导入会把 skill 目录里的临时/备份文件一起带进库**（曾把 `drivers.mjs.bak-*` 带进去）——导入前确认目录干净。
5. **`skills deploy` 只写各 agent 的全局目录**，管不了项目级 `.agents/skills/`；项目那份只能复制/手工。
6. **Junction 在这台机器上是能加载的**（OpenCode 实测；`.claude/skills` 里已有 `security-and-hardening` 等同类链接）。但链接指向的**绝对路径一改就断**，所以使用位特意指 skills-manager 库、而不是仓库。
7. **不要跑 legacy 的 `skills sync`**（按 active preset 批量刷所有 agent，会顺手动别的部署）。
8. **同一仓库多会话并行**：先读仓库自己的 `AGENTS.md`，再动手；Codex 与我曾同时在该仓工作（它提交、我改工作区），差点互相覆盖。
9. **给项目装/升级 skill 前，先确认该项目的 `.agents/`、`AGENTS.md`、`pdw.ps1` 已被 git 忽略或已提交**：PDW 的 `snapshot()` 把**全部 git 可见的未跟踪文件**算进任务指纹（与契约 scope 无关）。2026-10-17 给 `remote-job-aggregator` 首次装入后，那 10 个新文件改掉了该仓库**每一个**既有任务的指纹（独立评审实证：剔除这 10 个键后 `3b909d` 的指纹与 `state.artifact` 精确相等）。补救是补 `.git/info/exclude`，但只救回"baseline 之后无真实改动"的任务（实测 3 个里 1 个）。
10. **本机 PowerShell 的 `cd` 不改变 .NET 进程工作目录**：用相对路径读文件会读到**别的仓库**的同名文件（2026-10-17 子 Agent 实测踩到，只读、无副作用）。跨仓库操作一律用绝对路径。
11. **控制台回显中文路径会串码**：曾把 `E:\AI_ALL\Agent_备份` 读成 `Agent_技能` 并据此把错误路径写进给用户的回复。含中文的路径别靠回显辨认，先按模式匹配拿到对象再引用。
12. **`skills-manager` CLI 的子命令是顶层 `agents list`**：`skills agents list` 不存在（`skills` 下没有 `agents`）。手册/文档里写的命令要实跑过再落笔。

## 7. 开工自检（新会话第一步）

```sh
cd E:\Code_file\Projects\personal-dev-workflow
git log --oneline -5
git status --short | Measure-Object -Property Length -Line
node scripts/validate-skills.mjs
node --test scripts/validate-skills.test.mjs
node --test skills/personal-dev-workflow/scripts/drivers.test.mjs
node skills/personal-dev-workflow/scripts/pdw.test.mjs
node archive/tools/run-tests.mjs
& "$env:USERPROFILE\.skills-manager\bin\skills-manager-cli.exe" skills status personal-dev-workflow
```

若 `validate-skills.test` / `drivers.test` 报错，先看是不是有人把 `archive/` 里的东西搬回顶层（`AGENTS.md` 明确要求留在 `archive/`）。
