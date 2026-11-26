const calc = require('../../utils/calc.js');
const T = require('../../utils/time.js');
const Store = require('../../utils/storage.js');

const TITLES = [
    '先认识一下',
    '你一周休几天',
    '上个月到手月薪',
    '每天上下班时间',
    '每天休息时间段',
    '确认一下'
];

const WORKWEEK_TEXT = {
    double: '双休（周一至周五上班）',
    single: '单休（周一至周六上班）'
};

function toOffset(wallMin, startMin) {
    return (wallMin - startMin + 1440) % 1440;
}

function wallLabel(offset, startMin) {
    const total = startMin + offset;
    return (total >= 1440 ? '次日 ' : '') + T.minToStr(total % 1440);
}

function decorate(rest, startMin) {
    return {
        startOffsetMin: rest.startOffsetMin,
        endOffsetMin: rest.endOffsetMin,
        startLabel: wallLabel(rest.startOffsetMin, startMin),
        endLabel: wallLabel(rest.endOffsetMin, startMin)
    };
}

Page({
    data: {
        step: 0,
        stepTitle: TITLES[0],
        stepTitles: TITLES,
        salaryMonth: '',
        salaryInput: '',
        workweek: 'double',
        startMin: 540,
        endMin: 1080,
        startLabel: '09:00',
        endLabel: '18:00',
        spanLabel: '09:00',
        isCrossDay: false,
        rests: [],
        canAddRest: true,
        errors: { salary: '', shift: '', rest: '' },
        hours: T.HOURS,
        minutes: T.MINUTES,
        showPicker: false,
        pickerTitle: '',
        pickerField: '',
        pickerValue: [9, 0],
        pickerMin: 540,
        pickerMinLabel: '09:00',
        showRestEditor: false,
        editingIndex: -1,
        tempRestStart: 720,
        tempRestEnd: 780,
        tempRestStartLabel: '12:00',
        tempRestEndLabel: '13:00',
        preview: null,
        confirmSalaryText: '',
        confirmRestText: '无休息段',
        confirmWorkweekText: WORKWEEK_TEXT.double
    },

    onLoad: function (options) {
        const settings = Store.loadSettings();
        const month = T.previousMonthKey(Date.now());
        if (options && options.mode === 'reset' && settings) {
            Store.clearDraft();
            this.applyForm({
                salaryInput: String(settings.salaryCent / 100),
                workweek: settings.workweek || 'double',
                startMin: settings.shiftStartMin,
                endMin: settings.shiftEndMin,
                rests: settings.rests || [],
                step: 0
            }, month);
            return;
        }
        const draft = Store.loadDraft();
        if (draft) {
            this.applyForm(draft, month);
            wx.showToast({ title: '已恢复上次的设置', icon: 'none' });
        } else {
            this.setData({ salaryMonth: month });
        }
    },

    applyForm: function (form, month) {
        const startMin = Number(form.startMin);
        const endMin = Number(form.endMin);
        const span = (endMin - startMin + 1440) % 1440;
        const rests = calc.normalizeRests(form.rests || [], span);
        const patch = {
            step: Number(form.step) || 0,
            salaryMonth: month,
            salaryInput: String(form.salaryInput || ''),
            workweek: form.workweek === 'single' ? 'single' : 'double',
            startMin: startMin,
            endMin: endMin,
            startLabel: T.minToStr(startMin),
            endLabel: wallLabel(span, startMin),
            spanLabel: T.msToHM(span * 60000),
            isCrossDay: (startMin + span) >= 1440,
            rests: rests.map(function (r) { return decorate(r, startMin); }),
            canAddRest: rests.length < 5
        };
        patch.stepTitle = TITLES[patch.step];
        this.setData(patch);
    },

    setError: function (key, message) {
        const patch = {};
        patch['errors.' + key] = message;
        this.setData(patch);
        if (message) wx.showToast({ title: message, icon: 'none', duration: 2200 });
    },

    saveDraft: function () {
        Store.saveDraft({
            step: this.data.step,
            salaryInput: this.data.salaryInput,
            workweek: this.data.workweek,
            startMin: this.data.startMin,
            endMin: this.data.endMin,
            rests: this.data.rests.map(function (r) {
                return { startOffsetMin: r.startOffsetMin, endOffsetMin: r.endOffsetMin };
            })
        });
    },

    buildSettings: function () {
        return {
            salaryCent: Math.round(Number(this.data.salaryInput) * 100),
            salaryMonth: this.data.salaryMonth,
            workweek: this.data.workweek,
            shiftStartMin: this.data.startMin,
            shiftEndMin: this.data.endMin,
            rests: this.data.rests.map(function (r) {
                return { startOffsetMin: r.startOffsetMin, endOffsetMin: r.endOffsetMin };
            }),
            autoRestLink: false
        };
    },

    currentSpan: function () {
        return (this.data.endMin - this.data.startMin + 1440) % 1440;
    },

    validateSalary: function () {
        const raw = String(this.data.salaryInput).trim();
        if (!raw) return '填个到手月薪吧，只存你手机里';
        if (!/^\d+(\.\d{1,2})?$/.test(raw)) return '只能填数字，最多两位小数';
        const n = Number(raw);
        if (!isFinite(n) || n <= 0) return '月薪要大于 0 哦';
        if (n > 9999999.99) return '数字太大啦，检查一下';
        return '';
    },

    validateShift: function () {
        const span = this.currentSpan();
        if (!span) return '上下班时间不能一样哦';
        const restTotal = calc.restTotalOf(calc.normalizeRests(this.data.rests, span));
        if (span - restTotal < 1) return '休息比上班还长，那可太爽了（但不行）';
        return '';
    },

    validateRestAll: function () {
        const span = this.currentSpan();
        if (!span) return '上下班时间不能一样哦';
        const rests = calc.normalizeRests(this.data.rests, span);
        if (rests.length > 5) return '最多 5 段休息，够用了';
        if (calc.restTotalOf(rests) >= span) return '休息总时长不能超过工作时间';
        return '';
    },

    onSalaryInput: function (event) {
        this.setData({ salaryInput: event.detail.value });
    },

    onNext: function () {
        const step = this.data.step;
        if (step === 2) {
            const err = this.validateSalary();
            if (err) { this.setError('salary', err); return; }
        }
        if (step === 3) {
            const err = this.validateShift();
            if (err) { this.setError('shift', err); return; }
        }
        if (step === 4) {
            const err = this.validateRestAll();
            if (err) { this.setError('rest', err); return; }
            this.buildPreview();
        }
        this.setStep(step + 1);
    },

    onPrev: function () {
        if (this.data.step === 0) return;
        this.setStep(this.data.step - 1);
    },

    onSkip: function () {
        wx.navigateBack({
            fail: function () { wx.reLaunch({ url: '/pages/index/index' }); }
        });
    },

    setStep: function (step) {
        this.setData({
            step: step,
            stepTitle: TITLES[step],
            errors: { salary: '', shift: '', rest: '' }
        });
        this.saveDraft();
    },

    buildPreview: function () {
        const settings = this.buildSettings();
        const d = calc.derive(settings, Date.now());
        const restText = this.data.rests.length
            ? this.data.rests.map(function (r) { return r.startLabel + '–' + r.endLabel; }).join('、')
            : '无休息段';
        const estimateNote = d.workweek === 'single' ? '（按周一至周六估算）' : '（按周一至周五估算）';
        this.setData({
            preview: {
                salaryMonth: this.data.salaryMonth,
                workdayMonth: d.workdayMonth,
                workdays: d.N + ' 天' + (d.source === 'official' ? '（法定节假日表）' : estimateNote),
                dailyWork: T.msToHM(d.S * 1000),
                restTotal: T.msToHM(d.restTotal * 60000),
                hourly: T.money(d.hourly),
                daily: T.money(d.daily)
            },
            confirmSalaryText: '¥ ' + T.money(Number(this.data.salaryInput)),
            confirmRestText: restText,
            confirmWorkweekText: WORKWEEK_TEXT[settings.workweek] || WORKWEEK_TEXT.double
        });
    },

    onSelectWorkweek: function (event) {
        this.setData({ workweek: event.currentTarget.dataset.value });
    },

    onFinish: function () {
        const salaryErr = this.validateSalary();
        if (salaryErr) { this.setStep(2); this.setError('salary', salaryErr); return; }
        const shiftErr = this.validateShift();
        if (shiftErr) { this.setStep(3); this.setError('shift', shiftErr); return; }
        const restErr = this.validateRestAll();
        if (restErr) { this.setStep(4); this.setError('rest', restErr); return; }
        const settings = this.buildSettings();
        if (!calc.derive(settings, Date.now()).valid) {
            wx.showToast({ title: '设置还不完整，检查一下', icon: 'none' });
            return;
        }
        Store.saveSettings(settings);
        Store.clearDraft();
        wx.showToast({ title: '设置完成', icon: 'success' });
        setTimeout(function () { wx.reLaunch({ url: '/pages/index/index' }); }, 650);
    },

    // ---------- 24 小时制滑动时间选择器 ----------
    openPicker: function (event) {
        const field = event.currentTarget.dataset.field;
        let min = this.data.startMin;
        if (field === 'end') min = this.data.endMin;
        if (field === 'restStart') min = this.data.tempRestStart;
        if (field === 'restEnd') min = this.data.tempRestEnd;
        const titles = {
            start: '选择上班时间', end: '选择下班时间',
            restStart: '休息开始时间', restEnd: '休息结束时间'
        };
        this.setData({
            showPicker: true,
            pickerField: field,
            pickerTitle: titles[field],
            pickerMin: min,
            pickerValue: T.pickerValue(min),
            pickerMinLabel: T.minToStr(min)
        });
    },

    onPickerChange: function (event) {
        const value = event.detail.value;
        const min = T.valueToMin(value);
        this.setData({ pickerValue: value, pickerMin: min, pickerMinLabel: T.minToStr(min) });
    },

    adjustMinute: function (delta) {
        const min = (this.data.pickerMin + delta + 1440) % 1440;
        this.setData({ pickerMin: min, pickerValue: T.pickerValue(min), pickerMinLabel: T.minToStr(min) });
    },

    onMinus: function () { this.adjustMinute(-1); },
    onPlus: function () { this.adjustMinute(1); },

    onClosePicker: function () { this.setData({ showPicker: false }); },

    onConfirmPicker: function () {
        const field = this.data.pickerField;
        const min = this.data.pickerMin;
        const patch = { showPicker: false };
        if (field === 'start') {
            patch.startMin = min;
            patch.startLabel = T.minToStr(min);
        } else if (field === 'end') {
            patch.endMin = min;
        } else if (field === 'restStart') {
            patch.tempRestStart = min;
            patch.tempRestStartLabel = T.minToStr(min);
        } else if (field === 'restEnd') {
            patch.tempRestEnd = min;
            patch.tempRestEndLabel = T.minToStr(min);
        }

        const startMin = field === 'start' ? min : this.data.startMin;
        const endMin = field === 'end' ? min : this.data.endMin;
        const span = (endMin - startMin + 1440) % 1440;
        if (field === 'start' || field === 'end') {
            const normalized = calc.normalizeRests(this.data.rests, span);
            patch.rests = normalized.map(function (r) { return decorate(r, startMin); });
            patch.canAddRest = normalized.length < 5;
            patch.spanLabel = T.msToHM(span * 60000);
            patch.endLabel = wallLabel(span, startMin);
            patch.isCrossDay = (startMin + span) >= 1440;
        }
        this.setData(patch);
        this.saveDraft();
    },

    // ---------- 休息段 ----------
    onAddRest: function () {
        if (this.data.rests.length >= 5) {
            wx.showToast({ title: '最多 5 段休息，够用了', icon: 'none' });
            return;
        }
        const start = (this.data.startMin + 180) % 1440;
        const end = (this.data.startMin + 240) % 1440;
        this.setData({
            showRestEditor: true,
            editingIndex: -1,
            tempRestStart: start,
            tempRestEnd: end,
            tempRestStartLabel: T.minToStr(start),
            tempRestEndLabel: T.minToStr(end)
        });
        this.setError('rest', '');
    },

    onEditRest: function (event) {
        const index = Number(event.currentTarget.dataset.index);
        const rest = this.data.rests[index];
        if (!rest) return;
        const start = (this.data.startMin + rest.startOffsetMin) % 1440;
        const end = (this.data.startMin + rest.endOffsetMin) % 1440;
        this.setData({
            showRestEditor: true,
            editingIndex: index,
            tempRestStart: start,
            tempRestEnd: end,
            tempRestStartLabel: rest.startLabel,
            tempRestEndLabel: rest.endLabel
        });
        this.setError('rest', '');
    },

    onCloseRestEditor: function () { this.setData({ showRestEditor: false }); },

    onSaveRest: function () {
        const span = this.currentSpan();
        const os = toOffset(this.data.tempRestStart, this.data.startMin);
        const oe = toOffset(this.data.tempRestEnd, this.data.startMin);
        if (!(os >= 0 && os < oe && oe <= span)) {
            this.setError('rest', '休息时段要落在班次内，且结束晚于开始');
            return;
        }
        const list = this.data.rests.slice();
        const item = { startOffsetMin: os, endOffsetMin: oe };
        if (this.data.editingIndex >= 0) list[this.data.editingIndex] = item;
        else list.push(item);
        const merged = calc.normalizeRests(list, span);
        if (merged.length > 5) {
            this.setError('rest', '最多 5 段休息，够用了');
            return;
        }
        if (calc.restTotalOf(merged) >= span) {
            this.setError('rest', '休息总时长不能超过工作时间');
            return;
        }
        if (merged.length < list.length) {
            wx.showToast({ title: '已自动合并重叠的休息时段', icon: 'none' });
        }
        const startMin = this.data.startMin;
        this.setData({
            rests: merged.map(function (r) { return decorate(r, startMin); }),
            canAddRest: merged.length < 5,
            showRestEditor: false
        });
        this.setError('rest', '');
        this.saveDraft();
    },

    onDeleteRest: function () {
        const index = this.data.editingIndex;
        if (index < 0) return;
        const list = this.data.rests.slice();
        list.splice(index, 1);
        this.setData({ rests: list, canAddRest: list.length < 5, showRestEditor: false });
        this.saveDraft();
    },

    noop: function () {}
});
