/* 档位边界校验：敏感部位只能在「临界」及之后的档位出现。
 *
 * 这是用户明确定下的分界：
 *   猛烈 = 大幅动作，不碰敏感部位
 *   灼热 = 猛烈 + 更强力度与压制，仍不碰敏感部位
 *   临界 = 开始接触敏感部位（胸 / 大腿内侧 / 臀），但还不脱
 *   极限 = 衣物离开、直接触碰
 *   禁区 = 性行为本身
 *
 * 边界靠人眼守不住（700 条），所以用词表把它变成可执行的规则。
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(process.argv[2] || ".");
const sandbox = {};
vm.createContext(sandbox);
new vm.Script(fs.readFileSync(path.join(ROOT, "assets", "questions.js"), "utf8"),
  { filename: "questions.js" }).runInContext(sandbox);
const BANK = sandbox.HEARTBEAT_BANK;

/* 档位顺序（从轻到重） */
const ORDER = ["mild", "spicy", "fierce", "burning", "edge", "extreme", "forbidden"];
const CN = { mild: "温和", spicy: "热辣", fierce: "猛烈", burning: "灼热", edge: "临界", extreme: "极限", forbidden: "禁区" };

/* 敏感部位：第一处允许出现 = edge（临界） */
const SENSITIVE = /胸口|胸前|胸|乳|大腿内侧|腿内侧|臀|屁股|裆|胯|下体|私处/;
const SENSITIVE_FROM = "edge";

/* 脱衣 / 皮肤裸露：第一处允许出现 = extreme（极限）。
   注意「大腿内侧」属于敏感部位，已在上一档开放，这里不重复计。 */
const BARE = /脱掉|褪尽|褪下|全部拿掉|裸露|皮肤|光滑|赤|光着|插进|插入/;
const BARE_FROM = "extreme";

/* 性行为本身：第一处允许出现 = forbidden（禁区）。
   只匹配明确的行为词组，避免把「用嘴唇碰一下」这类轻触误判。 */
const SEX = /小花园|送上去|送到顶|失控一次|高潮|用嘴伺候|用嘴让对方|用嘴把他|用嘴把对方|含住|舌头|舔|进到对方|插/;
const SEX_FROM = "forbidden";

const problems = [];
const firstUse = {};

function check(tier, kind, items, re, label, allowedFrom) {
  const allowedIdx = ORDER.indexOf(allowedFrom);
  const tierIdx = ORDER.indexOf(tier);
  items.forEach((t, i) => {
    if (!re.test(t)) return;
    if (firstUse[label] === undefined) firstUse[label] = tier;
    if (tierIdx < allowedIdx) {
      problems.push(`[${label}] ${CN[tier]}·${kind === "truth" ? "真心话" : "大冒险"} #${i + 1} 出现过早：${t}`);
    }
  });
}

for (const tier of ORDER) {
  for (const kind of ["truth", "dare"]) {
    const items = BANK[tier][kind];
    check(tier, kind, items, SENSITIVE, "敏感部位", SENSITIVE_FROM);
    check(tier, kind, items, BARE, "直接触碰", BARE_FROM);
    check(tier, kind, items, SEX, "性行为", SEX_FROM);
  }
}

console.log("\n── 档位边界校验 ──");
console.log("首次出现位置（应 >= 允许档位）：");
for (const [label, tier] of Object.entries(firstUse)) {
  console.log(`  ${label.padEnd(6)} 首见于 ${CN[tier]}`);
}
if (problems.length) {
  console.log(`\n✗ ${problems.length} 处越界：`);
  problems.slice(0, 20).forEach(p => console.log("   " + p));
  if (problems.length > 20) console.log(`   …另有 ${problems.length - 20} 处`);
} else {
  console.log("\n✓ 700 条题目全部落在各自档位的边界内");
}
process.exit(problems.length ? 1 : 0);
