# Personal Dev Workflow distribution

This repository maintains and distributes the iterated Skill. Workflow research and original evidence live in `E:\Code_file\Projects\人机协作开发工作流研究`.

> **交接**：最新一份是 **`HANDOFF-20261017-opencode.md`**（迁移/清场/落位后的状态快照、待办与踩坑）；上一份 `HANDOFF-20261016-opencode.md` 保留可查（含未提交改动的归类建议、`.pdw` 悬空软链噪音、机器侧使用位现状）。插件与派生副本已移除（`plugin/`、`dist/`、`sync-copies.mjs`、npm 发布工作流），legacy 已整批归档到 `archive/`；**开工先读最新那份。**

- 落位与分发（把 Skill 挂到 cc/oc/dsh/agy 的全局位、升级项目里的副本、与研究发布包的对照口径与验收清单）：按 **`DEPLOYMENT.md`** 执行，不要每次重新讨论口径。方针依据：`E:\Code_file\Claude_code\Notes\DECISIONS.md` 的 D-0081（仓库=开发位、库=挂载开关、全局=受管链接、项目=按需复制）。

- Edit only `skills/personal-dev-workflow/` as the canonical Skill. **This repository ships the Skill only**: the DSH plugin bundle and the generated copies were removed on 2026-10-16 on the user's instruction (a plugin is not a Skill), and `scripts/sync-copies.mjs` is retired. Do not reintroduce a plugin directory or a copy step.
- Follow skill-creator: frontmatter contains only name/description; display metadata goes in agents/openai.yaml; runtime details in references/; runnable tools in scripts/; templates in assets/. Keep release notes and repository evidence outside the Skill.
- `package.json.version` identifies the distribution. `pdwSkillVersion` and the Skill/runtime text identify the imported research version. Preserve documented downstream fixes.
- Verify with `node scripts/validate-skills.mjs`, `node --test scripts/validate-skills.test.mjs`, `node --test skills/personal-dev-workflow/scripts/drivers.test.mjs`, `node skills/personal-dev-workflow/scripts/pdw.test.mjs`, and `node archive/tools/run-tests.mjs`. Fixture passes do not prove live authentication or provider routing.
- Keep `.pdw/` evidence/backups intact and leave the archived legacy material under `archive/` where it is; do not copy it back into the live tree. Do not copy transient backups into the Skill. No automatic commit, push, publish, release, global configuration changes or permanent deletion.

## 产物范围 / Scope（2026-10-16，用户指令）

- **本仓库只产出 Skill**：`skills/personal-dev-workflow/` 是唯一交付物。**不做 DSH 插件、不产任何派生副本**——插件 ≠ Skill。
- 2026-10-16 已移除：`plugin/`（含 `dsh-personal-dev-workflow` 插件与 `dsh-budget-gate`）、`dist/skillhub-pkg`、`scripts/sync-copies.mjs`；`validate-skills.mjs` 的副本校验与插件版本一致性校验、`validate-skills.test.mjs` 里对应的两个用例、CI 里那句"packaging"措辞一并去掉；`package.json` 的 `files` / `scripts` 不再提 plugin、dist、sync。
- 机理：**不再有副本，就不存在"canonical 与副本漂移"**，也不需要"暂停生成副本"这种临时状态。
- agent 侧不受影响：Claude / OpenCode 读的是 skills-manager 库里的那份（`~/.skills-manager/skills/personal-dev-workflow`），由 `skills update` 从本仓库导入。
