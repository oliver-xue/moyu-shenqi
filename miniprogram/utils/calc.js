// 核心计算引擎（纯函数，不依赖 wx API，可用 Node 直接跑验收用例）
// 严格实现方案 §5：时薪 = 月薪 / 当月工作日天数 / 每天工作时间
const H = require('./holidays.js');
const T = require('./time.js');
const SCH = require('./schedule.js');

const COPY = {
  UNINITIALIZED: ['先花 30 秒告诉我你的班次吧'],
  NOT_STARTED: ['还没开工，钱已经在排队了', '距离开工还有一会儿，先喘口气', '今天的钱，从上班那一刻开始算'],
  WORKING: ['搬砖中，钱在慢慢涨', '每一秒都在进账，虽然不多', '看，又多了几分钱'],
  RESTING: ['合法摸鱼时间：计时不停，钱包暂停', '休息中，数字也需要歇会儿', '这段不算钱，但算快乐'],
  OFF_WORK: ['今日收工，钱赚完啦', '今天的 KPI：准时下班，达成', '关掉页面，去过自己的生活'],
  OVERTIME: ['人还在，钱不加，记得早点走', '加班时长记着呢，别熬太晚', '这部分不算钱，但算辛苦'],
  DAY_OFF: ['今天不搬砖，钱包也放假', '好好躺，明天再赚', '休息日不产生收益，但产生快乐'],
  SHIFT_OFF: ['今天睡饱，钱包躺好'],
  HOLIDAY_WORK: ['节假日还在岗，辛苦了您'],
  MAKEUP: ['补班日，钱照赚（辛苦了）'],
  NIGHT: ['夜班进行中 · 归属 {D} 班次', '别人睡了，你的数字还在涨', '过零点不清零，放心']
};

const LABELS = {
  UNINITIALIZED: '未设置',
  NOT_STARTED: '未上班',
  WORKING: '工作中',
  RESTING: '休息中',
  OFF_WORK: '已下班',
  OVERTIME: '加班中',
  DAY_OFF: '休息日',
  SHIFT_OFF: '轮休',
  HOLIDAY_WORK: '节假日班'
};

function spanOf(settings) {
  return (settings.shiftEndMin - settings.shiftStartMin + 1440) % 1440;
}

// 休息段归一化：过滤非法段、按开始时间排序、重叠与相邻合并为并集
function normalizeRests(rests, span) {
  const items = (rests || [])
    .filter(function (r) {
      return r && Number.isFinite(r.startOffsetMin) && Number.isFinite(r.endOffsetMin) &&
        r.startOffsetMin >= 0 && r.startOffsetMin < r.endOffsetMin && r.endOffsetMin <= span;
    })
    .slice()
    .sort(function (a, b) { return a.startOffsetMin - b.startOffsetMin; });
  const merged = [];
  items.forEach(function (it) {
    const last = merged[merged.length - 1];
    if (!last || it.startOffsetMin > last.endOffsetMin) {
      merged.push({ startOffsetMin: it.startOffsetMin, endOffsetMin: it.endOffsetMin });
    } else {
      last.endOffsetMin = Math.max(last.endOffsetMin, it.endOffsetMin);
    }
  });
  return merged;
}

function restTotalOf(rests) {
  return rests.reduce(function (sum, r) { return sum + (r.endOffsetMin - r.startOffsetMin); }, 0);
}

// 派生全部计算常量
// 口径（v1.1）：salaryMonth 是「薪资基准月」（上月），只标注这份月薪的来源；
// 「当月工作日天数 D」一律取 workdayMonth，即「计算基准月」= 当前自然月（本月）的整月工作日数。
// now 可选，传入固定时间便于测试；不传时用系统当前时间。
function derive(settings, now) {
  const span = spanOf(settings);
  const rests = normalizeRests(settings.rests, span);
  const restTotal = restTotalOf(rests);
  const S = (span - restTotal) * 60; // 每天工作时间（秒）
  const current = new Date(now === undefined ? Date.now() : now);
  const year = current.getFullYear();
  const month = current.getMonth() + 1;
  const workdayMonth = year + '-' + T.pad2(month);
  const mode = SCH.modeOf(settings);
  const workweek = settings.workweek === 'single' ? 'single' : 'double';
  let N = SCH.countFor(settings, now);
  let source = mode === 'standard' && H.hasYear(year) ? 'official' : 'estimate';
  if (!N) { N = 21.75; source = 'fallback'; }
  const salary = (Number(settings.salaryCent) || 0) / 100;
  const daily = salary / N;                       // 恒等式：日薪与每天工时无关
  const hourly = S > 0 ? salary / N / (S / 3600) : 0;
  const perSecond = S > 0 ? salary / (N * S) : 0;
  return {
    valid: span > 0 && S > 0 && salary > 0,
    span: span, rests: rests, restTotal: restTotal, S: S,
    N: N, source: source, year: year, month: month,
    workdayMonth: workdayMonth, salaryMonth: settings.salaryMonth, workweek: workweek, mode: mode,
    salary: salary, daily: daily, hourly: hourly, perSecond: perSecond
  };
}

// 把相对偏移展开为某个班次的绝对时间区间（跨天自然成立）
function buildShift(settings, derived, dayDate) {
  const start = T.atMinute(dayDate, settings.shiftStartMin);
  const end = start + derived.span * 60000;
  const rests = derived.rests.map(function (r) {
    return {
      start: start + r.startOffsetMin * 60000,
      end: start + r.endOffsetMin * 60000
    };
  });
  return { dateKey: T.dateKey(dayDate), start: start, end: end, rests: rests, S: derived.S };
}

// 有效工作秒数：只累计 [上班, min(now, 下班)] 内扣掉已发生休息段的部分
function workedSeconds(shift, now) {
  const upper = Math.min(now, shift.end);
  if (upper <= shift.start) return 0;
  const gross = (upper - shift.start) / 1000;
  let restElapsed = 0;
  for (let i = 0; i < shift.rests.length; i += 1) {
    const r = shift.rests[i];
    const overlap = Math.min(upper, r.end) - r.start;
    if (overlap > 0) restElapsed += overlap / 1000;
  }
  return Math.max(0, Math.min(gross - restElapsed, shift.S));
}

function pickCopy(key, now, nightShift, shiftDateLabel, makeup) {
  let list = COPY[key] || COPY.UNINITIALIZED;
  if (nightShift && (key === 'WORKING' || key === 'RESTING')) list = COPY.NIGHT;
  else if (makeup && key === 'WORKING') list = COPY.MAKEUP;
  const text = list[Math.floor(now / 300000) % list.length];
  return text.replace('{D}', shiftDateLabel);
}

function uninitialized() {
  return {
    stateKey: 'UNINITIALIZED', phaseKey: 'UNINITIALIZED', statusLabel: LABELS.UNINITIALIZED,
    statusText: COPY.UNINITIALIZED[0], nightShift: false, shiftDateLabel: '',
    countdownText: '--:--:--', earnedText: '--', remainWorkText: '--:--',
    remainEarnText: '--', progressPct: 0, hourlyText: '--', dailyText: '--',
    perSecondText: '--', workdays: 0, workdaysSource: '', dailyWorkText: '--:--',
    salaryMonth: '', workdayMonth: '', overtimeText: '', showOvertime: false, tickNeeded: false,
    basisRows: []
  };
}

// 主入口：给定配置与绝对时间，算出首页所需的全部展示值
function getState(settings, now, options) {
  if (!settings) return uninitialized();
  const opt = options || {};
  const d = derive(settings, now);
  if (!d.valid) return uninitialized();

  const nowDate = new Date(now);
  const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), 0, 0, 0, 0);
  const todayKey = T.dateKey(today);

  // 进行中的班次实例（覆盖跨天：候选前两日 ~ 次日）
  let active = null;
  for (let delta = -2; delta <= 1; delta += 1) {
    const day = T.addDays(today, delta);
    if (!SCH.isWorkday(day, settings)) continue;
    const shift = buildShift(settings, d, day);
    if (now >= shift.start && now < shift.end) {
      if (!active || shift.start > active.start) active = shift;
    }
  }

  const todayWorkday = SCH.isWorkday(today, settings);
  const todayShift = buildShift(settings, d, today);
  // 「补班日，钱照赚」只保留给标准班；其他班次周末上班是正常班表，不误标补班
  const makeup = d.mode === 'standard' && todayWorkday && (d.workweek === 'single'
    ? today.getDay() === 0
    : (today.getDay() === 0 || today.getDay() === 6));

  // 无进行中班次时，找最近一个「已结束」的班次。
  // 若它在今天的自然日结束（跨天夜班尤其常见），当天继续展示满勤金额，
  // 避免夜班 06:00 收工时金额突然变 0；次日才进入新一轮。
  let lastEnded = null;
  for (let delta = -2; delta <= 0; delta += 1) {
    const day = T.addDays(today, delta);
    if (!SCH.isWorkday(day, settings)) continue;
    const sh = buildShift(settings, d, day);
    if (now >= sh.end && (!lastEnded || sh.end > lastEnded.end)) lastEnded = sh;
  }
  const endedToday = lastEnded && T.dateKey(new Date(lastEnded.end)) === todayKey;

  let shift = null;
  let key = '';
  let worked = 0;
  let nightShift = false;

  if (active) {
    shift = active;
    let inRest = false;
    for (let i = 0; i < shift.rests.length; i += 1) {
      const r = shift.rests[i];
      if (now >= r.start && now < r.end) inRest = true;
    }
    key = inRest ? 'RESTING' : 'WORKING';
    worked = workedSeconds(shift, now);
    nightShift = shift.dateKey !== todayKey;
  } else if (endedToday) {
    shift = lastEnded;
    key = opt.overtimeMode ? 'OVERTIME' : 'OFF_WORK';
    worked = d.S; // 满勤封顶，加班不加倍
    nightShift = shift.dateKey !== todayKey;
  } else if (!todayWorkday) {
    key = d.mode === 'standard' ? 'DAY_OFF' : 'SHIFT_OFF';
  } else if (now < todayShift.start) {
    shift = todayShift;
    key = 'NOT_STARTED';
  } else {
    shift = todayShift;
    key = opt.overtimeMode ? 'OVERTIME' : 'OFF_WORK';
    worked = d.S;
  }

  // 非标准班次按班表上班时，若正值法定放假日，展示「节假日班」；金额照常计算
  const phaseKey = key;
  const workDateKey = shift ? shift.dateKey : todayKey;
  const holidayWork = d.mode !== 'standard' && H.isOfficialOff(T.keyToDate(workDateKey)) &&
    ['WORKING', 'RESTING', 'NOT_STARTED', 'OFF_WORK', 'OVERTIME'].indexOf(phaseKey) >= 0;
  const displayKey = holidayWork ? 'HOLIDAY_WORK' : phaseKey;

  const earned = worked * d.perSecond;
  const remainWorkSec = Math.max(0, d.S - worked);
  const remainEarn = Math.max(0, d.daily - earned);
  const progressPct = d.S > 0 ? Math.min(100, Math.max(0, worked / d.S * 100)) : 0;
  const shiftDateLabel = shift ? shift.dateKey.slice(5).replace('-', ' 月 ') + ' 日' : '';
  const countdownMs = shift ? Math.max(0, shift.end - now) : 0;
  const overtimeMs = phaseKey === 'OVERTIME' ? Math.max(0, now - shift.end) : 0;
  const needCountdown = phaseKey !== 'DAY_OFF' && phaseKey !== 'SHIFT_OFF' && phaseKey !== 'UNINITIALIZED';

  return {
    stateKey: displayKey,
    phaseKey: phaseKey,
    statusLabel: LABELS[displayKey],
    statusText: pickCopy(displayKey, now, nightShift, shiftDateLabel, makeup),
    nightShift: nightShift,
    shiftDateLabel: shiftDateLabel,
    countdownText: needCountdown ? T.msToHMS(countdownMs) : '--:--:--',
    earnedText: (phaseKey === 'DAY_OFF' || phaseKey === 'SHIFT_OFF') ? '0.00' : T.money(earned),
    remainWorkText: T.msToHM(remainWorkSec * 1000),
    remainEarnText: T.money(remainEarn),
    progressPct: Math.round(progressPct * 10) / 10,
    hourlyText: T.money(d.hourly),
    dailyText: T.money(d.daily),
    perSecondText: d.perSecond.toFixed(6),
    workdays: d.N,
    workdaysSource: d.source,
    dailyWorkText: T.msToHM(d.S * 1000),
    salaryMonth: settings.salaryMonth,
    workdayMonth: d.workdayMonth,
    overtimeText: T.msToHMS(overtimeMs),
    showOvertime: phaseKey === 'OVERTIME',
    tickNeeded: phaseKey === 'WORKING' || phaseKey === 'RESTING' || phaseKey === 'NOT_STARTED' || phaseKey === 'OVERTIME',
    basisRows: [
      { label: '上月到手月薪', value: '¥ ' + T.money(d.salary) },
      { label: '薪资基准月（月薪来源）', value: settings.salaryMonth },
      { label: '计算基准月（本月）', value: d.workdayMonth },
      { label: '作息类型', value: SCH.description(settings) },
      { label: '本月牛马天数 D', value: d.N + ' 天' + SCH.daysNote(settings, d.source) },
      { label: '每天工作时间 T', value: T.msToHM(d.S * 1000) + '（已扣休息 ' + (d.restTotal / 60).toFixed(2) + ' 小时）' },
      { label: '时薪 = 月薪 / D / T', value: '¥ ' + T.money(d.hourly) + ' /小时' },
      { label: '秒薪', value: '¥ ' + d.perSecond.toFixed(6) + ' /秒' },
      { label: '今日目标（日薪）', value: '¥ ' + T.money(d.daily) }
    ]
  };
}

// 正计时：绝对时间戳计算，后台与冷启动不丢时长
function stopwatchElapsed(stopwatch, now) {
  if (!stopwatch) return 0;
  let ms = Number(stopwatch.elapsedMs) || 0;
  if (stopwatch.state === 'running') {
    ms += Math.max(0, now - (Number(stopwatch.startAt) || now));
  }
  return ms;
}

module.exports = {
  COPY: COPY,
  LABELS: LABELS,
  spanOf: spanOf,
  normalizeRests: normalizeRests,
  restTotalOf: restTotalOf,
  derive: derive,
  buildShift: buildShift,
  workedSeconds: workedSeconds,
  getState: getState,
  stopwatchElapsed: stopwatchElapsed
};
