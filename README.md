# Personal Dev Workflow

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![skills.sh](https://img.shields.io/badge/install-npx%20skills%20add%20satan9394%2Fdsh--personal--dev--workflow-2ea44f)](https://skills.sh)
[![version](https://img.shields.io/badge/version-0.3.1-informational)](CHANGELOG.md)
[![agents](https://img.shields.io/badge/agents-Claude%20Code%20%7C%20Codex%20%7C%20Cursor%20%7C%20DSH%20%7C%20OpenCode-8a2be2)](#install)

> **One conductor + isolated workers + file-based memory + a verification loop.**
> The human only raises requirements and signs off; all hauling and relaying is automated.
>
> 中文：**一个指挥 + 隔离 Worker + 文件记忆 + 验证闭环**；人只做提需求与拍板。
> 核心是任务卡六步循环：拆卡 → 派活 → 交证 → 验证 → 验收 → 复盘。

Lean by design: the skill body is **67 lines** (down from 147), every rule has a traceable source, and the rationale lives in an optional reference instead of the main file.

## Install (30 seconds)

```sh
npx skills add satan9394/dsh-personal-dev-workflow
# English only:  --skill personal-dev-workflow
# Chinese only:  --skill personal-dev-workflow-zh
```

Works with Claude Code, Codex, Cursor, Gemini CLI, OpenCode, DSH and any agent that reads the standard `SKILL.md` layout.

Other ways:

| Way | Command / path |
|---|---|
| Manual copy (DSH) | copy `skills/personal-dev-workflow/` into `<workspace>/.dsh/skills/` or `~/.dsh/skills/` |
| Manual copy (Claude Code) | copy `skills/personal-dev-workflow/` into `~/.claude/skills/` |
| DSH bundle plugin | `dsh plugin --profile web add link:<this repo>/plugin/dsh-personal-dev-workflow` |
| Tencent SkillHub | `skillhub install personal-dev-workflow --namespace user_d684b111` (also `personal-dev-workflow-zh`) |

## The six-step loop

1. **Break down** — converge a fuzzy requirement to one page (Problem / assumptions / MVP / Not Doing); write a SPEC for big features; explore unfamiliar code first (3–5 focused searches, then stop).
2. **Dispatch** — one card → one isolated executor (subagent, or `codex exec`). Every card states constraints (what must NOT change) and the evidence expected. Three questions: who coordinates, is it independent, will it touch the same files?
3. **Proof of work** — change summary + diff + tests + screenshots, citing its source.
4. **Verify** — objective gates (executable criteria, not "feels done"); default suspicion; Review five things; a fresh-context reviewer for large changes; hard stop after 3 failed fixes.
5. **Accept** — the human picks one: merge / rework / redirect.
6. **Retro** — lessons into `AGENTS.md`, automate anything repeated 3×, garbage-collect stale rules.

## Bilingual

- **English (default):** `skills/personal-dev-workflow/`
- **中文：** `skills/personal-dev-workflow-zh/`

Both ship with the same four templates: task card, SPEC, verification checklist, and an optional `framework.md` (five-component model, sources, cost numbers, mapping to how top AI companies work).

## Repository layout

```
dsh-personal-dev-workflow/
├── skills/
│   ├── personal-dev-workflow/         # English, 67-line body + references/
│   └── personal-dev-workflow-zh/      # Chinese variant
├── taskcard-cli.js                    # zero-dependency CLI for tasks/ cards (copy to your project root)
├── plugin/dsh-personal-dev-workflow/  # DSH bundle plugin (bundles both skills)
├── dist/                              # publish packages for SkillHub (en / zh)
├── demos/                             # static visualizations (research / workflow / this skill)
├── scripts/validate-skills.mjs        # dependency-free frontmatter + reference check
└── .github/workflows/validate-skills.yml
```

## Companion tools

`taskcard-cli.js` manages the `tasks/` board the workflow relies on:

```sh
node taskcard-cli.js init            # create tasks/ and its README
node taskcard-cli.js new "写文档"     # create tasks/004-写文档.md
node taskcard-cli.js list            # 编号 | 标题 | 状态
node taskcard-cli.js done 004        # flip status to 已合入
```

The CLI anchors to its own directory — copy it into your project root. `demos/*/index.html` are standalone pages you can open directly in a browser.

## Verification

This repo practices what the skill preaches:

- `node scripts/validate-skills.mjs` (also run in CI) checks that each skill's frontmatter is valid, that `name` matches its folder, that every `references/...` file mentioned in the body exists, and that each packaged copy (plugin bundle, `dist/` packages) matches the canonical `skills/` source byte-for-byte.
- `node scripts/sync-copies.mjs` regenerates those copies from `skills/` in one command — `skills/` is the single source of truth, and CI fails on any drift.
- `npx skills add satan9394/dsh-personal-dev-workflow --list` must discover both skills.
- The workflow itself was exercised end-to-end on a real project (task-card CLI): cards → isolated executor → proof of work → verification → acceptance → retro.

## Sources

Distilled from OpenAI Codex (harness engineering / Symphony), Anthropic (Claude Code best practices) and DeepSeek Harness field experience. The rule-by-rule mapping lives in `skills/personal-dev-workflow/references/framework.md`.

## License

MIT.

---

## 中文速览

个人开发工作流：一个指挥 + 隔离 Worker + 文件记忆 + 验证闭环。安装：

```sh
npx skills add satan9394/dsh-personal-dev-workflow --skill personal-dev-workflow-zh
```

或把 `skills/personal-dev-workflow-zh/` 复制到 `.dsh/skills/`（DSH）或 `~/.claude/skills/`（Claude Code）。
对 agent 说"开工 / 拆任务卡 / 实现功能 / 修 bug"，即按六步循环推进。
