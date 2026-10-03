import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/game/levels';
import { act, aimedCells, canStep, createState, starsOf, type Level } from '../src/game/rules';
import { solve } from '../src/game/solve';

const level = (over: Partial<Level>): Level => ({
  radius: 2, walls: [], holes: [], player: [-2, 0], goal: [2, 0], chasers: [], archers: [], par: 4, ...over,
});

describe('自分の手', () => {
  it('隣のマスへ動ける。壁・穴・盤の外・隣でないマスへは動けない', () => {
    const s = createState(level({ walls: [[-1, 0]], holes: [[-1, -1]] }));
    expect(canStep(s, '-2,1')).toBe(true);
    expect(canStep(s, '-1,0')).toBe(false);
    expect(canStep(s, '-1,-1')).toBe(false);
    expect(canStep(s, '-3,0')).toBe(false);
    expect(canStep(s, '0,0')).toBe(false);
    expect(act(s, '0,0')).toBeNull();
  });

  it('動くとターンが進む。元の状態は変わらない', () => {
    const s = createState(level({}));
    const next = act(s, '-1,0')!.state;
    expect(next.player).toBe('-1,0');
    expect(next.turns).toBe(1);
    expect(s.player).toBe('-2,0');
  });

  it('ゴールに着くとクリア', () => {
    const next = act(createState(level({ player: [1, 0] })), '2,0')!.state;
    expect(next.status).toBe('cleared');
    expect(starsOf(next)).toBe(3);
  });

  it('隣の敵のマスを選ぶと、動かずに倒す。全滅させるステージなら、最後の1人でクリア', () => {
    const s = createState(level({ goal: null, player: [0, 0], chasers: [[1, 0]] }));
    const next = act(s, '1,0')!.state;
    expect(next.player).toBe('0,0');
    expect(next.enemies[0].alive).toBe(false);
    expect(next.status).toBe('cleared');
  });
});

describe('追手', () => {
  it('自分に一番近づく隣のマスを予告し、次のターンにそこへ入る', () => {
    const s = createState(level({ chasers: [[2, 0]], goal: [2, -2] }));
    expect(s.enemies[0].target).toBe('1,0');
    const next = act(s, null)!.state;
    expect(next.enemies[0].cell).toBe('1,0');
  });

  it('同じ近さのマスが2つある時は、向きの番号が小さいほうを選ぶ', () => {
    // (1,-2) も (1,-1) も自分まで3マス。西（3番）が南西（4番）より先
    const s = createState(level({ chasers: [[2, -2]] }));
    expect(s.enemies[0].target).toBe('1,-2');
  });

  it('隣にいる追手は自分のマスを予告する。そこに居続けると当たる', () => {
    const s = createState(level({ player: [0, 0], chasers: [[1, 0]] }));
    expect(s.enemies[0].target).toBe('0,0');
    const next = act(s, null)!.state;
    expect(next.status).toBe('failed');
    expect(next.lost).toBe('chaser');
  });

  it('予告のマスから出れば当たらず、追手は空いたマスへ入る', () => {
    const s = createState(level({ player: [0, 0], chasers: [[1, 0]] }));
    const next = act(s, '-1,0')!.state;
    expect(next.status).toBe('playing');
    expect(next.enemies[0].cell).toBe('0,0');
  });

  it('穴を避けない。穴に入ると落ちる', () => {
    const s = createState(level({ player: [-2, 0], chasers: [[0, 0]], holes: [[-1, 0]] }));
    expect(s.enemies[0].target).toBe('-1,0');
    expect(act(s, null)!.state.enemies[0].alive).toBe(false);
  });

  it('入る先にほかの敵がいれば動かない', () => {
    const s = createState(level({ player: [-2, 0], chasers: [[0, 0], [1, 0]] }));
    const next = act(s, null)!.state;
    expect(next.enemies[0].cell).toBe('-1,0'); // 先に動いて、隣まで来る
    expect(next.enemies[1].cell).toBe('0,0'); // 空いたマスへ入る
    const blocked = createState(level({ player: [-2, 0], chasers: [[1, 0], [0, 0]] }));
    expect(act(blocked, null)!.state.enemies[0].cell).toBe('1,0'); // 前がまだ動いていないので止まる
  });
});

describe('弓兵', () => {
  it('まっすぐ先に自分が見えると、その向きを予告する。見えなければ撃たない', () => {
    const seen = createState(level({ player: [-2, 0], archers: [[2, 0]] }));
    expect(seen.enemies[0].aim).toBe(3);
    expect(aimedCells(seen, seen.enemies[0])).toEqual(['1,0', '0,0', '-1,0', '-2,0']);
    const hidden = createState(level({ player: [-2, 0], archers: [[2, 0]], walls: [[0, 0]] }));
    expect(hidden.enemies[0].aim).toBe(-1);
    expect(createState(level({ player: [-2, 1], archers: [[2, 0]] })).enemies[0].aim).toBe(-1);
  });

  it('線の上に居続けると当たる。線から出れば当たらない', () => {
    const s = createState(level({ player: [-2, 0], archers: [[2, 0]] }));
    const hit = act(s, '-1,0')!;
    expect(hit.state.status).toBe('failed');
    expect(hit.state.lost).toBe('archer');
    expect(hit.shots).toEqual([{ from: '2,0', to: '-1,0' }]);
    expect(act(s, '-2,1')!.state.status).toBe('playing');
  });

  it('矢は最初に当たった駒に刺さる。敵どうしでも当たる', () => {
    // 追手 (0,-1) は (-1,0) へ入る予告。自分が線から出ても、弓兵は予告した向きへ撃つ
    const s = createState(level({ player: [-2, 0], archers: [[2, 0]], chasers: [[1, 0]] }));
    expect(s.enemies[1].aim).toBe(-1); // 追手が間にいるので、最初は見えていない
    const lured = createState(level({ player: [-2, 0], archers: [[1, 0]], chasers: [[-1, -1]] }));
    expect(lured.enemies[1].aim).toBe(3);
    const next = act(lured, '-2,1')!; // 線から出る。追手は弓兵より後に動くので当たらない
    expect(next.shots).toEqual([{ from: '1,0', to: '-2,0' }]);
    expect(next.state.enemies[0].alive).toBe(true);
  });
});

describe('ターン数と星', () => {
  it('ターンを使い切ると失敗になる', () => {
    let s = createState(level({}), 2);
    s = act(s, null)!.state;
    s = act(s, null)!.state;
    expect(s.status).toBe('failed');
    expect(s.lost).toBe('time');
    expect(act(s, null)).toBeNull();
  });

  it('最少のターン数なら星3つ、2ターン多くまでは2つ、それより多いと1つ', () => {
    const s = createState(level({ par: 5 }));
    expect(starsOf({ ...s, status: 'cleared', turns: 5 })).toBe(3);
    expect(starsOf({ ...s, status: 'cleared', turns: 7 })).toBe(2);
    expect(starsOf({ ...s, status: 'cleared', turns: 8 })).toBe(1);
    expect(starsOf({ ...s, status: 'failed', turns: 5 })).toBe(0);
  });
});

describe('ステージ', () => {
  it('20 ステージ以上ある', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(20);
  });

  it('どのステージも解けて、par が最少のターン数と合っている', () => {
    LEVELS.forEach((l, i) => {
      const best = solve(l, l.par);
      expect(best?.length, `ステージ ${i + 1}`).toBe(l.par);
      // 求めた手順を順に打つと、本当にクリアになる
      let s = createState(l);
      for (const action of best ?? []) s = act(s, action)!.state;
      expect(s.status, `ステージ ${i + 1}`).toBe('cleared');
    });
  }, 60000);

  it('自分・ゴール・敵・壁・穴が同じマスに重なっていない', () => {
    LEVELS.forEach((l, i) => {
      const keys = [l.player, ...(l.goal ? [l.goal] : []), ...l.chasers, ...l.archers, ...l.walls, ...l.holes].map(([q, r]) => `${q},${r}`);
      expect(new Set(keys).size, `ステージ ${i + 1}`).toBe(keys.length);
    });
  });
});
