/* ============================================================
 * main.js — personal-dev-workflow v3 可视化
 * Hero：Three.js 3D（CDN 加载失败/WebGL 不可用时回退 2D Canvas）
 * 六步循环：SVG 环形交互 + 详情面板
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
   * 1) HERO：Three.js 3D（回退 2D Canvas）
   * ============================================================ */
  (function hero3D() {
    var host = document.getElementById("hero3d");
    var canvas2d = document.getElementById("heroCanvas");
    var names = ["拆卡", "派活", "交证", "验证", "验收", "复盘"];
    var palette = ["#0284c7", "#7c3aed", "#059669", "#db2777", "#d97706", "#2563eb", "#0d9488", "#be185d"];

    function start2D() {
      // ---------- 2D 回退：环形星座 ----------
      var ctx = canvas2d.getContext("2d");
      var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
      var R = 140, t = 0, stars = [];

      function resize() {
        var r = host.parentElement.getBoundingClientRect();
        W = r.width; H = r.height;
        canvas2d.width = W * dpr; canvas2d.height = H * dpr;
        canvas2d.style.width = W + "px"; canvas2d.style.height = H + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        R = Math.max(120, Math.min(W, H) * 0.26);
        stars = [];
        for (var s = 0; s < 60; s++) stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.2 + 0.3, tw: Math.random() * 6.28 });
      }
      function pos(i) {
        var a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
        return { x: W / 2 + Math.cos(a) * R, y: H / 2 + Math.sin(a) * R * 0.8 };
      }
      function draw() {
        ctx.clearRect(0, 0, W, H);
        var cx = W / 2, cy = H / 2;
        for (var s = 0; s < stars.length; s++) {
          ctx.globalAlpha = 0.10 + 0.30 * Math.abs(Math.sin(t * 0.8 + stars[s].tw));
          ctx.fillStyle = "#334155";
          ctx.beginPath(); ctx.arc(stars[s].x, stars[s].y, stars[s].r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(100,116,139,0.16)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(cx, cy, R, R * 0.8, 0, 0, Math.PI * 2); ctx.stroke();

        for (var i = 0; i < 6; i++) {
          var a = pos(i), b = pos((i + 1) % 6);
          var am = -Math.PI / 2 + ((i + 0.5) / 6) * Math.PI * 2;
          var mx = cx + Math.cos(am) * (R + 40), my = cy + Math.sin(am) * (R + 40) * 0.8;
          ctx.strokeStyle = "rgba(100,116,139,0.35)";
          ctx.lineWidth = 1.4;
          ctx.setLineDash([7, 9]);
          ctx.lineDashOffset = -t * 18;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
          ctx.setLineDash([]);
        }
        for (var j = 0; j < 6; j++) {
          var p = pos(j), c = palette[j];
          ctx.globalAlpha = 0.35; ctx.fillStyle = c;
          ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = c;
          ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
          ctx.font = "600 13px " + getFont();
          ctx.fillStyle = "rgba(15,23,42,0.75)";
          ctx.textAlign = "center";
          ctx.fillText(names[j], p.x, p.y + 26);
        }
        ctx.font = "800 15px " + getFont();
        ctx.fillStyle = "rgba(15,23,42,0.85)";
        ctx.textAlign = "center";
        ctx.fillText("六步循环", cx, cy - 6);
        ctx.font = "600 11px " + getFont();
        ctx.fillStyle = "rgba(15,23,42,0.55)";
        ctx.fillText("一张任务卡的一生", cx, cy + 14);
      }
      function getFont() { return '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif'; }
      window.addEventListener("resize", resize);
      resize();
      if (REDUCED) { draw(); return; }
      (function loop() { t += 0.016; draw(); requestAnimationFrame(loop); })();
    }

    // ---------- Three.js 3D ----------
    if (typeof THREE === "undefined") { start2D(); return; }

    var scene, camera, renderer, group, central, orbiterMeshes = [], lines, raf = null;

    function init3D() {
      try {
        var container = host.parentElement.getBoundingClientRect();
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(55, container.width / Math.max(container.height, 1), 0.1, 1000);
        camera.position.z = 300;

        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(container.width, container.height);
        host.appendChild(renderer.domElement);

        scene.add(new THREE.AmbientLight(0xffffff, 0.75));
        var pl = new THREE.PointLight(0xffffff, 0.6);
        pl.position.set(200, 200, 300);
        scene.add(pl);

        group = new THREE.Group();
        scene.add(group);

        // 中心指挥节点
        central = new THREE.Mesh(
          new THREE.IcosahedronGeometry(16, 1),
          new THREE.MeshPhongMaterial({ color: 0x7c3aed, emissive: 0x4c1d95, shininess: 40 })
        );
        group.add(central);

        // 环绕 Worker
        var posList = [];
        for (var i = 0; i < 8; i++) {
          var color = new THREE.Color(palette[i % palette.length]);
          var m = new THREE.Mesh(
            new THREE.SphereGeometry(i % 2 === 0 ? 6 : 4.5, 16, 16),
            new THREE.MeshPhongMaterial({ color: color, emissive: color, emissiveIntensity: 0.45 })
          );
          m.userData = {
            radius: 92 + ((i * 37) % 70),
            speed: 0.30 + ((i * 13) % 9) / 22,
            phase: (i / 8) * Math.PI * 2,
            yAmp: 18 + (i % 3) * 14
          };
          group.add(m);
          orbiterMeshes.push(m);
          posList.push(m.position.clone());
        }
        lines = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(posList),
          new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.45 })
        );
        group.add(lines);
        return true;
      } catch (e) {
        return false;
      }
    }

    function animate() {
      if (!group) return;
      var time = Date.now() * 0.001;
      for (var i = 0; i < orbiterMeshes.length; i++) {
        var o = orbiterMeshes[i], d = o.userData;
        var a = time * d.speed + d.phase;
        o.position.set(Math.cos(a) * d.radius, Math.sin(a) * d.yAmp, Math.sin(a * 1.3) * d.radius * 0.6);
      }
      // 更新连线顶点
      var arr = lines.geometry.attributes.position.array;
      for (var k = 0; k < orbiterMeshes.length; k++) {
        var p = orbiterMeshes[k].position;
        arr[k * 3] = p.x; arr[k * 3 + 1] = p.y; arr[k * 3 + 2] = p.z;
      }
      lines.geometry.attributes.position.needsUpdate = true;
      central.rotation.x += 0.004;
      central.rotation.y += 0.007;
      var sc = 1 + 0.08 * Math.sin(time * 1.4);
      central.scale.set(sc, sc, sc);
      group.rotation.y += 0.0016;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    }

    function onResize() {
      if (!renderer) return;
      var r = host.parentElement.getBoundingClientRect();
      camera.aspect = r.width / Math.max(r.height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(r.width, r.height);
    }

    if (init3D()) {
      window.addEventListener("resize", onResize);
      if (REDUCED) { renderer.render(scene, camera); } else { raf = requestAnimationFrame(animate); }
    } else {
      if (renderer && renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      start2D();
    }
  })();

  /* ============================================================
   * 2) 滚动进场
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
   * 4) 六步循环：SVG 环形 + 详情
   * ============================================================ */
  var stepDetail = document.getElementById("stepDetail");
  var svgNodes = [];

  function renderStep(i) {
    var s = D.lifecycle[i];
    stepDetail.innerHTML = "";
    stepDetail.style.animation = "none";
    void stepDetail.offsetWidth;
    stepDetail.style.animation = "";
    var head = html("div", "sd-head", null, stepDetail);
    html("h3", null, "第 " + (i + 1) + " 步 · " + s.name, head);
    html("span", "sd-src", "出处：" + s.src, head);
    html("p", "sd-body", s.body, stepDetail);
    html("p", "sd-key", "▸ " + s.key, stepDetail);
    svgNodes.forEach(function (n, idx) { n.classList.toggle("active", idx === i); });
  }

  (function renderCycle() {
    var wrap = document.getElementById("cycleSvg");
    var NS = "http://www.w3.org/2000/svg";
    var W = 520, H = 520, cx = W / 2, cy = H / 2, R = 152;
    var n = D.lifecycle.length;
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    wrap.appendChild(svg);

    function el(tag, attrs) {
      var node = document.createElementNS(NS, tag);
      for (var k in attrs) node.setAttribute(k, attrs[k]);
      svg.appendChild(node);
      return node;
    }
    function pos(i) {
      var a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      return { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
    }

    // 弧线（含回到拆卡的闭环）
    for (var i = 0; i < n; i++) {
      var a = pos(i), b = pos((i + 1) % n);
      var am = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI * 2;
      var mx = cx + Math.cos(am) * (R + 46), my = cy + Math.sin(am) * (R + 46);
      el("path", {
        d: "M" + a.x + "," + a.y + " Q" + mx + "," + my + " " + b.x + "," + b.y,
        fill: "none", stroke: "#94a3b8", "stroke-width": 1.8, class: "flow-edge"
      });
    }

    // 中心
    var ct = el("text", { x: cx, y: cy - 4, "text-anchor": "middle", "font-size": "16", "font-weight": "800", fill: "#0f172a" });
    ct.textContent = "六步循环";
    var cs = el("text", { x: cx, y: cy + 18, "text-anchor": "middle", "font-size": "11", fill: "#8a94a8" });
    cs.textContent = "一张任务卡的一生";

    // 节点
    var boxW = 96, boxH = 54;
    D.lifecycle.forEach(function (s, idx) {
      var p = pos(idx);
      var g = document.createElementNS(NS, "g");
      g.setAttribute("class", "cycle-node");
      g.setAttribute("transform", "translate(" + (p.x - boxW / 2) + "," + (p.y - boxH / 2) + ")");
      var color = ["#0284c7", "#7c3aed", "#059669", "#d97706", "#db2777", "#2563eb"][idx];
      var rect = el("rect", { x: 0, y: 0, width: boxW, height: boxH, rx: 12, fill: "rgba(15,23,42,0.045)", stroke: color, "stroke-width": 1.6 });
      var num = el("text", { x: boxW / 2, y: 20, "text-anchor": "middle", "font-size": "10", fill: color, class: "cn-num" });
      num.textContent = "STEP " + (idx + 1);
      var name = el("text", { x: boxW / 2, y: 38, "text-anchor": "middle", "font-size": "13.5", "font-weight": "700", fill: "#0f172a" });
      name.textContent = s.name;
      g.appendChild(rect); g.appendChild(num); g.appendChild(name);
      g.addEventListener("click", function () { renderStep(idx); });
      svg.appendChild(g);
      svgNodes.push(g);
    });

    renderStep(0);
  })();

  /* ============================================================
   * 5) 规则纪律
   * ============================================================ */
  (function renderRules() {
    var wrap = document.getElementById("rulesGrid");
    D.rules.forEach(function (r) {
      var card = html("div", "rule reveal-target", null, wrap);
      html("span", "rl-num", r.num, card);
      html("h3", null, r.title, card);
      html("p", null, r.desc, card);
    });
  })();

  /* ============================================================
   * 6) 上下文与成本
   * ============================================================ */
  (function renderContext() {
    var wrap = document.getElementById("contextGrid");
    D.context.forEach(function (c) {
      var card = html("div", "ctx reveal-target", null, wrap);
      html("div", "ct-icon", c.icon, card);
      var inner = html("div", null, null, card);
      html("div", "ct-title", c.title, inner);
      html("div", "ct-desc", c.desc, inner);
    });
  })();

  /* ============================================================
   * 7) 规模适配
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
   * 8) 模板与参考
   * ============================================================ */
  (function renderTemplates() {
    var wrap = document.getElementById("templatesGrid");
    D.templates.forEach(function (t) {
      var a = html("a", "tpl reveal-target", null, wrap);
      a.href = t.path;
      html("div", "tp-icon", t.icon, a);
      html("div", "tp-title", t.title, a);
      html("div", "tp-desc", t.desc, a);
      html("div", "tp-path", t.path, a);
    });
  })();

  /* ============================================================
   * 9) 自查清单（滚动进入后逐条打勾）
   * ============================================================ */
  (function renderChecklist() {
    var box = document.getElementById("checklistBox");
    var items = [];
    D.checklist.forEach(function (c) {
      var item = html("div", "cl-item", null, box);
      html("div", "cl-box", null, item);
      html("div", null, c, item);
      items.push(item);
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        items.forEach(function (it, i) {
          setTimeout(function () { it.classList.add("checked"); }, 420 + i * 420);
        });
      });
    }, { threshold: 0.4 });
    io.observe(box);
  })();

  /* ============================================================
   * 10) 进场动画
   * ============================================================ */
  initReveal();
})();
