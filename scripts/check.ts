// 全ステージを解いて、最少のターン数と手順を出す。
// 使い方: npm run check
import { LEVELS } from '../src/game/levels';
import { solve } from '../src/game/solve';

LEVELS.forEach((level, i) => {
  const best = solve(level, level.par + 2);
  console.log(`ステージ ${i + 1}: par ${level.par}・最少 ${best ? best.length : '解けない'}・${best ? best.map((a) => a ?? '待つ').join(' → ') : ''}`);
});
