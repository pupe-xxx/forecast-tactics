// ルール。敵が次にすることが全部見えている盤で、1手ずつ動いて、当たらずにゴールへ着く（または敵を全滅させる）。
// 1ターンの流れ：自分が1手打つ → 弓兵が予告どおりに撃つ → 追手が予告どおりに動く → 次の予告が決まる。
// このフォルダ（src/game）は画面の処理に触れない。document・Canvas・Math.random は使わない。
import { DIRS, hexDist, hexOf, inBoard, keyOf, type Hex } from './hex';

export type Status = 'playing' | 'cleared' | 'failed';
export type EnemyKind = 'chaser' | 'archer';

export interface Level {
  radius: number;
  walls: Hex[];
  holes: Hex[];
  player: Hex;
  /** ゴールのマス。null なら「敵を全滅させる」ステージ */
  goal: Hex | null;
  chasers: Hex[];
  archers: Hex[];
  /** ★3 になるターン数（最少のターン数） */
  par: number;
}

export interface Enemy {
  kind: EnemyKind;
  cell: string;
  alive: boolean;
  /** 追手の予告：次に入るマス */
  target: string | null;
  /** 弓兵の予告：次に撃つ向き（0〜5）。撃たないなら -1 */
  aim: number;
}

export interface State {
  radius: number;
  walls: string[];
  holes: string[];
  player: string;
  goal: string | null;
  enemies: Enemy[];
  turns: number;
  par: number;
  /** このターン数までにクリアできなければ失敗 */
  limit: number;
  status: Status;
  /** 失敗の理由 */
  lost: 'chaser' | 'archer' | 'time' | null;
}

/** 1手。隣のマス（動く。敵がいれば倒す）か、null（その場で待つ） */
export type Action = string | null;

/** 弓兵が撃った矢。from から to まで飛んだ */
export interface Shot {
  from: string;
  to: string;
}

/** 弓兵の矢が届く距離 */
export const ARCHER_RANGE = 5;
/** ★3 のターン数より、何ターン多く使えるか */
export const EXTRA_TURNS = 6;

const enemyAt = (state: State, cell: string): number => state.enemies.findIndex((e) => e.alive && e.cell === cell);

/** 弓兵から dir の向きに飛ぶ矢が、最初に当たるもの。壁か盤の端か届く距離の限りで止まる */
function arrowHit(state: State, from: string, dir: number): { cell: string; hit: 'player' | number | null } {
  const [dq, dr] = DIRS[dir];
  let [q, r] = hexOf(from);
  let cell = from;
  for (let step = 0; step < ARCHER_RANGE; step++) {
    q += dq;
    r += dr;
    if (!inBoard(q, r, state.radius) || state.walls.includes(keyOf(q, r))) break;
    cell = keyOf(q, r);
    if (cell === state.player) return { cell, hit: 'player' };
    const enemy = enemyAt(state, cell);
    if (enemy >= 0) return { cell, hit: enemy };
  }
  return { cell, hit: null };
}

/**
 * 今の位置から、敵の次の予告を決める。
 * 追手は、自分に一番近づく隣のマスへ入る（同じ近さなら DIRS の順で先の向き）。穴も避けない。
 * 弓兵は、自分がまっすぐ先に見えていれば、その向きに撃つ。
 */
function withPlans(state: State): State {
  const player = hexOf(state.player);
  const enemies = state.enemies.map((enemy): Enemy => {
    if (!enemy.alive) return { ...enemy, target: null, aim: -1 };
    if (enemy.kind === 'archer') {
      const aim = [0, 1, 2, 3, 4, 5].find((dir) => arrowHit(state, enemy.cell, dir).hit === 'player') ?? -1;
      return { ...enemy, target: null, aim };
    }
    const [q, r] = hexOf(enemy.cell);
    let target: string | null = null;
    let best = Infinity;
    for (const [dq, dr] of DIRS) {
      const next: Hex = [q + dq, r + dr];
      if (!inBoard(next[0], next[1], state.radius) || state.walls.includes(keyOf(...next))) continue;
      const d = hexDist(next, player);
      if (d < best) {
        best = d;
        target = keyOf(...next);
      }
    }
    return { ...enemy, target, aim: -1 };
  });
  return { ...state, enemies };
}

export function createState(level: Level, limit: number = level.par + EXTRA_TURNS): State {
  const enemy = (kind: EnemyKind) => ([q, r]: Hex): Enemy => ({ kind, cell: keyOf(q, r), alive: true, target: null, aim: -1 });
  return withPlans({
    radius: level.radius,
    walls: level.walls.map(([q, r]) => keyOf(q, r)),
    holes: level.holes.map(([q, r]) => keyOf(q, r)),
    player: keyOf(...level.player),
    goal: level.goal ? keyOf(...level.goal) : null,
    enemies: [...level.chasers.map(enemy('chaser')), ...level.archers.map(enemy('archer'))],
    turns: 0,
    par: level.par,
    limit,
    status: 'playing',
    lost: null,
  });
}

/** 弓兵が予告している矢の通り道（描画用）。from の隣から、当たるマスか止まるマスまで */
export function aimedCells(state: State, enemy: Enemy): string[] {
  if (!enemy.alive || enemy.aim < 0) return [];
  const [dq, dr] = DIRS[enemy.aim];
  const end = arrowHit(state, enemy.cell, enemy.aim).cell;
  const cells: string[] = [];
  let [q, r] = hexOf(enemy.cell);
  while (keyOf(q, r) !== end) {
    q += dq;
    r += dr;
    cells.push(keyOf(q, r));
  }
  return cells;
}

/** そのマスへ、今の手で動けるか（隣で、盤の中で、壁でも穴でもない。敵がいれば倒す手になる） */
export function canStep(state: State, cell: string): boolean {
  if (state.status !== 'playing') return false;
  const to = hexOf(cell);
  if (hexDist(hexOf(state.player), to) !== 1 || !inBoard(to[0], to[1], state.radius)) return false;
  if (state.walls.includes(cell)) return false;
  return enemyAt(state, cell) >= 0 || !state.holes.includes(cell);
}

const noneAlive = (state: State): boolean => state.enemies.every((e) => !e.alive);

/**
 * 1手打ち、敵が予告どおりに動いた後の状態を新しく返す（元の状態は変えない）。打てない手なら null。
 * shots は、このターンに弓兵が撃った矢。
 */
export function act(state: State, action: Action): { state: State; shots: Shot[] } | null {
  if (state.status !== 'playing') return null;
  if (action !== null && !canStep(state, action)) return null;

  // 自分の手。隣に敵がいれば倒し、いなければ動く
  let enemies = state.enemies;
  let player = state.player;
  if (action !== null) {
    const victim = enemyAt(state, action);
    if (victim >= 0) enemies = enemies.map((e, i) => (i === victim ? { ...e, alive: false } : e));
    else player = action;
  }
  let next: State = { ...state, player, enemies, turns: state.turns + 1 };
  const cleared = (s: State) => (s.goal ? s.player === s.goal : noneAlive(s));
  if (cleared(next)) return { state: withPlans({ ...next, status: 'cleared' }), shots: [] };

  // 弓兵が撃つ。矢は最初に当たった駒に刺さる（敵どうしでも当たる）
  const shots: Shot[] = [];
  let lost: State['lost'] = null;
  next.enemies.forEach((enemy, i) => {
    if (enemy.kind !== 'archer' || enemy.aim < 0 || !next.enemies[i].alive) return;
    const { cell, hit } = arrowHit(next, enemy.cell, enemy.aim);
    shots.push({ from: enemy.cell, to: cell });
    if (hit === 'player') lost ??= 'archer';
    else if (hit !== null) next = { ...next, enemies: next.enemies.map((e, k) => (k === hit ? { ...e, alive: false } : e)) };
  });

  // 追手が動く。番号の小さい順。入る先にほかの敵がいれば動かない。穴に入ると落ちる
  next.enemies.forEach((enemy, i) => {
    const target = enemy.target;
    if (enemy.kind !== 'chaser' || target === null || !next.enemies[i].alive) return;
    if (target === next.player) {
      lost ??= 'chaser';
      return;
    }
    if (enemyAt(next, target) >= 0) return;
    const alive = !next.holes.includes(target);
    next = { ...next, enemies: next.enemies.map((e, k) => (k === i ? { ...e, cell: target, alive } : e)) };
  });

  if (!lost && !cleared(next) && next.turns >= next.limit) lost = 'time';
  const status: Status = lost ? 'failed' : cleared(next) ? 'cleared' : 'playing';
  return { state: withPlans({ ...next, status, lost }), shots };
}

/** クリアした時の星の数 */
export function starsOf(state: State): number {
  if (state.status !== 'cleared') return 0;
  if (state.turns <= state.par) return 3;
  if (state.turns <= state.par + 2) return 2;
  return 1;
}
