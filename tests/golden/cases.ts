// 動作記録に入れる場面。
// ステージごとに、最少の手順を順に打った時の盤面を並べる。
import { LEVELS } from '../../src/game/levels';
import { act, createState } from '../../src/game/rules';
import { solve } from '../../src/game/solve';
import { fingerprint, type Trace } from '../../src/kit/golden';

function traceLevel(index: number): Trace {
  const level = LEVELS[index];
  let state = createState(level);
  const trace = [fingerprint(state)];
  for (const action of solve(level, level.par) ?? []) {
    state = act(state, action)!.state;
    trace.push(fingerprint(state));
  }
  return trace;
}

export function goldenCases(): Record<string, Trace> {
  return Object.fromEntries(LEVELS.map((_, i) => [`stage ${i + 1}`, traceLevel(i)]));
}
