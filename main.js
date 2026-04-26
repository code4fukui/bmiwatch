const STORAGE_KEY = "daily-sum-records";

const form = document.getElementById("record-form");
const typeInput = document.getElementById("type-input");
const amountInput = document.getElementById("amount-input");
const exportButton = document.getElementById("export-button");
const resetButton = document.getElementById("reset-button");
const recentShortcuts = document.getElementById("recent-shortcuts");
const shortcutEmpty = document.getElementById("shortcut-empty");
const todayTotal = document.getElementById("today-total");
const todayCount = document.getElementById("today-count");
const latestValue = document.getElementById("latest-value");
const recordDays = document.getElementById("record-days");
const chartLegend = document.getElementById("chart-legend");
const chart = document.getElementById("chart");
const chartEmpty = document.getElementById("chart-empty");
const recordsBody = document.getElementById("records-body");
const historyEmpty = document.getElementById("history-empty");
const rowTemplate = document.getElementById("record-row-template");

let records = loadRecords();
let editingRecordId = null;

render();

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const type = typeInput.value.trim();
  const amount = Number(amountInput.value);

  if (Number.isNaN(amount) || amount < 0) {
    return;
  }

  addRecord(amount, type);
  amountInput.value = "";
  amountInput.select();
});

resetButton.addEventListener("click", () => {
  if (!records.length) {
    return;
  }

  const confirmed = window.confirm("保存済みの記録をすべて削除しますか？");
  if (!confirmed) {
    return;
  }

  records = [];
  persistRecords();
  render();
});

exportButton.addEventListener("click", () => {
  if (!records.length) {
    return;
  }

  const csv = buildCsv(records);
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `daily-sum-${getLocalDateKey(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

function loadRecords() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeRecord)
      .filter(Boolean)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } catch {
    return [];
  }
}

function persistRecords() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function render() {
  const dailyTotals = aggregateDailyTotals(records);
  renderStats();
  renderShortcuts();
  renderTable();
  renderChart(dailyTotals);
}

function renderStats() {
  const latest = records.at(-1);
  const todayKey = getLocalDateKey(new Date());
  const todaysRecords = records.filter((record) => getLocalDateKey(new Date(record.timestamp)) === todayKey);
  const todaysTotal = todaysRecords.reduce((sum, record) => sum + record.amount, 0);
  const dayCount = new Set(records.map((record) => getLocalDateKey(new Date(record.timestamp)))).size;

  todayTotal.textContent = formatAmount(todaysTotal);
  todayCount.textContent = `${todaysRecords.length}件の記録`;
  latestValue.textContent = latest ? formatLatestRecord(latest) : "-";
  recordDays.textContent = String(dayCount);
}

function renderTable() {
  recordsBody.textContent = "";
  historyEmpty.style.display = records.length ? "none" : "block";

  for (const record of [...records].reverse()) {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    const timeCell = row.querySelector(".time-cell");
    row.querySelector(".type-cell").textContent = record.type || "-";
    row.querySelector(".amount-cell").textContent = formatAmount(record.amount);

    if (editingRecordId === record.id) {
      renderTimeEditor(timeCell, record);
    } else {
      const timeButton = document.createElement("button");
      timeButton.type = "button";
      timeButton.className = "time-button";
      timeButton.textContent = formatDateTime(record.timestamp);
      timeButton.addEventListener("click", () => {
        editingRecordId = record.id;
        render();
      });
      timeCell.appendChild(timeButton);
    }

    row.querySelector(".delete-button").addEventListener("click", () => {
      records = records.filter((entry) => entry.id !== record.id);
      if (editingRecordId === record.id) {
        editingRecordId = null;
      }
      persistRecords();
      render();
    });
    recordsBody.appendChild(row);
  }
}

function renderShortcuts() {
  recentShortcuts.textContent = "";

  const latestCombos = [];
  const seen = new Set();

  for (const record of [...records].reverse()) {
    const key = `${record.amount}\u0000${record.type}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    latestCombos.push({ amount: record.amount, type: record.type });
    if (latestCombos.length === 5) {
      break;
    }
  }

  shortcutEmpty.style.display = latestCombos.length ? "none" : "block";

  for (const combo of latestCombos) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shortcut-button";
    button.textContent = formatShortcut(combo);
    button.addEventListener("click", () => {
      addRecord(combo.amount, combo.type);
    });
    recentShortcuts.appendChild(button);
  }
}

function renderChart(dailyTotals) {
  if (!dailyTotals.length) {
    chartLegend.textContent = "";
    chart.innerHTML = "";
    chart.style.display = "none";
    chartEmpty.style.display = "block";
    return;
  }

  chart.style.display = "block";
  chartEmpty.style.display = "none";

  const width = 640;
  const height = 320;
  const padding = { top: 24, right: 24, bottom: 40, left: 56 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxAmount = Math.max(...dailyTotals.map((record) => record.total), 1);
  const range = maxAmount;
  const types = getChartTypes(dailyTotals);
  const colorMap = new Map(types.map((type) => [type, getTypeColor(type)]));
  const step = innerWidth / dailyTotals.length;
  const barWidth = Math.min(56, Math.max(22, step * 0.62));

  const yLabels = Array.from({ length: 4 }, (_, index) => {
    const value = (range * (3 - index)) / 3;
    const y = padding.top + (innerHeight * index) / 3;
    return { value, y };
  });

  const bars = dailyTotals.flatMap((record, index) => {
    const centerX = padding.left + step * index + step / 2;
    const x = centerX - barWidth / 2;
    let accumulated = 0;

    return types.flatMap((type) => {
      const amount = record.types[type] ?? 0;
      if (!amount) {
        return [];
      }

      const barHeight = (amount / range) * innerHeight;
      accumulated += amount;
      const y = padding.top + innerHeight - (accumulated / range) * innerHeight;

      return [{
        x,
        y,
        width: barWidth,
        height: barHeight,
        fill: colorMap.get(type),
      }];
    });
  });

  renderChartLegend(types, colorMap);

  chart.innerHTML = `
    ${yLabels.map(({ y }) => `<line class="grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>`).join("")}
    ${yLabels.map(({ value, y }) => `<text class="axis-label" x="${padding.left - 12}" y="${y + 4}" text-anchor="end">${trimNumber(value)}</text>`).join("")}
    ${bars.map((bar) => `<rect class="chart-bar" x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}" fill="${bar.fill}"></rect>`).join("")}
    ${dailyTotals.map((point, index) => {
      const centerX = padding.left + step * index + step / 2;
      return `<text class="axis-label" x="${centerX}" y="${height - 14}" text-anchor="middle">${shortDate(point.date)}</text>`;
    }).join("")}
  `;
}

function aggregateDailyTotals(source) {
  const totals = new Map();

  for (const record of source) {
    const date = getLocalDateKey(new Date(record.timestamp));
    const type = record.type || "";
    const daily = totals.get(date) ?? { total: 0, types: {} };
    daily.total += record.amount;
    daily.types[type] = (daily.types[type] ?? 0) + record.amount;
    totals.set(date, daily);
  }

  return [...totals.entries()]
    .map(([date, summary]) => ({ date, total: summary.total, types: summary.types }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeRecord(item) {
  if (!Number.isFinite(Number(item?.amount))) {
    return null;
  }

  if (typeof item?.timestamp === "string" && !Number.isNaN(Date.parse(item.timestamp))) {
    return {
      id: typeof item.id === "string" ? item.id : createRecordId(),
      timestamp: item.timestamp,
      type: typeof item.type === "string" ? item.type : "",
      amount: Number(item.amount),
    };
  }

  if (typeof item?.date === "string") {
    return {
      id: createRecordId(),
      timestamp: `${item.date}T00:00:00`,
      type: typeof item.type === "string" ? item.type : "",
      amount: Number(item.amount),
    };
  }

  return null;
}

function formatAmount(value) {
  return trimNumber(value);
}

function trimNumber(value) {
  return Number(value).toLocaleString("ja-JP", {
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTimeLocal(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function shortDate(value) {
  const [year, month, day] = value.split("-");
  return `${month}/${day}`;
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createRecordId() {
  return `record-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function renderTimeEditor(container, record) {
  const wrapper = document.createElement("div");
  wrapper.className = "time-edit";

  const input = document.createElement("input");
  input.type = "datetime-local";
  input.value = formatDateTimeLocal(record.timestamp);

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "mini-button";
  saveButton.textContent = "更新";
  saveButton.addEventListener("click", () => {
    updateRecordTimestamp(record.id, input.value);
  });

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "mini-button secondary";
  cancelButton.textContent = "取消";
  cancelButton.addEventListener("click", () => {
    editingRecordId = null;
    render();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      updateRecordTimestamp(record.id, input.value);
    }
    if (event.key === "Escape") {
      editingRecordId = null;
      render();
    }
  });

  wrapper.append(input, saveButton, cancelButton);
  container.appendChild(wrapper);
  queueMicrotask(() => input.focus());
}

function updateRecordTimestamp(recordId, localValue) {
  if (!localValue) {
    return;
  }

  const timestamp = new Date(localValue).toISOString();
  if (Number.isNaN(Date.parse(timestamp))) {
    return;
  }

  const target = records.find((record) => record.id === recordId);
  if (!target) {
    return;
  }

  target.timestamp = timestamp;
  records.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  editingRecordId = null;
  persistRecords();
  render();
}

function addRecord(amount, type = "") {
  records.push({
    id: createRecordId(),
    timestamp: new Date().toISOString(),
    type,
    amount,
  });
  records.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  persistRecords();
  render();
}

function buildCsv(source) {
  const rows = [
    ["日時", "日付", "種別", "量"],
    ...source.map((record) => [
      formatDateTime(record.timestamp),
      getLocalDateKey(new Date(record.timestamp)),
      record.type,
      String(record.amount),
    ]),
  ];

  return rows
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n");
}

function escapeCsvCell(value) {
  const text = String(value);
  if (!/[",\r\n]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function formatShortcut(record) {
  return record.type ? `${formatAmount(record.amount)} ${record.type}` : formatAmount(record.amount);
}

function formatLatestRecord(record) {
  const summary = record.type ? `${formatAmount(record.amount)} ${record.type}` : formatAmount(record.amount);
  return `${summary} / ${formatDateTime(record.timestamp)}`;
}

function getChartTypes(dailyTotals) {
  const types = new Set();
  for (const record of dailyTotals) {
    for (const type of Object.keys(record.types)) {
      types.add(type);
    }
  }
  return [...types].sort((a, b) => a.localeCompare(b, "ja"));
}

function renderChartLegend(types, colorMap) {
  chartLegend.textContent = "";

  for (const type of types) {
    const item = document.createElement("span");
    item.className = "legend-item";

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = colorMap.get(type);

    const label = document.createElement("span");
    label.textContent = formatType(type);

    item.append(swatch, label);
    chartLegend.appendChild(item);
  }
}

function getTypeColor(type) {
  const palette = ["#1a7f64", "#d26a32", "#2b6cb0", "#b44a2f", "#7b5cc7", "#c2872f", "#008b8b", "#b83280"];
  let hash = 0;
  for (const char of type || "_") {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return palette[hash % palette.length];
}

function formatType(type) {
  return type || "未分類";
}
