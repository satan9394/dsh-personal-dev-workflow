/* ============================================================
 * main.js — 渲染 + 动画 + 交互（零依赖）
 * ============================================================ */
(function () {
  "use strict";

  var D = window.DATA;
  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function html(tag, cls, text, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  /* ============================================================
   * 1) HERO Canvas：任务卡生命周期六步循环
   * ============================================================ */
  (function heroLoop() {
    var canvas = document.getElementById("heroCanvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var steps = ["拆卡", "派活", "交证", "验证", "验收", "复盘"];
    var N = steps.length;
    var palette = ["#0284c7", "#7c3aed", "#059669", "#db2777", "#d97706", "#2563eb"];
    var R = 150, t = 0, hi = 0, timer = 0;
    var stars = [];

    function resize() {
      var r = canvas.parentElement.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.max(150, Math.min(W, H) * 0.30);
      stars = [];
      for (var s = 0; s < 70; s++) {
        stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.3 + 0.3, tw: Math.random() * Math.PI * 2 });
      }
    }

    function pos(i) {
      var a = -Math.PI / 2 + (i / N) * Math.PI * 2;
      return { x: W / 2 + Math.cos(a) * R, y: H / 2 + Math.sin(a) * R * 0.8 };
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      var cx = W / 2, cy = H / 2;

      // 星点
      for (var s = 0; s < stars.length; s++) {
        var st = stars[s];
        ctx.globalAlpha = 0.10 + 0.30 * Math.abs(Math.sin(t * 0.8 + st.tw));
        ctx.fillStyle = "#334155";
        ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 轨道圈（淡）
      ctx.strokeStyle = "rgba(100,116,139,0.16)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(cx, cy, R, R * 0.78, 0, 0, Math.PI * 2); ctx.stroke();

      // 弧线（含回到拆卡的闭环）
      for (var i = 0; i < N; i++) {
        var a = pos(i), b = pos((i + 1) % N);
        var am = -Math.PI / 2 + ((i + 0.5) / N) * Math.PI * 2;
        var mx = cx + Math.cos(am) * (R + 44);
        var my = cy + Math.sin(am) * (R + 44) * 0.78;
        var active = (i === hi);
        ctx.strokeStyle = active ? palette[(i + 1) % N] : "rgba(100,116,139,0.35)";
        ctx.lineWidth = active ? 2.4 : 1.4;
        ctx.setLineDash([7, 9]);
        ctx.lineDashOffset = -t * (active ? 40 : 18);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx, my, b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 节点
      for (var j = 0; j < N; j++) {
        var p = pos(j);
        var c = palette[j];
        var isHi = (j === hi);
        var glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, isHi ? 26 : 18);
        glow.addColorStop(0, c);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = isHi ? 0.75 : 0.35;
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(p.x, p.y, isHi ? 26 : 18, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;

        // 节点本体
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(p.x, p.y, isHi ? 11 : 8, 0, Math.PI * 2); ctx.fill();
        if (isHi) {
          ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6;
          ctx.beginPath(); ctx.arc(p.x, p.y, 16 + 3 * Math.sin(t * 2), 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // 标签
        ctx.font = (isHi ? "800 " : "600 ") + "14px " + getFont();
        ctx.fillStyle = isHi ? "#0f172a" : "rgba(15,23,42,0.78)";
        ctx.textAlign = "center";
        ctx.fillText(steps[j], p.x, p.y + 30);
      }
    }

    function getFont() {
      return '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';
    }

    function loop() {
      t += 0.016;
      timer += 0.016;
      if (timer > 2.1) { timer = 0; hi = (hi + 1) % N; }
      draw();
      requestAnimationFrame(loop);
    }

    window.addEventListener("resize", resize);
    resize();
    if (REDUCED) { draw(); } else { loop(); }
  })();

  /* ============================================================
   * 2) 通用渲染
   * ============================================================ */
  function initReveal() {
    var items = document.querySelectorAll(".reveal-target");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); }
      });
    }, { threshold: 0.08 });
    items.forEach(function (n) { io.observe(n); });
  }

  /* ============================================================
   * 3) 五原则
   * ============================================================ */
  (function renderPrinciples() {
    var wrap = document.getElementById("principlesGrid");
    D.principles.forEach(function (p) {
      var card = html("div", "prin reveal-target", null, wrap);
      html("span", "prin-num", p.num, card);
      html("h3", null, p.title, card);
      html("p", null, p.desc, card);
    });
  })();

  /* ============================================================
   * 4) 生命周期 stepper
   * ============================================================ */
  var stepDetail = document.getElementById("stepDetail");

  function renderStep(i) {
    var s = D.lifecycle[i];
    stepDetail.innerHTML = "";
    stepDetail.style.animation = "none";
    void stepDetail.offsetWidth;
    stepDetail.style.animation = "";
    var head = html("div", "sd-head", null, stepDetail);
    html("h3", null, "第 " + (i + 1) + " 步 · " + s.name, head);
    html("span", "sd-src", "经验来源：" + s.src, head);
    html("p", "sd-body", s.body, stepDetail);
    html("p", "sd-out", "▸ " + s.out, stepDetail);
  }

  (function renderStepper() {
    var wrap = document.getElementById("stepper");
    D.lifecycle.forEach(function (s, i) {
      var chip = html("div", "step-chip", null, wrap);
      html("span", "sc-num", "STEP " + (i + 1), chip);
      html("span", "sc-name", s.name, chip);
      chip.addEventListener("click", function () {
        wrap.querySelectorAll(".step-chip").forEach(function (x) { x.classList.remove("active"); });
        chip.classList.add("active");
        renderStep(i);
      });
      if (i === 0) { chip.classList.add("active"); renderStep(0); }
    });
  })();

  /* ============================================================
   * 5) 工具分工
   * ============================================================ */
  (function renderTools() {
    var wrap = document.getElementById("toolsGrid");
    D.tools.forEach(function (tl) {
      var card = html("div", "tool reveal-target", null, wrap);
      html("div", "tl-icon", tl.icon, card);
      var inner = html("div", null, null, card);
      html("div", "tl-role", tl.role, inner);
      html("div", "tl-tool", tl.tool, inner);
      html("div", "tl-desc", tl.desc, inner);
    });
  })();

  /* ============================================================
   * 6) 规模适配
   * ============================================================ */
  (function renderScales() {
    var wrap = document.getElementById("scalesGrid");
    D.scales.forEach(function (s) {
      var card = html("div", "scale reveal-target", null, wrap);
      html("span", "sc-tag", s.tag, card);
      html("h3", null, s.title, card);
      var ul = html("ul", null, null, card);
      s.points.forEach(function (pt) { html("li", null, pt, ul); });
    });
  })();

  /* ============================================================
   * 7) 避坑
   * ============================================================ */
  (function renderPitfalls() {
    var wrap = document.getElementById("pitfallsGrid");
    D.pitfalls.forEach(function (p) {
      var card = html("div", "pitfall reveal-target", null, wrap);
      html("div", "pf-bad", p.bad, card);
      html("div", "pf-bad-desc", p.badDesc, card);
      html("div", "pf-good", "✓ " + p.good, card);
      html("div", "pf-good-desc", p.goodDesc, card);
    });
  })();

  /* ============================================================
   * 8) 开场动作 + 记忆提示
   * ============================================================ */
  (function renderKickoff() {
    var wrap = document.getElementById("kickoffList");
    D.kickoff.forEach(function (k, i) {
      var step = html("div", "ko-step reveal-target", null, wrap);
      html("div", "ko-num", String(i + 1), step);
      var inner = html("div", null, null, step);
      html("div", "ko-title", k.title, inner);
      html("div", "ko-desc", k.desc, inner);
    });
    var note = document.getElementById("memoryNote");
    html("h3", null, D.memoryNote.title, note);
    html("p", null, D.memoryNote.body, note);
  })();

  /* ============================================================
   * 9) 进场动画
   * ============================================================ */
  initReveal();
})();
