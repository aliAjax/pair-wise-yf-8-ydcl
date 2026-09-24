// 轻量 DOM 桩，用于在 Node 中验证 app.js 的放映计时逻辑
const fs = require("fs");
const path = require("path");

let nowMs = 1000000;
const store = {};
const intervals = new Map();
let intervalId = 1;
const listeners = new Map();

class FakeElement {
  constructor(id) {
    this.id = id;
    this._text = "";
    this.innerHTML = "";
    this.value = "";
    this.files = [];
    this.disabled = false;
    this.style = {};
    this.className = "";
    this.classList = {
      _set: new Set(),
      add: (...c) => c.forEach((x) => this.classList._set.add(x)),
      remove: (...c) => c.forEach((x) => this.classList._set.delete(x)),
      toggle: (c, force) => {
        const on = force === undefined ? !this.classList._set.has(c) : force;
        on ? this.classList._set.add(c) : this.classList._set.delete(c);
      },
      contains: (c) => this.classList._set.has(c)
    };
    this.listeners = {};
  }
  get textContent() {
    return this._text;
  }
  set textContent(v) {
    this._text = String(v);
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  dispatch(type, event = {}) {
    for (const fn of this.listeners[type] || []) fn.call(this, event);
  }
  querySelector(sel) {
    return makeButton(sel);
  }
  closest() {
    return null;
  }
  reset() {}
}

function makeEl(id) {
  return new FakeElement(id);
}
function makeButton(sel) {
  const el = new FakeElement(sel);
  return el;
}

const ids = [
  "reelTitle", "colorFilter", "searchInput", "segmentForm", "codeInput", "durationInput",
  "shiftInput", "damageInput", "thumbInput", "noteInput", "segmentList", "warningList",
  "totalDuration", "damageCount", "segmentCount", "exportBtn", "screeningPanel",
  "screeningStatus", "nowCode", "nowNote", "nowRemaining", "nowPlanned", "nowProgressBar",
  "startBtn", "pauseBtn", "resumeBtn", "skipBtn", "resetBtn", "planTotal", "actualTotal",
  "progressText", "skipCount", "screeningSummary"
];
const byId = {};
for (const id of ids) byId[id] = makeEl(id);
byId.colorFilter.value = "all";
byId.durationInput.value = 12;

const vm = require("vm");
const code = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

const RealDate = Date;
function buildSandbox() {
  class FakeDate extends RealDate {
    static now() {
      return nowMs;
    }
  }
  return {
    document: {
      querySelector(sel) {
        const id = sel.replace("#", "");
        return byId[id] || new FakeElement(sel);
      },
      addEventListener(type, fn) {
        listeners.set(type, fn);
      },
      get visibilityState() {
        return "visible";
      }
    },
    window: {
      addEventListener(type, fn) {
        listeners.set(type, fn);
      }
    },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      }
    },
    crypto: { randomUUID: () => `id-${Math.random().toString(36).slice(2, 10)}` },
    structuredClone: (v) => JSON.parse(JSON.stringify(v)),
    setInterval: (fn) => {
      const id = intervalId++;
      intervals.set(id, fn);
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
    Date: FakeDate,
    console,
    Math,
    JSON,
    String,
    Number,
    Boolean,
    Object,
    Array,
    Set,
    Map,
    isNaN
  };
}

function runApp() {
  const sandbox = buildSandbox();
  vm.createContext(sandbox);
  vm.runInContext(code + "\n__getState = () => state;", sandbox, { filename: "app.js" });
  return sandbox;
}

function tickIntervals() {
  for (const fn of [...intervals.values()]) fn();
}
function advance(ms) {
  nowMs += ms;
}
function clockStep(ms) {
  advance(ms);
  tickIntervals();
}

let sandbox = runApp();
const getState = () => sandbox.__getState();
const click = (id, ev) => byId[id].dispatch("click", ev);
let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}\n      expected ${e}\n      actual   ${a}`);
  }
}
const nowDisplay = () => byId.nowRemaining.textContent;

// ---------- 场景1：开始/暂停/继续 ----------
console.log("场景1 开始 → 高亮当前段 → 倒计时 → 暂停 → 继续");
click("startBtn");
check("初始倒计时=段时长 18s", nowDisplay(), "0:18");
clockStep(3000);
check("3秒后剩 15s", nowDisplay(), "0:15");
click("pauseBtn");
check("暂停时显示 已暂停", byId.screeningStatus.textContent, "已暂停");
advance(10000); // 墙上时间走 10 秒，暂停中不应计入
tickIntervals();
check("暂停10秒后仍停在 15s", nowDisplay(), "0:15");
click("resumeBtn");
check("继续后仍从 15s", nowDisplay(), "0:15");
clockStep(2000);
check("再放2秒剩 13s", nowDisplay(), "0:13");

// ---------- 场景2：跳过当前段，留下已映秒数，进入下一段 ----------
console.log("场景2 跳过本段，留下已映秒数并进入下一段");
click("skipBtn");
const s = getState();
check("段1记录已映 5 秒", Math.round(s.screening.results[s.segments[0].id].playedMs / 1000), 5);
check("段1被标记跳过", s.screening.results[s.segments[0].id].skipped, true);
check("当前进入段2 A-006", byId.nowCode.textContent, "A-006");
check("段2倒计时=9s", nowDisplay(), "0:09");
check("跳过计数=1", byId.skipCount.textContent, "1");

// ---------- 场景3：暂停中跳过 ----------
console.log("场景3 暂停后跳过，下一段保持暂停、从完整时长开始");
clockStep(4000);
click("pauseBtn");
check("段2放4秒后暂停剩5s", nowDisplay(), "0:05");
click("skipBtn");
check("段2已映4秒", Math.round(getState().screening.results[s.segments[1].id].playedMs / 1000), 4);
check("进入段3且仍暂停", byId.screeningStatus.textContent, "已暂停");
check("段3倒计时=14s", nowDisplay(), "0:14");
click("resumeBtn");
clockStep(5000);
check("段3放5秒剩9s", nowDisplay(), "0:09");

// ---------- 场景4：刷新后进度不丢 ----------
console.log("场景4 重开页面：进度与留下的秒数恢复，且按墙上时间补走");
click("pauseBtn"); // 段3已映 5s，剩 9s
const before = JSON.parse(store["zfl17-film-strip-desk"]);
check("持久化状态为 paused", before.screening.status, "paused");
click("resetBtn");
check("重置后回到未开始", byId.screeningStatus.textContent, "未开始");
// 模拟重新打开：恢复暂停快照（先再存一份）
store["zfl17-film-strip-desk"] = JSON.stringify(before);
// 重新执行脚本 = 刷新页面（重置定时器表，时间继续走）
intervals.clear();
sandbox = runApp();
check("刷新后恢复 paused", byId.screeningStatus.textContent, "已暂停");
check("刷新后段3仍剩9s（暂停不吃墙钟）", byId.nowRemaining.textContent, "0:09");
check("段1跳过记录保留：已映5s", byId.segmentList.innerHTML.includes("已跳过 · 已映 0:05"), true);
check("跳过顺序与备注仍在", byId.segmentList.innerHTML.includes("开场街景，节奏平稳"), true);

// ---------- 场景5：放映中关闭页面，按墙上时间自动走完 ----------
console.log("场景5 放映中重开，经过时间自动补走并进入下一段");
click("resumeBtn");
clockStep(2000); // 段3剩 7s
listeners.get("pagehide")(); // 关页面，落盘
advance(8000); // 关闭后过了 8 秒，段3应已自然走完
intervals.clear();
sandbox = runApp();
check("关闭期间走完，状态为已走完", byId.screeningStatus.textContent, "已走完");
const done = getState();
check("段3完整计入 14s", Math.round(done.screening.results[done.segments[2].id].playedMs / 1000), 14);
check("计划时长 41s", byId.planTotal.textContent, "0:41");
const expectedActual = 5 + 4 + 14;
check(`实际放映 ${expectedActual}s`, byId.actualTotal.textContent, "0:23");
check("汇总含跳过清单", byId.screeningSummary.innerHTML.includes("A-001") && byId.screeningSummary.innerHTML.includes("A-006"), true);

// ---------- 场景6：全新清卷，全程跳过每一段 ----------
console.log("场景6 新卷：全部临时跳过后汇总");
click("resetBtn");
click("startBtn");
click("skipBtn"); // 段1 已映0
click("skipBtn"); // 段2 已映0
check("跳两段后停在段3", byId.nowCode.textContent, "A-012");
click("skipBtn"); // 段3 已映0 → 全部走完
check("状态已走完", byId.screeningStatus.textContent, "已走完");
check("实际放映 0:00", byId.actualTotal.textContent, "0:00");
check("计划仍为 0:41", byId.planTotal.textContent, "0:41");
check("跳过3段", byId.skipCount.textContent, "3");
check("清单中三段均保留", ["A-001", "A-006", "A-012"].every((c) => byId.segmentList.innerHTML.includes(c)), true);

// ---------- 场景7：关闭期间跨多段，时间按段边界结转 ----------
console.log("场景7 放映中关闭，经过时间跨段结转到后一段");
click("resetBtn");
click("startBtn");
clockStep(3000); // 段1 已映3s，剩15s
listeners.get("pagehide")();
advance(15000 + 9000 + 6000); // 走完段1(15)、段2(9)，再进段3 6s
intervals.clear();
sandbox = runApp();
const st7 = getState();
check("重开后仍为放映中", byId.screeningStatus.textContent, "放映中");
check("当前已到段3 A-012", byId.nowCode.textContent, "A-012");
check("段3剩 8s（结转6s）", byId.nowRemaining.textContent, "0:08");
check("段1计满 18s", Math.round(st7.screening.results[st7.segments[0].id].playedMs / 1000), 18);
check("段2计满 9s", Math.round(st7.screening.results[st7.segments[1].id].playedMs / 1000), 9);
check("段3结转 6s", Math.round(st7.screening.results[st7.segments[2].id].playedMs / 1000), 6);
check("实际放映累计 33s", byId.actualTotal.textContent, "0:33");

console.log(failures ? `\n${failures} 项失败` : "\n全部通过");
process.exit(failures ? 1 : 0);
