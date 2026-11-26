// 时间工具：所有配置时间以「自 00:00 起的分钟整数」存储
const HOURS = [];
const MINUTES = [];

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

for (let h = 0; h < 24; h += 1) HOURS.push(pad2(h));
for (let m = 0; m < 12; m += 1) MINUTES.push(pad2(m * 5));

function minToStr(min) {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  return pad2(Math.floor(v / 60)) + ':' + pad2(v % 60);
}

function strToMin(str) {
  const p = String(str).split(':');
  return Number(p[0]) * 60 + Number(p[1]);
}

function dateKey(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

function keyToDate(key) {
  const p = key.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 0, 0, 0, 0);
}

function addDays(date, delta) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta, 0, 0, 0, 0);
}

// 某天 00:00 + minute 分钟的绝对时间戳（minute 可超过 1440，Date 会自动进位）
function atMinute(date, minute) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, minute, 0, 0).getTime();
}

function msToHMS(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return pad2(Math.floor(total / 3600)) + ':' + pad2(Math.floor(total / 60) % 60) + ':' + pad2(total % 60);
}

function msToHM(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return pad2(Math.floor(total / 3600)) + ':' + pad2(Math.floor(total / 60) % 60);
}

// ROUND_HALF_UP 到分，规避浮点尾差
function round2(n) {
  return Math.floor(n * 100 + 0.5 + 1e-9) / 100;
}

function money(n) {
  const parts = round2(n).toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

// picker-view 的 value（两列下标）与分钟整数互转；滑动粒度 5 分钟
function pickerValue(min) {
  const tick = ((Math.round(min / 5) % 288) + 288) % 288;
  return [Math.floor(tick / 12), tick % 12];
}

function valueToMin(value) {
  return (Number(value[0]) * 12 + Number(value[1])) * 5;
}

// 薪资基准月 = 当前自然月的上一月
function previousMonthKey(now) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth() - 1, 1, 0, 0, 0, 0).getFullYear() +
    '-' + pad2(new Date(d.getFullYear(), d.getMonth() - 1, 1).getMonth() + 1);
}

module.exports = {
  HOURS: HOURS,
  MINUTES: MINUTES,
  pad2: pad2,
  minToStr: minToStr,
  strToMin: strToMin,
  dateKey: dateKey,
  keyToDate: keyToDate,
  addDays: addDays,
  atMinute: atMinute,
  msToHMS: msToHMS,
  msToHM: msToHM,
  round2: round2,
  money: money,
  pickerValue: pickerValue,
  valueToMin: valueToMin,
  previousMonthKey: previousMonthKey
};
