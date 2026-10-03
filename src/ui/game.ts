// このゲームの画面。盤と敵の予告を描き、タップを「動く・倒す・待つ」に直して、外枠（shell）に渡す。
import { boardCells, hexOf, inBoard, keyOf } from '../game/hex';
import { LEVELS } from '../game/levels';
import { act, aimedCells, canStep, createState, starsOf, type Shot, type State } from '../game/rules';
import { centerOf, hexAt, hexPath, layoutFor, type HexLayout } from './hexview';
import { t } from './i18n';
import type { Anim, GameDef } from './shell';

// 論理サイズ。描画はすべてこの座標で書く（実際の大きさは kit/scale が合わせる）
const VIEW = { width: 720, height: 720 } as const;
const COLORS = {
  bg: '#0a111b', cell: '#1c2e45', cellAlt: '#152236', grid: '#2a4060', wall: '#546e7a', hole: '#04070b',
  step: 'rgba(79,195,247,0.16)', goal: '#ffd54f', player: '#4fc3f7',
  chaser: '#ef5350', archer: '#ba68c8', danger: 'rgba(239,83,80,0.38)', dangerLine: '#ef5350', arrow: '#fff59d',
} as const;

const HINTS: [ja: string, en: string][] = [
  ['隣のマスをタップして動く。金色の輪がゴール。壁（灰色）と穴（黒）は通れない', 'Tap a neighboring cell to move. The gold ring is the goal. Walls (gray) and holes (black) block you'],
  ['赤いマスは、敵が次に入るマス。そこに居ると当たる。隣に来た敵はタップで倒せる', 'A red cell is where an enemy steps next. Do not be there. Tap an enemy next to you to defeat it'],
  ['弓兵（紫）は、まっすぐ先にあなたが見えると、次のターンにその線を撃つ。線から出れば当たらない', 'An archer (purple) that sees you in a straight line shoots along it next turn. Step off the line'],
];

const layoutOf = (state: State): HexLayout => layoutFor(state.radius, { x: 0, y: 0, ...VIEW });

function fillHex(ctx: CanvasRenderingContext2D, layout: HexLayout, cell: string, color: string, scale: number = 0.96): void {
  const { x, y } = centerOf(layout, hexOf(cell));
  hexPath(ctx, x, y, layout.size, scale);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawBoard(ctx: CanvasRenderingContext2D, layout: HexLayout, state: State, showSteps: boolean): void {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  for (const [q, r] of boardCells(state.radius)) {
    const { x, y } = centerOf(layout, [q, r]);
    hexPath(ctx, x, y, layout.size, 0.96);
    ctx.fillStyle = ((q - r) % 3 + 3) % 3 === 0 ? COLORS.cellAlt : COLORS.cell;
    ctx.fill();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 2;
    ctx.stroke();
    // 今の手で動けるマス
    if (showSteps && canStep(state, keyOf(q, r))) fillHex(ctx, layout, keyOf(q, r), COLORS.step);
  }
  for (const wall of state.walls) fillHex(ctx, layout, wall, COLORS.wall, 0.84);
  for (const hole of state.holes) fillHex(ctx, layout, hole, COLORS.hole, 0.84);
  if (state.goal) {
    const { x, y } = centerOf(layout, hexOf(state.goal));
    ctx.beginPath();
    ctx.arc(x, y, layout.size * 0.66, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.goal;
    ctx.lineWidth = 6;
    ctx.setLineDash([10, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** 敵が次にすること。追手が入るマスと、弓兵が撃つ線 */
function drawPlans(ctx: CanvasRenderingContext2D, layout: HexLayout, state: State): void {
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    if (enemy.target) {
      fillHex(ctx, layout, enemy.target, COLORS.danger);
      const a = centerOf(layout, hexOf(enemy.cell)), b = centerOf(layout, hexOf(enemy.target));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo((a.x + b.x) / 2, (a.y + b.y) / 2);
      ctx.strokeStyle = COLORS.dangerLine;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    const aimed = aimedCells(state, enemy);
    if (aimed.length > 0) {
      for (const cell of aimed) fillHex(ctx, layout, cell, COLORS.danger);
      const a = centerOf(layout, hexOf(enemy.cell)), b = centerOf(layout, hexOf(aimed[aimed.length - 1]));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = COLORS.dangerLine;
      ctx.lineWidth = 4;
      ctx.setLineDash([14, 10]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function drawChaser(ctx: CanvasRenderingContext2D, size: number, x: number, y: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - size * 0.5);
  ctx.lineTo(x + size * 0.46, y + size * 0.36);
  ctx.lineTo(x - size * 0.46, y + size * 0.36);
  ctx.closePath();
  ctx.fillStyle = COLORS.chaser;
  ctx.fill();
}

function drawArcher(ctx: CanvasRenderingContext2D, size: number, x: number, y: number): void {
  ctx.beginPath();
  ctx.rect(x - size * 0.36, y - size * 0.36, size * 0.72, size * 0.72);
  ctx.fillStyle = COLORS.archer;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, size * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.bg;
  ctx.fill();
}

function drawPlayer(ctx: CanvasRenderingContext2D, size: number, x: number, y: number, lost: boolean): void {
  ctx.beginPath();
  ctx.arc(x, y, size * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = lost ? COLORS.wall : COLORS.player;
  ctx.fill();
  ctx.strokeStyle = COLORS.bg;
  ctx.lineWidth = 4;
  ctx.stroke();
}

function draw(ctx: CanvasRenderingContext2D, state: State, anim: Anim<State, Shot[]> | null): void {
  const layout = layoutOf(state);
  drawBoard(ctx, layout, state, !anim);
  // 動きを見せている間は、次の予告はまだ出さない
  if (!anim && state.status === 'playing') drawPlans(ctx, layout, state);

  const slide = (now: string, before: string) => {
    const to = centerOf(layout, hexOf(now));
    if (!anim) return to;
    const from = centerOf(layout, hexOf(before));
    return { x: from.x + (to.x - from.x) * anim.t, y: from.y + (to.y - from.y) * anim.t };
  };

  state.enemies.forEach((enemy, i) => {
    const before = anim?.from.enemies[i];
    // 倒れた敵は、動きを見せている間だけ残して、終わったら消す
    if (!enemy.alive && !(anim && before?.alive)) return;
    const { x, y } = slide(enemy.cell, before?.cell ?? enemy.cell);
    ctx.globalAlpha = enemy.alive ? 1 : 1 - (anim?.t ?? 1);
    if (enemy.kind === 'chaser') drawChaser(ctx, layout.size, x, y);
    else drawArcher(ctx, layout.size, x, y);
    ctx.globalAlpha = 1;
  });

  const player = slide(state.player, anim?.from.player ?? state.player);
  drawPlayer(ctx, layout.size, player.x, player.y, !anim && state.status === 'failed' && state.lost !== 'time');

  // 撃たれた矢。動きの前半だけ見せる
  if (anim && anim.t < 0.6) {
    ctx.strokeStyle = COLORS.arrow;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    for (const shot of anim.events) {
      const a = centerOf(layout, hexOf(shot.from)), b = centerOf(layout, hexOf(shot.to));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
}

function step(state: State, action: string | null) {
  const result = act(state, action);
  if (!result) return null;
  const killed = result.state.enemies.filter((e) => !e.alive).length > state.enemies.filter((e) => !e.alive).length;
  return { state: result.state, events: result.shots, ms: 240, sound: killed ? 'hit' as const : 'tap' as const };
}

export const game: GameDef<State, Shot[]> = {
  saveKey: 'forecast-tactics.v1',
  title: 'FORECAST TACTICS',
  howto: t(
    '敵が次にすることは、赤い印で全部見えている。1手ずつ動いて、当たらずにゴールへ着こう（ゴールが無いステージは、敵を全滅させる）。',
    'Every enemy shows its next move in red. Move one step at a time and reach the goal without being hit (with no goal, defeat every enemy).',
  ),
  view: VIEW,
  levelCount: LEVELS.length,

  start: (level) => createState(LEVELS[level]),
  status: (state) => state.status,
  stars: starsOf,
  counter: (state) => {
    const left = state.limit - state.turns;
    const goal = state.goal ? '' : t('全滅させる・', 'Defeat all · ');
    return goal + t(`残り ${left} ターン（★3 は ${state.par}）`, `${left} turns left (★3: ${state.par})`);
  },
  hint: (level) => {
    const hint = HINTS[level];
    return hint ? t(...hint) : '';
  },
  failText: (state) =>
    state.lost === 'chaser' ? t('追手に捕まりました', 'A chaser caught you')
    : state.lost === 'archer' ? t('矢に当たりました', 'An arrow hit you')
    : t('ターンを使い切りました', 'Out of turns'),

  buttons: () => [{ id: 'wait', label: t('その場で待つ', 'Wait a turn') }],
  press: (state) => step(state, null),

  tap(state, x, y) {
    const [q, r] = hexAt(layoutOf(state), x, y);
    if (!inBoard(q, r, state.radius)) return null;
    const cell = keyOf(q, r);
    // 自分のマスをタップしても待てる
    if (cell === state.player) return step(state, null);
    return step(state, cell) ?? { state, sound: 'miss' };
  },

  draw,
};
