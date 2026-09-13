/**
 * n3-budget-gate.mjs — DSH host 级预算闸门（tools/pre-execute）
 * ============================================================================
 * 作用：把「派活前先查预算」从 agent 纪律升级为 harness 级拦截。
 * 形态：挂在官方可注册的 `tools/pre-execute` 瀑布上，对**派活类**工具调用
 *       （subagent / subagent_fork / workflow / ralph）在派发前委托外部 controller
 *       `node <controller> gate <项目根>`，按 stdout 的 JSON 判定 allow / deny。
 *
 * 判定策略（6 条，逐条对应任务卡 N3）：
 *   1. 项目根没有 RUN_STATE.md（未管理项目）→ **放行**（+ 一次性提示）。
 *      这条是防锁死的关键：绝大多数目录没有状态文件。
 *   2. 有 RUN_STATE.md，controller 输出合法 JSON {"allow":true} → 放行。
 *   3. 有 RUN_STATE.md，controller 输出合法 JSON {"allow":false} → 拒绝，
 *      reason 用 controller 的原文（含触顶计数器与当前值）。
 *   4. 有 RUN_STATE.md，但 controller 崩溃 / 非 JSON / 超时 / 脚本不存在 →
 *      **拒绝（fail-closed）**，理由写明「controller 异常，请修状态文件或删除它」。
 *      **只对已管理项目 fail-closed**，未管理项目永不因此被拒。
 *   5. 工具白名单：只门禁派活类；**绝不含 pwsh / bash / read / write 等**，
 *      保证预算触顶后 agent 仍能跑 shell 自救（否则永久锁死）。
 *   6. 性能：单次判定 < 200ms 目标；同项目根 1.5s TTL 缓存 + 并发合并（in-flight）。
 *
 * 另外三条安全设计（不属于 6 条策略，但同等重要）：
 *   - 插件自身内部错误（bug / fs 异常）→ 一律放行（fail-open）。controller 异常
 *     才 fail-closed；不能让本插件的一个 TypeError 把整个 harness 锁死。
 *   - 项目根判定是**精确根**（不向上遍历），避免把子目录误判成"已管理"而 fail-closed。
 *   - 项目根来源：config.projectRoot > exec.agent.session.header.cwd > process.cwd()。
 *
 * 安装：本文件放在 `~/.dsh/profiles/web/n3-budget-gate.mjs`，
 *       cordis.patch.yml 里 `name: './n3-budget-gate.mjs'`（零 pnpm 安装；
 *       parsePatchList 的 anchorInsertedPluginNames 会锚成 patch 旁的 file:// URL）。
 *
 *       为什么是 `.mjs` 而不是任务卡举例的 `.js`（已实测，勿照抄错误结论）：
 *       profile 根目录的 package.json 没有 `"type":"module"`，所以 `.js` 的模块类型
 *       未定义。Node 24（本机 v24.14.0）会**回退重解析**为 ES module 并打印
 *       `MODULE_TYPELESS_PACKAGE_JSON` 警告 —— 实测 `./n3-budget-gate.js` 能加载成功，
 *       代价是每次启动一条警告 + 一次重解析开销；而在没有该回退能力的旧 Node 上，
 *       同样的 `.js` 会因 `export` 语法报错而加载失败。`.mjs` 两处都干净：
 *       永远是 ESM，无警告、无重解析、与 Node 版本无关。
 *
 * 依赖：零 npm 依赖，只用 node: 内置模块；不联网。
 */

import { execFile } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'

export const name = 'n3-budget-gate'

/** 默认配置（patch 里的 config 可覆盖任意字段）。 */
const DEFAULTS = {
  /** 策略 5：只门禁派活类工具 —— 绝不要加 pwsh / bash / read / write */
  tools: ['subagent', 'subagent_fork', 'workflow', 'ralph'],
  /** 项目根的状态文件（存在 = 已管理项目） */
  stateFile: 'RUN_STATE.md',
  /** 显式项目根；null = 从 exec.agent.session.header.cwd 推断，再退回 process.cwd() */
  projectRoot: null,
  /** 固定 controller 路径，供 {controller} 占位使用 */
  controller: null,
  /**
   * controller 候选路径（按顺序取第一个存在的）。
   * 支持占位：{root} = 项目根，{controller} = config.controller。
   */
  controllerCandidates: ['{root}/tools/runstate.js', '{controller}'],
  /** controller 可执行文件；默认当前 harness 自己的 node，最稳 */
  gateBin: process.execPath,
  /** gate 子命令名 */
  gateSubcommand: 'gate',
  /** 单次判定超时（ms） */
  timeoutMs: 8000,
  /** 同项目根判定缓存 TTL（ms）—— 1~2s，不要更长（预算会变） */
  cacheTtlMs: 1500,
  /** 审计 JSONL（null = 不写） */
  auditFile: null,
  /** 拒绝理由前缀 */
  denyPrefix: '预算闸门',
  /** 未管理项目是否打一次性提示（stderr + 审计） */
  notifyUnmanaged: true,
}

/** 确保目录存在（用于审计文件）。 */
function ensureDirFor(file) {
  try {
    mkdirSync(dirname(file), { recursive: true })
  } catch {
    /* ignore */
  }
}

/** 占位符展开。 */
function expand(template, root, controller) {
  return String(template).replaceAll('{root}', root).replaceAll('{controller}', controller ?? '')
}

/** 在候选列表里挑第一个真实存在的 controller 脚本。 */
function pickController(candidates, root, controller) {
  for (const raw of candidates) {
    if (typeof raw !== 'string' || raw.trim() === '') continue
    const p = expand(raw, root, controller).trim()
    if (p === '') continue
    try {
      if (existsSync(p)) return p
    } catch {
      /* ignore */
    }
  }
  return null
}

/**
 * 跑 controller。**永不 reject**：所有失败都降级为可判定的返回值。
 * @returns {Promise<{exitCode:number|null, spawnFailed:boolean, timedOut:boolean, aborted:boolean, stdout:string, stderr:string, message:string, durationMs:number}>}
 */
function runGateCommand({ bin, args, timeoutMs, signal }) {
  const started = Date.now()
  return new Promise((done) => {
    const finish = (payload) => done({ ...payload, durationMs: Date.now() - started })
    let child
    try {
      child = execFile(
        bin,
        args,
        { timeout: timeoutMs, windowsHide: true, maxBuffer: 1 << 20, signal },
        (error, stdout, stderr) => {
          const out = String(stdout ?? '')
          const err = String(stderr ?? '')
          if (error === undefined || error === null) {
            finish({ exitCode: 0, spawnFailed: false, timedOut: false, aborted: false, stdout: out, stderr: err, message: '' })
            return
          }
          const numeric = typeof error.code === 'number'
          finish({
            exitCode: numeric ? error.code : null,
            spawnFailed: !numeric,
            timedOut: error.killed === true,
            aborted: error.name === 'AbortError',
            stdout: out,
            stderr: err,
            message: String(error.message ?? ''),
          })
        },
      )
    } catch (error) {
      // execFile 同步抛出（如 bin 不存在）也走 spawnFailed 分支
      finish({
        exitCode: null,
        spawnFailed: true,
        timedOut: false,
        aborted: false,
        stdout: '',
        stderr: '',
        message: String(error?.message ?? error),
      })
      return
    }
    void child
  })
}

/**
 * 解析 controller 的 stdout。契约：stdout 恒为一行合法 JSON。
 * 容错：允许 JSON 前后有杂音，取第一个以 `{` 开头的可解析行。
 * @returns 解析出的对象；非 JSON / 空 / allow 非布尔 → undefined
 */
function parseGateStdout(stdout) {
  const text = String(stdout ?? '').trim()
  if (!text) return undefined
  const lines = text.split(/\r?\n/)
  const candidates = [lines.find((l) => l.trim().startsWith('{')), ...lines.filter((l) => l.trim().startsWith('{')), text]
  for (const line of candidates) {
    if (typeof line !== 'string' || line.trim() === '') continue
    try {
      const parsed = JSON.parse(line.trim())
      if (parsed && typeof parsed === 'object' && typeof parsed.allow === 'boolean') return parsed
    } catch {
      /* try next */
    }
  }
  return undefined
}

export function apply(ctx, config = {}) {
  const cfg = { ...DEFAULTS, ...(config ?? {}) }
  const toolSet = new Set(Array.isArray(cfg.tools) ? cfg.tools.map(String) : [])
  const cache = new Map() // root -> { at:number, decision }
  const inflight = new Map() // root -> Promise<decision>
  const notified = new Set() // 一次性提示去重

  if (cfg.auditFile) ensureDirFor(cfg.auditFile)

  /** 审计：**绝不影响判定**（写失败静默吞掉）。 */
  const audit = (record) => {
    if (!cfg.auditFile) return
    try {
      appendFileSync(cfg.auditFile, JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n', 'utf8')
    } catch {
      /* ignore */
    }
  }

  /** 项目根：config 显式 > agent 会话 cwd > 进程 cwd。 */
  const resolveRoot = (exec) => {
    if (typeof cfg.projectRoot === 'string' && cfg.projectRoot.trim() !== '') return resolvePath(cfg.projectRoot)
    const cwd = exec?.agent?.session?.header?.cwd
    if (typeof cwd === 'string' && cwd.trim() !== '') return resolvePath(cwd)
    return process.cwd()
  }

  /** 一次性提示（未管理项目）。 */
  const noticeOnce = (root, record) => {
    if (!cfg.notifyUnmanaged) return
    if (notified.has(root)) return
    notified.add(root)
    audit({ ...record, oneTimeNotice: true })
    try {
      process.stderr.write(`[n3-budget-gate] 未管理项目（该目录无 ${cfg.stateFile}）→ 放行：${root}\n`)
    } catch {
      /* ignore */
    }
  }

  /** 真正跑一次 controller 并给出判定。 */
  const runDecision = async (root, stateFile, exec) => {
    const args = [null, cfg.gateSubcommand, root] // [null] 占位，稍后填 script
    const script = pickController(cfg.controllerCandidates, root, cfg.controller)
    const base = {
      tool: exec?.name,
      event: 'pre-execute',
      root,
      stateFile,
      controller: script,
      gateBin: cfg.gateBin,
    }

    // 策略 4 的「controller 不存在」分支：已管理项目 → fail-closed
    if (script === null) {
      const why = `找不到 controller 脚本（候选：${cfg.controllerCandidates.map((c) => expand(c, root, cfg.controller)).join(' | ')}）`
      const reason = `${cfg.denyPrefix}: controller 异常：${why}；请修状态文件（${stateFile}）或删除它`
      audit({ ...base, exitCode: null, anomaly: 'controller-missing', decision: 'deny', reason })
      return { allow: false, reason, source: 'controller-missing', durationMs: 0, exitCode: null }
    }

    args[0] = script
    if (exec?.signal?.aborted === true) {
      audit({ ...base, exitCode: null, anomaly: 'aborted', decision: 'allow', reason: '调用已被取消，跳过门禁' })
      return { allow: true, reason: 'aborted', source: 'aborted', durationMs: 0, exitCode: null }
    }

    const r = await runGateCommand({ bin: cfg.gateBin, args, timeoutMs: cfg.timeoutMs, signal: exec?.signal })
    const parsed = parseGateStdout(r.stdout)
    const record = {
      ...base,
      args,
      exitCode: r.exitCode,
      spawnFailed: r.spawnFailed,
      timedOut: r.timedOut,
      aborted: r.aborted,
      durationMs: r.durationMs,
      gateJson: parsed ?? null,
    }

    // 策略 2 / 3：JSON 是唯一权威
    if (parsed !== undefined) {
      if (parsed.allow === true) {
        audit({ ...record, decision: 'allow', reason: 'controller 允许', exitCodeMatches: r.exitCode === 0 })
        return { allow: true, reason: 'json-allow', source: 'json-allow', durationMs: r.durationMs, exitCode: r.exitCode }
      }
      const text = typeof parsed.reason === 'string' && parsed.reason.trim() !== ''
        ? parsed.reason
        : `controller 拒绝（退出码 ${r.exitCode}）`
      const reason = `${cfg.denyPrefix}: ${text}`
      audit({ ...record, decision: 'deny', reason, exitCodeMatches: r.exitCode === 1 })
      return { allow: false, reason, source: 'json-deny', durationMs: r.durationMs, exitCode: r.exitCode }
    }

    // 策略 4：无合法 JSON = controller 异常 → 已管理项目 fail-closed
    // 注意分类顺序：execFile 在超时/中止时 error.code 不是数字，会被误判为 spawnFailed，
    // 所以 timedOut / aborted 必须先判。
    const why = r.timedOut
      ? `controller 超时（>${cfg.timeoutMs}ms）`
      : r.aborted
        ? 'controller 调用被中止'
        : r.spawnFailed
          ? `controller 无法执行（${r.message || 'spawn failed'}）`
          : `controller 输出不是合法 JSON（退出码 ${r.exitCode}${r.stderr.trim() ? `，stderr: ${r.stderr.trim().slice(0, 200)}` : ''}）`
    const reason = `${cfg.denyPrefix}: controller 异常：${why}；请修状态文件（${stateFile}）或删除它`
    audit({ ...record, anomaly: 'controller-error', decision: 'deny', reason })
    return { allow: false, reason, source: 'controller-error', durationMs: r.durationMs, exitCode: r.exitCode }
  }

  /** 带 TTL 缓存 + 并发合并的判定。 */
  const decide = async (root, stateFile, exec) => {
    const now = Date.now()
    const hit = cache.get(root)
    if (hit !== undefined && now - hit.at < cfg.cacheTtlMs) {
      return { ...hit.decision, cached: true, durationMs: now - hit.at }
    }
    const running = inflight.get(root)
    if (running !== undefined) return { ...(await running), cached: 'coalesced' }
    const p = (async () => {
      try {
        return await runDecision(root, stateFile, exec)
      } finally {
        inflight.delete(root)
      }
    })()
    inflight.set(root, p)
    const decision = await p
    cache.set(root, { at: Date.now(), decision })
    return { ...decision, cached: false }
  }

  // ---- 钩子注册：tools/pre-execute 瀑布（每条分支都必须显式 return next()）----
  return ctx.on('tools/pre-execute', async (exec, next) => {
    try {
      // 策略 5：白名单外（含 pwsh / bash / read / write …）直接放行，绝不放行失败
      if (!toolSet.has(String(exec?.name ?? ''))) return next()

      const root = resolveRoot(exec)
      const statePath = resolvePath(root, String(cfg.stateFile))

      // 策略 1：未管理项目（项目根无 RUN_STATE.md）→ 放行（防锁死）
      let managed = false
      try {
        managed = existsSync(statePath)
      } catch {
        managed = false
      }
      if (!managed) {
        noticeOnce(root, { tool: exec?.name, event: 'pre-execute', root, stateFile: statePath, managed: false, decision: 'allow', reason: 'unmanaged-project（无状态文件）→ 放行' })
        return next()
      }

      const decision = await decide(root, statePath, exec)
      if (decision.allow) return next()
      return { kind: 'deny', reason: decision.reason }
    } catch (error) {
      // 插件自身内部错误 → fail-open（controller 异常才 fail-closed，见策略 4）
      audit({
        tool: exec?.name,
        event: 'pre-execute',
        internalError: String(error?.message ?? error),
        decision: 'allow',
        reason: '插件内部错误 → fail-open（不影响 harness 可用性）',
      })
      return next()
    }
  })
}
