// 法定节假日与调休补班日
// 数据源：国务院办公厅《关于 2026 年部分节假日安排的通知》（2025-11-04 发布）
// 每年国务院公布次年安排后，在 RAW 中新增对应年份即可；缺失年份自动降级为「周一至周五」。
const RAW = {
  2026: {
    off: [
      ['2026-01-01', '2026-01-03'], // 元旦
      ['2026-02-15', '2026-02-23'], // 春节
      ['2026-04-04', '2026-04-06'], // 清明
      ['2026-05-01', '2026-05-05'], // 劳动节
      ['2026-06-19', '2026-06-21'], // 端午
      ['2026-09-25', '2026-09-27'], // 中秋
      ['2026-10-01', '2026-10-07']  // 国庆
    ],
    on: [
      '2026-01-04', '2026-02-14', '2026-02-28',
      '2026-05-09', '2026-09-20', '2026-10-10'
    ]
  }
};

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function keyOf(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function parseKey(key) {
  const p = key.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 0, 0, 0, 0);
}

function expandRange(from, to) {
  const out = [];
  let cur = parseKey(from);
  const end = parseKey(to);
  let guard = 0;
  while (cur.getTime() <= end.getTime() && guard < 400) {
    out.push(keyOf(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1, 0, 0, 0, 0);
    guard += 1;
  }
  return out;
}

const TABLE = {};
Object.keys(RAW).forEach(function (year) {
  const off = [];
  RAW[year].off.forEach(function (range) {
    expandRange(range[0], range[1]).forEach(function (k) {
      off.push(k);
    });
  });
  TABLE[year] = { off: off, on: RAW[year].on.slice() };
});

function hasYear(year) {
  return Object.prototype.hasOwnProperty.call(TABLE, String(year));
}

// workweek: 'double' 双休（默认）/ 'single' 单休（周六也上班）
// 法定放假 off 与调休补班 on 的优先级对所有休息制度一致；
// 休息制度只决定「基础周末」里哪几天算工作日：双休=周一至周五，单休=周一至周六。
function isWorkday(date, workweek) {
  const key = keyOf(date);
  const table = TABLE[String(date.getFullYear())];
  if (table) {
    if (table.on.indexOf(key) >= 0) return true;   // 调休补班优先
    if (table.off.indexOf(key) >= 0) return false; // 法定放假
  }
  const weekday = date.getDay();
  const upper = workweek === 'single' ? 6 : 5;
  return weekday >= 1 && weekday <= upper;
}

function isWorkdayKey(key, workweek) {
  return isWorkday(parseKey(key), workweek);
}

// month: 1-12，返回该自然月的整月工作日天数
function countWorkdays(year, month, workweek) {
  const lastDay = new Date(year, month, 0).getDate();
  let total = 0;
  for (let d = 1; d <= lastDay; d += 1) {
    if (isWorkday(new Date(year, month - 1, d, 0, 0, 0, 0), workweek)) total += 1;
  }
  return total;
}

module.exports = {
  hasYear: hasYear,
  isWorkday: isWorkday,
  isWorkdayKey: isWorkdayKey,
  countWorkdays: countWorkdays
};
