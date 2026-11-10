const modes = ['quick', 'full'];
const whole = value => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
const time = value => Number.isFinite(value) && value > 0 ? value : null;

export const MEDALS = Object.freeze([
  { id: 'crossfire', name: '弯道炮手', goal: '单局打出 3 次弯道夹击' },
  { id: 'rescue', name: '荒野救援', goal: '绕回救起一节脱钩炮车' },
  { id: 'dual', name: '双核击破', goal: '在同一窗口击破守卫两侧弱点' },
  { id: 'compact', name: '短列突击', goal: '用最多两节炮车赢下完整战斗' },
  { id: 'formation', name: '四炮编队', goal: '以四节炮车赢下完整战斗' },
]);

export function normalizeSave(value) {
  const data = value && typeof value === 'object' ? value : {};
  const records = {};
  for (const mode of modes) {
    const record = data.records?.[mode] || {};
    records[mode] = {
      runs: whole(record.runs),
      wins: whole(record.wins),
      bestTime: time(record.bestTime) ?? time(mode === 'quick' ? data.bestQuick : data.bestFull),
      bestCrossfires: whole(record.bestCrossfires),
      bestBarrage: whole(record.bestBarrage),
    };
  }
  return {
    records,
    medals: MEDALS.map(medal => medal.id).filter(id => Array.isArray(data.medals) && data.medals.includes(id)),
    legacyCrossfires: Math.max(whole(data.legacyCrossfires), whole(data.maxCrossfires)),
    legacyWins: Math.max(whole(data.legacyWins), whole(data.wins)),
    muted: data.muted === true,
  };
}

export function recordBattle(save, run) {
  const mode = run.mode === 'quick' ? 'quick' : 'full';
  const stats = run.stats;
  const won = run.phase === 'won';
  const record = save.records[mode];
  const bestTime = won && time(run.time) !== null && (record.bestTime === null || run.time < record.bestTime);
  const bestCrossfires = whole(stats.crossfires) > record.bestCrossfires;
  record.runs++;
  if (won) record.wins++;
  if (bestTime) record.bestTime = run.time;
  record.bestCrossfires = Math.max(record.bestCrossfires, whole(stats.crossfires));
  record.bestBarrage = Math.max(record.bestBarrage, whole(stats.bestVolleyKills));

  const earned = {
    crossfire: stats.crossfires >= 3,
    rescue: stats.recovered > 0,
    dual: stats.dualBreaks > 0,
    compact: won && mode === 'full' && stats.maxCars <= 2,
    formation: won && mode === 'full' && run.train.cars.length === 4,
  };
  const medals = MEDALS.filter(medal => earned[medal.id] && !save.medals.includes(medal.id));
  save.medals.push(...medals.map(medal => medal.id));
  return { bestTime, bestCrossfires, medals };
}
