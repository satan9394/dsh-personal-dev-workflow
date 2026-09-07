/* ============================================================
 * main.js — 渲染 + 动画 + 交互（零依赖，可 file:// 直接打开）
 * ============================================================ */
(function () {
  "use strict";

  var D = window.DATA;
  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 小工具 ---------- */
  function el(tag, attrs, parent) {
    var n = document.createElementNS ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function html(tag, cls, text, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  /* ============================================================
   * 1) HERO Canvas：总指挥星座（conductor + orbiting workers）
   * ============================================================ */
  var hero = (function () {
    var canvas = document.getElementById("heroCanvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var workers = [];
    var workerNames = ["Claude Code", "Codex", "Gemini CLI", "Jules", "Symphony Worker", "DSH Subagent", "Copilot", "Meta AI", "Qwen", "Ralph"];
    var N = workerNames.length;
    var stars = [];
    var t = 0;

    function resize() {
      var r = canvas.parentElement.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      workers = [];
      for (var i = 0; i < N; i++) {
        workers.push({
          name: workerNames[i],
          radius: 130 + ((i * 47) % 130),
          speed: 0.12 + ((i * 13) % 10) / 55,
          phase: (i / N) * Math.PI * 2,
          color: pickWorkerColor(i)
        });
      }
      stars = [];
      for (var s = 0; s < 90; s++) {
        stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + 0.3, tw: Math.random() * Math.PI * 2 });
      }
    }

    function pickWorkerColor(i) {
      var palette = ["#38bdf8", "#34d399", "#a78bfa", "#f472b6", "#fbbf24"];
      return palette[i % palette.length];
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      var cx = W / 2, cy = H / 2;

      // 背景星点
      for (var s = 0; s < stars.length; s++) {
        var st = stars[s];
        var a = 0.12 + 0.38 * Math.abs(Math.sin(t * 0.8 + st.tw));
        ctx.globalAlpha = a;
        ctx.fillStyle = "#334155";
        ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 轨道圈
      ctx.strokeStyle = "rgba(100,116,139,0.20)";
      ctx.lineWidth = 1;
      for (var ring = 1; ring <= 3; ring++) {
        ctx.beginPath(); ctx.arc(cx, cy, 90 + ring * 62, 0, Math.PI * 2); ctx.stroke();
      }

      // 连线 + Worker
      for (var i = 0; i < workers.length; i++) {
        var w = workers[i];
        var x = cx + Math.cos(t * w.speed + w.phase) * w.radius;
        var y = cy + Math.sin(t * w.speed + w.phase) * w.radius * 0.72;

        // 连接线（脉冲透明度）
        var pulse = 0.16 + 0.12 * Math.sin(t * 1.5 + i);
        ctx.strokeStyle = w.color;
        ctx.globalAlpha = pulse;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
        ctx.globalAlpha = 1;

        // Worker 节点
        var glow = ctx.createRadialGradient(x, y, 0, x, y, 16);
        glow.addColorStop(0, w.color); glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = w.color;
        ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2); ctx.fill();

        // 标签
        ctx.font = "600 11px " + getFont();
        ctx.fillStyle = "rgba(15,23,42,0.72)";
        ctx.textAlign = "center";
        ctx.fillText(w.name, x, y + 22);
      }

      // 中心：总指挥
      var cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 54);
      cg.addColorStop(0, "rgba(167,139,250,0.9)");
      cg.addColorStop(0.45, "rgba(56,189,248,0.55)");
      cg.addColorStop(1, "rgba(56,189,248,0)");
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(cx, cy, 54, 0, Math.PI * 2); ctx.fill();

      var br = 10 + 4 * Math.sin(t * 1.2);
      ctx.strokeStyle = "rgba(167,139,250,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 15 + br * 0.35, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(cx, cy, 15 + br, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#0f172a";
      ctx.font = "800 15px " + getFont();
      ctx.textAlign = "center";
      ctx.fillText("总指挥", cx, cy + 22);
      ctx.font = "600 10px " + getFont();
      ctx.fillStyle = "rgba(15,23,42,0.65)";
      ctx.fillText("Conductor", cx, cy + 36);
    }

    function getFont() {
      return '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';
    }

    function loop() {
      t += 0.016;
      draw();
      requestAnimationFrame(loop);
    }

    window.addEventListener("resize", resize);
    resize();
    if (REDUCED) { draw(); } else { loop(); }
  })();

  /* ============================================================
   * 2) 通用渲染：进场动画
   * ============================================================ */
  function initReveal(root) {
    var items = (root || document).querySelectorAll(".reveal-target");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); }
      });
    }, { threshold: 0.08 });
    items.forEach(function (n) { io.observe(n); });
  }
  function revealable(node) {
    if (!node) return;
    node.classList.add("reveal-target");
  }

  /* ============================================================
   * 3) SVG 流程图渲染器（分层布局 + 动画连线）
   * ============================================================ */
  var FLOW_COLORS = {
    people: "#38bdf8",
    conductor: "#a78bfa",
    worker: "#34d399",
    memory: "#f472b6",
    verify: "#fbbf24",
    generic: "#7d8db1"
  };
  function nodeKind(label) {
    if (/验收|人|项目经理|需求|看板/.test(label)) return "people";
    if (/指挥|Conductor|调度/.test(label)) return "conductor";
    if (/Worker|Claude|Codex|助手|Jules|Gemini/.test(label)) return "worker";
    if (/记忆|CLAUDE|任务卡|笔记|AGENTS/.test(label)) return "memory";
    if (/验证|证明|CI|Review|自测|测试/.test(label)) return "verify";
    return "generic";
  }
  function renderFlow(container, flow, opts) {
    opts = opts || {};
    var NS = "http://www.w3.org/2000/svg";
    var nodes = flow.nodes, edges = flow.edges, active = flow.active || [];
    var n = nodes.length;

    // BFS 分层
    var layer = new Array(n).fill(-1);
    layer[0] = 0;
    var queue = [0];
    while (queue.length) {
      var cur = queue.shift();
      edges.forEach(function (e) {
        [e[0], e[1]].forEach(function (nd, idx) {
          var other = e[1 - idx];
          if (nd === cur && layer[other] === -1) { layer[other] = layer[cur] + 1; queue.push(other); }
        });
      });
    }
    for (var i = 0; i < n; i++) if (layer[i] === -1) layer[i] = 0;

    var maxLayer = Math.max.apply(null, layer);
    var layers = [];
    for (var L = 0; L <= maxLayer; L++) layers.push([]);
    for (var j = 0; j < n; j++) layers[layer[j]].push(j);

    var W = opts.width || 520;
    var NODE_H = 46;
    var colGap = Math.max(150, (W - 60) / Math.max(maxLayer, 1));
    var rowGap = 92;
    var H = Math.max(layers.reduce(function (m, arr) { return Math.max(m, arr.length * rowGap + 60); }, 0), 220);

    var pos = {};
    layers.forEach(function (arr, li) {
      var total = arr.length * rowGap;
      var startY = (H - total) / 2 + 30;
      arr.forEach(function (nodeId, ri) {
        var label = nodes[nodeId];
        var kind = nodeKind(label);
        var color = FLOW_COLORS[kind];
        var tw = Math.max(90, Math.min(190, label.length * 12.5 + 26));
        pos[nodeId] = { x: 40 + li * colGap, y: startY + ri * rowGap, w: tw, h: NODE_H, color: color, kind: kind };
      });
    });

    // 高度校正（右列可能超宽）
    var rightMax = 0;
    for (var p in pos) rightMax = Math.max(rightMax, pos[p].x + pos[p].w);
    W = Math.max(W, rightMax + 40);
    if (opts.width && W > opts.width) W = rightMax + 30;

    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: "100%" });
    container.innerHTML = "";
    container.appendChild(svg);

    var uid = "m" + Math.random().toString(36).slice(2, 8);
    var defs = el("defs", null, svg);
    var marker = el("marker", { id: "arr-" + uid, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
    el("path", { d: "M0,0 L10,5 L0,10 z", fill: "#94a3b8" }, marker);

    // 边
    edges.forEach(function (e) {
      var a = pos[e[0]], b = pos[e[1]];
      var x1 = a.x + a.w, y1 = a.y + a.h / 2;
      var x2 = b.x, y2 = b.y + b.h / 2;
      if (e[1] === 0) { x1 = a.x; x2 = b.x + b.w; }
      var mx = (x1 + x2) / 2;
      var d = "M" + x1 + "," + y1 + " C" + mx + "," + y1 + " " + mx + "," + y2 + " " + x2 + "," + y2;
      el("path", { d: d, fill: "none", stroke: "#94a3b8", "stroke-width": 1.6, class: "flow-edge", "marker-end": "url(#arr-" + uid + ")" }, svg);
    });

    // 节点
    for (var q = 0; q < n; q++) {
      var nd = pos[q];
      var g = el("g", { class: "flow-node" }, svg);
      var isActive = active.indexOf(q) !== -1;
      var g2 = el("g", isActive ? { class: "node-pulse" } : {}, g);
      el("rect", { x: nd.x, y: nd.y, width: nd.w, height: nd.h, rx: 12, fill: "rgba(15,23,42,0.05)", stroke: nd.color, "stroke-width": 1.4 }, g2);
      el("text", { x: nd.x + nd.w / 2, y: nd.y + nd.h / 2 + 4.5, "font-size": 12.5, fill: "#0f172a" }, g2).textContent = nodes[q];
      if (isActive) {
        el("rect", { x: nd.x - 3, y: nd.y - 3, width: nd.w + 6, height: nd.h + 6, rx: 14, fill: "none", stroke: nd.color, "stroke-width": 1.2, "stroke-opacity": 0.5 }, g);
      }
    }
    return svg;
  }

  /* ============================================================
   * 4) KPI 速览
   * ============================================================ */
  (function renderKpis() {
    var grid = document.getElementById("kpiGrid");
    D.kpis.forEach(function (k, i) {
      var card = html("div", "kpi reveal-target", null, grid);
      html("div", "kpi-num", k.num, card);
      html("div", "kpi-label", k.label, card);
      html("div", "kpi-src", "来源：" + k.src, card);
    });
  })();

  /* ============================================================
   * 5) 公司 Tab + 面板
   * ============================================================ */
  var companyPanel = document.getElementById("companyPanel");

  function renderCompany(key) {
    var c = D.companies[key];
    companyPanel.innerHTML = "";
    companyPanel.style.animation = "none";
    void companyPanel.offsetWidth;
    companyPanel.style.animation = "";

    var head = html("div", "cp-head", null, companyPanel);
    html("h3", null, c.name, head);
    html("span", "cp-tagline", c.tagline, head);
    html("p", "cp-verdict", c.verdict, companyPanel);

    var body = html("div", "cp-body", null, companyPanel);
    var pts = html("div", "cp-points", null, body);
    c.points.forEach(function (p) {
      var card = html("div", "cp-point", null, pts);
      html("div", "pp-title", null, card).innerHTML = '<span class="tag">▸</span>' + p.title;
      html("div", "pp-desc", p.desc, card);
    });

    var flowBox = html("div", "cp-flow", null, body);
    html("div", "cp-flow-title", c.flow.title, flowBox);
    renderFlow(flowBox, c.flow);
  }

  (function renderCompanyTabs() {
    var wrap = document.getElementById("companyTabs");
    D.companyOrder.forEach(function (key) {
      var c = D.companies[key];
      var b = html("button", "tab", c.name, wrap);
      b.addEventListener("click", function () {
        wrap.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        renderCompany(key);
      });
      if (key === D.companyOrder[0]) { b.classList.add("active"); renderCompany(key); }
    });
  })();

  /* ============================================================
   * 6) 记忆策略三代演进
   * ============================================================ */
  (function renderMemory() {
    var wrap = document.getElementById("memoryStages");
    D.memoryStages.forEach(function (s) {
      var card = html("div", "mstage " + s.cls + " reveal-target", null, wrap);
      html("span", "ms-num", s.num, card);
      html("h3", null, s.title, card);
      html("p", null, s.body, card);
      var verdict = s.verdict[0] === "good" ? "ms-good" : "ms-bad";
      html("p", verdict, "→ " + s.verdict[1], card);
    });
  })();

  /* ============================================================
   * 7) 共同模式：SVG 图 + 卡片
   * ============================================================ */
  (function renderPattern() {
    var wrap = document.getElementById("patternVis");
    renderFlow(wrap, D.pattern, { width: 520 });
    var cards = document.getElementById("patternCards");
    D.pattern.cards.forEach(function (c) {
      var card = html("div", "pcard reveal-target", null, cards);
      html("div", "pc-icon", c.icon, card);
      var inner = html("div", null, null, card);
      html("div", "pc-title", c.title, inner);
      html("div", "pc-desc", c.desc, inner);
    });
  })();

  (function renderCompare() {
    var wrap = document.getElementById("compareWrap");
    var c = D.compare;
    var box = html("div", "compare reveal-target", null, wrap);
    html("h3", "compare-title", c.title, box);
    var table = html("div", "compare-table", null, box);
    var head = html("div", "compare-row compare-head", null, table);
    html("div", "compare-dim", "环节", head);
    html("div", null, "你的旧流程（手动）", head);
    html("div", null, "OpenAI Symphony", head);
    html("div", null, "DSH 子代理（原生）", head);
    c.rows.forEach(function (r) {
      var row = html("div", "compare-row", null, table);
      html("div", "compare-dim", r.dim, row);
      html("div", "compare-cell old", r.old, row);
      html("div", "compare-cell", r.sym, row);
      html("div", "compare-cell dsh", r.dsh, row);
    });
  })();

  (function renderTrends() {
    var wrap = document.getElementById("trends");
    if (!D.trends) return;
    D.trends.forEach(function (tr) {
      var card = html("div", "trend reveal-target", null, wrap);
      html("span", "tr-tag", tr.tag, card);
      var inner = html("div", null, null, card);
      html("div", "tr-title", tr.title, inner);
      html("div", "tr-desc", tr.desc, inner);
    });
  })();

  /* ============================================================
   * 8) 诊断 + Playbook + 结语
   * ============================================================ */
  (function renderDiagnosis() {
    var wrap = document.getElementById("diagnosis");
    D.diagnosis.forEach(function (d) {
      var card = html("div", "diag reveal-target", null, wrap);
      html("h4", null, d.title, card);
      html("p", null, d.desc, card);
    });
  })();

  (function renderPlaybook() {
    var wrap = document.getElementById("playbookSteps");
    D.playbook.forEach(function (s, i) {
      var step = html("div", "pstep reveal-target", null, wrap);
      html("div", "ps-num", String(i + 1), step);
      var inner = html("div", null, null, step);
      html("div", "ps-title", s.title, inner);
      html("div", "ps-desc", s.desc, inner);
      html("div", "ps-how", "💡 " + s.how, inner);
    });
    document.getElementById("closeText").textContent = D.closeText;
  })();

  /* ============================================================
   * 9) 资料来源
   * ============================================================ */
  (function renderSources() {
    var ul = document.getElementById("sourceList");
    D.sources.forEach(function (s) {
      var li = html("li", null, null, ul);
      html("span", "src-tag", s.tag, li);
      var a = html("a", null, s.label, li);
      a.href = s.url; a.target = "_blank"; a.rel = "noopener";
      html("div", null, s.url, li).style.cssText = "font-size:12px;color:#5b6b8f;word-break:break-all;";
    });
  })();

  /* ============================================================
   * 10) 进场动画初始化
   * ============================================================ */
  initReveal();
})();
