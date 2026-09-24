const storageKey = "zfl17-film-strip-desk";

const fallbackThumbs = ["#d49b35", "#347d89", "#b54d48", "#4d7656", "#6d6378"];

const defaultState = {
  reelTitle: "春日试映A卷",
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
  ],
  screening: createScreeningState()
};

function createScreeningState() {
  return {
    status: "idle", // idle | running | paused | finished
    currentId: null,
    remaining: 0,
    endsAt: null,
    records: {} // id -> { played: 已放映秒数, skipped: 是否被跳过 }
  };
}

let state = loadState();
let draggedId = null;

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
  screeningStatusText: document.querySelector("#screeningStatusText"),
  nowCode: document.querySelector("#nowCode"),
  nowCountdown: document.querySelector("#nowCountdown"),
  nowCountdownBox: document.querySelector("#nowCountdownBox"),
  nowMeta: document.querySelector("#nowMeta"),
  nowNote: document.querySelector("#nowNote"),
  startToggleBtn: document.querySelector("#startToggleBtn"),
  skipBtn: document.querySelector("#skipBtn"),
  resetScreeningBtn: document.querySelector("#resetScreeningBtn"),
  progressText: document.querySelector("#progressText"),
  elapsedText: document.querySelector("#elapsedText"),
  progressFill: document.querySelector("#progressFill"),
  screeningSummary: document.querySelector("#screeningSummary")
};

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    const merged = { ...structuredClone(defaultState), ...JSON.parse(saved) };
    merged.screening = normalizeScreening(merged.screening, merged.segments);
    return merged;
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeScreening(saved, segments) {
  const base = createScreeningState();
  if (!saved || typeof saved !== "object") return base;
  const records = {};
  if (saved.records && typeof saved.records === "object") {
    for (const segment of segments) {
      const record = saved.records[segment.id];
      if (!record) continue;
      records[segment.id] = {
        played: Math.max(0, Number(record.played) || 0),
        skipped: Boolean(record.skipped)
      };
    }
  }
  const validStatuses = ["idle", "running", "paused", "finished"];
  const currentExists = saved.currentId && segments.some((item) => item.id === saved.currentId);
  return {
    status: validStatuses.includes(saved.status) && (saved.status === "idle" || currentExists)
      ? saved.status
      : "idle",
    currentId: currentExists ? saved.currentId : null,
    remaining: Math.max(0, Number(saved.remaining) || 0),
    endsAt: Number(saved.endsAt) || null,
    records
  };
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

function renderList() {
  const segments = getFilteredSegments();
  els.segmentList.innerHTML =
    segments
      .map((item, index) => {
        const realIndex = state.segments.findIndex((segment) => segment.id === item.id);
        const hasDamage = item.damage !== "完好";
        const screeningView = getCardScreeningView(item.id);
        return `
          <article class="segment-card ${screeningView.cardClass}" draggable="true" data-id="${item.id}">
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
                ${
                  screeningView.badgeText
                    ? `<span class="badge-screening ${screeningView.badgeClass}">${screeningView.badgeText}</span>`
                    : ""
                }
              </div>
              <div class="tag-row">
                <span class="tag">${escapeHtml(item.shift)}</span>
                <span class="tag ${hasDamage ? "damage" : "ok"}">${escapeHtml(item.damage)}</span>
              </div>
              <p class="segment-note">${escapeHtml(item.note || "没有备注。")}</p>
              ${screeningView.line ? `<div class="segment-screening">${screeningView.line}</div>` : ""}
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

function getScreeningIndex() {
  if (!state.screening.currentId) return -1;
  return state.segments.findIndex((item) => item.id === state.screening.currentId);
}

function getRecord(id) {
  return state.screening.records[id] || { played: 0, skipped: false };
}

function getDisplayRemaining(segment) {
  const screening = state.screening;
  if (!segment) return 0;
  if (screening.status === "running") {
    return Math.max(0, Math.ceil((screening.endsAt - Date.now()) / 1000));
  }
  return Math.max(0, Math.ceil(screening.remaining));
}

function getElapsedTotal() {
  const screening = state.screening;
  let total = Object.values(screening.records).reduce((sum, record) => sum + record.played, 0);
  if (screening.status === "running") {
    total += Math.max(0, screening.remaining - (screening.endsAt - Date.now()) / 1000);
  }
  return total;
}

function getCardScreeningView(id) {
  const screening = state.screening;
  const record = screening.records[id];
  const empty = { cardClass: "", badgeClass: "", badgeText: "", line: "" };
  if (screening.status === "idle") return empty;

  if (id === screening.currentId) {
    const segment = state.segments.find((item) => item.id === id);
    const remaining = getDisplayRemaining(segment);
    const already = record ? record.played : 0;
    const playedHere = Math.floor(already + Number(segment.duration) - remaining);
    if (screening.status === "running") {
      return {
        cardClass: "is-playing",
        badgeClass: "",
        badgeText: "放映中",
        line: `正在放映 · 本段已放映 ${playedHere} 秒 · 剩余 ${remaining} 秒`
      };
    }
    if (screening.status === "paused") {
      return {
        cardClass: "is-paused",
        badgeClass: "paused",
        badgeText: "已暂停",
        line: `已暂停 · 本段已放映 ${playedHere} 秒 · 剩余 ${remaining} 秒`
      };
    }
  }

  if (record) {
    if (record.skipped) {
      return {
        cardClass: "is-skipped",
        badgeClass: "skipped",
        badgeText: "已跳过",
        line: `已跳过 · 已放映 ${Math.floor(record.played)} 秒`
      };
    }
    return {
      cardClass: "is-done",
      badgeClass: "done",
      badgeText: "已走完",
      line: `已走完 · 放映 ${Math.floor(record.played)} 秒`
    };
  }
  return empty;
}

function startScreening() {
  if (!state.segments.length) return;
  const screening = state.screening;
  if (screening.status === "idle") {
    const first = state.segments[0];
    screening.currentId = first.id;
    screening.remaining = Number(first.duration);
  }
  screening.status = "running";
  screening.endsAt = Date.now() + Math.max(0, screening.remaining) * 1000;
  saveState();
  renderAll();
}

function pauseScreening() {
  const screening = state.screening;
  if (screening.status !== "running") return;
  screening.remaining = Math.max(0, (screening.endsAt - Date.now()) / 1000);
  screening.status = "paused";
  screening.endsAt = null;
  saveState();
  renderAll();
}

function finalizeSegment(id, skipped) {
  const screening = state.screening;
  const segment = state.segments.find((item) => item.id === id);
  if (!segment) return;
  const duration = Number(segment.duration);
  const played = skipped
    ? Math.min(duration, Math.max(0, duration - screening.remaining))
    : duration;
  screening.records[id] = {
    played: Math.round(played * 10) / 10,
    skipped
  };
}

function advanceSegment(skipped) {
  const screening = state.screening;
  if (!screening.currentId || (screening.status !== "running" && screening.status !== "paused")) return;
  if (screening.status === "running") {
    screening.remaining = Math.max(0, (screening.endsAt - Date.now()) / 1000);
  }
  finalizeSegment(screening.currentId, skipped);

  const currentIndex = state.segments.findIndex((item) => item.id === screening.currentId);
  const next = state.segments[currentIndex + 1];
  if (next) {
    screening.currentId = next.id;
    screening.remaining = Number(next.duration);
    if (screening.status === "running") {
      screening.endsAt = Date.now() + screening.remaining * 1000;
    }
  } else {
    screening.status = "finished";
    screening.currentId = null;
    screening.remaining = 0;
    screening.endsAt = null;
  }
  saveState();
  renderAll();
}

function catchUpScreening() {
  const screening = state.screening;
  if (screening.status !== "running" || !screening.currentId) return;
  let scheduleEnd = screening.endsAt;
  let guard = 0;
  while (screening.status === "running" && guard <= state.segments.length) {
    guard += 1;
    const segment = state.segments.find((item) => item.id === screening.currentId);
    if (!segment) {
      screening.status = "paused";
      screening.endsAt = null;
      break;
    }
    if (Date.now() < scheduleEnd) {
      screening.endsAt = scheduleEnd;
      screening.remaining = Math.max(0, (scheduleEnd - Date.now()) / 1000);
      break;
    }
    screening.remaining = 0;
    finalizeSegment(segment.id, false);
    const nextIndex = state.segments.findIndex((item) => item.id === screening.currentId) + 1;
    const next = state.segments[nextIndex];
    if (!next) {
      screening.status = "finished";
      screening.currentId = null;
      screening.remaining = 0;
      screening.endsAt = null;
      break;
    }
    screening.currentId = next.id;
    screening.remaining = Number(next.duration);
    scheduleEnd += Number(next.duration) * 1000;
    screening.endsAt = scheduleEnd;
  }
  saveState();
}

function resetScreening() {
  state.screening = createScreeningState();
  saveState();
  renderAll();
}

function screeningTick() {
  const screening = state.screening;
  if (screening.status !== "running") return;
  if (Date.now() >= screening.endsAt) {
    advanceSegment(false);
    return;
  }
  renderScreeningLive();
  updateSegmentBadges();
}

function renderScreeningLive() {
  const screening = state.screening;
  const index = getScreeningIndex();
  const segment = index >= 0 ? state.segments[index] : null;
  const remaining = getDisplayRemaining(segment);
  const total = state.segments.length;

  const statusLabels = {
    idle: "待映",
    running: "放映中",
    paused: "已暂停",
    finished: "全部走完"
  };
  els.screeningStatusText.textContent = statusLabels[screening.status] || "待映";

  if (screening.status === "finished") {
    els.nowCode.textContent = "全部片段已走完";
    els.nowCountdown.textContent = "00";
    els.nowCountdownBox.classList.remove("running");
    els.nowMeta.textContent = `共走完 ${total} 段，详见下方汇总。`;
    els.nowNote.textContent = "";
  } else if (segment) {
    els.nowCode.textContent = `${index + 1}. ${segment.code}`;
    els.nowCountdown.textContent = String(remaining).padStart(2, "0");
    els.nowCountdownBox.classList.toggle("running", screening.status === "running");
    const record = getRecord(segment.id);
    const playedHere = Math.max(0, Number(segment.duration) - remaining);
    if (screening.status === "running") {
      els.nowMeta.textContent = `计划 ${formatDuration(segment.duration)} · 本段已放映 ${formatDuration(
        record.played + playedHere
      )}`;
    } else {
      els.nowMeta.textContent = `已暂停 · 剩余 ${remaining} 秒，继续后从这里接着走。`;
    }
    els.nowNote.textContent = segment.note || "";
  } else {
    els.nowCode.textContent = "—";
    els.nowCountdown.textContent = "--";
    els.nowMeta.textContent = total ? "按下「开始放映」后，按本段剩余秒数倒计时。" : "先在左侧加入片段，再开始放映。";
    els.nowNote.textContent = "";
  }

  els.nowCountdownBox.classList.toggle("running", screening.status === "running");

  const toggleLabels = {
    idle: "开始放映",
    running: "暂停",
    paused: "继续放映",
    finished: "重新开始"
  };
  els.startToggleBtn.textContent = toggleLabels[screening.status] || "开始放映";
  els.startToggleBtn.classList.toggle("running", screening.status === "running");
  els.startToggleBtn.disabled = !total;
  els.skipBtn.disabled = screening.status !== "running" && screening.status !== "paused";
  els.resetScreeningBtn.disabled = screening.status === "idle";

  const doneCount = Object.keys(screening.records).length;
  const position = screening.status === "finished" ? total : index >= 0 ? index : doneCount;
  els.progressText.textContent = `第 ${position} / ${total} 段`;
  els.elapsedText.textContent = `已放映 ${formatDuration(getElapsedTotal())}`;
  const plannedTotal = state.segments.reduce((sum, item) => sum + Number(item.duration), 0);
  const percent = plannedTotal > 0 ? Math.min(100, (getElapsedTotal() / plannedTotal) * 100) : 0;
  els.progressFill.style.width = `${percent}%`;

  if (screening.status === "finished") {
    renderScreeningSummary();
  } else {
    els.screeningSummary.hidden = true;
    els.screeningSummary.innerHTML = "";
  }
}

function updateSegmentBadges() {
  const screening = state.screening;
  if (screening.status === "idle") return;
  for (const card of els.segmentList.querySelectorAll(".segment-card")) {
    const view = getCardScreeningView(card.dataset.id);
    card.classList.toggle("is-playing", view.cardClass === "is-playing");
    card.classList.toggle("is-paused", view.cardClass === "is-paused");
    card.classList.toggle("is-done", view.cardClass === "is-done");
    card.classList.toggle("is-skipped", view.cardClass === "is-skipped");
    let badge = card.querySelector(".badge-screening");
    if (view.badgeText) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "badge-screening";
        card.querySelector(".segment-title").appendChild(badge);
      }
      badge.className = `badge-screening ${view.badgeClass}`.trim();
      badge.textContent = view.badgeText;
    } else if (badge) {
      badge.remove();
    }
    const line = card.querySelector(".segment-screening");
    if (view.line) {
      if (!line) {
        const created = document.createElement("div");
        created.className = "segment-screening";
        card.querySelector(".segment-main").appendChild(created);
      }
      card.querySelector(".segment-screening").textContent = view.line;
    } else if (line) {
      line.remove();
    }
  }
}

function renderScreeningSummary() {
  const planned = state.segments.reduce((sum, item) => sum + Number(item.duration), 0);
  const actual = Object.values(state.screening.records).reduce((sum, record) => sum + record.played, 0);
  const skippedCount = Object.values(state.screening.records).filter((record) => record.skipped).length;
  const difference = actual - planned;

  const rows = state.segments
    .map((item, index) => {
      const record = getRecord(item.id);
      const times = record.skipped
        ? `跳过 · 已放映 ${formatDuration(record.played)} / ${formatDuration(item.duration)}`
        : `放映 ${formatDuration(record.played)} / ${formatDuration(item.duration)}`;
      return `
        <div class="summary-row ${record.skipped ? "is-skipped" : ""}">
          <strong>${index + 1}. ${escapeHtml(item.code)}</strong>
          <span class="summary-note">${escapeHtml(item.note || "无备注")}</span>
          <span class="summary-times">${times}</span>
        </div>
      `;
    })
    .join("");

  els.screeningSummary.hidden = false;
  els.screeningSummary.innerHTML = `
    <div class="summary-numbers">
      <div>
        <span>计划时长</span>
        <strong>${formatDuration(planned)}</strong>
      </div>
      <div>
        <span>实际放映时长</span>
        <strong>${formatDuration(actual)}</strong>
      </div>
      <div>
        <span>与计划相差</span>
        <strong class="difference">${difference <= 0 ? "−" : "+"}${formatDuration(Math.abs(difference))}</strong>
      </div>
      <div>
        <span>跳过片段</span>
        <strong>${skippedCount} 段</strong>
      </div>
    </div>
    <div class="summary-table">${rows}</div>
  `;
}

function renderAll() {
  saveState();
  els.reelTitle.value = state.reelTitle;
  renderStats();
  renderList();
  renderWarnings();
  renderScreeningLive();
  scrollCurrentSegmentIntoView();
}

function scrollCurrentSegmentIntoView() {
  const screening = state.screening;
  if (screening.status !== "running" && screening.status !== "paused") return;
  const card = els.segmentList.querySelector(`.segment-card[data-id="${screening.currentId}"]`);
  if (card) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  const minutes = Math.floor(value / 60);
  const rest = String(value % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
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
  if (state.screening.status === "finished") {
    state.screening = createScreeningState();
  }
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

els.startToggleBtn.addEventListener("click", () => {
  const status = state.screening.status;
  if (status === "running") {
    pauseScreening();
  } else if (status === "paused" || status === "idle") {
    startScreening();
  } else if (status === "finished") {
    if (window.confirm("重新开始将清空本次放映记录，从第一段重新计时，确定吗？")) {
      resetScreening();
      startScreening();
    }
  }
});
els.skipBtn.addEventListener("click", () => advanceSegment(true));
els.resetScreeningBtn.addEventListener("click", () => {
  if (window.confirm("确定清空全部放映进度和已记录秒数吗？")) resetScreening();
});

els.segmentList.addEventListener("click", (event) => {
  const up = event.target.closest("[data-move-up]");
  const down = event.target.closest("[data-move-down]");
  const remove = event.target.closest("[data-delete]");
  if (up) moveSegment(up.dataset.moveUp, -1);
  if (down) moveSegment(down.dataset.moveDown, 1);
  if (remove) {
    const removedIndex = state.segments.findIndex((item) => item.id === remove.dataset.delete);
    state.segments = state.segments.filter((item) => item.id !== remove.dataset.delete);
    delete state.screening.records[remove.dataset.delete];
    handleScreeningSegmentRemoval(removedIndex, remove.dataset.delete);
    renderAll();
  }
});

function handleScreeningSegmentRemoval(removedIndex, removedId) {
  const screening = state.screening;
  if (screening.status === "idle" || screening.status === "finished") return;
  if (screening.currentId !== removedId) return;
  const next = state.segments[Math.min(removedIndex, state.segments.length - 1)];
  if (next) {
    screening.currentId = next.id;
    screening.remaining = Number(next.duration);
    if (screening.status === "running") {
      screening.endsAt = Date.now() + screening.remaining * 1000;
    }
  } else {
    screening.status = "finished";
    screening.currentId = null;
    screening.remaining = 0;
    screening.endsAt = null;
  }
}

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

catchUpScreening();
renderAll();
setInterval(screeningTick, 250);
window.addEventListener("beforeunload", saveState);
