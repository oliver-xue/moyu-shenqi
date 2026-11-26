const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..', 'miniprogram') + path.sep;
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); } }
function walk(dir, out) { fs.readdirSync(dir).forEach(f => { const p = path.join(dir, f); if (fs.statSync(p).isDirectory()) { if (f !== '.workbuddy') walk(p, out); } else out.push(p); }); return out; }
const files = walk(ROOT, []);

console.log('== 静态检查 ==');
const jsonFiles = files.filter(f => f.endsWith('.json'));
jsonFiles.forEach(f => { try { JSON.parse(fs.readFileSync(f, 'utf8')); ok('JSON ' + path.basename(f), true); } catch (e) { ok('JSON ' + f, false, e.message); } });
const app = JSON.parse(fs.readFileSync(ROOT + 'app.json', 'utf8'));
ok('lazyCodeLoading 存在', app.lazyCodeLoading === 'requiredComponents');
ok('pages 非空', app.pages && app.pages.length >= 3);
app.pages.forEach(p => {
  ok('页面文件 ' + p + '.wxml', fs.existsSync(ROOT + p + '.wxml'));
  ok('页面文件 ' + p + '.js', fs.existsSync(ROOT + p + '.js'));
  ok('页面文件 ' + p + '.json', fs.existsSync(ROOT + p + '.json'));
});
(app.tabBar ? app.tabBar.list : []).forEach(t => ok('tabBar 路径已注册 ' + t.pagePath, app.pages.indexOf(t.pagePath) >= 0));
const pcfg = JSON.parse(fs.readFileSync(ROOT + 'project.config.json', 'utf8'));
ok('miniprogramRoot 指向源码根', fs.existsSync(path.join(ROOT, pcfg.miniprogramRoot, 'app.json')));

const ALLOWED = ['view','text','button','input','picker-view','picker-view-column','progress','switch','block','image','icon','scroll-view','form','label','textarea','canvas'];
const BANNED = [/\?\./, /\?\?/, /=>/, /document\./, /window\./, /localStorage/, /fetch\(/, /wx\.request/];
files.filter(f => f.endsWith('.wxml')).forEach(f => {
  const s = fs.readFileSync(f, 'utf8');
  const tags = [...s.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)/g)].map(m => m[1]);
  tags.forEach(t => ok('组件 ' + t + ' in ' + path.basename(f), ALLOWED.indexOf(t) >= 0, '不允许的 HTML 标签'));
  BANNED.forEach(r => ok('禁用语法 ' + r + ' in ' + path.basename(f), !r.test(s), 'WXML 含不允许的表达式'));
  ok('引用本地文件 ' + path.basename(f), !/<image[^>]+src="https?:/.test(s));
});
files.filter(f => f.endsWith('.js')).forEach(f => {
  try { cp.execFileSync('node', ['--check', f], { stdio: 'pipe' }); ok('JS 语法 ' + path.basename(f), true); }
  catch (e) { ok('JS 语法 ' + f, false, String(e.stderr || e).slice(0, 200)); }
  const s = fs.readFileSync(f, 'utf8');
  [...s.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)].forEach(m => {
    ok('require 路径 ' + m[1], fs.existsSync(path.resolve(path.dirname(f), m[1])));
  });
  BANNED.slice(3).forEach(r => ok('无浏览器 API in ' + path.basename(f), !r.test(s), r.toString()));
});

const OB_WXML = fs.readFileSync(ROOT + 'pages/onboarding/onboarding.wxml', 'utf8');
const OB_WXSS = fs.readFileSync(ROOT + 'pages/onboarding/onboarding.wxss', 'utf8');
ok('第1步按钮文案：开始摸鱼', OB_WXML.indexOf('开始摸鱼') >= 0);
ok('第1步按钮文案：等会再摸', OB_WXML.indexOf('等会再摸') >= 0);
ok('旧按钮文案已清除', OB_WXML.indexOf('稍后设置') < 0 && OB_WXML.indexOf("'开始设置'") < 0);
ok('4 个底部按钮都有点击态', (OB_WXML.match(/hover-class="btn-press"/g) || []).length === 4);
ok('回弹样式存在（全局）', fs.readFileSync(ROOT + 'app.wxss', 'utf8').indexOf('.tap-bounce.btn-press') >= 0);
ok('第2步月薪说明只保留首句', OB_WXML.indexOf('<text class="hint">请填「到手」金额（扣完社保个税后实际到账的）。</text>') >= 0);
ok('关于隐私模块保留', OB_WXML.indexOf('关于隐私') >= 0 && OB_WXML.indexOf('privacy-text') >= 0);
ok('引导为 6 步', OB_WXML.indexOf('第 {{step + 1}} / 6 步') >= 0 && (OB_WXML.match(/wx:if="\{\{step === [0-5]\}\}" class="step-body/g) || []).length === 6);
ok('休息制度选择块存在', OB_WXML.indexOf('data-value="double"') >= 0 && OB_WXML.indexOf('data-value="single"') >= 0 && OB_WXML.indexOf('onSelectWorkweek') >= 0);
ok('footer 完成按钮在第6步', OB_WXML.indexOf('wx:if="{{step === 5}}" class="footer-btn primary-button') >= 0);
const SALARY_CSS = OB_WXSS.match(/\.salary-input\s*\{([\s\S]*?)\}/);
ok('月薪输入框有显式高度避免裁切', !!SALARY_CSS && /height:\s*\d+rpx/.test(SALARY_CSS[1]));
ok('月薪字号已放大', !!SALARY_CSS && /font-size:\s*(7\d|8\d)rpx/.test(SALARY_CSS[1]));
const IDX_WXML = fs.readFileSync(ROOT + 'pages/index/index.wxml', 'utf8');
const APP_WXSS = fs.readFileSync(ROOT + 'app.wxss', 'utf8');
const ALL_WXSS = files.filter(f => f.endsWith('.wxss')).map(f => fs.readFileSync(f, 'utf8')).join('\n');
ok('首页主卡文案：当日已赚金额', IDX_WXML.indexOf('当日已赚金额') >= 0 && IDX_WXML.indexOf('每日已赚金额') < 0);
ok('全局圆润字体链生效', APP_WXSS.indexOf('Yuanti SC') >= 0 && APP_WXSS.indexOf('letter-spacing') >= 0);
ok('按钮胶囊圆角', APP_WXSS.indexOf('border-radius: 999rpx') >= 0);
ok('标题字重恢复清晰', ALL_WXSS.indexOf('font-weight: 600') >= 0);
const APP_JSON = fs.readFileSync(ROOT + 'app.json', 'utf8');
ok('页面底色加深提升层次', APP_WXSS.indexOf('#eef3f0') >= 0);
ok('主文字色加深', APP_WXSS.indexOf('#14241f') >= 0);
ok('主色青绿保留', APP_WXSS.indexOf('#0e7c72') >= 0);
ok('窗口背景与页面一致且下拉文字清晰', APP_JSON.indexOf('#eef3f0') >= 0 && APP_JSON.indexOf('"dark"') >= 0);
const ST_WXSS = fs.readFileSync(ROOT + 'pages/settings/settings.wxss', 'utf8');
const IDX_WXSS = fs.readFileSync(ROOT + 'pages/index/index.wxss', 'utf8');
const EDIT_BTN = ST_WXSS.match(/\.edit-button\s*\{([\s\S]*?)\}/);
const STATUS_CARD = IDX_WXSS.match(/\.status-card\s*\{([\s\S]*?)\}/);
ok('设置按钮文字不换行', !!EDIT_BTN && /white-space:\s*nowrap/.test(EDIT_BTN[1]));
ok('状态文案模块整体居中', !!STATUS_CARD && /align-items:\s*center/.test(STATUS_CARD[1]) && /text-align:\s*center/.test(STATUS_CARD[1]));
const CALC_SRC = fs.readFileSync(ROOT + 'utils/calc.js', 'utf8');
ok('计算依据显示 D/T 符号', CALC_SRC.indexOf('当月工作日天数 D') >= 0 && CALC_SRC.indexOf('时薪 = 月薪 / D / T') >= 0);
ok('内置变量 d.N / d.S 未改动', CALC_SRC.indexOf('d.N') >= 0 && CALC_SRC.indexOf('d.S') >= 0);

console.log('== 运行时冒烟测试（模拟 wx / Page）==');
const NOW_D = new Date();
const HOL = require(ROOT + 'utils/holidays.js');
const TM = require(ROOT + 'utils/time.js');
const EXPECT_N = HOL.countWorkdays(NOW_D.getFullYear(), NOW_D.getMonth() + 1);
const EXPECT_MONTH = NOW_D.getFullYear() + '-' + String(NOW_D.getMonth() + 1).padStart(2, '0');
const EXPECT_HOURLY = TM.money(10000 / EXPECT_N / 7);
let store = {};
global.wx = {
  getStorageSync: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); },
  removeStorageSync: k => { delete store[k]; },
  showToast: () => {}, navigateTo: () => {}, reLaunch: () => {}, switchTab: () => {},
  navigateBack: () => {}, showModal: o => { if (o.success) o.success({ confirm: true }); }
};
global.App = () => {};
global.Page = function (def) {
  const page = Object.assign({}, def);
  page.data = JSON.parse(JSON.stringify(def.data || {}));
  page.setData = function (patch) {
    Object.keys(patch).forEach(k => {
      if (k.indexOf('.') >= 0) { const p = k.split('.'); page.data[p[0]][p[1]] = patch[k]; }
      else page.data[k] = patch[k];
    });
  };
  Object.keys(def).forEach(k => { if (typeof def[k] === 'function') page[k] = def[k].bind(page); });
  global.__page = page;
};
function loadPage(rel) {
  const abs = ROOT + rel;
  delete require.cache[require.resolve(abs)];
  global.__page = null;
  require(abs);
  return global.__page;
}

let idx = loadPage('pages/index/index.js');
idx.onLoad(); idx.onShow();
ok('未初始化进入空态', idx.data.ready === false);
idx.onHide();

// 走完整引导流程
let ob = loadPage('pages/onboarding/onboarding.js');
ob.onLoad({});
ok('引导起始 step=0', ob.data.step === 0);
ob.onNext();
ok('休息制度默认双休', ob.data.workweek === 'double');
ob.onSelectWorkweek({ currentTarget: { dataset: { value: 'single' } } });
ok('休息制度可切单休', ob.data.workweek === 'single');
ob.onSelectWorkweek({ currentTarget: { dataset: { value: 'double' } } });
ok('休息制度可切回双休', ob.data.workweek === 'double');
ob.onNext();
ob.setData({ salaryInput: 'abc' });
ob.onNext();
ok('非法月薪被拦截', ob.data.step === 2 && !!ob.data.errors.salary);
ob.setData({ salaryInput: '10000.00' });
ob.onNext();
ok('薪资通过 -> step3', ob.data.step === 3);
ob.onNext();
ok('班次通过 -> step4', ob.data.step === 4);
ob.onAddRest();
ob.setData({ tempRestStart: 720, tempRestEnd: 780 });
ob.onSaveRest();
ok('休息段 12:00-13:00 已添加', ob.data.rests.length === 1 && ob.data.rests[0].startOffsetMin === 180);
ob.onAddRest();
ob.setData({ tempRestStart: 750, tempRestEnd: 840 });
ob.onSaveRest();
ok('重叠段自动合并', ob.data.rests.length === 1 && ob.data.rests[0].endOffsetMin === 300, JSON.stringify(ob.data.rests));
ob.onNext();
ok('确认页生成预览', ob.data.step === 5 && !!ob.data.preview);
ok('确认页显示双休', ob.data.confirmWorkweekText === '双休（周一至周五上班）', ob.data.confirmWorkweekText);
ok('确认页时薪按本月工作日算', ob.data.preview.hourly === EXPECT_HOURLY, ob.data.preview.hourly + ' / expect ' + EXPECT_HOURLY);
ok('确认页计算基准月 = 本月', ob.data.preview.workdayMonth === EXPECT_MONTH, ob.data.preview.workdayMonth);
ok('确认页薪资基准月 ≠ 本月', ob.data.preview.salaryMonth !== EXPECT_MONTH, ob.data.preview.salaryMonth);
ob.onFinish();
ok('设置已写入本地存储', !!store['moyu.settings.v1']);
ok('薪资以分存储', store['moyu.settings.v1'].salaryCent === 1000000);

// 回到首页
idx = loadPage('pages/index/index.js');
idx.onLoad(); idx.onShow();
ok('已初始化首页 ready', idx.data.ready === true);
ok('倒计时有值', /^\d\d:\d\d:\d\d$/.test(idx.data.countdownText), idx.data.countdownText);
ok('金额有值', /^[\d,]+\.\d\d$/.test(idx.data.earnedText), idx.data.earnedText);
ok('计算依据行数', idx.data.basisRows.length === 9);
ok('计算依据含休息制度行', idx.data.basisRows.some(function (r) { return r.label === '休息制度'; }));
idx.tick(true);
ok('tick 可重复执行', true);

// 正计时全流程
idx.onStart();
ok('正计时 running', idx.data.swState === 'running');
idx.onPause();
ok('正计时 paused', idx.data.swState === 'paused');
idx.onFinish();
ok('结束后生成记录', store['moyu.records.v1'] && store['moyu.records.v1'].length === 1);
ok('结束后回到 idle', idx.data.swState === 'idle');
idx.onReset();
ok('重置不抛错', true);
idx.onShowBasis(); idx.onHideBasis();
ok('计算依据弹层可开关', idx.data.showBasis === false);
idx.onHide();

// 设置页
let st = loadPage('pages/settings/settings.js');
st.onShow();
ok('设置页 ready', st.data.ready === true);
ok('设置页展示计算依据', st.data.rows.length === 9);
ok('设置页显示休息制度', st.data.workweekText === '双休（周一至周五上班）', st.data.workweekText);
ok('设置页显示班次', /09:00/.test(st.data.shiftText), st.data.shiftText);
st.onToggleAutoRestLink({ detail: { value: true } });
ok('联动开关持久化', store['moyu.settings.v1'].autoRestLink === true);
st.onToggleOvertime({ detail: { value: true } });
ok('加班开关持久化', store['moyu.runtime.v1'].overtimeMode === true);
st.onAbout();

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
