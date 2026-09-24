const storageKey = "zfl17-film-strip-desk";

const fallbackThumbs = ["#d49b35", "#347d89", "#b54d48", "#4d7656", "#6d6378"];

function defaultScreening() {
  return {
    status: "idle", // idle | running | paused | finished
    currentId: null,
    runningSince: null,
    results: {} // id -> { playedMs, skipped }
  };
}

const defaultState = {
  reelTitle: "春日试映A卷",
  screening: defaultScreening(),
  segments: [
    {
      id: crypto.randomUUID(),
      code: "A-001",
      duration: 18,
      shift: "正常",
      damage: "完好",
      note: "开场街景，节奏平稳，适合保留原顺序。",
      thumb: ""
    },
    {
      id: crypto.randomUUID(),
      code: "A-006",
      duration: 9,
      shift: "偏红",
      damage: "轻微划痕",
      note: "人物近景左侧有划痕，试映时留意是否明显。",
      thumb: ""
    },
    {
      id: crypto.randomUUID(),
      code: "A-012",
      duration: 14,
      shift: "褪色",
      damage: "接片松动",
      note: "接片位置靠近段尾，放映前建议重新压平。",
      thumb: ""
    }
  ]
};

let state = loadState();
let draggedId = null;
let tickHandle = null;
let lastListSignature = "";
let lastSaveTick = 0;

const els = {
  reelTitle: document.querySelector("#reelTitle"),
  colorFilter: document.querySelector("#colorFilter"),
  searchInput: document.querySelector("#searchInput"),
  segmentForm: document.querySelector("#segmentForm"),
  codeInput: document.querySelector("#codeInput"),
  durationInput: document.querySelector("#durationInput"),
  shiftInput: document.querySelector("#shiftInput"),
  damageInput: document.querySelector("#damageInput"),
  thumbInput: document.querySelector("#thumbInput"),
  noteInput: document.querySelector("#noteInput"),
  segmentList: document.querySelector("#segmentList"),
  warningList: document.querySelector("#warningList"),
  totalDuration: document.querySelector("#totalDuration"),
  damageCount: document.querySelector("#damageCount"),
  segmentCount: document.querySelector("#segmentCount"),
  exportBtn: document.querySelector("#exportBtn"),
  screeningStatus: document.querySelector("#screeningStatus"),
  nowCode: document.querySelector("#nowCode"),
  nowNote: document.querySelector("#nowNote"),
  nowRemaining: document.querySelector("#nowRemaining"),
  nowPlanned: document.querySelector("#nowPlanned"),
  nowProgressBar: document.querySelector("#nowProgressBar"),
  startBtn: document.querySelector("#startBtn"),
  pauseBtn: document.querySelector("#pauseBtn"),
  resumeBtn: document.querySelector("#resumeBtn"),
  skipBtn: document.querySelector("#skipBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  planTotal: document.querySelector("#planTotal"),
  actualTotal: document.querySelector("#actualTotal"),
  progressText: document.querySelector("#progressText"),
  skipCount: document.querySelector("#skipCount"),
  screeningSummary: document.querySelector("#screeningSummary")
};

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    const merged = { ...structuredClone(defaultState), ...JSON.parse(saved) };
    const screening = defaultScreening();
    if (merged.screening && typeof merged.screening === "object") {
      screening.status = ["idle", "running", "paused", "finished"].includes(merged.screening.status)
        ? merged.screening.status
        : "idle";
      screening.currentId = merged.screening.currentId ?? null;
      screening.runningSince = Number(merged.screening.runningSince) || null;
      screening.results =
        merged.screening.results && typeof merged.screening.results === "object"
          ? merged.screening.results
          : {};
    }
    merged.screening = screening;
    return merged;
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function getFilteredSegments() {
  const color = els.colorFilter.value;
  const keyword = els.searchInput.value.trim();
  return state.segments.filter((item) => {
    const matchesColor = color === "all" || item.shift === color;
    const matchesKeyword = !keyword || `${item.code}${item.note}${item.damage}`.includes(keyword);
    return matchesColor && matchesKeyword;
  });
}

function renderStats() {
  const total = state.segments.reduce((sum, item) => sum + Number(item.duration), 0);
  const damaged = state.segments.filter((item) => item.damage !== "完好").length;
  els.totalDuration.textContent = formatDuration(total);
  els.damageCount.textContent = damaged;
  els.segmentCount.textContent = state.segments.length;
}

function renderList(now = Date.now()) {
  const screening = state.screening;
  const segments = getFilteredSegments();
  els.segmentList.innerHTML =
    segments
      .map((item, index) => {
        const realIndex = state.segments.findIndex((segment) => segment.id === item.id);
        const hasDamage = item.damage !== "完好";
        const result = screening.results[item.id];
        const isCurrent = screening.currentId === item.id && screening.status !== "finished";
        const cardClass = [
          "segment-card",
          isCurrent ? "is-current" : "",
          result && !result.skipped && result.playedMs >= segmentDurationMs(item) ? "is-done" : "",
          result && result.skipped ? "is-skipped" : ""
        ]
          .filter(Boolean)
          .join(" ");
        const screenChip = isCurrent
          ? `<span class="screen-chip now">${screening.status === "paused" ? "已暂停" : "正在放映"}</span>`
          : result?.skipped
            ? `<span class="screen-chip skipped">已跳过 · 已映 ${formatDurationCeil(result.playedMs / 1000)}</span>`
            : result
              ? `<span class="screen-chip done">已映 ${formatDurationCeil(Math.min(result.playedMs, segmentDurationMs(item)) / 1000)}</span>`
              : "";
        return `
          <article class="${cardClass}" draggable="true" data-id="${item.id}">
            <div class="thumb">
              ${
                item.thumb
                  ? `<img src="${item.thumb}" alt="${escapeHtml(item.code)}缩略图" />`
                  : `<div class="film-placeholder" style="background:${fallbackThumbs[realIndex % fallbackThumbs.length]}">${escapeHtml(item.code)}</div>`
              }
            </div>
            <div class="segment-main">
              <div class="segment-title">
                <strong>${realIndex + 1}. ${escapeHtml(item.code)}</strong>
                <span>${formatDuration(item.duration)}</span>
                ${screenChip}
              </div>
              <div class="tag-row">
                <span class="tag">${escapeHtml(item.shift)}</span>
                <span class="tag ${hasDamage ? "damage" : "ok"}">${escapeHtml(item.damage)}</span>
              </div>
              <p class="segment-note">${escapeHtml(item.note || "没有备注。")}</p>
            </div>
            <div class="segment-actions">
              <button type="button" title="上移" data-move-up="${item.id}">↑</button>
              <button type="button" title="下移" data-move-down="${item.id}">↓</button>
              <button type="button" title="删除" data-delete="${item.id}">×</button>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty">没有符合筛选的片段。</p>`;
}

function renderWarnings() {
  const warnings = state.segments.filter((item) => item.damage !== "完好" || item.shift !== "正常");
  els.warningList.innerHTML =
    warnings
      .map((item) => {
        const index = state.segments.findIndex((segment) => segment.id === item.id) + 1;
        const reasons = [item.shift !== "正常" ? item.shift : "", item.damage !== "完好" ? item.damage : ""].filter(Boolean).join(" · ");
        return `
          <div class="warning-item">
            <strong>${index}. ${escapeHtml(item.code)}</strong>
            <span>${escapeHtml(reasons)}${item.note ? `：${escapeHtml(item.note)}` : ""}</span>
          </div>
        `;
      })
      .join("") || `<p class="empty">当前清单没有颜色偏移或破损提醒。</p>`;
}

function renderAll(now = Date.now()) {
  reconcileScreening(now);
  saveState();
  els.reelTitle.value = state.reelTitle;
  renderStats();
  lastListSignature = "";
  renderList(now);
  renderWarnings();
  renderScreening(now);
  syncTick();
}

function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  const minutes = Math.floor(value / 60);
  const rest = String(value % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

// 倒计时按整秒显示：剩 0.x 秒时仍显示 0:01
function formatRemaining(ms) {
  return formatDuration(Math.max(0, Math.ceil(ms / 1000)));
}

function segmentDurationMs(item) {
  return Math.max(0, Number(item.duration) || 0) * 1000;
}

function ensureResult(id) {
  const results = state.screening.results;
  if (!results[id]) results[id] = { playedMs: 0, skipped: false };
  return results[id];
}

function isHandled(result, durationMs) {
  return Boolean(result) && (result.skipped || result.playedMs >= durationMs);
}

function findNextUnfinished() {
  return state.segments.find((item) => !isHandled(state.screening.results[item.id], segmentDurationMs(item)));
}

function pruneResults() {
  const ids = new Set(state.segments.map((item) => item.id));
  for (const id of Object.keys(state.screening.results)) {
    if (!ids.has(id)) delete state.screening.results[id];
  }
}

function totalPlanMs() {
  return state.segments.reduce((sum, item) => sum + segmentDurationMs(item), 0);
}

function totalPlayedMs(now) {
  const screening = state.screening;
  return state.segments.reduce((sum, item) => {
    let value = screening.results[item.id]?.playedMs ?? 0;
    if (screening.status === "running" && screening.currentId === item.id) {
      value += now - screening.runningSince;
    }
    return sum + Math.max(0, Math.min(value, segmentDurationMs(item)));
  }, 0);
}

function liveRemainingMs(now) {
  const screening = state.screening;
  if (!screening.currentId || screening.status === "finished") return 0;
  const current = state.segments.find((item) => item.id === screening.currentId);
  if (!current) return 0;
  const played = screening.results[current.id]?.playedMs ?? 0;
  const elapsed = screening.status === "running" ? Math.max(0, now - screening.runningSince) : 0;
  return Math.max(0, segmentDurationMs(current) - played - elapsed);
}

function finishScreening() {
  state.screening.status = "finished";
  state.screening.currentId = null;
  state.screening.runningSince = null;
}

// 按墙上时钟结算：关掉页面期间也会自动走完/跳过时间，重开后进度不丢
function reconcileScreening(now) {
  const screening = state.screening;
  pruneResults();
  if (screening.status !== "running") {
    if (screening.status === "paused") {
      const currentExists =
        screening.currentId && state.segments.some((item) => item.id === screening.currentId);
      if (!currentExists) {
        const next = findNextUnfinished();
        if (next) {
          screening.currentId = next.id;
        } else {
          finishScreening();
        }
      }
    }
    if (screening.status === "finished") {
      const remaining = findNextUnfinished();
      if (remaining) {
        screening.status = "idle";
        screening.currentId = null;
      }
    }
    return;
  }

  if (!screening.currentId || !state.segments.some((item) => item.id === screening.currentId)) {
    const next = findNextUnfinished();
    if (!next) {
      finishScreening();
      return;
    }
    screening.currentId = next.id;
    screening.runningSince = now;
    ensureResult(next.id);
  }

  let cursor = screening.runningSince; // 已结算到的墙上时间点
  while (screening.status === "running") {
    const current = state.segments.find((item) => item.id === screening.currentId);
    if (!current) break;
    const duration = segmentDurationMs(current);
    const result = ensureResult(current.id);
    const available = Math.max(0, now - cursor);
    const room = Math.max(0, duration - (result.playedMs ?? 0));

    if (available < room) {
      result.playedMs += available;
      cursor = now;
      break;
    }

    // 本段在 cursor + room 处走完，剩余时间结转到下一段
    result.playedMs = duration;
    cursor += room;
    const next = findNextUnfinished();
    if (!next) {
      finishScreening();
      break;
    }
    screening.currentId = next.id;
    ensureResult(next.id);
  }
  if (screening.status === "running") screening.runningSince = cursor;
}

function markSkipped(id, playedMs) {
  const result = ensureResult(id);
  result.playedMs = Math.max(0, playedMs);
  result.skipped = true;
}

function skipCurrent(now) {
  const screening = state.screening;
  const current = state.segments.find((item) => item.id === screening.currentId);
  if (!current || screening.status === "finished") return;
  const result = ensureResult(current.id);
  let played = result.playedMs ?? 0;
  if (screening.status === "running") {
    played += Math.max(0, now - screening.runningSince);
  }
  markSkipped(current.id, Math.min(played, segmentDurationMs(current)));

  const next = findNextUnfinished();
  if (!next) {
    finishScreening();
  } else if (screening.status === "running") {
    screening.currentId = next.id;
    screening.runningSince = now;
    ensureResult(next.id);
  } else {
    screening.currentId = next.id;
    screening.runningSince = null;
  }
}

function startScreening() {
  const screening = state.screening;
  const next = findNextUnfinished();
  if (!next) return;
  screening.status = "running";
  screening.currentId = next.id;
  screening.runningSince = Date.now();
  ensureResult(next.id);
}

function pauseScreening(now) {
  const screening = state.screening;
  if (screening.status !== "running" || !screening.currentId) return;
  const current = state.segments.find((item) => item.id === screening.currentId);
  if (current) {
    const result = ensureResult(current.id);
    result.playedMs = Math.min(
      segmentDurationMs(current),
      (result.playedMs ?? 0) + Math.max(0, now - screening.runningSince)
    );
  }
  screening.status = "paused";
  screening.runningSince = null;
}

function resumeScreening() {
  const screening = state.screening;
  if (screening.status !== "paused" || !screening.currentId) return;
  const current = state.segments.find((item) => item.id === screening.currentId);
  if (!current) return;
  const result = ensureResult(current.id);
  // 暂停期间可能改过本段时长，从停下的秒数继续
  result.playedMs = Math.min(result.playedMs ?? 0, segmentDurationMs(current));
  if (result.playedMs >= segmentDurationMs(current)) {
    const next = findNextUnfinished();
    if (!next) {
      finishScreening();
      return;
    }
    screening.currentId = next.id;
    ensureResult(next.id);
  }
  screening.status = "running";
  screening.runningSince = Date.now();
}

function resetScreening() {
  state.screening = defaultScreening();
}

// 切到后台/关闭页面前把当前进度落盘
function checkpointScreening(now) {
  const screening = state.screening;
  if (screening.status !== "running" || !screening.currentId) return;
  const current = state.segments.find((item) => item.id === screening.currentId);
  if (!current) return;
  const result = ensureResult(current.id);
  result.playedMs = Math.min(
    segmentDurationMs(current),
    (result.playedMs ?? 0) + Math.max(0, now - screening.runningSince)
  );
  screening.runningSince = now;
  saveState();
}

function screeningSignature() {
  const screening = state.screening;
  const current = screening.currentId ? state.segments.find((item) => item.id === screening.currentId) : null;
  const played = current?.id ? screening.results[current.id]?.playedMs ?? 0 : 0;
  return [
    screening.status,
    screening.currentId ?? "",
    current ? segmentDurationMs(current) - played : "",
    state.segments
      .map((item) => {
        const r = screening.results[item.id];
        return r ? `${r.skipped ? 1 : 0}:${Math.round(r.playedMs / 1000)}` : "";
      })
      .join("|")
  ].join("#");
}

function renderScreening(now) {
  const screening = state.screening;
  const statusMap = {
    idle: ["未开始", "status-idle"],
    running: ["放映中", "status-running"],
    paused: ["已暂停", "status-paused"],
    finished: ["已走完", "status-finished"]
  };
  const [statusText, statusClass] = statusMap[screening.status] || statusMap.idle;
  els.screeningStatus.textContent = statusText;
  els.screeningStatus.className = `screening-status ${statusClass}`;

  const current = screening.currentId ? state.segments.find((item) => item.id === screening.currentId) : null;
  const remaining = liveRemainingMs(now);
  const planMs = totalPlanMs();
  const actualMs = totalPlayedMs(now);
  const skippedCount = state.segments.filter((item) => screening.results[item.id]?.skipped).length;
  const handledCount = state.segments.filter(
    (item) => isHandled(screening.results[item.id], segmentDurationMs(item)) || item.id === screening.currentId
  ).length;
  const nextSegment = findNextUnfinished();

  if (current) {
    els.nowCode.textContent = current.code;
    els.nowNote.textContent = current.note || "没有备注。";
    els.nowPlanned.textContent = formatDuration(current.duration);
    const progress = current.duration
      ? ((segmentDurationMs(current) - remaining) / segmentDurationMs(current)) * 100
      : 100;
    els.nowProgressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    els.nowRemaining.textContent = formatRemaining(remaining);
  } else if (screening.status === "finished") {
    els.nowCode.textContent = "全部片段已走完";
    els.nowNote.textContent = "";
    els.nowPlanned.textContent = formatDuration(planMs / 1000);
    els.nowProgressBar.style.width = "100%";
    els.nowRemaining.textContent = "0:00";
  } else if (nextSegment) {
    els.nowCode.textContent = `下一段：${nextSegment.code}`;
    els.nowNote.textContent = nextSegment.note || "没有备注。";
    els.nowPlanned.textContent = formatDuration(nextSegment.duration);
    els.nowProgressBar.style.width = "0";
    els.nowRemaining.textContent = formatRemaining(segmentDurationMs(nextSegment));
  } else {
    els.nowCode.textContent = "准备就绪";
    els.nowNote.textContent = "清单为空，先在左侧录入片段。";
    els.nowPlanned.textContent = formatDuration(planMs / 1000);
    els.nowProgressBar.style.width = "0";
    els.nowRemaining.textContent = "0:00";
  }

  els.planTotal.textContent = formatDuration(Math.round(planMs / 1000));
  els.actualTotal.textContent = formatDuration(Math.round(actualMs / 1000));
  els.progressText.textContent = `${handledCount}/${state.segments.length}`;
  els.skipCount.textContent = skippedCount;

  const hasSegments = state.segments.length > 0;
  els.startBtn.classList.toggle("hidden", screening.status !== "idle");
  els.startBtn.disabled = !hasSegments || findNextUnfinished() === undefined;
  els.pauseBtn.classList.toggle("hidden", screening.status !== "running");
  els.resumeBtn.classList.toggle("hidden", screening.status !== "paused");
  els.skipBtn.classList.toggle("hidden", !(screening.status === "running" || screening.status === "paused"));
  els.resetBtn.classList.toggle(
    "hidden",
    screening.status === "idle" && Object.keys(screening.results).length === 0
  );

  if (screening.status === "finished") {
    const skippedItems = state.segments.filter((item) => screening.results[item.id]?.skipped);
    els.screeningSummary.classList.remove("hidden");
    els.screeningSummary.innerHTML = `
      <strong>汇总</strong>：计划时长 ${formatDuration(Math.round(planMs / 1000))}，
      实际放映 ${formatDuration(Math.round(actualMs / 1000))}，
      跳过 ${skippedItems.length} 段。被跳过的片段仍按原顺序保留在清单与备注中。
      ${
        skippedItems.length
          ? `<ul>${skippedItems
              .map(
                (item) =>
                  `<li>${escapeHtml(item.code)}：已映 ${formatDurationCeil(
                    (screening.results[item.id].playedMs ?? 0) / 1000
                  )}｜${escapeHtml(item.note || "无备注")}</li>`
              )
              .join("")}</ul>`
          : ""
      }
    `;
  } else {
    els.screeningSummary.classList.add("hidden");
    els.screeningSummary.innerHTML = "";
  }
}

function formatDurationCeil(seconds) {
  return formatDuration(Math.ceil(Math.max(0, Number(seconds) || 0)));
}

function screeningTick() {
  if (state.screening.status !== "running") return;
  const now = Date.now();
  reconcileScreening(now);
  renderScreening(now);
  const signature = screeningSignature();
  if (signature !== lastListSignature) {
    lastListSignature = signature;
    renderList(now);
  }
  if (now - lastSaveTick > 5000) {
    lastSaveTick = now;
    saveState();
  }
  syncTick();
}

function syncTick() {
  const shouldRun = state.screening.status === "running";
  if (shouldRun && !tickHandle) {
    lastSaveTick = Date.now();
    tickHandle = setInterval(screeningTick, 300);
  } else if (!shouldRun && tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

async function addSegment(event) {
  event.preventDefault();
  const thumb = await readFileAsDataUrl(els.thumbInput.files[0]);
  state.segments.push({
    id: crypto.randomUUID(),
    code: els.codeInput.value.trim(),
    duration: Number(els.durationInput.value),
    shift: els.shiftInput.value,
    damage: els.damageInput.value,
    note: els.noteInput.value.trim(),
    thumb
  });
  els.segmentForm.reset();
  els.durationInput.value = 12;
  renderAll();
}

function moveSegment(id, direction) {
  const index = state.segments.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.segments.length) return;
  const [item] = state.segments.splice(index, 1);
  state.segments.splice(target, 0, item);
  renderAll();
}

function exportList() {
  const lines = [
    `胶片卷：${state.reelTitle || "未命名胶片卷"}`,
    `总时长：${formatDuration(state.segments.reduce((sum, item) => sum + Number(item.duration), 0))}`,
    "",
    ...state.segments.map((item, index) => `${index + 1}. ${item.code}｜${formatDuration(item.duration)}｜${item.shift}｜${item.damage}｜${item.note || "无备注"}`)
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.reelTitle || "film-reel"}-checklist.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.reelTitle.addEventListener("input", () => {
  state.reelTitle = els.reelTitle.value;
  saveState();
});
els.colorFilter.addEventListener("change", renderList);
els.searchInput.addEventListener("input", renderList);
els.segmentForm.addEventListener("submit", addSegment);
els.exportBtn.addEventListener("click", exportList);

els.startBtn.addEventListener("click", () => {
  startScreening();
  renderAll();
});
els.pauseBtn.addEventListener("click", () => {
  const now = Date.now();
  reconcileScreening(now);
  pauseScreening(now);
  renderAll();
});
els.resumeBtn.addEventListener("click", () => {
  reconcileScreening(Date.now());
  resumeScreening();
  renderAll();
});
els.skipBtn.addEventListener("click", () => {
  const now = Date.now();
  reconcileScreening(now);
  skipCurrent(now);
  renderAll();
});
els.resetBtn.addEventListener("click", () => {
  resetScreening();
  renderAll();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    checkpointScreening(Date.now());
  }
});
window.addEventListener("pagehide", () => {
  checkpointScreening(Date.now());
});

els.segmentList.addEventListener("click", (event) => {
  const up = event.target.closest("[data-move-up]");
  const down = event.target.closest("[data-move-down]");
  const remove = event.target.closest("[data-delete]");
  if (up) moveSegment(up.dataset.moveUp, -1);
  if (down) moveSegment(down.dataset.moveDown, 1);
  if (remove) {
    const id = remove.dataset.delete;
    state.segments = state.segments.filter((item) => item.id !== id);
    delete state.screening.results[id];
    if (state.screening.currentId === id) {
      state.screening.currentId = null;
      state.screening.runningSince = null;
      if (state.screening.status === "running") state.screening.status = "paused";
      if (state.segments.length === 0) state.screening.status = "idle";
    }
    renderAll();
  }
});

els.segmentList.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card) return;
  draggedId = card.dataset.id;
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
});

els.segmentList.addEventListener("dragend", (event) => {
  event.target.closest("[data-id]")?.classList.remove("dragging");
  draggedId = null;
});

els.segmentList.addEventListener("dragover", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card || !draggedId || card.dataset.id === draggedId) return;
  event.preventDefault();
  const fromIndex = state.segments.findIndex((item) => item.id === draggedId);
  const toIndex = state.segments.findIndex((item) => item.id === card.dataset.id);
  if (fromIndex < 0 || toIndex < 0) return;
  const [item] = state.segments.splice(fromIndex, 1);
  state.segments.splice(toIndex, 0, item);
  renderAll();
});

renderAll();
