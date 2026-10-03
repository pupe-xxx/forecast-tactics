// ステージの一覧。最初の3つは遊び方を覚えるための手作り。残りは scripts/gen.ts が作る。
import { GENERATED } from './levels.gen';
import type { Level } from './rules';

const INTRO: Level[] = [
  // 隣のマスへ動く。壁と穴は通れない
  { radius: 2, walls: [[0, 0], [0, -1]], holes: [[1, 0]], player: [-2, 0], goal: [2, 0], chasers: [], archers: [], par: 5 },
  // 追手は予告したマスへ入ってくる。隣に来たら倒せる
  { radius: 2, walls: [[0, -1], [0, 1]], holes: [], player: [-2, 0], goal: [2, 0], chasers: [[2, -1]], archers: [], par: 5 },
  // 弓兵は、まっすぐ先にいると次のターンに撃つ
  { radius: 2, walls: [[-1, 0]], holes: [], player: [-2, 1], goal: [1, -2], chasers: [], archers: [[2, -2], [-2, 0]], par: 5 },
];

export const LEVELS: Level[] = [...INTRO, ...GENERATED];
