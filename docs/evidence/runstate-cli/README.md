# runstate — 零依赖 RUN_STATE.md 状态机 CLI

`runstate` 把「本轮跑到哪了」变成一个**可机械校验**的文件：用 `RUN_STATE.md` 记录 Mission、
完成标准与预算计数器，CLI 负责**创建 / 校验 / 推进**，并对预算做**硬性拦截**。
零依赖（只用 `node:` 内置模块），单文件入口 `runstate.js`，需要 Node ≥18。
项目本地约定见 `AGENTS.md`。

## 用法

```
node runstate.js --help
node runstate.js init <dir>
node runstate.js check <dir>
node runstate.js advance <dir> <field>
```

| 入口 | 行为 |
|---|---|
| `--help`（或 `-h` / `help` / 无参数） | 打印全部子命令、字段别名与退出码约定。**不读不写任何文件**，始终退出 0。 |
| `init <dir>` | 在 `<dir>` 生成 `RUN_STATE.md` 骨架（目录不存在则递归创建）。含 Mission / Definition of Done / Out of scope / Mode / Active Workset / Blocked / Deferred Backlog / Budget / Last verified commit / Resume From / Notes for the next run 共 11 节。**目标文件已存在则覆盖**（并在 stderr 提示），不备份、不合并。 |
| `check <dir>` | 只读校验：必需节 Mission / Definition of Done / Active Workset / Budget / Resume From 是否齐全，然后汇总 Budget 计数行，并执行预算门禁。 |
| `advance <dir> <field>` | 把 Budget 中某个计数器 +1 并写回。先校验后落盘，越界则拒绝。 |

### advance 的字段

`<field>` 是**大小写不敏感**的别名，映射到 Budget 节里的行标签：

| 别名 | Budget 行标签 | 含义 |
|---|---|---|
| `epoch` | `Epoch` | 已用轮次（当前 / 上限） |
| `cards` | `完成卡数` | 本轮完成的任务卡数（当前 / 上限） |
| `repairs` | `已用 Repair` | 已消耗的返工额度（当前 / 上限） |
| `subagents` | `已派子代理` | 已派出的隔离执行器数（**模板中无上限，可无限递增**） |

写回时**沿用文件里原本的标签写法**，别名只做入口糖。`init` 的默认骨架为
`Epoch: 0 / 3`、`完成卡数: 0 / 6`、`已用 Repair: 0 / 1`、`已派子代理: 0`；
这些**只是模板默认值**，按任务实际需要直接改文件里的数字即可。

## 退出码

| 码 | 含义 | 典型触发 |
|---|---|---|
| `0` | 成功 | 帮助、骨架写出、校验通过、计数成功 +1 |
| `1` | **状态 / 校验错误** | `RUN_STATE.md` 不存在或不可读、必需节缺失、Budget 无可用计数行、`advance` 的字段在文件中不存在、**预算越界被拒**、`check` 时某计数器已达上限 |
| `2` | **用法错误** | 未知子命令、缺参数（如 `advance <dir>` 漏字段）、`advance` 字段别名不在上表内 |

失败一律**非零退出**，并往 stderr 打印 `runstate: 错误: …` 说明原因；成功信息走 stdout。

## 预算守卫（Budget Guard）与原子性

守则是：**宁可拒绝，也不越界；拒绝时绝不留下半成品。**

- `advance` 先做完全部校验与预算判断，只有确定可以写入时才落盘。
  若 `当前 + 1 > 上限`，直接拒绝并以 `1` 退出，同时明确打印「文件未做任何修改」。
- 因此所有拒绝路径下，`RUN_STATE.md` **字节级零改动**（可用哈希前后比对证明，
  这也是本卡的验收方式之一）。
- 无上限的计数器（如模板里的 `已派子代理`，写成 `0` 而非 `0 / N`）只递增不拦截。
- `check` 是独立的**门禁**：只要有任一有限额计数器达到上限（`当前 >= 上限`）就判定失败并点名
  该计数器。也就是说预算耗尽后 `check` 也会挡住你 —— 想继续就得显式提高上限或开新 Epoch，
  而不是悄悄多跑一格。

## 上手示例

```bash
T=$(mktemp -d)                       # 或者任意临时目录
node runstate.js init  "$T"          # 生成骨架          → exit 0
node runstate.js advance "$T" cards  # 完成卡数 0 → 1     → exit 0
node runstate.js advance "$T" cards  # 完成卡数 1 → 2     → exit 0
node runstate.js check "$T"          # 汇总预算，仍在限额内 → exit 0
```

输出片段：

```
已写入 /tmp/xxx/RUN_STATE.md
包含节: Mission / Definition of Done / Out of scope / …
字段 cards → 完成卡数
已推进 完成卡数: 0 → 1 / 6
检查 /tmp/xxx/RUN_STATE.md
Budget 汇总:
  - Epoch: 0 / 3
  - 完成卡数: 2 / 6
检查结果: 通过（4 条预算计数行，均在限额内）
```

推到上限后再来一次，就会被守卫拦下：

```
$ node runstate.js advance "$T" cards     # 假设已是 6 / 6
runstate: 错误: 预算守卫拒绝递增：完成卡数 已达上限 6 / 6（再 +1 会变成 7 / 6）
文件未做任何修改。
$ echo $?
1
```

`check` 在此时同样以 `1` 退出：

```
runstate: 错误: 预算已达上限: 完成卡数 6 / 6
检查结果: 失败（预算已达上限: 完成卡数 6 / 6）
```

## 已知限制

- **非法计数行会报错并指出行号**（T004 起；此前是静默跳过）：`check` / `advance` 遇到
  `- 完成卡数: abc / 2` 这类写法即非零退出，并在 stderr 打印 `Budget 第 N 行格式非法: "原行内容"`。
  计数行须形如 `- 标签: 当前整数 / 上限整数`：只有 **ASCII `/`** 表示上限（全角 `／` 判为格式非法），
  且上限两侧必须都是整数（`1 / xyz`、`1 /` 同样直接失败）。写数字时务必写成整数。
  代价是 Budget 节内任何「标签: 值」行都会被当作计数行，散文行（如 `- 备注: 见文档`）会让 `check` 失败 ——
  这是有意收紧（宁可失败出声，不可静默跳过）。
- **缺冒号的笔误**（如 `- 完成卡数 3 / 2`）目前仍不被识别为计数行：`check` 会放行，`advance` 会以 `1` 退出且不写文件。
  该项**仍在 Deferred Backlog**，本轮未修。
- `advance` 没有 `--dry-run`；预演只能靠复制临时目录（仍在 backlog）。
- 仅识别 `##` 二级标题节，且节名匹配不区分大小写、忽略标题括号后缀。
- 自动化测试只有 `tests/run-tests.mjs` 这一条黑盒冒烟，覆盖 init / check / advance / 越界原子性 / 非法行 / `--help` / 未知子命令；
  没有单元测试、没有覆盖率统计。
