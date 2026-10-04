/* Minimal DOM + browser shim so assets/app.js can be executed and driven under
   Node. Purpose: catch runtime errors and integration bugs a syntax check cannot
   see (stale selectors, broken state transitions, bad event wiring).
   It is not a rendering engine and makes no claims about visuals. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(process.argv[2] || ".");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(ROOT, "assets", "app.js"), "utf8");
const questionsJs = fs.readFileSync(path.join(ROOT, "assets", "questions.js"), "utf8");

/* ── elements ── */
const VOID = new Set(["meta", "link", "br", "hr", "img", "input", "source", "path", "circle", "rect", "use"]);

class El {
  constructor(tag) {
    this.tagName = (tag || "").toUpperCase();
    this.attrs = new Map();
    this.children = [];
    this.parent = null;
    this.dataset = {};
    this.style = new Proxy({}, { get: (t, k) => t[k] ?? "", set: (t, k, v) => (t[k] = v, true) });
    this._text = "";
    this._html = "";
    this._handlers = new Map();
    this.hidden = false;
    this.disabled = false;
    this.value = "";
  }
  /* single source of truth for classes: the `class` attribute */
  get className() { return this.attrs.get("class") || ""; }
  set className(v) { this.attrs.set("class", String(v)); }
  get classList() {
    const el = this;
    const list = () => el.className.split(/\s+/).filter(Boolean);
    const write = a => { el.className = a.join(" "); };
    return {
      add: (...c) => write([...new Set(list().concat(c))]),
      remove: (...c) => write(list().filter(x => !c.includes(x))),
      contains: c => list().includes(c),
      toggle: (c, f) => (f === undefined ? (list().includes(c) ? write(list().filter(x => x !== c)) : write(list().concat(c)))
                                        : (f ? write([...new Set(list().concat(c))]) : write(list().filter(x => x !== c))))
    };
  }
  get id() { return this.attrs.get("id") || ""; }
  setAttribute(k, v) {
    this.attrs.set(k, String(v));
    if (k === "class") this.className = v;
    if (k.startsWith("data-")) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v);
  }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  get textContent() {
    const own = this.tagName === "#TEXT" ? this._text : (this._text || "");
    return own + this.children.map(c => c.textContent).join("");
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._text = ""; this._html = String(v); this.children = []; parseInto(this._html, this); }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  addEventListener(t, fn) { if (!this._handlers.has(t)) this._handlers.set(t, []); this._handlers.get(t).push(fn); }
  removeEventListener() {}
  dispatch(type, ev = {}) {
    const e = Object.assign({ type, target: this, preventDefault() {}, stopPropagation() {} }, ev);
    let node = this;
    while (node) { (node._handlers.get(type) || []).forEach(fn => fn.call(node, e)); node = node.parent; }
  }
  click() { this.dispatch("click"); }
  blur() { this.dispatch("blur"); }
  focus() {}
  closest(sel) { let n = this; while (n) { if (matches(n, sel)) return n; n = n.parent; } return null; }
  matches(sel) { return matches(this, sel); }
  querySelectorAll(sel) {
    const out = [];
    const walk = n => n.children.forEach(c => { if (matches(c, sel)) out.push(c); walk(c); });
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  getContext() {
    const noop = () => {};
    const grad = { addColorStop: noop };
    return new Proxy({}, {
      get: (t, k) => {
        if (k === "createRadialGradient" || k === "createLinearGradient") return () => grad;
        if (k === "canvas") return { width: 720, height: 720 };
        return t[k] ?? noop;
      },
      set: (t, k, v) => (t[k] = v, true)
    });
  }
  getBoundingClientRect() { return { top: 0, left: 0, right: 430, bottom: 932, width: 430, height: 932 }; }
  scrollTo() {}
}

/* ── selector engine: comma groups, descendant combinators, tag/#id/.class/[attr=v] ── */
const selCache = new Map();
function compile(sel) {
  if (selCache.has(sel)) return selCache.get(sel);
  const groups = String(sel).split(",").map(g => g.trim()).filter(Boolean).map(group =>
    group.split(/\s+/).map(part => {
      const m = { tag: null, id: null, cls: [], attr: [] };
      const re = /([#.]?[\w-]+|\[[^\]]+\])/g;
      let t;
      while ((t = re.exec(part))) {
        const tok = t[0];
        if (tok.startsWith("#")) m.id = tok.slice(1);
        else if (tok.startsWith(".")) m.cls.push(tok.slice(1));
        else if (tok.startsWith("[")) m.attr.push(tok.slice(1, -1));
        else m.tag = tok.toUpperCase();
      }
      return m;
    })
  );
  selCache.set(sel, groups);
  return groups;
}
function simpleMatch(el, m) {
  if (!m) return true;
  if (m.tag && el.tagName !== m.tag) return false;
  if (m.id && el.id !== m.id) return false;
  if (m.cls.some(c => !el.classList.contains(c))) return false;
  for (const a of m.attr) {
    const i = a.indexOf("=");
    if (i < 0) { if (!el.attrs.has(a)) return false; }
    else {
      const k = a.slice(0, i), v = a.slice(i + 1).replace(/^["']|["']$/g, "");
      if (el.attrs.get(k) !== v) return false;
    }
  }
  return true;
}
function matches(el, sel) {
  return compile(sel).some(chain => {
    if (!simpleMatch(el, chain[chain.length - 1])) return false;
    let node = el.parent, i = chain.length - 2;
    while (i >= 0) {
      if (!node) return false;
      if (simpleMatch(node, chain[i])) i--;
      node = node.parent;
    }
    return true;
  });
}

/* ── HTML parser ── */
const ATTR_RE = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const TAG_RE = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)(\/?)>/gi;
const applyAttrs = (el, attrs) => {
  const ar = new RegExp(ATTR_RE.source, "g");
  let a;
  while ((a = ar.exec(attrs || ""))) el.setAttribute(a[1], a[2] ?? a[3] ?? a[4] ?? "");
};
const isBlank = s => !s || !s.trim();

function nextClose(s, from, tag) {
  const re = new RegExp("<(/?)" + tag + "(?=[\\s/>])[^>]*>", "gi");
  re.lastIndex = from;
  let depth = 0, m;
  while ((m = re.exec(s))) {
    if (m[1] === "/") { if (depth === 0) return m.index; depth--; }
    else depth++;
  }
  return s.length;
}
/* parse the first element of s → [element|null, charsConsumed] */
function parseOne(s) {
  TAG_RE.lastIndex = 0;
  const m = TAG_RE.exec(s);
  if (!m) { const t = new El("#text"); t._text = s; return [t, s.length]; }
  if (m.index > 0) {
    /* leading text node — keep it so textContent resolves like a browser */
    const txt = s.slice(0, m.index);
    if (!isBlank(txt)) { const t = new El("#text"); t._text = txt; return [t, m.index]; }
  }
  if (m[0].startsWith("<!") || m[0].startsWith("<!--") || m[1]) return [null, TAG_RE.lastIndex];
  const el = new El(m[2]);
  applyAttrs(el, m[3]);
  const start = TAG_RE.lastIndex;
  if (m[4] || VOID.has(m[2].toLowerCase())) return [el, start];
  const close = nextClose(s, start, m[2]);
  parseInto(s.slice(start, close), el);
  const ct = new RegExp("</" + m[2] + "\\s*>", "i").exec(s.slice(close));
  return [el, close + (ct ? ct[0].length : 0)];
}
function parseInto(s, parent) {
  let i = 0;
  while (i < s.length) {
    const [el, used] = parseOne(s.slice(i));
    if (el) parent.appendChild(el);
    if (used <= 0) break;
    i += used;
  }
  return parent;
}

const root = new El("html");
parseInto(html, root);

/* ── window/document shim ── */
const store = new Map();
const document = {
  documentElement: root,
  body: root.querySelector("body") || new El("body"),
  querySelector: s => root.querySelector(s),
  querySelectorAll: s => root.querySelectorAll(s),
  createElement: t => new El(t),
  addEventListener: (t, fn) => root.addEventListener(t, fn),
  title: ""
};
const timeouts = [];
const frames = [];
const win = {
  document,
  innerWidth: 430,
  innerHeight: 932,
  devicePixelRatio: 1,
  requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
  cancelAnimationFrame: () => {},
  setTimeout: fn => { timeouts.push(fn); return timeouts.length; },
  clearTimeout: () => {},
  setInterval: () => 1,
  clearInterval: () => {},
  performance: { now: () => Date.now() },
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
  },
  scrollTo: () => {},
  addEventListener: () => {},
  matchMedia: () => ({ matches: false, addListener() {}, addEventListener() {} }),
  getComputedStyle: () => ({ getPropertyValue: () => "" }),
  AudioContext: undefined,
  webkitAudioContext: undefined
};
win.window = win;
win.self = win;
win.globalThis = win;

/* ── run the app ── */
const errors = [];
const ctx = vm.createContext(win);
try {
  /* same load order as index.html */
  new vm.Script(questionsJs, { filename: "questions.js" }).runInContext(ctx);
  new vm.Script(appJs, { filename: "app.js" }).runInContext(ctx);
} catch (e) { errors.push("boot: " + e.stack); }

const hb = win.__heartbeat;
const results = [];
const $ = s => root.querySelector(s);
const $$ = s => root.querySelectorAll(s);

/* drive queued animation frames and setTimeout callbacks.
   `batches` limits how many generations of timeouts are released, so a test can
   tap while the green window is still open instead of racing past it. */
function runTimers(batches = 60) {
  for (let i = 0; i < batches; i++) {
    for (let f = 0; f < 500 && frames.length; f++) {
      const fn = frames.shift();
      try { fn(Date.now()); } catch (e) { errors.push("frame: " + e.message); }
    }
    const batch = timeouts.splice(0, timeouts.length);
    batch.forEach(fn => { try { fn(); } catch (e) { errors.push("timer: " + e.message); } });
  }
}
const check = (name, fn) => {
  try { const msg = fn(); results.push([true, name, msg || ""]); }
  catch (e) { results.push([false, name, e.message]); }
};
const currentView = () => ($$(".view").find(v => v.classList.contains("is-active")) || {}).dataset?.view;
const b_cls = el => el.className;

if (!hb) {
  results.push([false, "expose __heartbeat", "not found — app threw during boot"]);
} else {
  check("initial state loads", () => "intensity=" + hb.state.intensity + " names=" + hb.state.names.length);
  check("set names + unlock tiers", () => {
    hb.set({ names: ["阿泽", "小满"], intensity: "fierce", unlocked: ["mild", "spicy", "fierce", "burning", "edge", "extreme", "forbidden"], points: 200 });
    if (hb.state.names.length !== 2) throw new Error("names not stored");
    return "ok";
  });
  check("setup renders 7 intensity rows", () => {
    hb.go("setup");
    const modes = $$("#intensityList .mode");
    if (modes.length !== 7) throw new Error("expected 7 rows, got " + modes.length);
    return modes.map(x => x.dataset.tier).join(",");
  });
  check("truth view renders a card", () => {
    hb.go("truth");
    if (!$("#cardText").textContent.trim()) throw new Error("card text empty");
    return $("#cardKind").textContent + ": " + $("#cardText").textContent.slice(0, 22) + "...";
  });
  check("choosing 真心话 yields a truth card", () => {
    hb.set({ intensity: "spicy" });
    hb.go("truth");
    hb.pick("truth");
    runTimers(8);
    if ($("#cardKind").textContent !== "真心话") throw new Error("kind = " + $("#cardKind").textContent);
    return $("#cardText").textContent.slice(0, 24) + "...";
  });
  check("choosing 大冒险 yields a dare card", () => {
    hb.pick("dare");
    runTimers(8);
    if ($("#cardKind").textContent !== "大冒险") throw new Error("kind = " + $("#cardKind").textContent);
    return $("#cardText").textContent.slice(0, 24) + "...";
  });
  check("turn rotates between players", () => {
    const seen = new Set();
    for (let i = 0; i < 4; i++) { hb.pick("truth"); runTimers(8); seen.add($("#cardWho").textContent); }
    if (seen.size < 2) throw new Error("never rotated: " + [...seen]);
    return [...seen].join(" / ");
  });
  check("points accrue on draw", () => {
    const before = hb.state.points;
    $("#btnNext").click(); runTimers(8);
    $("#btnNext").click(); runTimers(8);
    if (hb.state.points <= before) throw new Error("no growth (" + before + " -> " + hb.state.points + ")");
    return before + " -> " + hb.state.points;
  });
  check("wheel spin resolves a segment", () => {
    hb.go("wheel");
    hb.spin();
    runTimers(90);
    const v = $("#wheelValue").textContent;
    if (!v || v === "…" || v === "—") throw new Error("no value: " + v);
    return v;
  });
  check("dice roll resolves a face + action", () => {
    hb.go("dice");
    hb.roll();
    runTimers(60);
    const n = $("#dieNum").textContent;
    if (!/^[1-6]$/.test(n)) throw new Error("face = " + n);
    if (!$("#dieText").textContent.trim()) throw new Error("action text empty");
    return n + " -> " + $("#dieText").textContent;
  });
  check("traffic light: green tap wins", () => {
    hb.go("traffic");
    hb.tap();                     /* red */
    runTimers(1);                 /* release only the red→green delay */
    if ($("#lightLabel").textContent.indexOf("绿灯") < 0) throw new Error("not green: " + $("#lightLabel").textContent);
    hb.tap();                     /* tap on green */
    const label = $("#lightLabel").textContent;
    if (label.indexOf("过了") < 0) throw new Error("did not win: " + label);
    if (hb.state.stats.wins < 1) throw new Error("win not recorded");
    return label + " · wins=" + hb.state.stats.wins;
  });
  check("traffic light: missing the window loses", () => {
    hb.go("traffic");
    const rounds = hb.state.stats.rounds;
    hb.tap();
    runTimers(1);                 /* green */
    runTimers(1);                 /* let the window expire */
    const label = $("#lightLabel").textContent;
    if (label.indexOf("超时") < 0) throw new Error("not a timeout: " + label);
    if (hb.state.stats.rounds !== rounds + 1) throw new Error("round not counted");
    return label;
  });
  check("traffic light: false start detected", () => {
    hb.go("traffic");
    const before = hb.state.stats.rounds;
    hb.tap();
    hb.tap();
    const label = $("#lightLabel").textContent;
    if (!/抢跑/.test(label)) throw new Error("not detected: " + label);
    if (hb.state.stats.rounds !== before + 1) throw new Error("round not counted");
    return label;
  });
  check("custom question joins the deck", () => {
    hb.go("custom");
    $("#customText").value = "测试题：说出你今天最想说的一句话";
    $("#btnAddCustom").click();
    if (!(hb.state.custom.extreme || []).some(c => c.text.indexOf("测试题") >= 0)) throw new Error("not persisted");
    if ($("#bankList").textContent.indexOf("测试题") < 0) throw new Error("bank not re-rendered");
    return "ok";
  });
  check("locked tier renders the unlock price", () => {
    hb.set({ points: 0, unlocked: ["mild", "spicy"], intensity: "mild" });
    hb.go("setup");
    const ex = $$("#intensityList .mode").find(b => b.dataset.tier === "edge");
    if (!ex) throw new Error("edge row missing");
    if (!ex.classList.contains("is-locked")) throw new Error("row not marked locked");
    if (ex.textContent.indexOf("200") < 0) throw new Error("price not shown: " + ex.textContent);
    return ex.textContent.replace(/\s+/g, " ").trim().slice(0, 46);
  });
  check("mode drawer reflects the active tier", () => {
    hb.set({ points: 300, unlocked: ["mild", "spicy", "fierce", "burning", "edge", "extreme", "forbidden"], intensity: "fierce" });
    hb.go("truth");
    $("#btnTruthMode").click();                 /* open the drawer */
    if ($("#drawer").hidden) throw new Error("drawer did not open");
    const rows = $$("#drawerBody .dmode");
    if (rows.length !== 7) throw new Error("drawer rows = " + rows.length);
    const active = rows.filter(r => r.classList.contains("is-on"));
    if (active.length !== 1 || active[0].dataset.tier !== "fierce") throw new Error("active row wrong");
    rows.find(r => r.dataset.tier === "spicy").click();   /* switch tier from the drawer */
    if (hb.state.intensity !== "spicy") throw new Error("tier not switched");
    if (!$("#drawer").hidden) throw new Error("drawer did not close after pick");
    if ($("#truthModeName").textContent !== "热辣") throw new Error("header not updated: " + $("#truthModeName").textContent);
    return "fierce -> spicy via drawer";
  });
  /* ---- 18+ gate: promise-based, so it gets its own async block below ---- */
  check("18+ tier shows an age dialog instead of using window.confirm", () => {
    hb.set({ points: 0, unlocked: ["mild", "spicy"], intensity: "mild", adultAck: false });
    hb.go("setup");
    const row = $$("#intensityList .mode").find(b => b.dataset.tier === "forbidden");
    if (!row) throw new Error("禁区 row missing");
    if (row.textContent.indexOf("18+") < 0) throw new Error("18+ badge missing");
    /* 18+ is gated by the age dialog, not by 心跳值 */
    if (row.textContent.indexOf("心跳值") >= 0) throw new Error("禁区 should not be paywalled");
    row.click();
    if ($("#ask").hidden) throw new Error("age dialog did not open");
    if ($("#askBody").textContent.indexOf("成年") < 0) throw new Error("dialog missing consent copy");
    if (hb.state.intensity !== "mild") throw new Error("tier applied before confirmation");
    return "dialog shown, tier not applied yet";
  });
  check("question bank is complete and duplicate-free", () => {
    /* built-in prompts are 20 truths + 20 dares per tier; custom ones add on top */
    const customTexts = new Set();
    for (const tier of ["mild", "spicy", "fierce", "burning", "edge", "extreme", "forbidden"]) {
      (hb.state.custom[tier] || []).forEach(c => customTexts.add(c.text));
    }
    let total = 0;
    const seen = new Set();
    for (const tier of ["mild", "spicy", "fierce", "burning", "edge", "extreme", "forbidden"]) {
      const customCount = (hb.state.custom[tier] || []).length;
      hb.set({ intensity: tier });
      hb.go("truth");
      const deckSize = Number(($("#deckInfo").textContent.match(/牌堆 (\d+) 张/) || [])[1]);
      const expected = 100 + customCount;      /* 50 真心话 + 50 大冒险 */
      if (deckSize !== expected) throw new Error(`${tier}: deck ${deckSize}, expected ${expected}`);
      /* walk the whole deck and collect every built-in prompt actually served */
      for (let i = 0; i < deckSize; i++) {
        $("#btnNext").click();
        runTimers(2);
        const t = $("#cardText").textContent;
        if (customTexts.has(t)) continue;          /* skip用户自定义题 */
        if (seen.has(t)) throw new Error("built-in prompt served twice: " + t);
        seen.add(t);
        total++;
      }
    }
    if (total !== 700) throw new Error("distinct built-in prompts = " + total + " (expected 700)");
    return `7 tiers × 100 cards = ${total} distinct built-in prompts`;
  });
  check("no card hands control back to the partner", () => {
    /* 实测：双方脑子都空的时候，「由对方决定」这类卡会直接卡住，一律禁用 */
    const BANNED = [/由对方/, /对方指定/, /对方宣布/, /对方决定/, /由他\/她决定/, /对方提要求/];
    const offenders = [];
    for (const tier of ["mild", "spicy", "fierce", "burning", "edge", "extreme", "forbidden"]) {
      hb.set({ intensity: tier });
      hb.go("truth");
      const deckSize = Number(($("#deckInfo").textContent.match(/牌堆 (\d+) 张/) || [])[1]);
      for (let i = 0; i < deckSize; i++) {
        $("#btnNext").click();
        runTimers(2);
        const t = $("#cardText").textContent;
        if (BANNED.some(re => re.test(t))) offenders.push(tier + ": " + t);
      }
    }
    if (offenders.length) throw new Error(offenders.length + " card(s): " + offenders[0]);
    return "0 offenders across all 700 cards";
  });
  check("rules page has content", () => {
    hb.go("rules");
    const arts = $$("#view-rules article");
    if (arts.length < 5) throw new Error("only " + arts.length + " blocks");
    return arts.length + " blocks";
  });
  check("locked tier is blocked without points", () => {
    hb.set({ points: 0, unlocked: ["mild", "spicy"], intensity: "mild" });
    hb.go("setup");
    const locked = $$("#intensityList .mode").find(b => b.dataset.tier === "burning");
    if (!locked) throw new Error("burning row missing");
    locked.click();
    if (hb.state.intensity !== "mild") throw new Error("locked tier became active");
    return "blocked, intensity still " + hb.state.intensity;
  });
  check("unlocking spends points and activates", () => {
    hb.set({ points: 200 });
    hb.go("setup");
    $$("#intensityList .mode").find(b => b.dataset.tier === "edge").click();
    if (hb.state.intensity !== "edge") throw new Error("did not activate");
    if (hb.state.points !== 0) throw new Error("points = " + hb.state.points);
    return "unlocked edge, points 200 -> " + hb.state.points;
  });
  check("localStorage round-trip", () => {
    const raw = store.get("heartbeat-duo.v1");
    if (!raw) throw new Error("nothing persisted");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.names)) throw new Error("names missing");
    return Object.keys(parsed).join(",");
  });
}

runTimers(80);

/* ── async: the 18+ dialog resolves through a promise ── */
const drain = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
await drain();
if (hb) {
  try {
    const diag = {
      askHidden: $("#ask").hidden,
      priorIntensity: hb.state.intensity,
      priorAck: hb.state.adultAck
    };
    if ($("#ask").hidden) throw new Error("age dialog was not open; diag=" + JSON.stringify(diag));
    $("#askOk").click();
    await drain();
    runTimers(4);
    if (!hb.state.adultAck) throw new Error("adultAck not persisted; diag=" + JSON.stringify(diag));
    if (hb.state.intensity !== "forbidden") throw new Error("tier not applied after confirm: " + hb.state.intensity);
    if (!$("#ask").hidden) throw new Error("dialog did not close");
    hb.go("truth");
    const t = $("#cardText").textContent;
    if (!t.trim()) throw new Error("no card rendered for 禁区");
    results.push([true, "18+ tier unlocks after confirming age", "禁区 卡片: " + t.slice(0, 26) + "..."]);
  } catch (e) {
    results.push([false, "18+ tier unlocks after confirming age", e.message]);
  }
}

console.log("\n-- 心跳副本 · DOM smoke test --");
let fails = 0;
for (const [ok, name, msg] of results) {
  if (!ok) fails++;
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (msg ? "  ->  " + msg : ""));
}
if (errors.length) {
  console.log("\n-- runtime errors --");
  errors.slice(0, 8).forEach(e => console.log("  " + e.split("\n").slice(0, 4).join("\n     ")));
}
console.log("\n" + (results.length - fails) + "/" + results.length + " passed, " + errors.length + " runtime error(s)");
process.exit(fails || errors.length ? 1 : 0);
