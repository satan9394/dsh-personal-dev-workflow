# dsh-budget-gate

**host 级预算闸门**（DSH 插件）：把「派活前先查预算」从 agent 纪律升级为 harness 级拦截。

挂在官方可注册的 `tools/pre-execute` 瀑布上，对**派活类**工具调用（`subagent` / `subagent_fork` / `workflow` /
`ralph`）在派发前委托外部 controller `node <controller> gate <项目根>`，按 stdout 的 JSON 判定 allow / deny。
它补的是 `tools/runstate.js` 的短板：CLI 只能约束"被调用时"的那次写入，本插件约束的是"派发前"这个动作。

- 入口：`index.mjs`（与已上线的 `~/.dsh/profiles/web/n3-budget-gate.mjs` **逐字节一致**）
- 已上线副本 SHA256：`E4AC33F9BA588C2D724EEF08540612818D894696F7964D64509A0090ACBBC790`（15042 bytes）
- 依赖：零 npm 依赖，只用 `node:` 内置模块，不联网

> 本目录只是**可复现的副本**（让硬盘闸门不依赖某台机器的 profile）。真正的加载点是 DSH profile 的
> `cordis.patch.yml`；本目录不会被 `dsh plugin add` 自动挂载。

## 安装

两步：把入口文件放到 profile 目录旁，再往该 profile 的 `cordis.patch.yml` 追加一个 `insert` 块。

**① 放置文件**（与 `cordis.patch.yml` 同目录，`~/.dsh/profiles/<profile>/`）：

```sh
cp plugin/dsh-budget-gate/index.mjs ~/.dsh/profiles/web/n3-budget-gate.mjs
```

**② 追加 patch 片段**（顶层数组末尾；改完热加载生效，实测无需重启 `dsh web`）：

```yaml
- insert:
    - id: n3-budget-gate
      name: './n3-budget-gate.mjs'
      config:
        # 派活类白名单 —— 绝不要加 pwsh / bash / read / write（否则触顶即永久锁死）
        tools: ['subagent', 'subagent_fork', 'workflow', 'ralph']
        stateFile: 'RUN_STATE.md'
        # null = 项目根取自 exec.agent.session.header.cwd（退回 process.cwd()）
        projectRoot: null
        # 固定 controller 路径；{root} = 项目根，{controller} = 本项的值
        controller: null
        controllerCandidates: ['{root}/tools/runstate.js', '{controller}']
        # 默认当前 harness 自己的 node；如 profile 用的 node 不同则显式指定
        gateBin: null
        gateSubcommand: 'gate'
        timeoutMs: 8000
        # 同项目根 1.5s TTL 缓存（含并发合并）；不要调长，预算会变
        cacheTtlMs: 1500
        denyPrefix: '预算闸门'
        auditFile: '~/.dsh/logs/n3-budget-gate.jsonl'
        notifyUnmanaged: true
```

两个实测坑：

- **必须用 `.mjs` 扩展名**。profile 根目录的 `package.json` 没有 `"type":"module"`，`.js` 的模块类型未定义。
  Node 24 会回退重解析为 ESM 并打印 `MODULE_TYPELESS_PACKAGE_JSON` 警告；在没有该回退能力的旧 Node 上，
  同样的 `.js` 会因 `export` 语法直接加载失败。`.mjs` 两处都干净。
- **`id` 必须全新**。`insert` 是**新增** loader 行，不是按 id 覆盖既有行；复用既有 id 会触发
  `duplicate loader entry id` 导致 `dsh web` 起不来（本项目 2026-09-12 已踩过）。上线前用
  `dsh --profile <p> --patch <overlay.yml> --dump-config` 全树查重，确认 id 唯一。

## 判定策略（6 条）

| # | 情况 | 行为 |
|---|---|---|
| 1 | 项目根**没有** `RUN_STATE.md`（未管理项目） | **放行** + 一次性提示（stderr + 审计）。防锁死的关键：绝大多数目录没有状态文件 |
| 2 | 有状态文件，controller 输出合法 JSON `{"allow":true}` | 放行 |
| 3 | 有状态文件，controller 输出合法 JSON `{"allow":false}` | **拒绝**，reason 用 controller 原文（含触顶计数器与当前值） |
| 4 | 有状态文件，但 controller 崩溃 / 非 JSON / 超时 / 脚本不存在 | **拒绝（fail-closed）**，理由写明「controller 异常，请修状态文件或删除它」 |
| 5 | 工具白名单 | **只门禁派活类**；**绝不含** `pwsh` / `bash` / `read` / `write`，保证触顶后 agent 仍能跑 shell 自救 |
| 6 | 性能 | 单次判定目标 < 200ms（实测 79–117ms）；同项目根 1.5s TTL 缓存 + 并发合并（in-flight coalescing） |

## fail-open / fail-closed 边界（如实声明）

**fail-closed 只有一种情况**：项目**已管理**（项目根存在 `RUN_STATE.md`）**且** controller 异常
（崩溃 / 非 JSON / 超时 / 脚本不存在）。其余一律向"放行"一侧倒：

- **未管理项目**（无状态文件）→ 放行，永不因 controller 异常被拒。
- **插件自身内部错误**（bug / fs 异常 / `TypeError`）→ 放行。插件的一个异常不能把整个 harness 锁死。
  **只有 controller 异常才 fail-closed**。
- **白名单外工具**（含 `pwsh`）→ 放行，且**根本不 spawn controller**。
- **插件缺失 / 未加载 / 被同 profile 其它层覆盖** → 闸门**静默消失**，派活全部无门禁通过。这是与
  `deny-risk-commands` 同一类的加载面 fail-open，须靠 doctor / 健康检查或实拨一次来确认条目真的在树里。
- **patch 文件写坏 → `dsh` 直接起不来**（fail-loud）。所以改动前必须备份，并在隔离 `DSH_HOME` 里真启动一次
  （`--dump-config` **不足以**发现 duplicate loader entry id），改完立刻发一个无害工具调用验证。

**强制面**：仅 `subagent` / `subagent_fork` / `workflow` / `ralph` 四个派活类工具，且只覆盖**派发这一个检查点**。
它管不到已派出 worker 内部的工作，也管不到任何不经工具调用的消耗；真正的成本闸门仍是
「一个 Mission 一个信封 + 两级预算」。

**项目根判定是精确根**（不向上遍历）：子目录一律算未管理并放行——宁可漏拦，不可误锁。
来源优先级：`config.projectRoot` > `exec.agent.session.header.cwd` > `process.cwd()`。

## 备份与回滚

**改动前先备份 patch**（备份名带时间戳，留在 profile 目录里）：

```sh
cp ~/.dsh/profiles/web/cordis.patch.yml ~/.dsh/profiles/web/cordis.patch.yml.bak-<YYYYMMDD-HHMMSS>
```

**回滚（两级，任选其一）**：

1. **只关闸门**：把上面那段 `- insert:` 块从 `cordis.patch.yml` 里取消掉，热加载后闸门即消失
   （回到"无 host 闸门、只剩 CLI 可检查"的状态）。插件文件留着不影响其它功能。
2. **整文件还原**：用备份覆盖回去

   ```sh
   cp ~/.dsh/profiles/web/cordis.patch.yml.bak-<YYYYMMDD-HHMMSS> ~/.dsh/profiles/web/cordis.patch.yml
   ```

   本机该回滚路径已于 2026-09-13 在真实 profile 上实测通过（备份文件
   `cordis.patch.yml.bak-20260913-002912`）。

回滚后请**真启动一次 + 实拨一次派活类调用**确认：闸门确实不在了（agent 应当能直接派活），且 `dsh web`
能正常起来。不要只看 `--dump-config`。

## 审计

每次判定追加**一行 JSON**（写失败静默吞掉，**绝不影响判定**）：

```
~/.dsh/logs/n3-budget-gate.jsonl
```

字段：`ts` / `tool` / `event` / `root` / `stateFile` / `controller` / `gateBin` / `args` / `exitCode` /
`spawnFailed` / `timedOut` / `aborted` / `durationMs` / `gateJson` / `decision` / `reason`，
另有 `anomaly`（`controller-missing` / `controller-error`）、`oneTimeNotice`（未管理项目的一次性提示）。

用它回答两个问题：**这次派活过没过闸门**、**为什么**。排查建议：

```sh
tail -n 20 ~/.dsh/logs/n3-budget-gate.jsonl
```

## 与仓库其它部分的关系

- 判定逻辑与边界同时写在 `skills/personal-dev-workflow/SKILL.md`
  §"Enforcement surface & fail-open/closed boundaries" 与两份 `references/production-control.md` §10，
  三处口径必须一致；改本插件的判定就同步改它们。
- controller 本体是 `tools/runstate.js`（`gate` 子命令输出那行 JSON），测试是 `node tools/run-tests.mjs`。

## License

MIT.
