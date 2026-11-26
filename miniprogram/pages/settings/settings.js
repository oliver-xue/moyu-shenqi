const calc = require('../../utils/calc.js');
const T = require('../../utils/time.js');
const Store = require('../../utils/storage.js');
const S = require('../../utils/schedule.js');

function restText(settings) {
    if (!settings.rests || !settings.rests.length) return '无休息段';
    return settings.rests.map(function (r) {
        const a = settings.shiftStartMin + r.startOffsetMin;
        const b = settings.shiftStartMin + r.endOffsetMin;
        return (a >= 1440 ? '次日 ' : '') + T.minToStr(a % 1440) + '–' +
            (b >= 1440 ? '次日 ' : '') + T.minToStr(b % 1440);
    }).join('、');
}

Page({
    data: {
        ready: false,
        rows: [],
        shiftText: '',
        restText: '',
        autoRestLink: false,
        overtimeMode: false,
        todayTotalText: '0 分 0 秒',
        recordCount: 0,
        holidaysNote: '',
        scheduleText: '标准班 · 双休（周一至周五）'
    },

    onShow: function () {
        const settings = Store.loadSettings();
        const runtime = Store.loadRuntime();
        if (!settings) {
            this.setData({ ready: false });
            return;
        }
        const state = calc.getState(settings, Date.now(), { overtimeMode: !!runtime.overtimeMode });
        const span = calc.spanOf(settings);
        const endTotal = settings.shiftStartMin + span;
        const ms = Store.todayTotalMs(Date.now());
        this.setData({
            ready: true,
            rows: state.basisRows,
            shiftText: T.minToStr(settings.shiftStartMin) + ' — ' +
                (endTotal >= 1440 ? '次日 ' : '') + T.minToStr(endTotal % 1440),
            restText: restText(settings),
            autoRestLink: !!settings.autoRestLink,
            overtimeMode: !!runtime.overtimeMode,
            todayTotalText: Math.floor(ms / 60000) + ' 分 ' + Math.floor(ms / 1000) % 60 + ' 秒',
            recordCount: Store.loadRecords().length,
            scheduleText: S.description(settings),
            holidaysNote: S.holidaysNote(settings, state.workdaysSource)
        });
    },

    onEdit: function () {
        wx.navigateTo({ url: '/pages/onboarding/onboarding?mode=reset' });
    },

    onGoSetup: function () {
        wx.navigateTo({ url: '/pages/onboarding/onboarding' });
    },

    onToggleAutoRestLink: function (event) {
        const settings = Store.loadSettings();
        if (!settings) return;
        settings.autoRestLink = !!event.detail.value;
        Store.saveSettings(settings);
        this.setData({ autoRestLink: settings.autoRestLink });
        wx.showToast({
            title: settings.autoRestLink ? '休息时自动开始摸鱼计时' : '已关闭自动联动',
            icon: 'none'
        });
    },

    onToggleOvertime: function (event) {
        const runtime = Store.loadRuntime();
        runtime.overtimeMode = !!event.detail.value;
        Store.saveRuntime(runtime);
        this.setData({ overtimeMode: runtime.overtimeMode });
        wx.showToast({ title: '已保存，回首页即可看到', icon: 'none' });
    },

    onClearToday: function () {
        const self = this;
        wx.showModal({
            title: '清空今日摸鱼累计',
            content: '只删除今天已结束的摸鱼记录，进行中的计时不受影响。',
            success: function (res) {
                if (!res.confirm) return;
                Store.clearTodayRecords(Date.now());
                self.onShow();
                wx.showToast({ title: '已清空', icon: 'success' });
            }
        });
    },

    onClearAll: function () {
        wx.showModal({
            title: '清空全部数据',
            content: '会删除薪资、班次、休息段和所有摸鱼记录，回到初始设置。此操作不可撤销。',
            confirmText: '清空',
            confirmColor: '#c0392b',
            success: function (res) {
                if (!res.confirm) return;
                Store.clearAll();
                wx.reLaunch({ url: '/pages/index/index' });
            }
        });
    },

    onAbout: function () {
        wx.showModal({
            title: '关于摸鱼神器',
            content: '所有计算都在本机完成，不登录、不联网、不上传薪资。节假日表随版本内置，每年更新。金额公式严格按：时薪 = 月薪 / 本月牛马天数 D / 每天工作时间。',
            showCancel: false
        });
    }
});
