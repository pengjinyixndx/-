/* ============================================================
   心跳副本 · HEARTBEAT DUO
   纯前端复刻 · 无依赖 · 所有数据仅存本地
   ============================================================ */
(() => {
"use strict";

/* ───────────────────────── utils ───────────────────────── */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const rnd = (a, b) => a + Math.random() * (b - a);
const ri  = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = ri(0, i); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
/* deep clone that also works where structuredClone is unavailable */
function clone(o) {
  if (typeof structuredClone === "function") { try { return structuredClone(o); } catch (e) {} }
  return JSON.parse(JSON.stringify(o));
}

/* ───────────────────────── persistence ───────────────────────── */
const KEY = "heartbeat-duo.v1";
const DEFAULTS = {
  names: [],
  intensity: "mild",
  custom: { mild: [], spicy: [], fierce: [], burning: [], edge: [], extreme: [], forbidden: [] },
  sound: true,
  adultAck: false,
  stats: { wins: 0, best: null, rounds: 0 }
};
let S = load();

/* 只保留 DEFAULTS 里声明过的键：旧存档里的 points / unlocked 等
   废弃字段会被丢弃，而不是继续留在状态与 localStorage 里。 */
const SCHEMA_KEYS = Object.keys(DEFAULTS);

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw !== "object") return clone(DEFAULTS);
    const s = clone(DEFAULTS);
    SCHEMA_KEYS.forEach(k => { if (raw[k] !== undefined) s[k] = raw[k]; });
    s.custom = Object.assign(clone(DEFAULTS.custom), raw.custom || {});
    s.stats = Object.assign(clone(DEFAULTS.stats), raw.stats || {});
    return s;
  } catch (e) { return clone(DEFAULTS); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

/* ───────────────────────── tiers ─────────────────────────
   七档递进：破冰 → 脸红 → 大幅动作 → 加强力度 → 隔衣敏感 → 脱衣触碰 → 18+  */
const TIERS = [
  { id: "mild",    name: "温和", latin: "MILD",    adult: false, desc: "破冰。零身体接触，只会让你笑和松下来。" },
  { id: "spicy",   name: "热辣", latin: "SPICY",   adult: false, desc: "脸红 + 交心一次到位：偏好、坦白、猜心事。" },
  { id: "fierce",  name: "猛烈", latin: "FIERCE",  adult: false, desc: "大幅肢体动作：拉、抱、按、压、跨坐。衣物开始离开。" },
  { id: "burning", name: "灼热", latin: "BURNING", adult: false, desc: "力度与压制拉满，贴身摩擦。仍不碰敏感部位。" },
  { id: "edge",    name: "临界", latin: "EDGE",    adult: false, desc: "隔着衣物接触胸、大腿内侧、臀。还不脱。" },
  { id: "extreme", name: "极限", latin: "EXTREME", adult: false, desc: "衣物离开，直接触碰，全身接触。" },
  { id: "forbidden", name: "禁区", latin: "18+",   adult: true,  desc: "18+。只想玩到这里的两个人再进来。" }
];
const tierOf = id => TIERS.find(t => t.id === id) || TIERS[0];

/* heart glyphs of increasing agitation (mirrors the mini program icon set) */
const HEARTS = {
  mild:    '<path d="M16 27.4S4.6 20.2 4.6 12.4A6.6 6.6 0 0 1 16 8.4a6.6 6.6 0 0 1 11.4 4C27.4 20.2 16 27.4 16 27.4z" fill="currentColor"/>',
  spicy:   '<path d="M16 27.9S4.2 20.4 4.2 12.2A6.9 6.9 0 0 1 16 7.8a6.9 6.9 0 0 1 11.8 4.4C27.8 20.4 16 27.9 16 27.9z" fill="currentColor"/><path d="M16 7.8 12.4 2.6 16 4l3.6-1.4z" fill="currentColor" opacity=".85"/>',
  fierce:  '<path d="M16 28.2S3.8 20.6 3.8 12A7.2 7.2 0 0 1 16 7.3 7.2 7.2 0 0 1 28.2 12c0 8.6-12.2 16.2-12.2 16.2z" fill="currentColor"/><path d="M6.4 9.6 3 5.4l4.2.4zM25.6 9.6 29 5.4l-4.2.4z" fill="currentColor"/>',
  burning: '<path d="M16 29S3.2 21 3.2 11.6A7.4 7.4 0 0 1 16 6.8a7.4 7.4 0 0 1 12.8 4.8C28.8 21 16 29 16 29z" fill="currentColor"/><path d="M2 8.2 7 6l-1 5.2zM30 8.2 25 6l1 5.2zM16 4.6l-2.6-3.4h5.2z" fill="currentColor"/><path d="M16 12.4c1.6 2 3 3.6 3 5.3a3 3 0 0 1-6 0c0-1.7 1.4-3.3 3-5.3z" fill="#20040e"/>',
  edge:    '<path d="M16 29.3S2.9 21 2.9 11.3A7.6 7.6 0 0 1 16 6.6a7.6 7.6 0 0 1 13.1 4.7C29.1 21 16 29.3 16 29.3z" fill="currentColor"/><path d="M1.4 6.6 6.8 4l-1.2 5.8zM30.6 6.6 25.2 4l1.2 5.8zM16 4l-3-4h6z" fill="currentColor"/><path d="M16 12.2c1.9 2.3 3.4 4.1 3.4 6a3.4 3.4 0 0 1-6.8 0c0-1.9 1.5-3.7 3.4-6z" fill="#20040e"/><path d="M10.4 22.6c1.7 1.1 3.6 1.7 5.6 1.7s3.9-.6 5.6-1.7" fill="none" stroke="#20040e" stroke-width="1.5" stroke-linecap="round"/>',
  extreme: '<path d="M16 29.6S2.6 21.2 2.6 11.2A7.8 7.8 0 0 1 16 6.2a7.8 7.8 0 0 1 13.4 5c0 10-13.4 18.4-13.4 18.4z" fill="currentColor"/><path d="M1 5.6 6.6 3.2 5.4 9zM31 5.6 25.4 3.2 26.6 9zM16 3.6l-3.2-3.6h6.4z" fill="currentColor"/><path d="M12 13.4h8M12 17.6h8M12 21.8h8" stroke="#20040e" stroke-width="1.6" stroke-linecap="round"/>',
  forbidden: '<path d="M16 29.8S2.4 21.3 2.4 11.1A8 8 0 0 1 16 6a8 8 0 0 1 13.6 5.1c0 10.2-13.6 18.7-13.6 18.7z" fill="currentColor"/><path d="M.8 5.2 6.6 2.8 5.2 9zM31.2 5.2 25.4 2.8 26.8 9zM16 3.2 12.6-.6h6.8z" fill="currentColor"/><path d="M11.6 13.2h8.8M11.6 17.4h8.8M11.6 21.6h8.8M14.6 25.4h2.8" stroke="#20040e" stroke-width="1.7" stroke-linecap="round"/>'
};

/* ───────────────────────── content banks ─────────────────────────
   题库本体在 assets/questions.js（4 档 × 50 真心话 + 50 大冒险）。
   本文件负责洗牌、发牌与自定义题合并。                              */
const BANK = HEARTBEAT_BANK;
if (!BANK) throw new Error("题库未加载：请确认 assets/questions.js 在 app.js 之前引入。");

/* 转盘结果：每项都是一件“能立刻做完”的事，同一档内不重复同类动作 */
const WHEELS = {
  junior: [
    "亲一下额头", "拥抱十秒", "说三句好话", "对视十秒", "牵手一分钟",
    "亲一下脸颊", "说出一个优点", "帮对方揉肩", "夸对方可爱", "唱一句歌",
    "讲一个秘密", "对方选一项"
  ],
  senior: [
    "接吻十秒", "耳语情话", "喂对方一口", "公主抱一次", "十厘米对视",
    "亲锁骨三秒", "解开一颗扣子", "抚摸后背", "额头相抵", "对方提要求",
    "转盘再转一次", "由输家执行"
  ]
};
const DICE = {
  junior: [
    { n: 1, t: "说一件今天最想和对方一起做的事" },
    { n: 2, t: "对方提出一个小要求，你照做" },
    { n: 3, t: "拥抱十秒，中途不许说话" },
    { n: 4, t: "夸对方三个词语，不许重复" },
    { n: 5, t: "和对方交换一件小物件带在身上" },
    { n: 6, t: "双方同时说出一件最难忘的事，撞上就重来" }
  ],
  senior: [
    { n: 1, t: "亲一下对方指定的地方" },
    { n: 2, t: "耳语一句最直白的话" },
    { n: 3, t: "贴墙站立，对方从一米外走近贴上来" },
    { n: 4, t: "对视八秒，先笑的人认输一次" },
    { n: 5, t: "解开对方一颗扣子，仅此而已" },
    { n: 6, t: "由对方宣布一个现在必须完成的小挑战" }
  ]
};
const TRAFFIC = { junior: { window: 620 }, senior: { window: 330 } };

/* ───────────────────────── audio (synthesised heartbeat) ───────────────────────── */
const Sound = (() => {
  let ctx = null;
  const ensure = () => {
    if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (C) ctx = new C(); }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  };
  function thump(at, gain, f0) {
    const c = ensure(); if (!c) return;
    const osc = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 320;
    osc.type = "sine";
    osc.frequency.setValueAtTime(f0, at);
    osc.frequency.exponentialRampToValueAtTime(f0 * .45, at + .16);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + .012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + .22);
    osc.connect(lp); lp.connect(g); g.connect(c.destination);
    osc.start(at); osc.stop(at + .26);
  }
  return {
    beat() { if (!S.sound) return; const c = ensure(); if (!c) return; const t = c.currentTime + .01; thump(t, .34, 88); thump(t + .17, .2, 78); },
    tick() { if (!S.sound) return; const c = ensure(); if (!c) return; thump(c.currentTime + .01, .09, 190); },
    chord() {
      if (!S.sound) return; const c = ensure(); if (!c) return;
      [523.25, 659.25, 783.99].forEach((f, i) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = "triangle"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, c.currentTime);
        g.gain.exponentialRampToValueAtTime(.11, c.currentTime + .05 + i * .04);
        g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + 1.1);
        o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 1.2);
      });
    },
    buzz() {
      if (!S.sound) return; const c = ensure(); if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = "sawtooth"; o.frequency.value = 120;
      g.gain.setValueAtTime(.13, c.currentTime);
      g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + .5);
      o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + .55);
    }
  };
})();

/* ───────────────────────── background FX: ECG trace + particles ───────────────────────── */
const FX = (() => {
  const cv = $("#fx"), ctx = cv.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  const parts = [];
  let phase = 0, spike = 0, last = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.width = Math.floor(innerWidth * dpr);
    H = cv.height = Math.floor(innerHeight * dpr);
    cv.style.width = innerWidth + "px"; cv.style.height = innerHeight + "px";
  }
  window.addEventListener("resize", resize); resize();

  function burst(n, x, y) {
    n = n || 24; x = x == null ? innerWidth / 2 : x; y = y == null ? innerHeight * .42 : y;
    for (let i = 0; i < n; i++) {
      parts.push({
        x: x * dpr, y: y * dpr,
        vx: rnd(-2.6, 2.6) * dpr, vy: rnd(-4.4, -.6) * dpr,
        life: 1, size: rnd(2, 5.4) * dpr, hue: rnd(-6, 26)
      });
    }
  }

  /* one PQRST complex per cycle; amplitude scales with `spike` */
  function ecg(t) {
    const c = (t % 1160) / 1160;
    const amp = (7 + spike * 46) * dpr;
    let v = 0;
    if (c < .12) v = Math.sin(c / .12 * Math.PI) * .12;
    else if (c < .18) v = 0;
    else if (c < .21) v = -((c - .18) / .03) * .3;
    else if (c < .25) v = ((c - .21) / .04) - .3 * (1 - (c - .21) / .04);
    else if (c < .28) v = 1 - ((c - .25) / .03) * 1.35;
    else if (c < .36) v = -.35 + ((c - .28) / .08) * .35;
    else if (c < .52) v = Math.sin((c - .36) / .16 * Math.PI) * .22;
    return v * amp;
  }

  function frame(now) {
    if (!last) last = now;
    const dt = Math.min(48, now - last); last = now;
    phase += dt;
    spike *= Math.pow(.5, dt / 420);
    ctx.clearRect(0, 0, W, H);

    const baseY = H * .78;
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, "rgba(255,139,160,0)");
    grad.addColorStop(.25, "rgba(255,139,160,.5)");
    grad.addColorStop(.75, "rgba(255,77,109,.6)");
    grad.addColorStop(1, "rgba(255,77,109,0)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.6 * dpr;
    ctx.beginPath();
    const step = 3 * dpr;
    for (let x = 0; x <= W; x += step) {
      const tt = phase + (x / W) * 1160 * 2.2;
      const y = baseY - ecg(tt) - Math.sin(tt / 380) * 3 * dpr;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy += 0.09 * dpr; p.x += p.vx; p.y += p.vy; p.life -= dt / 1400;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      ctx.globalAlpha = clamp(p.life, 0, 1) * .85;
      ctx.fillStyle = "hsl(" + (348 + p.hue) + " 88% " + (58 + p.hue) + "%)";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { burst, excite: v => { spike = clamp(spike + (v == null ? 1 : v), 0, 1.6); } };
})();

/* ───────────────────────── toast ───────────────────────── */
let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg; el.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-on"), 2100);
}

/* ───────────────────────── router ───────────────────────── */
let current = "home";
const routeHistory = [];
function go(view) { if (view === current) return; routeHistory.push(current); show(view); }
function back() { show(routeHistory.pop() || "home"); }
function show(view) {
  $$(".view").forEach(v => v.classList.toggle("is-active", v.dataset.view === view));
  current = view;
  try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { window.scrollTo(0, 0); }
  if (view === "truth") prepareTruth();
  if (view === "wheel") drawWheel();
  if (view === "custom") renderBank();
  if (view === "setup") renderModes();
  syncChrome();
}

/* ───────────────────────── chrome ───────────────────────── */
function syncChrome() {
  const t = tierOf(S.intensity);
  $("#chipIntensity").textContent = S.names.length ? t.name + " · " + S.names.join("&") : t.name;
  $("#chromeSub").textContent = current === "home" ? "HEARTBEAT DUO" : t.latin + " MODE";
  $("#btnSound").classList.toggle("is-off", !S.sound);
}

/* ───────────────────────── names ───────────────────────── */
function parseNames(v) {
  return v.split(/[\s,，、&+＋\/|]+/).map(s => s.trim()).filter(Boolean).slice(0, 6);
}
function renderNames() {
  $("#namesPreview").innerHTML = S.names.map(n => '<span class="nametag"><i></i>' + esc(n) + "</span>").join("");
  $("#drawerNames").innerHTML = S.names.length
    ? "当前角色：" + S.names.map(esc).join(" · ")
    : "还没有写名字，去「角色名称」里补上。";
}

/* ───────────────────────── modes / unlock ───────────────────────── */
/* 所有档位默认可用：唯一的门槛是 18+ 档的成年确认 */
function renderModes() {
  $("#intensityList").innerHTML = TIERS.map(t => {
    const needsAge = t.adult && !S.adultAck;
    const on = S.intensity === t.id;
    const desc = needsAge ? "18+ · 首次进入需确认双方成年 · " + t.desc : t.desc;
    const state = on ? "使用中" : needsAge ? "18+" : "";
    return '<button class="mode ' + (on ? "is-on " : "") + (needsAge ? "is-locked" : "") + '" data-tier="' + t.id + '">'
      + '<span class="mode__heart"><svg viewBox="0 0 32 32">' + HEARTS[t.id] + "</svg></span>"
      + '<span class="mode__body"><span class="mode__name">' + t.name + (t.adult ? '<b class="adult-badge">18+</b>' : "") + "</span>"
      + '<span class="mode__desc">' + desc + "</span></span>"
      + '<span class="mode__state">' + state + "</span>"
      + "</button>";
  }).join("");
  renderNames();
}
/* ───────────────────────── in-app confirm ─────────────────────────
   window.confirm 在内嵌 WebView（微信等）里不可靠、还可能被静默拦截，
   返回 false 时点击会“毫无反应”。所有需要确认的流程都走这个自绘弹窗。   */
let askResolve = null, askBound = false;
function ask(opts) {
  if (!askBound) {
    askBound = true;
    $("#askOk").addEventListener("click", () => closeAsk(true));
    $("#askCancel").addEventListener("click", () => closeAsk(false));
    $("#ask").addEventListener("click", e => { if (e.target.closest("[data-ask-close]")) closeAsk(false); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#ask").hidden) closeAsk(false); });
  }
  return new Promise(resolve => {
    askResolve = resolve;
    $("#askTitle").textContent = opts.title || "确认";
    $("#askBody").innerHTML = opts.body || "";
    $("#askOk").textContent = opts.ok || "确认";
    $("#askCancel").textContent = opts.cancel || "取消";
    $("#askBody").classList.toggle("is-adult", !!opts.adult);
    $("#ask").hidden = false;
  });
}
function closeAsk(v) {
  $("#ask").hidden = true;
  const r = askResolve; askResolve = null;
  if (r) r(v);
}

function selectTier(id) {
  const t = tierOf(id);
  const proceed = () => {
    S.intensity = id; save();
    renderModes(); renderDrawer(); syncChrome();
    if (current === "truth") prepareTruth();
  };
  /* 18+ 档位先确认年龄，用自绘弹窗而不是 window.confirm */
  if (t.adult && !S.adultAck) {
    ask({
      title: "18+ 内容确认",
      adult: true,
      body: "<p>「" + t.name + "」是 <b>18+</b> 内容，包含成人向的亲密描写。</p>"
          + "<p>请确认：你们<b>双方都已成年</b>，并且都是<b>自愿</b>参与。</p>"
          + "<p class=\"ask__note\">任何时候都可以直接跳过任何一张卡。</p>",
      ok: "我们已成年，继续"
    }).then(ok => {
      if (!ok) return;
      S.adultAck = true; save();
      proceed();
    });
    return;
  }
  proceed();
}

/* ───────────────────────── drawer ───────────────────────── */
function openDrawer() { renderDrawer(); $("#drawer").hidden = false; document.body.style.overflow = "hidden"; }
function closeDrawer() { $("#drawer").hidden = true; document.body.style.overflow = ""; }
function renderDrawer() {
  renderNames();
  $("#drawerBody").innerHTML = '<div class="dgroup"><div class="dgroup__h">真心话大冒险</div>'
    + TIERS.map(it => {
      const on = S.intensity === it.id;
      return '<button class="dmode ' + (on ? "is-on" : "") + '" data-tier="' + it.id + '">'
        + '<span class="dmode__heart"><svg viewBox="0 0 32 32">' + HEARTS[it.id] + "</svg></span>"
        + '<span class="dmode__name">' + it.name + (it.adult ? '<b class="adult-badge adult-badge--drawer">18+</b>' : "") + "</span>"
        + (on ? '<span class="dmode__lock">使用中</span>' : "")
        + "</button>";
    }).join("") + "</div>";
}

/* ───────────────────────── truth or dare deck ───────────────────────── */
const deck = { key: "", queue: [], index: 0, turn: 0 };

const deckKey = () => S.intensity + "|" + S.names.join(",");
function buildDeck() {
  const t = S.intensity;
  const custom = S.custom[t] || [];
  const byKind = { truth: [], dare: [] };
  ["truth", "dare"].forEach(kind => {
    /* 自定义题支持多行：每行算一条，空行忽略 */
    const extra = [];
    custom.filter(c => c.kind === kind).forEach(c => {
      String(c.text).split(/\r?\n/).forEach(line => { const s = line.trim(); if (s) extra.push(s); });
    });
    const pool = BANK[t][kind].concat(extra);
    byKind[kind] = shuffle(pool);
  });
  const out = [];
  while (byKind.truth.length || byKind.dare.length) {
    if (byKind.truth.length) out.push({ kind: "truth", text: byKind.truth.pop() });
    if (byKind.dare.length) out.push({ kind: "dare", text: byKind.dare.pop() });
  }
  return out;
}
function prepareTruth() {
  if (deck.key !== deckKey() || !deck.queue.length) { deck.key = deckKey(); deck.queue = buildDeck(); deck.index = 0; }
  renderCard(deck.queue[deck.index % deck.queue.length]);
  $("#truthModeName").textContent = tierOf(S.intensity).name;
  $("#deckInfo").textContent = "牌堆 " + deck.queue.length + " 张 · 自定义题已并入";
}
function whoIsNext() {
  if (!S.names.length) return "轮到谁？";
  const n = S.names[deck.turn % S.names.length];
  deck.turn++;
  return n;
}
function renderCard(item, who) {
  const t = tierOf(S.intensity);
  const kindEl = $("#cardKind");
  kindEl.textContent = item.kind === "truth" ? "真心话" : "大冒险";
  kindEl.classList.toggle("is-dare", item.kind === "dare");
  $("#cardIdx").textContent = "#" + String((deck.index % deck.queue.length) + 1).padStart(3, "0");
  $("#cardWho").textContent = who || (S.names.length ? "准备好了吗？" : "点下面的按钮抽卡");
  $("#cardText").textContent = item.text;
  $("#cardMeta").textContent = t.name + " · " + (item.kind === "truth" ? "真心话" : "大冒险");
}
function drawNext(who) {
  const item = deck.queue[deck.index % deck.queue.length];
  deck.index++;
  const card = $("#card");
  card.classList.add("is-swap");
  FX.excite(.9);
  setTimeout(() => {
    renderCard(item, who);
    card.classList.remove("is-swap");
    Sound.beat();
    FX.burst(22);
  }, 200);
  $("#deckInfo").textContent = "牌堆 " + deck.queue.length + " 张 · 已抽 " + deck.index + " 张";
}
/* 真心话 / 大冒险 chosen → walk the deck to that kind, then draw it */
function pickKind(want) {
  const who = whoIsNext();
  let guard = 0;
  while (deck.queue[deck.index % deck.queue.length].kind !== want && guard++ < deck.queue.length) deck.index++;
  drawNext(who);
}
/* 再来一张 → next card regardless of kind */
function drawAny() {
  const who = whoIsNext();
  drawNext(who);
}

/* ───────────────────────── wheel ───────────────────────── */
const wheelCv = $("#wheel"), wctx = wheelCv.getContext("2d");
const WCOLORS = ["#fdf2e6", "#c8103e", "#f6dfc8", "#8e0c2a", "#ffd9e2", "#a30f31"];
let wheelTier = "junior", wheelAngle = -Math.PI / 2, wheelVel = 0, wheelSpinning = false;

function drawWheel() {
  const segs = WHEELS[wheelTier];
  const n = segs.length, cx = 360, cy = 360, R = 330, r = 96;
  wctx.clearRect(0, 0, 720, 720);

  wctx.beginPath(); wctx.arc(cx, cy, R + 12, 0, Math.PI * 2);
  wctx.fillStyle = "#2b0812"; wctx.fill();
  wctx.lineWidth = 6; wctx.strokeStyle = "rgba(253,242,230,.55)"; wctx.stroke();

  for (let i = 0; i < n; i++) {
    const a0 = wheelAngle + (i / n) * Math.PI * 2;
    const a1 = wheelAngle + ((i + 1) / n) * Math.PI * 2;
    wctx.beginPath(); wctx.moveTo(cx, cy); wctx.arc(cx, cy, R, a0, a1); wctx.closePath();
    wctx.fillStyle = WCOLORS[i % WCOLORS.length]; wctx.fill();
    wctx.lineWidth = 2; wctx.strokeStyle = "rgba(43,8,18,.28)"; wctx.stroke();

    wctx.save();
    wctx.translate(cx, cy);
    wctx.rotate(a0 + (a1 - a0) / 2);
    wctx.fillStyle = (i % 2 === 0) ? "#5c0920" : "#fdf2e6";
    wctx.font = "600 25px 'PingFang SC','Microsoft YaHei',sans-serif";
    wctx.textAlign = "right"; wctx.textBaseline = "middle";
    wctx.fillText(segs[i], R - 26, 0);
    wctx.restore();
  }

  const g = wctx.createRadialGradient(cx, cy, 8, cx, cy, r);
  g.addColorStop(0, "#2b0812"); g.addColorStop(1, "#7d0a26");
  wctx.beginPath(); wctx.arc(cx, cy, r, 0, Math.PI * 2); wctx.fillStyle = g; wctx.fill();
  wctx.lineWidth = 3; wctx.strokeStyle = "rgba(253,242,230,.4)"; wctx.stroke();

  wctx.beginPath();
  wctx.moveTo(cx, cy - R + 2); wctx.lineTo(cx - 20, cy - R - 34); wctx.lineTo(cx + 20, cy - R - 34);
  wctx.closePath(); wctx.fillStyle = "#fdf2e6"; wctx.fill();
  wctx.lineWidth = 2; wctx.strokeStyle = "rgba(43,8,18,.5)"; wctx.stroke();
}

function spinWheel() {
  if (wheelSpinning) return;
  wheelSpinning = true;
  $("#btnSpin").disabled = true;
  $("#wheelValue").textContent = "…";
  wheelVel = rnd(0.36, 0.46);
  let tickAcc = 0;
  const step = () => {
    wheelAngle += wheelVel;
    wheelVel *= 0.9885;
    tickAcc += wheelVel;
    if (tickAcc > 0.36) { tickAcc = 0; Sound.tick(); }
    drawWheel();
    if (wheelVel > 0.0022) requestAnimationFrame(step);
    else finishSpin();
  };
  requestAnimationFrame(step);
}
function finishSpin() {
  const segs = WHEELS[wheelTier], n = segs.length;
  const pointer = -Math.PI / 2;
  let rel = (pointer - wheelAngle) % (Math.PI * 2);
  if (rel < 0) rel += Math.PI * 2;
  const value = segs[Math.floor(rel / (Math.PI * 2 / n)) % n];
  $("#wheelValue").textContent = value;
  Sound.chord(); FX.excite(1.2); FX.burst(30, innerWidth / 2, innerHeight * .45);
  toast("指针停在：" + value);
  $("#wheelInfo").textContent = (wheelTier === "junior" ? "初级" : "高级") + "转盘 · " + n + " 个结果";
  wheelSpinning = false;
  $("#btnSpin").disabled = false;
}

/* ───────────────────────── dice ───────────────────────── */
let diceTier = "junior", rolling = false;
const FACE_ROT = {
  1: { x: -18, y: 24 }, 2: { x: -18, y: -66 }, 3: { x: 72, y: 24 },
  4: { x: -108, y: 24 }, 5: { x: -18, y: 114 }, 6: { x: -18, y: 204 }
};
function setDie(n, spin) {
  const die = $("#die");
  if (spin) {
    die.style.transition = "transform 1.25s cubic-bezier(.2,.8,.2,1)";
    die.style.transform = "rotateX(" + (-18 + 360 * ri(2, 3)) + "deg) rotateY(" + (24 + 360 * ri(2, 3)) + "deg) rotateZ(" + ri(-60, 60) + "deg)";
    setTimeout(() => {
      die.style.transition = "transform .5s cubic-bezier(.2,1.3,.4,1)";
      const r = FACE_ROT[n];
      die.style.transform = "rotateX(" + r.x + "deg) rotateY(" + r.y + "deg)";
    }, 1260);
  } else {
    const r = FACE_ROT[n];
    die.style.transition = "transform .5s cubic-bezier(.18,.86,.24,1)";
    die.style.transform = "rotateX(" + r.x + "deg) rotateY(" + r.y + "deg)";
  }
}
function rollDice() {
  if (rolling) return;
  rolling = true;
  $("#btnRoll").disabled = true;
  $("#dieText").textContent = "滚动中……";
  $("#dieNum").textContent = "—";
  let count = 0;
  const flick = setInterval(() => { setDie(ri(1, 6), false); Sound.tick(); if (++count > 7) clearInterval(flick); }, 110);
  const n = ri(1, 6);
  setDie(n, true);
  setTimeout(() => {
    const item = DICE[diceTier].find(d => d.n === n);
    $("#dieNum").textContent = n;
    $("#dieText").textContent = item.t;
    Sound.chord(); FX.excite(1); FX.burst(24);
    rolling = false;
    $("#btnRoll").disabled = false;
  }, 1900);
}

/* ───────────────────────── traffic light ───────────────────────── */
const traffic = { state: "idle", timer: null, greenAt: 0, tier: "junior" };
function trafficSet(light, label) {
  $("#lightbox").dataset.light = light;
  $("#lightLabel").textContent = label;
  $$(".lamp").forEach(l => l.removeAttribute("data-on"));
  const map = { red: ".lamp--red", yellow: ".lamp--yellow", green: ".lamp--green" };
  if (map[light]) { const el = $(map[light]); if (el) el.setAttribute("data-on", "1"); }
}
function trafficReset(label) {
  clearTimeout(traffic.timer);
  traffic.state = "idle";
  trafficSet("idle", label || "点击下方按钮开始");
  $("#tapLabel").textContent = "开始";
}
function startTrafficRound() {
  clearTimeout(traffic.timer);
  traffic.state = "waiting";
  trafficSet("red", "红灯 · 忍住");
  $("#tapLabel").textContent = "别动…";
  traffic.timer = setTimeout(() => {
    traffic.state = "green";
    traffic.greenAt = performance.now();
    trafficSet("green", "绿灯！点！");
    $("#tapLabel").textContent = "点！";
    Sound.tick();
    const win = TRAFFIC[traffic.tier].window;
    traffic.timer = setTimeout(() => {
      if (traffic.state === "green") {
        traffic.state = "idle";
        trafficSet("idle", "超时 · 慢了（窗口 " + win + "ms）");
        $("#tapLabel").textContent = "再来一次";
        Sound.buzz();
        settleTraffic(false, null);
      }
    }, win);
  }, rnd(1300, 4300));
}
function settleTraffic(won, ms) {
  S.stats.rounds++;
  if (won) {
    S.stats.wins++;
    if (ms != null && (S.stats.best == null || ms < S.stats.best)) S.stats.best = ms;
  }
  save(); renderTrafficStats();
}
function renderTrafficStats() {
  $("#trafficStats").innerHTML =
    '<div class="stat"><b>' + S.stats.wins + '</b><span>胜场</span></div>'
    + '<div class="stat"><b>' + (S.stats.best == null ? "—" : S.stats.best + "ms") + '</b><span>最快反应</span></div>'
    + '<div class="stat"><b>' + S.stats.rounds + '</b><span>总局数</span></div>';
}
function tapTraffic() {
  if (traffic.state === "idle") { startTrafficRound(); return; }
  if (traffic.state === "waiting") {
    clearTimeout(traffic.timer);
    traffic.state = "idle";
    trafficSet("yellow", "抢跑了！等灯变绿");
    $("#tapLabel").textContent = "再来一次";
    Sound.buzz();
    settleTraffic(false, null);
    return;
  }
  if (traffic.state === "green") {
    clearTimeout(traffic.timer);
    const ms = Math.round(performance.now() - traffic.greenAt);
    const win = TRAFFIC[traffic.tier].window;
    traffic.state = "idle";
    if (ms <= win) {
      trafficSet("green", "过了！" + ms + "ms");
      $("#tapLabel").textContent = "再来一次";
      Sound.chord(); FX.excite(1.3); FX.burst(34);
      toast(ms + "ms · 过了");
      settleTraffic(true, ms);
    } else {
      trafficSet("yellow", "慢了 " + (ms - win) + "ms");
      $("#tapLabel").textContent = "再来一次";
      Sound.buzz();
      settleTraffic(false, null);
    }
  }
}

/* ───────────────────────── custom bank ───────────────────────── */
const customSel = { kind: "truth", tier: "extreme" };
function renderBank() {
  const groups = ["mild", "spicy", "fierce", "extreme"].map(tid => {
    const rows = [];
    ["truth", "dare"].forEach(kind => {
      (S.custom[tid] || []).filter(c => c.kind === kind).forEach((c, i) => {
        rows.push('<div class="bank__item"><p>' + esc(c.text) + "</p>"
          + '<button data-del="' + tid + "|" + kind + "|" + i + '" title="删除" aria-label="删除">✕</button></div>');
      });
    });
    if (!rows.length) return "";
    return '<div class="bank__group"><div class="bank__gh">' + tierOf(tid).name + " · " + rows.length + " 题</div>" + rows.join("") + "</div>";
  }).join("");
  $("#bankList").innerHTML = groups || '<div class="bank__empty">还没有自定义题目。<br>在上面写一道，它会混进对应强度的牌堆里。</div>';
}
function addCustom() {
  const text = $("#customText").value.trim();
  if (!text) { toast("先写点什么"); return; }
  const t = customSel.tier;
  if (!S.custom[t]) S.custom[t] = [];
  S.custom[t].push({ kind: customSel.kind, text });
  save();
  deck.key = "";                       /* force deck rebuild */
  $("#customText").value = "";
  renderBank();
  toast("已加入「" + tierOf(t).name + " · " + (customSel.kind === "truth" ? "真心话" : "大冒险") + "」");
  Sound.beat();
}

/* ───────────────────────── wiring ───────────────────────── */
function bindTierSeg(sel, onPick) {
  $$(sel + " .seg__i").forEach(b => b.addEventListener("click", () => {
    $$(sel + " .seg__i").forEach(x => x.classList.toggle("is-on", x === b));
    onPick(b.dataset.tier);
  }));
}

document.addEventListener("click", e => {
  const t = e.target;
  const goBtn = t.closest("[data-go]");
  if (goBtn) { go(goBtn.dataset.go); return; }
  const backBtn = t.closest("[data-back]");
  if (backBtn) { back(); return; }
  const tierBtn = t.closest("[data-tier]");
  if (tierBtn && (tierBtn.classList.contains("mode") || tierBtn.classList.contains("dmode"))) {
    selectTier(tierBtn.dataset.tier);
    if (tierBtn.classList.contains("dmode")) closeDrawer();
    return;
  }
  const del = t.closest("[data-del]");
  if (del) {
    const parts = del.dataset.del.split("|");
    const tid = parts[0], kind = parts[1], idx = +parts[2];
    S.custom[tid] = (S.custom[tid] || []).filter((c, i) => !(c.kind === kind && i === idx));
    save(); deck.key = ""; renderBank(); toast("已删除");
    return;
  }
  if (t.closest("[data-close]")) closeDrawer();
});

$("#btnHome").addEventListener("click", () => { routeHistory.length = 0; show("home"); });
$("#btnSound").addEventListener("click", () => {
  S.sound = !S.sound; save(); syncChrome();
  toast(S.sound ? "心跳音效已开" : "心跳音效已关");
  if (S.sound) Sound.beat();
});
$("#btnTruthMode").addEventListener("click", openDrawer);
$("#btnCustomEdit").addEventListener("click", () => go("custom"));

$$("[data-pick]").forEach(b => b.addEventListener("click", () => pickKind(b.dataset.pick)));
$("#btnNext").addEventListener("click", drawAny);
$("#btnShuffle").addEventListener("click", () => {
  deck.queue = shuffle(deck.queue); deck.index = 0; deck.key = deckKey();
  toast("已洗牌"); Sound.beat(); prepareTruth();
});

$("#namesInput").addEventListener("input", e => {
  S.names = parseNames(e.target.value);
  renderNames(); syncChrome(); save();
});
$("#namesInput").addEventListener("keydown", e => { if (e.key === "Enter") { e.target.blur(); toast("名字已保存"); } });

bindTierSeg("#wheelTier", t => { wheelTier = t; drawWheel(); Sound.tick(); });
bindTierSeg("#diceTier", t => {
  diceTier = t;
  $("#diceInfo").textContent = (t === "junior" ? "初级" : "高级") + "骰子 · 6 个结果";
  Sound.tick();
});
bindTierSeg("#trafficTier", t => { traffic.tier = t; trafficReset(); renderTrafficStats(); });
$$("#customKind .seg__i").forEach(b => b.addEventListener("click", () => {
  $$("#customKind .seg__i").forEach(x => x.classList.toggle("is-on", x === b));
  customSel.kind = b.dataset.kind;
}));
$$("#customTier .seg__i").forEach(b => b.addEventListener("click", () => {
  $$("#customTier .seg__i").forEach(x => x.classList.toggle("is-on", x === b));
  customSel.tier = b.dataset.tier;
}));
$("#btnAddCustom").addEventListener("click", addCustom);
$("#customText").addEventListener("keydown", e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addCustom(); });

$("#btnSpin").addEventListener("click", spinWheel);
$("#btnRoll").addEventListener("click", rollDice);
$("#btnTap").addEventListener("click", tapTraffic);

document.addEventListener("keydown", e => {
  if (e.key === "Escape") { if (!$("#drawer").hidden) closeDrawer(); else if (current !== "home") back(); }
  if (e.code === "Space" && current === "traffic") { e.preventDefault(); tapTraffic(); }
});

/* ───────────────────────── init ───────────────────────── */
$("#namesInput").value = S.names.join(" ");
$("#diceInfo").textContent = "初级骰子 · 6 个结果";
renderModes(); renderNames(); renderTrafficStats(); renderBank();
setDie(ri(1, 6), false);
syncChrome();

/* test hooks (harmless in production) */
window.__heartbeat = {
  get state() { return S; },
  go: v => { routeHistory.length = 0; show(v); },
  /* set() 也走 schema 白名单，避免写入已废弃的键（如 points） */
  set: patch => {
    Object.keys(patch).forEach(k => { if (SCHEMA_KEYS.indexOf(k) >= 0) S[k] = patch[k]; });
    save(); renderModes(); renderNames(); syncChrome();
  },
  pick: pickKind,
  spin: spinWheel, roll: rollDice, tap: tapTraffic,
  reset() { try { localStorage.removeItem(KEY); } catch (e) {} S = clone(DEFAULTS); location.reload(); }
};
})();
