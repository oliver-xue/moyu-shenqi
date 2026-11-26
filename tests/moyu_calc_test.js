const path = require('path');
const P = path.join(__dirname, '..', 'miniprogram', 'utils') + path.sep;
const H = require(P + 'holidays.js');
const T = require(P + 'time.js');
const SCHED = require(P + 'schedule.js');
let pass = 0, fail = 0;
function eq(name, got, want) { if (String(got) === String(want)) { pass++; console.log('  OK  ' + name + ' = ' + got); } else { fail++; console.log('  FAIL ' + name + ' got=' + got + ' want=' + want); } }
function ok(name, cond, extra) { if (cond) { pass++; console.log('  OK  ' + name + (extra ? ' = ' + extra : '')); } else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); } }
function at(d,h,m){ return new Date(2026, 9, d, h, m, 0, 0).getTime(); } // 2026-10 (仅用于跨月验证)

console.log('== 真实节假日表 ==');
eq('2026-10 工作日 D', H.countWorkdays(2026,10), 18);
eq('2026-11 工作日 D', H.countWorkdays(2026,11), 21);
eq('2026-10-01 国庆放假', H.isWorkdayKey('2026-10-01'), false);
eq('2026-10-10 调休补班', H.isWorkdayKey('2026-10-10'), true);
eq('2026-11-14 普通周六', H.isWorkdayKey('2026-11-14'), false);

console.log('== 新口径：D 按本月，薪资基准月仅作标注 ==');
const realCalc = require(P + 'calc.js');
const RS = { salaryCent:1000000, salaryMonth:'2026-10', shiftStartMin:540, shiftEndMin:1080,
             rests:[{startOffsetMin:180,endOffsetMin:240}], autoRestLink:false };
const dNov = realCalc.derive(RS, new Date(2026,10,9,10,0,0).getTime());
eq('薪资基准月仍为上月', dNov.salaryMonth, '2026-10');
eq('计算基准月为本月', dNov.workdayMonth, '2026-11');
eq('本月 D=21', dNov.N, 21);
eq('本月口径时薪', T.money(dNov.hourly), '59.52');
eq('本月口径日薪', T.money(dNov.daily), '476.19');
const dDec = realCalc.derive(RS, new Date(2026,11,15,10,0,0).getTime());
eq('跨月计算基准月', dDec.workdayMonth, '2026-12');
eq('跨月 D 跟随新月', dDec.N, H.countWorkdays(2026,12));
eq('跨月薪资基准月不变', dDec.salaryMonth, '2026-10');

console.log('== 单休 / 双休休息制度 ==');
const dDouble = H.countWorkdays(2026, 11, 'double');
const dSingle = H.countWorkdays(2026, 11, 'single');
eq('双休 D=21', dDouble, 21);
ok('单休 D > 双休 D', dSingle > dDouble, 'single=' + dSingle + ' double=' + dDouble);
eq('单休周六算工作日', H.isWorkdayKey('2026-11-14', 'single'), true);
eq('双休周六非工作日', H.isWorkdayKey('2026-11-14', 'double'), false);
eq('无参数默认双休(向后兼容)', H.isWorkdayKey('2026-11-14'), false);
eq('单休下国庆仍放假', H.isWorkdayKey('2026-10-01', 'single'), false);
eq('单休下调休补班仍生效', H.isWorkdayKey('2026-10-10', 'single'), true);
const RS_single = Object.assign({}, RS, { workweek: 'single' });
const dS = realCalc.derive(RS_single, new Date(2026,10,9,10,0,0).getTime());
const dD = realCalc.derive(RS, new Date(2026,10,9,10,0,0).getTime());
ok('单休时薪 < 双休时薪', dS.hourly < dD.hourly, 'single=' + dS.hourly.toFixed(2) + ' double=' + dD.hourly.toFixed(2));
ok('单休 D 与双休不同', dS.N !== dD.N, 'single=' + dS.N + ' double=' + dD.N);
eq('derive 返回 workweek=single', dS.workweek, 'single');
eq('无 workweek 默认 double', dD.workweek, 'double');
const stSatSingle = realCalc.getState(RS_single, new Date(2026,10,14,10,0,0).getTime(), {});
ok('单休周六是正常的班(非DAY_OFF)', stSatSingle.stateKey !== 'DAY_OFF', stSatSingle.stateKey);

console.log('== 四种作息类型与节假日口径 ==');
const WS5 = Object.assign({}, RS, { scheduleMode: 'weekly', weekdays: [1, 2, 3, 4, 5] });
const WS6 = Object.assign({}, RS, { scheduleMode: 'weekly', weekdays: [1, 2, 3, 4, 5, 6] });
eq('固定周班按周一至周五 D=21', SCHED.countWorkdays(2026, 11, WS5), 21);
ok('固定周班加周六 D 变多', SCHED.countWorkdays(2026, 11, WS6) > 21, SCHED.countWorkdays(2026, 11, WS6));
eq('固定周班周日轮休', realCalc.getState(WS5, new Date(2026, 10, 1, 10, 0, 0).getTime(), {}).stateKey, 'SHIFT_OFF');
eq('轮休当天金额为 0', realCalc.getState(WS5, new Date(2026, 10, 1, 10, 0, 0).getTime(), {}).earnedText, '0.00');
eq('轮休文案', realCalc.getState(WS5, new Date(2026, 10, 1, 10, 0, 0).getTime(), {}).statusText, '今天睡饱，钱包躺好');
const ROT = Object.assign({}, RS, { scheduleMode: 'rotation', rotation: { workDays: 2, restDays: 1, startDate: '2026-11-01', startState: 'work' } });
eq('轮班制做2休1 本月 D=20', SCHED.countWorkdays(2026, 11, ROT), 20);
eq('轮班制休息日轮休', realCalc.getState(ROT, new Date(2026, 10, 3, 10, 0, 0).getTime(), {}).stateKey, 'SHIFT_OFF');
const ROT_REST_FIRST = Object.assign({}, RS, { scheduleMode: 'rotation', rotation: { workDays: 2, restDays: 1, startDate: '2026-11-01', startState: 'rest' } });
eq('轮班制起始状态为休息', SCHED.isWorkdayKey('2026-11-01', ROT_REST_FIRST), false);
const MAN = Object.assign({}, RS, { scheduleMode: 'manual', manualD: 17, specialDates: [{ date: '2026-11-14', type: 'work' }] });
eq('手动排班 D 直接用填写值', realCalc.derive(MAN, new Date(2026, 10, 9, 10, 0, 0).getTime()).N, 17);
ok('手动特殊日期把周六标成上班', realCalc.getState(MAN, new Date(2026, 10, 14, 10, 0, 0).getTime(), {}).stateKey !== 'SHIFT_OFF', realCalc.getState(MAN, new Date(2026, 10, 14, 10, 0, 0).getTime(), {}).stateKey);
eq('关闭自动算 D 时用自填值', realCalc.derive(Object.assign({}, RS, { autoD: false, manualD: 17 }), new Date(2026, 10, 9, 10, 0, 0).getTime()).N, 17);
const ROT_HOL = Object.assign({}, RS, { scheduleMode: 'rotation', rotation: { workDays: 2, restDays: 1, startDate: '2026-10-01', startState: 'work' } });
const holState = realCalc.getState(ROT_HOL, new Date(2026, 9, 1, 10, 0, 0).getTime(), {});
eq('节假日上班进入节假日班状态', holState.stateKey, 'HOLIDAY_WORK');
eq('节假日班文案', holState.statusText, '节假日还在岗，辛苦了您');
ok('节假日班正常计钱', Number(holState.earnedText) > 0, holState.earnedText);
const makeupState = realCalc.getState(RS, new Date(2026, 9, 10, 10, 0, 0).getTime(), {});
ok('标准班补班日保留补班文案', makeupState.statusText.indexOf('补班日') >= 0, makeupState.statusText);
const weekMakeup = realCalc.getState(WS6, new Date(2026, 9, 10, 10, 0, 0).getTime(), {});
ok('其他班次周末上班不标补班', weekMakeup.statusText.indexOf('补班日') < 0, weekMakeup.statusText);
const weekHoliday = realCalc.getState(WS5, new Date(2026, 9, 1, 10, 0, 0).getTime(), {});
eq('其他班次节假日上班也计钱', weekHoliday.stateKey, 'HOLIDAY_WORK');

console.log('== 方案 §9.1 示例 (mock D=20) ==');
H.countWorkdays = function(){ return 20; };
const calc = require(P + 'calc.js');
const S = { salaryCent: 1000000, salaryMonth: '2026-10', shiftStartMin: 540, shiftEndMin: 1080,
            rests: [{startOffsetMin:180, endOffsetMin:240}], autoRestLink:false };
const d = calc.derive(S, new Date(2026,10,9,10,0,0).getTime());
eq('span', d.span, 540);
eq('T 秒', d.S, 28800);
eq('时薪', T.money(d.hourly), '62.50');
eq('日薪 (恒等式)', T.money(d.daily), '500.00');
eq('秒薪', d.perSecond.toFixed(6), '0.017361');
function t(day,h,m,opt){ return calc.getState(S, new Date(2026,10,day,h,m,0,0).getTime(), opt||{}); }
eq('09:00 已赚', t(9,9,0).earnedText, '0.00');
eq('09:00 倒计时', t(9,9,0).countdownText, '09:00:00');
eq('10:00 已赚', t(9,10,0).earnedText, '62.50');
eq('10:00 倒计时', t(9,10,0).countdownText, '08:00:00');
eq('12:00 已赚', t(9,12,0).earnedText, '187.50');
eq('12:30 状态', t(9,12,30).stateKey, 'RESTING');
eq('12:30 已赚(冻结)', t(9,12,30).earnedText, '187.50');
eq('12:30 倒计时(继续走)', t(9,12,30).countdownText, '05:30:00');
eq('14:00 已赚', t(9,14,0).earnedText, '250.00');
eq('18:00 已赚', t(9,18,0).earnedText, '500.00');
eq('18:00 状态', t(9,18,0).stateKey, 'OFF_WORK');
eq('18:00 倒计时', t(9,18,0).countdownText, '00:00:00');
eq('19:30 加班状态', t(9,19,30,{overtimeMode:true}).stateKey, 'OVERTIME');
eq('19:30 加班已赚(封顶)', t(9,19,30,{overtimeMode:true}).earnedText, '500.00');
eq('19:30 加班时长', t(9,19,30,{overtimeMode:true}).overtimeText, '01:30:00');
eq('恒等式: 已赚+还能赚=日薪', T.round2(Number(t(9,14,0).earnedText)+Number(t(9,14,0).remainEarnText)), 500);
eq('14:00 进度%', t(9,14,0).progressPct, 50);
eq('周六休息日', t(14,10,0).stateKey, 'DAY_OFF');
eq('周六已赚', t(14,10,0).earnedText, '0.00');

console.log('== 跨天夜班 22:00-06:00 休息 00:00-00:30 ==');
const N = { salaryCent:1000000, salaryMonth:'2026-10', shiftStartMin:1320, shiftEndMin:360,
            rests:[{startOffsetMin:120,endOffsetMin:150}], autoRestLink:false };
const nd = calc.derive(N, new Date(2026,10,9,22,0,0).getTime());
eq('span', nd.span, 480);
eq('T 秒', nd.S, 27000);
eq('时薪', T.money(nd.hourly), '66.67');
eq('日薪 (恒等式)', T.money(nd.daily), '500.00');
function nt(day,h,m){ return calc.getState(N, new Date(2026,10,day,h,m,0,0).getTime(), {}); }
eq('次日00:00 已赚', nt(10,0,0).earnedText, '133.33');
eq('次日00:15 已赚(休息冻结)', nt(10,0,15).earnedText, '133.33');
eq('次日00:15 状态', nt(10,0,15).stateKey, 'RESTING');
eq('次日00:15 跨天标记', nt(10,0,15).nightShift, true);
eq('次日06:00 已赚', nt(10,6,0).earnedText, '500.00');

console.log('== 休息段合并 ==');
const merged = calc.normalizeRests([{startOffsetMin:180,endOffsetMin:240},{startOffsetMin:210,endOffsetMin:270},{startOffsetMin:300,endOffsetMin:330}], 540);
eq('合并后段数', merged.length, 2);
eq('首段结束', merged[0].endOffsetMin, 270);

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
