const calc = require('../../utils/calc.js');
const T = require('../../utils/time.js');
const Store = require('../../utils/storage.js');
const S = require('../../utils/schedule.js');
const H = require('../../utils/holidays.js');

const TITLES = [
    '先认识一下',
    '你的作息怎么排？',
    '上个月到手月薪',
    '每天上下班时间',
    '每天休息时间段',
    '确认一下'
];

const MODE_OPTIONS = [
    { mode: 'standard', label: '标准班', desc: '双休 / 单休，按法定节假日' },
    { mode: 'weekly', label: '固定周班', desc: '每周固定哪几天上班' },
    { mode: 'rotation', label: '轮班制', desc: '做 N 天休 M 天' },
    { mode: 'manual', label: '手动排班', desc: '自填 D，逐日标记' }
];

const LAST_STEP = 5;

function currentMonthKey() {
    return T.dateKey(new Date()).slice(0, 7);
}

// 初始 D = 当前自然月按国务院节假日表算出的工作日数，与预填色块一一对应
function defaultManualD() {
    const now = new Date();
    return H.countWorkdays(now.getFullYear(), now.getMonth() + 1, 'double') || 21;
}

function buildWeekDays(days) {
    const selected = Array.isArray(days) ? days : [];
    return S.WEEK_LABELS.map(function (label, index) {
        return { day: index, label: label, on: selected.indexOf(index) >= 0 };
    });
}

// 未传 specialDates 时，默认按国务院节假日表预填：法定放假日留空、调休补班日标上班；
// 传入时只认「上班」标记，其余日期一律未标记 = 休息（用户手动标记优先）。
function buildCalendar(monthKey, specialDates) {
    const parts = monthKey.split('-');
    const lastDay = new Date(Number(parts[0]), Number(parts[1]), 0).getDate();
    const workKeys = {};
    if (specialDates === undefined || specialDates === null) {
        for (let d = 1; d <= lastDay; d += 1) {
            const date = new Date(Number(parts[0]), Number(parts[1]) - 1, d, 0, 0, 0, 0);
            if (H.isWorkday(date, 'double')) workKeys[T.dateKey(date)] = 1;
        }
    } else {
        specialDates.forEach(function (it) {
            // 旧存档中落在休息日/法定放假日的上班标记，初始化时一律不恢复
            if (it && it.date && it.type === 'work' && H.isWorkdayKey(it.date, 'double')) {
                workKeys[it.date] = 1;
            }
        });
    }
    const list = [];
    for (let d = 1; d <= lastDay; d += 1) {
        const key = monthKey + '-' + T.pad2(d);
        list.push({ day: d, key: key, mark: workKeys[key] ? 'work' : '' });
    }
    return list;
}

function isStandardWorkdayKey(key) {
    return H.isWorkdayKey(key, 'double');
}

// 初始化时让深色标记数严格等于 D：优先保留/补齐国务院节假日表的工作日，不足再取其余日期；
// 超出 D 时从末尾依次取消，日期顺序始终与实际月历一致。
function syncCalendarToD(days, dText) {
    const list = (days || []).map(function (d) {
        return { day: d.day, key: d.key, mark: d.mark };
    });
    const target = Math.max(0, Math.min(31, Math.floor(Number(dText)) || 0));
    const marked = list.filter(function (d) { return d.mark === 'work'; });
    if (marked.length > target) {
        const drop = {};
        marked.slice(target).forEach(function (d) { drop[d.key] = 1; });
        list.forEach(function (d) { if (drop[d.key]) d.mark = ''; });
    } else if (marked.length < target) {
        const notHoliday = function (d) { return !H.isOfficialOff(T.keyToDate(d.key)); };
        const workdays = list.filter(function (d) { return d.mark !== 'work' && isStandardWorkdayKey(d.key) && notHoliday(d); });
        const others = list.filter(function (d) { return d.mark !== 'work' && !isStandardWorkdayKey(d.key) && notHoliday(d); });
        const add = workdays.concat(others).slice(0, target - marked.length);
        const keys = {};
        add.forEach(function (d) { keys[d.key] = 1; });
        list.forEach(function (d) { if (keys[d.key]) d.mark = 'work'; });
    }
    return list;
}

// 手动排班只有两态：标记上班 / 未标记（休息）
function countManualWork(days) {
    return (days || []).filter(function (d) { return d.mark === 'work'; }).length;
}

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
        scheduleModes: MODE_OPTIONS,
        scheduleMode: 'standard',
        workweek: 'double',
        weekDays: buildWeekDays([]),
        rotationWorkText: '2',
        rotationRestText: '1',
        rotationStartDate: currentMonthKey() + '-01',
        rotationStartState: 'work',
        manualDText: String(defaultManualD()),
        autoD: true,
        calendarMonth: currentMonthKey(),
        calendarDays: buildCalendar(currentMonthKey()),
        manualWorkCount: 0,
        manualOverLimit: false,
        startMin: 540,
        endMin: 1080,
        startLabel: '09:00',
        endLabel: '18:00',
        spanLabel: '09:00',
        isCrossDay: false,
        rests: [],
        canAddRest: true,
        errors: { salary: '', shift: '', rest: '', schedule: '' },
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
        confirmScheduleText: S.description({ scheduleMode: 'standard' })
    },

    onLoad: function (options) {
        const settings = Store.loadSettings();
        const month = T.previousMonthKey(Date.now());
        if (options && options.mode === 'reset' && settings) {
            Store.clearDraft();
            this.applyForm({
                salaryInput: String(settings.salaryCent / 100),
                scheduleMode: S.modeOf(settings),
                workweek: settings.workweek || 'double',
                weekdays: settings.weekdays,
                rotation: settings.rotation,
                manualD: settings.manualD,
                autoD: settings.autoD,
                specialDates: settings.specialDates,
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
        const monthKey = currentMonthKey();
        const manualD = form.manualD || defaultManualD();
        const patch = {
            step: Number(form.step) || 0,
            salaryMonth: month,
            salaryInput: String(form.salaryInput || ''),
            scheduleMode: S.modeOf(form),
            workweek: form.workweek === 'single' ? 'single' : 'double',
            weekDays: buildWeekDays(form.weekdays),
            rotationWorkText: String((form.rotation && form.rotation.workDays) || 2),
            rotationRestText: String((form.rotation && form.rotation.restDays) || 1),
            rotationStartDate: (form.rotation && form.rotation.startDate) || (currentMonthKey() + '-01'),
            rotationStartState: (form.rotation && form.rotation.startState === 'rest') ? 'rest' : 'work',
            manualDText: String(manualD),
            autoD: form.autoD !== false,
            calendarMonth: monthKey,
            calendarDays: syncCalendarToD(buildCalendar(monthKey, form.specialDates), manualD),
            confirmScheduleText: S.description(form),
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
        patch.manualWorkCount = countManualWork(patch.calendarDays);
        patch.manualOverLimit = patch.manualWorkCount > (Number(patch.manualDText) || 0);
        this._manualSynced = true;
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
            scheduleMode: this.data.scheduleMode,
            workweek: this.data.workweek,
            weekdays: this.data.weekDays.filter(function (d) { return d.on; }).map(function (d) { return d.day; }),
            rotation: {
                workDays: Number(this.data.rotationWorkText) || 1,
                restDays: Number(this.data.rotationRestText) || 1,
                startDate: this.data.rotationStartDate,
                startState: this.data.rotationStartState
            },
            manualD: Number(this.data.manualDText) || 21,
            autoD: this.data.scheduleMode === 'manual' ? false : this.data.autoD,
            specialDates: this.data.calendarDays.filter(function (d) { return !!d.mark; }).map(function (d) {
                return { date: d.key, type: d.mark };
            }),
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
            scheduleMode: this.data.scheduleMode,
            workweek: this.data.workweek,
            weekdays: this.data.weekDays.filter(function (d) { return d.on; }).map(function (d) { return d.day; }),
            rotation: {
                workDays: Number(this.data.rotationWorkText) || 1,
                restDays: Number(this.data.rotationRestText) || 1,
                startDate: this.data.rotationStartDate,
                startState: this.data.rotationStartState
            },
            manualD: Number(this.data.manualDText) || 21,
            autoD: this.data.scheduleMode === 'manual' ? false : this.data.autoD,
            specialDates: this.data.calendarDays.filter(function (d) { return !!d.mark; }).map(function (d) {
                return { date: d.key, type: d.mark };
            }),
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

    // 手动排班：实际上班色块数不能超过填写的 D
    manualLimitError: function (days, dText) {
        const list = days || this.data.calendarDays;
        const raw = String(dText === undefined ? this.data.manualDText : dText).trim();
        const d = Number(raw);
        if (!/^\d+$/.test(raw) || d < 1 || d > 31) return '本月牛马天数 D 填 1～31';
        const count = countManualWork(list);
        if (count > d) {
            return '已按班表算出 ' + count + ' 天，超过填写的 D = ' + d + ' 天；调大 D 或把多余日期标为休息';
        }
        return '';
    },

    validateSchedule: function () {
        const mode = this.data.scheduleMode;
        if (mode === 'weekly') {
            const selected = this.data.weekDays.filter(function (d) { return d.on; });
            if (!selected.length) return '至少选一天上班吧';
        }
        if (mode === 'rotation') {
            const n = Number(this.data.rotationWorkText);
            const m = Number(this.data.rotationRestText);
            if (!/^\d+$/.test(String(this.data.rotationWorkText)) || n < 1 || n > 31) return '做几天上班填 1～31';
            if (!/^\d+$/.test(String(this.data.rotationRestText)) || m < 1 || m > 31) return '休几天填 1～31';
            const start = this.data.rotationStartDate;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || T.dateKey(T.keyToDate(start)) !== start) {
                return '起始日期请按 2026-11-01 这样填';
            }
        }
        if (mode === 'manual') {
            const limitErr = this.manualLimitError();
            if (limitErr) return limitErr;
        } else if (!this.data.autoD) {
            const raw = String(this.data.manualDText).trim();
            const d = Number(raw);
            if (!/^\d+$/.test(raw) || d < 1 || d > 31) return '本月牛马天数 D 填 1～31';
        }
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
        if (step === 1) {
            const err = this.validateSchedule();
            if (err) { this.setError('schedule', err); return; }
        }
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
            errors: { salary: '', shift: '', rest: '', schedule: '' }
        });
        this.saveDraft();
    },

    buildPreview: function () {
        const settings = this.buildSettings();
        const d = calc.derive(settings, Date.now());
        const restText = this.data.rests.length
            ? this.data.rests.map(function (r) { return r.startLabel + '–' + r.endLabel; }).join('、')
            : '无休息段';
        this.setData({
            preview: {
                salaryMonth: this.data.salaryMonth,
                workdayMonth: d.workdayMonth,
                workdays: d.N + ' 天' + S.daysNote(settings, d.source),
                dailyWork: T.msToHM(d.S * 1000),
                restTotal: T.msToHM(d.restTotal * 60000),
                hourly: T.money(d.hourly),
                daily: T.money(d.daily)
            },
            confirmSalaryText: '¥ ' + T.money(Number(this.data.salaryInput)),
            confirmRestText: restText,
            confirmScheduleText: S.description(settings)
        });
    },

    // ---------- 作息类型 ----------
    onSelectScheduleMode: function (event) {
        const mode = event.currentTarget.dataset.mode;
        let days = this.data.calendarDays;
        if (mode === 'manual' && !this._manualSynced) {
            days = syncCalendarToD(days, this.data.manualDText);
            this._manualSynced = true;
        }
        const count = countManualWork(days);
        const cap = Number(this.data.manualDText);
        this.setData({
            scheduleMode: mode,
            calendarDays: days,
            manualWorkCount: count,
            manualOverLimit: (isFinite(cap) && cap > 0) ? count > cap : true
        });
        this.setError('schedule', '');
    },

    onSelectWorkweek: function (event) {
        this.setData({ workweek: event.currentTarget.dataset.value });
    },

    onToggleWeekday: function (event) {
        const index = Number(event.currentTarget.dataset.index);
        const item = this.data.weekDays[index];
        if (!item) return;
        const list = this.data.weekDays.slice();
        list[index].on = !item.on;
        this.setData({ weekDays: list });
        this.setError('schedule', '');
    },

    onRotationInput: function (event) {
        const field = event.currentTarget.dataset.field;
        const patch = {};
        if (field === 'work') patch.rotationWorkText = event.detail.value;
        else if (field === 'rest') patch.rotationRestText = event.detail.value;
        else if (field === 'start') patch.rotationStartDate = event.detail.value;
        this.setData(patch);
        this.setError('schedule', '');
    },

    onSelectStartState: function (event) {
        this.setData({ rotationStartState: event.currentTarget.dataset.value });
    },

    onManualDInput: function (event) {
        const text = event.detail.value;
        const count = countManualWork(this.data.calendarDays);
        const cap = Number(text);
        this.setData({
            manualDText: text,
            manualOverLimit: (isFinite(cap) && cap > 0) ? count > cap : true,
            'errors.schedule': this.manualLimitError(this.data.calendarDays, text)
        });
    },

    onToggleAutoD: function (event) {
        this.setData({ autoD: !!event.detail.value });
        this.setError('schedule', '');
    },

    onToggleManualMark: function (event) {
        const index = Number(event.currentTarget.dataset.index);
        const item = this.data.calendarDays[index];
        if (!item) return;
        // 只有两态：未标记（休息）↔ 标记上班；上班色块不得超过 D
        const next = item.mark === 'work' ? '' : 'work';
        const list = this.data.calendarDays.map(function (d) {
            return { day: d.day, key: d.key, mark: d.mark };
        });
        list[index].mark = next;
        if (next === 'work') {
            const err = this.manualLimitError(list);
            if (err) { this.setError('schedule', err); return; }
        }
        const count = countManualWork(list);
        const cap = Number(this.data.manualDText);
        this.setData({
            calendarDays: list,
            manualWorkCount: count,
            manualOverLimit: (isFinite(cap) && cap > 0) ? count > cap : true,
            'errors.schedule': ''
        });
    },

    onFinish: function () {
        const scheduleErr = this.validateSchedule();
        if (scheduleErr) { this.setStep(1); this.setError('schedule', scheduleErr); return; }
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
