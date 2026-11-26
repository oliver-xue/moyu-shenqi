// 本地存储层：全部数据留在本机，不上传、不联网
const T = require('./time.js');

const KEYS = {
  settings: 'moyu.settings.v1',
  stopwatch: 'moyu.stopwatch.v1',
  records: 'moyu.records.v1',
  runtime: 'moyu.runtime.v1',
  draft: 'moyu.onboarding.draft'
};

function read(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value === '' || value === null || value === undefined ? fallback : value;
  } catch (e) {
    return fallback;
  }
}

function write(key, value) {
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

function remove(key) {
  try { wx.removeStorageSync(key); } catch (e) { /* 忽略 */ }
}

function loadSettings() { return read(KEYS.settings, null); }

function saveSettings(settings) {
  settings.schemaVersion = 1;
  settings.updatedAt = Date.now();
  return write(KEYS.settings, settings);
}

function emptyStopwatch() {
  return { state: 'idle', startAt: 0, elapsedMs: 0, tag: 'moyu' };
}

function loadStopwatch() {
  const sw = read(KEYS.stopwatch, null);
  if (!sw || ['idle', 'running', 'paused'].indexOf(sw.state) < 0) return emptyStopwatch();
  return sw;
}

function saveStopwatch(sw) { return write(KEYS.stopwatch, sw); }

function loadRecords() {
  const list = read(KEYS.records, []);
  return Array.isArray(list) ? list : [];
}

function addRecord(record) {
  const list = loadRecords();
  list.push(record);
  if (list.length > 500) list.splice(0, list.length - 500);
  return write(KEYS.records, list);
}

function todayTotalMs(now) {
  const key = T.dateKey(new Date(now));
  return loadRecords().reduce(function (sum, r) {
    return r.dateKey === key ? sum + (Number(r.durationMs) || 0) : sum;
  }, 0);
}

function clearTodayRecords(now) {
  const key = T.dateKey(new Date(now));
  const kept = loadRecords().filter(function (r) { return r.dateKey !== key; });
  return write(KEYS.records, kept);
}

function loadRuntime() { return read(KEYS.runtime, { lastNow: 0, overtimeMode: false }); }
function saveRuntime(runtime) { return write(KEYS.runtime, runtime); }

function loadDraft() { return read(KEYS.draft, null); }
function saveDraft(draft) { return write(KEYS.draft, draft); }
function clearDraft() { remove(KEYS.draft); }

function clearAll() {
  Object.keys(KEYS).forEach(function (k) { remove(KEYS[k]); });
}

module.exports = {
  KEYS: KEYS,
  read: read,
  write: write,
  loadSettings: loadSettings,
  saveSettings: saveSettings,
  emptyStopwatch: emptyStopwatch,
  loadStopwatch: loadStopwatch,
  saveStopwatch: saveStopwatch,
  loadRecords: loadRecords,
  addRecord: addRecord,
  todayTotalMs: todayTotalMs,
  clearTodayRecords: clearTodayRecords,
  loadRuntime: loadRuntime,
  saveRuntime: saveRuntime,
  loadDraft: loadDraft,
  saveDraft: saveDraft,
  clearDraft: clearDraft,
  clearAll: clearAll
};
