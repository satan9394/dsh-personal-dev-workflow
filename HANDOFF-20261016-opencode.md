# HANDOFF — 2026-10-16 · 给 Codex 的留意清单与归一化清洗建议

> 出具方：OpenCode（本机另一会话）；接收方：在本仓库工作的 Codex 会话。
> 目的：把"仓库外我动过的东西"和"我看到的乱点"一次讲清，供你做统一化清洗与适配。
> 本文件只记录与建议，**不含任何我擅自做的仓库内容改动**（我在仓库里唯一动过的是 `AGENTS.md` 末尾的产物范围一节，那是用户指令）。

> **2026-10-17 更新**：本文写于"插件/副本移除"**之前**。2026-10-16 晚已按用户指令移除 `plugin/`、`dist/skillhub-pkg`、`scripts/sync-copies.mjs`（以及 npm 发布工作流），并把 `tools/`、`demos/`、`docs/`、`taskcard-cli.js` 整批归档到 `archive/`；仓库现在只产出 Skill（见 `AGENTS.md` 的「产物范围 / Scope」）。因此第三节第 4、6 条与第五节第 6 步已不适用；**第 1、2、3、5 条（未提交改动、发布落后于 1.3.2、`AGENTS.md` 曾未跟踪、`.pdw` 悬空软链噪音）仍然有效**。另：本目录已改名为 `personal-dev-workflow`（2026-10-17）。

## 一、仓库现状快照（2026-10-16 晚，只读取得）

- `HEAD = 0e06aea fix(skill): recover role JSON from prose, fences, and balanced braces`；**领先 `origin/main` 1 个提交**，落后 0；分支只有 `main`；无 stash。
- 工作区 **31 项**：**25 个已修改 + 6 个未跟踪，0 个删除**（`git status --short`）。
- 未跟踪的 6 个（都是这一轮的产物）：
  - `AGENTS.md`（治理文件本身还没进版本库）
  - `scripts/validate-skills.test.mjs`
  - `skills/personal-dev-workflow/scripts/drivers.test.mjs`（另有 `dist/`、`plugin/` 下的两份同名副本）
  - `docs/evidence/research-1.3.2-import.json`
- `.pdw/` 已被 `.gitignore` 忽略：**5.1 MB / 4153 个文件**，内含 `migrations/` 与 `test-runs/`。
- 杂物扫描（排除 `.pdw/`）**为空**——先前那个 `scripts/drivers.mjs.bak-20261016-204755` 已被你清掉。
- 已知噪音：`git status` 每次都打印 `could not open directory '.pdw/.../symlink-scope/dangling/'`（`.pdw/test-runs/*` 与 `.pdw/migrations/research-1.3.2/install-final/*` 下有**悬空符号链接**，是测试夹具留下的）。

## 二、仓库外我动过的东西（供你对齐，别重复做）

1. **使用位（agent 实际读的那份）**：skills-manager 库 `~/.skills-manager/skills/personal-dev-workflow`，源＝本仓库工作区（`source_type=local`）。已 `skills update` 到 **1.3.2-local / 8 个文件**，与本仓库 `skills/personal-dev-workflow/` **逐字节一致**。
2. **CC/OC 的入口**：`~/.claude/skills/personal-dev-workflow` 是 **Junction → 库**（不是指向仓库）。实测可被 Claude 与 OpenCode 读取（`opencode api get /api/skill` 命中）。
3. **DSH 的入口**：`~/.dsh/skills/personal-dev-workflow` 仍是**旧的真副本（2.0.0）**——故意留着，因为"链接对 DSH 能否加载"没实测过。
4. **记账**（在 DSH / Claude_code 的笔记仓，不在本仓库）：`Notes/DECISIONS.md` 的 D-0079/D-0080/D-0081、`Notes/2026/10/NOTES_20261016.md` 四条日记、`E:\DeepSeek_Harness\workspace\2026_09_06\AGENTS.md`（旧工作区墓碑）。

## 三、我看到的乱点（建议动作 + 谁来决定）

| # | 乱点 | 证据 | 建议动作 |
|---|---|---|---|
| 1 | **31 项改动 + 1 个未推提交全悬着** | 见第一节 | 用户拍板：哪些进版本库、分几个提交、是否推 `main` |
| 2 | **发布与仓库不一致** | 已发布 `v2.0.0` 不含 `1.3.2-local`（`0e06aea` 是修复，工作区还有 25 项） | 决定是否发 `v2.0.1`（`package.json` 已写 2.0.1）；发版说明按 `RELEASING.md` 的窗口要求写 |
| 3 | **`AGENTS.md` 本身未跟踪** | `?? AGENTS.md` | 尽早 `git add` 进版本库——它是治理文件，别只活在本地磁盘 |
| 4 | ~~副本生成的临时暂停~~ **已解决** | `AGENTS.md` 的「产物范围」 | 2026-10-16 已按用户指令移除插件与全部副本（`plugin/`、`dist/`、`sync-copies.mjs`、npm 发布工作流）+ 对应校验与用例；legacy 整批归档到 `archive/` ⇒ 漂移问题从根上消失 |
| 5 | **`.pdw/` 只增不减 + 悬空软链** | 5.1 MB / 4153 文件；`symlink-scope/dangling` | 归入清洗：① 清悬空软链，消掉 `git status` 噪音；② 决定 `test-runs/` 是否只留最近若干次（规则要求"保留 `.pdw/` 证据"，所以只建议裁剪、不整目录删） |
| 6 | **v1.x 遗留物曾与 v2 并列**（已归档） | 2026-10-17 已把 `tools/`（v0.5.x 控制器 + 43 用例）、`demos/`×3、`docs/`、`taskcard-cli.js` 整批移到仓库的 `archive/`；本机 DSH 那个已停用的预算闸门仍指向 `archive/tools/runstate.js` |
| 7 | **同一份 skill 在机器上有 9 处** | 仓库（canonical）、库、`.claude` 入口、`.dsh` 入口、四个项目 `.agents/skills/` | 项目级按用户方针"长期项目复制、小项目不复制"；机器侧已由库+链接收口，**项目那份归各项目自己变**（用户已安排） |
| 8 | **死引用** | 归档脚本 `sync-personal-dev-workflow.ps1` 的旧目标里含已不存在的 `Composable_Agent_Harness` | 该脚本只对"往项目推副本"还有用；若启用，先把目标表里那条死路径删掉 |

## 四、边界（我遵守，也建议你留意）

- **不做**：自动提交 / 推送 / 发布 / 改全局配置 / 永久删除（本仓库 `AGENTS.md` 明文）。
- **不改**：`.pdw/` 证据与备份、legacy `docs/`+`tools/`（保持原样，只加说明）。
- **别碰**：机器侧使用位（库、`~/.claude/skills` 那条 Junction、`~/.dsh` 那份副本）——那是用户与我在管的落位，改它会绕过记账。
- **删链接/删目录**：本机 shell 的安全闸门会拦 `rmdir`/`Remove-Item`，要删只能走回收站工具；删 Junction 前先确认"删的是链接不是真身"（我这次先备份再动手）。

## 五、建议的清洗顺序（等你与用户确认后执行）

1. 先清噪音：删 `.pdw/**/symlink-scope/dangling` 悬空软链；确认 `git status` 不再有 warning。
2. 把 `AGENTS.md` 与 6 个新文件补齐进版本库；把 25 个修改按主题分成 2–3 个提交（建议：技能修复 / 校验与 CI / 文档与发布元数据）。
3. 跑五条验证（见下），全绿后再谈发布。
4. 发布决策：`v2.0.1`（含 `1.3.2-local` 与角色 JSON 修复）——发版说明、tag、Release 由用户授权后做。
5. 标注 legacy：`README` 增加"v2 现行 / v1.x 遗产"一节；顺带把 `docs/` 里指向旧设计的表述标记为历史。
6. 副本暂停解除：用户明示后跑一次 `sync-copies.mjs` + `validate-skills.mjs` 收口，并在 `AGENTS.md` 里撤掉那节「临时状态」。

## 六、验证命令（本仓库 `AGENTS.md` 指定的五条）

```sh
node scripts/validate-skills.mjs
node --test scripts/validate-skills.test.mjs
node --test skills/personal-dev-workflow/scripts/drivers.test.mjs
node skills/personal-dev-workflow/scripts/pdw.test.mjs
node archive/tools/run-tests.mjs
```

我 2026-10-16 晚跑过一轮（**当前工作区**）：`validate-skills` 全绿（源版本 1.3.2-local 对齐 `pdwSkillVersion`、发布号 2.0.1 两处一致）；两个 `--test` exit 0；`pdw.test` **32 通过 / 0 失败**；`run-tests` 42/43（1 条条件跳过）。**fixture 通过不等于真机登录与供应商路由已验证。**
