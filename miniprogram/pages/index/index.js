const calc = require('../../utils/calc.js');
const T = require('../../utils/time.js');
const Store = require('../../utils/storage.js');

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const TAGS = [
    { key: 'moyu', label: '摸鱼' },
    { key: 'overtime', label: '加班' },
    { key: 'focus', label: '专注' }
];

function totalText(ms) {
    const sec = Math.floor(ms / 1000);
    return Math.floor(sec / 60) + ' 分 ' + (sec % 60) + ' 秒';
}

function shiftRangeText(settings) {
    const span = calc.spanOf(settings);
    const endTotal = settings.shiftStartMin + span;
    const end = (endTotal >= 1440 ? '次日 ' : '') + T.minToStr(endTotal % 1440);
    return T.minToStr(settings.shiftStartMin) + ' — ' + end;
}

Page({
    data: {
        ready: false,
        todayText: '',
        shiftRangeText: '',
        stateKey: 'UNINITIALIZED',
        statusLabel: '未设置',
        statusText: '先花 30 秒告诉我你的班次吧',
        countdownText: '--:--:--',
        earnedText: '--',
        remainWorkText: '--:--',
        remainEarnText: '--',
        hourlyText: '--',
        dailyText: '--',
        dailyWorkText: '--:--',
        progressPct: 0,
        nightShift: false,
        shiftDateLabel: '',
        showOvertime: false,
        overtimeText: '00:00:00',
        showOvertimeButton: false,
        overtimeButtonText: '我还在加班',
        monthNotice: '',
        basisRows: [],
        showBasis: false,
        swExpanded: false,
        swText: '00:00:00',
        swState: 'idle',
        swTag: 'moyu',
        swTags: TAGS,
        swPrimaryText: '开始',
        todayTotalText: '0 分 0 秒'
    },

    onLoad: function () {
        this._timer = null;
        this._timeout = null;
        this._lastTapMap = {};
        this._lastIdleTick = 0;
        this._settings = null;
        this._runtime = { lastNow: 0, overtimeMode: false };
        this._stopwatch = Store.emptyStopwatch();
    },

    onShow: function () {
        this._settings = Store.loadSettings();
        this._runtime = Store.loadRuntime();
        this._stopwatch = Store.loadStopwatch();

        const now = Date.now();
        if (this._runtime.lastNow && Math.abs(now - this._runtime.lastNow) > 5 * 60 * 1000) {
            wx.showToast({ title: '检测到系统时间变化，已按当前时间重算', icon: 'none', duration: 2500 });
        }
        this._runtime.lastNow = now;
        Store.saveRuntime(this._runtime);

        if (!this._settings) {
            this.stopTick();
            this.setData({ ready: false });
            const self = this;
            setTimeout(function () {
                wx.navigateTo({ url: '/pages/onboarding/onboarding' });
            }, 350);
            return;
        }

        this.setData({
            ready: true,
            shiftRangeText: shiftRangeText(this._settings),
            monthNotice: this._settings.salaryMonth !== T.previousMonthKey(now)
                ? '当前基于 ' + this._settings.salaryMonth + ' 的到手月薪计算，本月牛马天数 D 按班表算；可在「设置」里更新薪资'
                : ''
        });
        this.tick(true);
        this.startTick();
    },

    onHide: function () {
        this.stopTick();
        const runtime = Store.loadRuntime();
        runtime.lastNow = Date.now();
        Store.saveRuntime(runtime);
    },

    onUnload: function () {
        this.stopTick();
    },

    startTick: function () {
        this.stopTick();
        const self = this;
        const delay = 1000 - (Date.now() % 1000) + 10;
        this._timeout = setTimeout(function () {
            self.tick(false);
            self._timer = setInterval(function () { self.tick(false); }, 1000);
        }, delay);
    },

    stopTick: function () {
        if (this._timeout) { clearTimeout(this._timeout); this._timeout = null; }
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
    },

    // 每个 tick 用绝对时间全量重算，只把变化的展示字段写入 setData
    tick: function (force) {
        if (!this._settings) return;
        const now = Date.now();
        const sw = this._stopwatch;
        const s = calc.getState(this._settings, now, { overtimeMode: !!this._runtime.overtimeMode });

        // 可选联动（默认关闭）：进入休息段自动开始摸鱼计时，离开自动暂停。
        // 只影响正计时，绝不改动倒计时与收益计算。
        const prevKey = this._prevStateKey;
        if (prevKey !== undefined && this._settings.autoRestLink) {
            if (s.stateKey === 'RESTING' && prevKey !== 'RESTING' && sw.state === 'idle') {
                sw.state = 'running';
                sw.startAt = now;
                Store.saveStopwatch(sw);
            } else if (prevKey === 'RESTING' && s.stateKey === 'WORKING' && sw.state === 'running') {
                sw.elapsedMs = calc.stopwatchElapsed(sw, now);
                sw.state = 'paused';
                sw.startAt = 0;
                Store.saveStopwatch(sw);
            }
        }
        this._prevStateKey = s.stateKey;

        if (!force && !s.tickNeeded && sw.state !== 'running') {
            if (now - this._lastIdleTick < 5000) return;
            this._lastIdleTick = now;
        }

        const swMs = calc.stopwatchElapsed(sw, now);
        const totalMs = Store.todayTotalMs(now) + (sw.state === 'idle' ? 0 : swMs);
        const d = new Date(now);
        const patch = {};
        const self = this;
        function put(key, value) {
            if (self.data[key] !== value) patch[key] = value;
        }

        put('todayText', (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()]);
        put('stateKey', s.stateKey);
        put('statusLabel', s.statusLabel);
        put('statusText', s.statusText);
        put('countdownText', s.countdownText);
        put('earnedText', s.earnedText);
        put('remainWorkText', s.remainWorkText);
        put('remainEarnText', s.remainEarnText);
        put('hourlyText', s.hourlyText);
        put('dailyText', s.dailyText);
        put('dailyWorkText', s.dailyWorkText);
        put('progressPct', s.progressPct);
        put('nightShift', s.nightShift);
        put('shiftDateLabel', s.shiftDateLabel);
        put('showOvertime', s.showOvertime);
        put('overtimeText', s.overtimeText);
        put('showOvertimeButton', s.phaseKey === 'OFF_WORK' || s.phaseKey === 'OVERTIME');
        put('overtimeButtonText', s.showOvertime ? '我下班了' : '我还在加班');
        put('basisRows', s.basisRows);
        put('swText', T.msToHMS(swMs));
        put('swState', sw.state);
        put('swTag', sw.tag);
        put('swPrimaryText', sw.state === 'paused' ? '继续' : '开始');
        put('todayTotalText', totalText(totalMs));

        if (Object.keys(patch).length) this.setData(patch);
    },

    noop: function () {},

    // 按操作分别防抖：连点同一个按钮会被拦截，但开始→暂停→结束这类不同操作互不阻塞
    debounce: function (key) {
        const now = Date.now();
        const last = this._lastTapMap[key] || 0;
        if (now - last < 300) return false;
        this._lastTapMap[key] = now;
        return true;
    },

    onGoSetup: function () {
        wx.navigateTo({ url: '/pages/onboarding/onboarding' });
    },

    onShowBasis: function () { this.setData({ showBasis: true }); },
    onHideBasis: function () { this.setData({ showBasis: false }); },

    onToggleOvertime: function () {
        if (!this.debounce('overtime')) return;
        this._runtime.overtimeMode = !this._runtime.overtimeMode;
        Store.saveRuntime(this._runtime);
        this.tick(true);
    },

    onToggleExpand: function () {
        this.setData({ swExpanded: !this.data.swExpanded });
    },

    onTagChange: function (event) {
        const tag = event.currentTarget.dataset.tag;
        const sw = this._stopwatch;
        sw.tag = tag;
        Store.saveStopwatch(sw);
        this.tick(true);
    },

    onStart: function () {
        if (!this.debounce('start')) return;
        const sw = this._stopwatch;
        if (sw.state === 'running') return;
        sw.state = 'running';
        sw.startAt = Date.now();
        Store.saveStopwatch(sw);
        this.tick(true);
    },

    onPause: function () {
        if (!this.debounce('pause')) return;
        const sw = this._stopwatch;
        if (sw.state !== 'running') return;
        sw.elapsedMs = calc.stopwatchElapsed(sw, Date.now());
        sw.state = 'paused';
        sw.startAt = 0;
        Store.saveStopwatch(sw);
        this.tick(true);
    },

    onFinish: function () {
        if (!this.debounce('finish')) return;
        const sw = this._stopwatch;
        if (sw.state === 'idle' && !sw.elapsedMs) {
            wx.showToast({ title: '还没开始计时呢', icon: 'none' });
            return;
        }
        const now = Date.now();
        const duration = calc.stopwatchElapsed(sw, now);
        Store.addRecord({
            dateKey: T.dateKey(new Date(now)),
            tag: sw.tag,
            startAt: sw.startAt || now,
            endAt: now,
            durationMs: duration
        });
        const fresh = Store.emptyStopwatch();
        fresh.tag = sw.tag;
        Store.saveStopwatch(fresh);
        this._stopwatch = fresh;
        wx.showToast({ title: '记下啦', icon: 'success' });
        this.tick(true);
    },

    onReset: function () {
        const self = this;
        wx.showModal({
            title: '重置本次计时',
            content: '只清零当前这一次，今日累计和已保存的记录都会保留。',
            confirmText: '重置',
            success: function (res) {
                if (!res.confirm) return;
                const fresh = Store.emptyStopwatch();
                fresh.tag = self._stopwatch.tag;
                Store.saveStopwatch(fresh);
                self._stopwatch = fresh;
                self.tick(true);
            }
        });
    }
});
