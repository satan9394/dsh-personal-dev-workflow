# 状态模型

机器真相源：`.agent-state/run-state.json`。

核心字段：

```json
{
  "schemaVersion": 1,
  "mode": "bounded",
  "mission": {
    "goal": "...",
    "definitionOfDone": ["..."],
    "outOfScope": [],
    "status": "active"
  },
  "workset": [],
  "blocked": [],
  "deferredBacklog": [],
  "budget": {
    "run": {
      "epoch": {"used": 0, "limit": 2},
      "cards": {"used": 0, "limit": 6},
      "repairs": {"used": 0, "limit": 1},
      "workersSpawned": {"used": 0, "limit": 8},
      "research": {"used": 0, "limit": 1}
    },
    "mission": {
      "runs": {"used": 1, "limit": 3},
      "cards": {"used": 0, "limit": 12},
      "repairs": {"used": 0, "limit": 3}
    },
    "worksetLimit": 8,
    "activeWorkerLimit": 3,
    "maxSubagentDepth": 1
  },
  "workers": {"active": 0},
  "lastVerifiedCommit": null,
  "resumeFrom": null
}
```

`RUN_STATE.md` 由脚本自动渲染，供人查看。不要手改 Markdown 期待改变预算。

## Counter 与 Gauge

- counter：cards、repairs、workersSpawned、research；只增不减（new-run reset Run 级）。
- gauge：workers.active；Worker 开始 +1，结束 -1。
- derived：workset size = `workset.length`，不要再维护一个容易漂移的“WorkSet 规模计数器”。

## 一致性

每次状态写入使用临时文件 + rename，避免进程中断留下半截 JSON。`check` 会拒绝非法类型、超限、active worker 为负等状态。
