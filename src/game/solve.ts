// 総当たりで最少のターン数を求める。ステージの確認と、ステージ作りに使う。
import { DIRS, hexOf, keyOf } from './hex';
import { act, createState, type Action, type Level, type State } from './rules';

// 予告は位置から決まるので、位置と生死だけで同じ盤面かどうかが分かる
const stateKey = (s: State): string => `${s.player}|${s.enemies.map((e) => (e.alive ? e.cell : 'x')).join(';')}`;

/** 今の位置から打てる手の候補（待つ・隣の6マス）。打てない手も混ざる */
export function candidates(state: State): Action[] {
  const [q, r] = hexOf(state.player);
  return [null, ...DIRS.map(([dq, dr]) => keyOf(q + dq, r + dr))];
}

/** 最少のターン数でクリアする手順。maxTurns ターンまでで届かなければ null */
export function solve(level: Level, maxTurns: number = 14): Action[] | null {
  const start = createState(level, Infinity);

  // 幅優先。同じ盤面は、最初に着いた時の手順だけ覚える
  let layer: { state: State; path: Action[] }[] = [{ state: start, path: [] }];
  const seen = new Set([stateKey(start)]);

  for (let depth = 1; depth <= maxTurns && layer.length > 0; depth++) {
    const next: { state: State; path: Action[] }[] = [];
    for (const node of layer) {
      for (const action of candidates(node.state)) {
        const result = act(node.state, action);
        if (!result || result.state.status === 'failed') continue;
        if (result.state.status === 'cleared') return [...node.path, action];
        const key = stateKey(result.state);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ state: result.state, path: [...node.path, action] });
      }
    }
    layer = next;
  }
  return null;
}
