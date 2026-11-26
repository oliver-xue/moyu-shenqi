// 作息类型：标准班 / 固定周班 / 轮班制 / 手动排班
// 只判断「某天是否按班表上班」与本月天数 D；休息段、金额公式仍在 calc.js。
// 节假日口径：标准班直接用国务院节假日表；其余模式法定节假日让位休息安排，
// 即不由节假日表改变班表（但在法定放假日上班时会标记为 HOLIDAY_WORK）。
const H = require('./holidays.js');
const T = require('./time.js');

const MODES = {
  standard: '标准班',
  weekly: '固定周班',
  rotation: '轮班制',
  manual: '手动排班'
};

const WEEK_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function clampInt(value, min, max, fallback) {
  const n = Math.floor(Number(value));
  if (!isFinite(n) || n < min || n > max) return fallback;
  return n;
}

function validKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return T.dateKey(T.keyToDate(key)) === key;
}

function modeOf(settings) {
  const mode = settings && settings.scheduleMode;
  return Object.prototype.hasOwnProperty.call(MODES, mode) ? mode : 'standard';
}

function normalize(settings) {
  const s = settings || {};
  const rawDays = Array.isArray(s.weekdays) ? s.weekdays : [];
  const weekdays = rawDays.filter(function (n) {
    return Number.isInteger(n) && n >= 0 && n <= 6;
  });
  const rot = s.rotation || {};
  const rotation = {
    workDays: clampInt(rot.workDays, 1, 31, 1),
    restDays: clampInt(rot.restDays, 1, 31, 1),
    startDate: validKey(rot.startDate) ? rot.startDate : '1970-01-01',
    startState: rot.startState === 'rest' ? 'rest' : 'work'
  };
  const specialDates = Array.isArray(s.specialDates) ? s.specialDates.filter(function (it) {
    return it && validKey(it.date) && (it.type === 'work' || it.type === 'off');
  }) : [];
  return {
    mode: modeOf(s),
    workweek: s.workweek === 'single' ? 'single' : 'double',
    weekdays: weekdays,
    rotation: rotation,
    specialDates: specialDates,
    manualD: clampInt(s.manualD, 1, 31, 0),
    autoD: s.autoD !== false
  };
}

function dayDiff(fromKey, date) {
  const start = T.keyToDate(fromKey).getTime();
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).getTime();
  return Math.round((end - start) / 86400000);
}

function isRotationWork(date, cfg) {
  const cycle = cfg.workDays + cfg.restDays;
  const idx = ((dayDiff(cfg.startDate, date) % cycle) + cycle) % cycle;
  return cfg.startState === 'work' ? idx < cfg.workDays : idx >= cfg.restDays;
}

function isManualWork(date, cfg) {
  const key = T.dateKey(date);
  for (let i = 0; i < cfg.specialDates.length; i += 1) {
    if (cfg.specialDates[i].date === key) return cfg.specialDates[i].type === 'work';
  }
  const weekday = date.getDay();
  return weekday >= 1 && weekday <= 5;
}

// 某天是否按班表上班（不含节假日表的强制干预）
function isWorkday(date, settings) {
  const cfg = normalize(settings);
  if (cfg.mode === 'weekly') return cfg.weekdays.indexOf(date.getDay()) >= 0;
  if (cfg.mode === 'rotation') return isRotationWork(date, cfg.rotation);
  if (cfg.mode === 'manual') return isManualWork(date, cfg);
  return H.isWorkday(date, cfg.workweek);
}

function isWorkdayKey(key, settings) {
  return isWorkday(T.keyToDate(key), settings);
}

function countWorkdays(year, month, settings) {
  const cfg = normalize(settings);
  if (cfg.mode === 'standard') return H.countWorkdays(year, month, cfg.workweek);
  const lastDay = new Date(year, month, 0).getDate();
  let total = 0;
  for (let d = 1; d <= lastDay; d += 1) {
    if (isWorkday(new Date(year, month - 1, d, 0, 0, 0, 0), settings)) total += 1;
  }
  return total;
}

// 参与金额公式的 D：手动排班直接填；其他模式默认自动按班表算。
function countFor(settings, now) {
  const cfg = normalize(settings);
  const current = new Date(now === undefined ? Date.now() : now);
  if (cfg.mode === 'manual' || !cfg.autoD) {
    if (cfg.manualD > 0) return cfg.manualD;
  }
  return countWorkdays(current.getFullYear(), current.getMonth() + 1, settings);
}

function description(settings) {
  const cfg = normalize(settings);
  if (cfg.mode === 'weekly') {
    const days = cfg.weekdays.slice().sort(function (a, b) { return a - b; }).map(function (n) {
      return WEEK_LABELS[n];
    });
    return '固定周班（' + (days.length ? days.join('、') : '未选上班日') + '）';
  }
  if (cfg.mode === 'rotation') {
    return '轮班制（做 ' + cfg.rotation.workDays + ' 休 ' + cfg.rotation.restDays +
      '，' + (cfg.rotation.startState === 'work' ? '从上班开始' : '从休息开始') + '）';
  }
  if (cfg.mode === 'manual') {
    return '手动排班（本月 D = ' + (cfg.manualD || '待填') + ' 天，特殊日期 ' + cfg.specialDates.length + ' 天）';
  }
  return cfg.workweek === 'single' ? '标准班 · 单休（周一至周六）' : '标准班 · 双休（周一至周五）';
}

function daysNote(settings, source) {
  const cfg = normalize(settings);
  if (cfg.mode === 'standard') {
    if (source === 'official') return '（按国务院节假日表）';
    return cfg.workweek === 'single' ? '（按周一至周六估算）' : '（按周一至周五估算）';
  }
  if (cfg.mode === 'weekly') return '（按固定周班）';
  if (cfg.mode === 'rotation') return '（按做休轮班）';
  return cfg.autoD ? '（按手动排班）' : '（手动填写）';
}

function holidaysNote(settings, source) {
  const cfg = normalize(settings);
  if (cfg.mode === 'standard') {
    if (source === 'official') {
      return '本月牛马天数按国务院节假日表计算（含调休补班日）；法定放假日不上班。';
    }
    return cfg.workweek === 'single'
      ? '未找到本月的节假日数据，工作日按周一至周六估算（单休）。'
      : '未找到本月的节假日数据，工作日按周一至周五估算。';
  }
  if (cfg.mode === 'weekly') {
    return '固定周班按你选的每周上班日计算本月天数；法定节假日让位你的休息安排，不改变班表。';
  }
  if (cfg.mode === 'rotation') {
    return '轮班制按「做 N 休 M」和起始日推进计算本月天数；法定节假日让位你的休息安排，不改变班表。';
  }
  return cfg.autoD
    ? '手动排班默认按国务院节假日表预填（法定放假日休息、调休补班日上班）；你的逐日标记优先，未标记即为休息。'
    : '手动排班按你填写的本月牛马天数 D 计算；法定节假日按国务院表显示，你的逐日标记优先。';
}

module.exports = {
  MODES: MODES,
  WEEK_LABELS: WEEK_LABELS,
  modeOf: modeOf,
  normalize: normalize,
  isWorkday: isWorkday,
  isWorkdayKey: isWorkdayKey,
  countWorkdays: countWorkdays,
  countFor: countFor,
  description: description,
  daysNote: daysNote,
  holidaysNote: holidaysNote
};
