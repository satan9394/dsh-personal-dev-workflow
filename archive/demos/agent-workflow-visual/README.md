# 顶级 AI 公司内部如何用 Agent 开发生产级软件（可视化调研）

基于公开资料 + DeepSeek Harness 源码核实的调研，输出为一个**零依赖、纯静态、可离线打开**的交互可视化页面（浅色主题）。

## 打开方式

直接用浏览器打开 `index.html` 即可（无需服务器、无需联网、无需构建）：

```
agent-workflow-visual/index.html
```

## 文件结构

| 文件 | 作用 |
|---|---|
| `index.html` | 页面骨架（章节结构 + SVG/Canvas 容器） |
| `css/styles.css` | 主题 tokens + 全部样式（浅色主题，token 驱动） |
| `js/data.js` | **全部内容数据**（公司要点、流程、记忆演进、对比表、Playbook、来源） |
| `js/main.js` | 渲染 + 动画 + 交互（Hero 星座 Canvas、SVG 流程动画、Tab、滚动进场） |

想改内容：只编辑 `js/data.js`，不用碰渲染逻辑。

## 页面章节

1. Hero — 总指挥星座动画（Canvas）：一个 Conductor + N 个 Worker 环绕
2. 速览 — 六个最硬的公开信号（≈100% 新代码 / Google 25%→75% / Meta 55%·80% / 10–15 并行实例 / 验证提升 2–3× / Symphony +500% PR）
3. 逐家拆解 — Anthropic / OpenAI / Google / Meta / GitHub·微软 五个 Tab，每家要点 + SVG 流程动画
4. 记忆策略 — 上下文记忆三代演进（有损压缩 → 硬切窗口+外部记忆 → 文件即记忆）
5. 共同模式 — 全公司统一拓扑的 SVG 流程图 + 四张说明卡 + 行业趋势信号（Uber/Datadog/Cursor）
6. 落地 — 你的处境诊断 + 三种落地方式对比表 + 5 步 Playbook + 一句话总结
7. 附录 — 全部资料来源链接（25+ 条）

## 技术说明

- 零外部依赖（无 CDN），`file://` 直接打开可用
- 动画：Canvas 星座（requestAnimationFrame）+ SVG 描边流动（CSS dashoffset）+ 滚动进场（IntersectionObserver）
- 尊重 `prefers-reduced-motion`：系统开启减弱动态时自动降级为静态帧
- 中文字体栈：PingFang SC / Microsoft YaHei / Noto Sans SC

## 待办

- [x] 后台调研子代理返回后，把 Google / Meta 章节的 [调研中] 占位替换为带引用的真实内容
- [x] 新增 GitHub / 微软公司页（@Copilot 活跃贡献者 + 微软吊销 Claude Code 许可）
- [x] 按用户要求由深色主题改为浅色主题
