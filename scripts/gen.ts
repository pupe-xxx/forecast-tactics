// ステージを作って src/game/levels.gen.ts に書き出す。
// 使い方: npm run gen
// 乱数の種は固定なので、何度実行しても同じステージができる。段階（TIERS）を変えた時だけ中身が変わる。
import { writeFileSync } from 'node:fs';
import { boardCells, hexDist, type Hex } from '../src/game/hex';
import { act, createState, type Level } from '../src/game/rules';
import { solve } from '../src/game/solve';
import { createRng, type Rng } from '../src/kit/rng';

type Range = readonly [min: number, max: number];

interface Tier {
  radius: number;
  /** true なら「ゴールに着く」、false なら「敵を全滅させる」 */
  goal: boolean;
  chasers: Range;
  archers: Range;
  walls: Range;
  holes: Range;
  par: Range;
  count: number;
}

// 後ろの段階ほど、盤が広く、敵が多く、最少のターン数が多い
const TIERS: Tier[] = [
  { radius: 2, goal: true, chasers: [1, 2], archers: [0, 0], walls: [1, 3], holes: [0, 1], par: [4, 6], count: 3 },
  { radius: 2, goal: true, chasers: [1, 1], archers: [1, 2], walls: [1, 3], holes: [0, 1], par: [4, 6], count: 3 },
  { radius: 3, goal: false, chasers: [2, 2], archers: [0, 1], walls: [2, 4], holes: [1, 3], par: [4, 7], count: 4 },
  { radius: 3, goal: true, chasers: [2, 3], archers: [1, 2], walls: [3, 6], holes: [1, 3], par: [6, 9], count: 4 },
  { radius: 3, goal: false, chasers: [3, 3], archers: [1, 2], walls: [3, 6], holes: [2, 4], par: [6, 9], count: 4 },
  { radius: 3, goal: true, chasers: [3, 4], archers: [2, 2], walls: [3, 6], holes: [1, 3], par: [8, 11], count: 3 },
];

const between = (rng: Rng, [min, max]: Range) => min + rng.int(max - min + 1);

function randomLevel(rng: Rng, tier: Tier): Level {
  const cells: Hex[] = boardCells(tier.radius);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const take = (n: number) => cells.splice(0, n);
  const [player] = take(1);
  return {
    radius: tier.radius,
    player,
    goal: tier.goal ? take(1)[0] : null,
    chasers: take(between(rng, tier.chasers)),
    archers: take(between(rng, tier.archers)),
    walls: take(between(rng, tier.walls)),
    holes: take(between(rng, tier.holes)),
    par: 0,
  };
}

/** 面白いステージだけ通す。通ったら par を入れて返す */
function accept(level: Level, tier: Tier): Level | null {
  // 始まった時から隣に敵がいると、考える前に当たる
  if ([...level.chasers, ...level.archers].some((e) => hexDist(e, level.player) < 2)) return null;
  const best = solve(level, tier.par[1]);
  if (!best || best.length < tier.par[0]) return null;
  // ゴールへまっすぐ歩くだけで着くステージは外す
  if (level.goal && best.length < hexDist(level.player, level.goal) + 2) return null;
  // 待っているだけで敵が全滅するステージは外す
  if (!level.goal) {
    let state = createState(level, best.length + 1);
    while (state.status === 'playing') state = act(state, null)!.state;
    if (state.status === 'cleared') return null;
  }
  // 待つ手が半分を超える手順は、見ているだけになるので外す
  if (best.filter((a) => a === null).length * 2 > best.length) return null;
  return { ...level, par: best.length };
}

const levels: Level[] = [];
TIERS.forEach((tier, t) => {
  const rng = createRng(5000 + t);
  let found = 0;
  for (let tries = 0; found < tier.count && tries < 200000; tries++) {
    const level = accept(randomLevel(rng, tier), tier);
    if (!level) continue;
    levels.push(level);
    found++;
  }
  console.log(`段階 ${t + 1}: ${found} / ${tier.count}`);
});

const lines = levels.map((l) => `  ${JSON.stringify(l)},`);
writeFileSync(
  new URL('../src/game/levels.gen.ts', import.meta.url),
  `// scripts/gen.ts が書き出したステージ。手で直さない（直したい時は scripts/gen.ts を変えて npm run gen）。\nimport type { Level } from './rules';\n\nexport const GENERATED: Level[] = [\n${lines.join('\n')}\n];\n`,
);
console.log(`${levels.length} ステージを書き出した: src/game/levels.gen.ts`);
