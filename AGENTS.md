# Personal Dev Workflow distribution

This repository maintains and distributes the iterated Skill. Workflow research and original evidence live in `E:\Code_file\Projects\人机协作开发工作流研究`.

> **2026-10-16 交接**：本机另一会话（OpenCode）留下留意清单与归一化建议 → **`HANDOFF-20261016-opencode.md`**（含"临时状态·暂停副本生成"、31 项未提交改动的归类建议、`.pdw` 悬空软链噪音、机器侧使用位现状）。**做统一化清洗前先读它。**

- Edit only `skills/personal-dev-workflow/` as the canonical Skill; regenerate plugin/dist copies with `node scripts/sync-copies.mjs`. **⚠ 2026-10-16 起暂停生成副本——见文末「临时状态」。**
- Follow skill-creator: frontmatter contains only name/description; display metadata goes in agents/openai.yaml; runtime details in references/; runnable tools in scripts/; templates in assets/. Keep release notes and repository evidence outside the Skill.
- `package.json.version` and the plugin version identify the distribution. `pdwSkillVersion` and the Skill/runtime text identify the imported research version. Preserve documented downstream fixes.
- Verify with `node scripts/validate-skills.mjs`, `node --test scripts/validate-skills.test.mjs`, `node --test skills/personal-dev-workflow/scripts/drivers.test.mjs`, `node skills/personal-dev-workflow/scripts/pdw.test.mjs`, and `node tools/run-tests.mjs`. Fixture passes do not prove live authentication or provider routing.
- Keep `.pdw/` evidence/backups and legacy docs/tools intact. Do not copy transient backups into the Skill. No automatic commit, push, publish, release, global configuration changes or permanent deletion.

## 临时状态 / Temporary hold（2026-10-16 起，用户指令）

**Do not generate or re-sync the plugin/dist skill copies until the user lifts this hold.**

- **暂停什么**：不跑 `node scripts/sync-copies.mjs`；也不手工把 `plugin/dsh-personal-dev-workflow/skills/personal-dev-workflow/` 与 `dist/skillhub-pkg/` 跟 `skills/personal-dev-workflow/` 对齐。
- **已知后果（预期状态，不是待修的 bug）**：副本会与 canonical 漂移，`scripts/validate-skills.mjs` 的"逐字节一致"检查（以及 CI 里同一条闸门）会报 FAIL。**暂停期间不要为了让它变绿而去生成副本**——要么接受它报红并说明原因，要么等解除后一次性补齐。
- **不受影响**：Skill 本体 `skills/personal-dev-workflow/`，以及 agent 实际使用的两份——skills-manager 库 `~/.skills-manager/skills/personal-dev-workflow` 与 `~/.claude/skills/personal-dev-workflow`（Junction）——读的都是 canonical，不读这些副本。
- **解除方式**：由用户明示恢复；恢复时跑 `node scripts/sync-copies.mjs` 再跑 `node scripts/validate-skills.mjs` 收口。
