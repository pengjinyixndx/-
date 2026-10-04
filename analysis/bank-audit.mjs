/* Audit the question bank inside assets/app.js:
   - counts per tier/kind (must all be 20)
   - exact and normalised duplicates
   - near-duplicates via character-bigram Jaccard similarity
   - dare "opening mechanic" distribution (same-shape prompts are the thing
     that made the first draft feel repetitive) */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(process.argv[2] || ".");
const qjs = fs.readFileSync(path.join(ROOT, "assets", "questions.js"), "utf8");

/* load the bank exactly the way the browser does, rather than parsing it */
const sandbox = {};
vm.createContext(sandbox);
new vm.Script(qjs, { filename: "questions.js" }).runInContext(sandbox);
const BANK = sandbox.HEARTBEAT_BANK;
if (!BANK) throw new Error("HEARTBEAT_BANK not exported by assets/questions.js");

const KINDS = ["truth", "dare"];
const TIERS = ["mild", "spicy", "fierce", "burning", "edge", "extreme", "forbidden"];
const TIER_CN = { mild: "温和", spicy: "热辣", fierce: "猛烈", burning: "灼热",
                  edge: "临界", extreme: "极限", forbidden: "禁区" };
/* the user's explicit call: prompts that hand control back to the partner are
   dead weight — in the moment both people freeze and say nothing. Ban them. */
const BANNED = [
  [/由对方/, "「由对方…」类机制"],
  [/对方指定/, "「对方指定」类机制"],
  [/对方宣布/, "「对方宣布」类机制"],
  [/对方决定/, "「对方决定」类机制"],
  [/由他\/她决定/, "「由他/她决定」类机制"],
  [/对方提要求/, "「对方提要求」"]
];

const norm = s => s.replace(/[\s，。、？！「」（）·—…,.?!]/g, "");
function bigrams(s) {
  const n = norm(s), out = new Set();
  for (let i = 0; i < n.length - 1; i++) out.add(n.slice(i, i + 2));
  return out;
}
function jaccard(a, b) {
  const A = bigrams(a), B = bigrams(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
/* 每个大冒险的「动作机制」。顺序有意义：先判具体动作，再落到泛化的触碰/抚摸。 */
const MECHANICS = [
  ["耳语/耳边", /耳/], ["亲吻/嘴唇", /亲|吻|嘴唇/],
  /* 隔衣接触敏感部位：临界档的核心意图。
     同一个部位，「按压 / 托贴 / 推移」是不同动作，分开统计才看得出是否真的重复。 */
  ["隔衣-按压", /(隔着[^。]{0,10}(按|压|盖)|(按|压)住(对方)?(胸口|胸前|大腿内侧|腿内侧|臀)|盖住对方胸口)/],
  ["隔衣-托贴", /(贴着|贴住|包住|贴着不动|停住|停着|贴上去|让布料贴住|衣服贴得最紧)/],
  ["隔衣-推移", /(往上推|往上移|从下往上|慢慢往上|一路按|来回|打圈|碾)/],
  ["隔衣-指尖", /(指腹|指尖|手指|拇指|手背|两根手指)/],
  ["隔衣-腿/身体", /(膝盖|大腿|用身体|用胸口|用整个身体的重量|用肘)/],
  ["隔衣-口", /(吻|嘴唇|含|咬)[^。]{0,14}隔着/],
  ["隔衣接触", /隔着衣|隔着布料|隔着裤|隔着最后|让布料贴住|衣服贴得最紧/],
  ["敏感部位", /胸口|胸前|大腿内侧|腿内侧|臀|屁股/],
  ["解开衣物", /扣子|衣物|脱|外套|裤腰|内衣|褪|解下来/], ["拥抱", /抱/],
  ["悬空/抱起", /抱起来|托起来|离地|悬空|拎起来/],
  ["压制/控制", /按住|绑|压住|扣住|不许动|不许逃|反扣|重量压住|锁住|扣在|按在/],
  ["对视", /对视|眼睛|闭眼/],
  ["说话/表白", /说|讲|表白|叫|夸/], ["触摸猜测", /猜/], ["距离/靠近", /靠近|距离|贴上|贴墙/],
  ["交换/给予", /交换|交给|给对?方/], ["对方决定", /由对方|让对方决定|对方指定|对方宣布/],
  ["表演/动作", /模仿|跳|唱|画|复述|编/],
  /* 禁区档用：进身体、用嘴、用手、体位 */
  ["进入/体位", /进去|进入|顶|从后面|从背后|坐上去|跨坐|侧入|抬起腰|分开腿|缠在|架在肩|架到腰|分到最开/],
  ["用嘴", /用嘴|用舌头|用舌尖|含住|舔/],
  ["用手", /用手|用手指|指尖|手掌|用手掌|用手把|托住/],
  ["触碰/抚摸", /碰|摸|抚|划|描/],
  ["贴紧/摩擦", /贴|按|压|揉|碾|来回|摩擦|收紧|夹住|分开/]
];
function mechanicOf(text) {
  for (const [label, re] of MECHANICS) if (re.test(text)) return label;
  return "其他";
}

let problems = 0;
const report = [];
for (const tier of TIERS) {
  for (const kind of KINDS) {
    const items = BANK[tier][kind];
    const label = `${TIER_CN[tier]}·${kind === "truth" ? "真心话" : "大冒险"}`;
    const issues = [];

    if (items.length !== 50) issues.push(`数量 ${items.length}（应为 50）`);

    /* exact + normalised duplicates */
    const seen = new Map();
    items.forEach((t, i) => {
      const k = norm(t);
      if (seen.has(k)) issues.push(`重复 #${seen.get(k) + 1} 与 #${i + 1}：${t}`);
      else seen.set(k, i);
    });

    /* near duplicates */
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const s = jaccard(items[i], items[j]);
        if (s >= 0.42) issues.push(`相似 ${(s * 100).toFixed(0)}% #${i + 1}/#${j + 1}：${items[i]}  ≈  ${items[j]}`);
      }
    }

    /* banned mechanics */
    items.forEach((t, i) => {
      for (const [re, label] of BANNED) {
        if (re.test(t)) issues.push(`禁用机制 ${label} #${i + 1}：${t}`);
      }
    });

    /* cross-tier duplicates (same prompt appearing in two tiers) */
    for (const other of TIERS) {
      if (other === tier) continue;
      const otherItems = BANK[other][kind].map(norm);
      items.forEach((t, i) => {
        if (otherItems.includes(norm(t))) issues.push(`与「${TIER_CN[other]}」层完全相同：#${i + 1} ${t}`);
      });
    }

    const mech = {};
    if (kind === "dare") items.forEach(t => { const m = mechanicOf(t); mech[m] = (mech[m] || 0) + 1; });
    /* a tier dominated by one mechanic reads as repetitive even when every line
       is unique — the user hit exactly this (24/50 opened with 嘴唇/舌尖).
       「其他」 is the catch-all for mechanics this script has no label for, so a
       high 其他 share means the labels are too coarse, not that the tier repeats. */
    if (kind === "dare") {
      const named = Object.entries(mech).filter(([k]) => k !== "其他").sort((a, b) => b[1] - a[1]);
      const top = named[0];
      if (top && top[1] / items.length > 0.4) {
        issues.push(`机制单一：「${top[0]}」占 ${top[1]}/${items.length}（>40%），读起来会重复`);
      }
      const other = mech["其他"] || 0;
      if (other / items.length > 0.5) {
        issues.push(`提示：${other}/${items.length} 条未归类（>50%），建议给 MECHANICS 补规则`);
      }
    }

    report.push({ label, count: items.length, issues, mech });
  }
}

console.log("\n── 题库审计 ──");
for (const r of report) {
  const mechTxt = r.mech && Object.keys(r.mech).length
    ? "  机制分布: " + Object.entries(r.mech).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(" ")
    : "";
  console.log(`\n${r.label}  (${r.count} 条)${mechTxt}`);
  if (!r.issues.length) console.log("  ✓ 无重复、无高相似项");
  else r.issues.forEach(i => { console.log("  ✗ " + i); problems++; });
}
/* the earlier audit double-counted per item; recompute honestly */
const realProblems = report.reduce((n, r) => n + r.issues.length, 0);
console.log(`\n合计 ${report.reduce((n, r) => n + r.count, 0)} 条题目，${realProblems} 个问题`);
process.exit(realProblems ? 1 : 0);
