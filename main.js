const STORAGE_KEY = "daily-sum-records";

const form = document.getElementById("record-form");
const typeInput = document.getElementById("type-input");
const amountInput = document.getElementById("amount-input");
const importButton = document.getElementById("import-button");
const importFileInput = document.getElementById("import-file-input");
const exportButton = document.getElementById("export-button");
const resetButton = document.getElementById("reset-button");
const recentShortcuts = document.getElementById("recent-shortcuts");
const shortcutEmpty = document.getElementById("shortcut-empty");
const todayTotal = document.getElementById("today-total");
const todayCount = document.getElementById("today-count");
const latestValue = document.getElementById("latest-value");
const recordDays = document.getElementById("record-days");
const chartLegend = document.getElementById("chart-legend");
const weekChartLegend = document.getElementById("week-chart-legend");
const chart = document.getElementById("chart");
const weekChart = document.getElementById("week-chart");
const chartEmpty = document.getElementById("chart-empty");
const recordsBody = document.getElementById("records-body");
const historyEmpty = document.getElementById("history-empty");
const rowTemplate = document.getElementById("record-row-template");

let records = loadRecords();
let editingRecordId = null;
let highlightedWeekDate = getRelativeDateKey(-1);

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

importButton.addEventListener("click", () => {
  importFileInput.click();
});

importFileInput.addEventListener("change", async () => {
  const [file] = importFileInput.files || [];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const imported = parseCsvRecords(text);
    if (!imported.length) {
      window.alert("読み込める記録がありませんでした。");
      return;
    }

    const merged = [...records];
    for (const record of imported) {
      merged.push({
        id: createRecordId(),
        timestamp: record.timestamp,
        type: record.type,
        amount: record.amount,
      });
    }

    records = merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    persistRecords();
    render();
    window.alert(`${imported.length}件の記録を読み込みました。`);
  } catch {
    window.alert("CSVの読み込みに失敗しました。");
  } finally {
    importFileInput.value = "";
  }
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
  const recentWeekSeries = buildRecentWeekSeries(records);
  renderStats();
  renderShortcuts();
  renderTable();
  renderChart(dailyTotals);
  renderWeekChart(recentWeekSeries);
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
  const padding = { top: 24, right: 24, bottom: 58, left: 56 };
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
    ${yLabels.map(({ value, y }) => `<text class="axis-label" x="${padding.left - 12}" y="${y + 4}" text-anchor="end">${formatAxisValue(value)}</text>`).join("")}
    ${bars.map((bar) => `<rect class="chart-bar" x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}" fill="${bar.fill}"></rect>`).join("")}
    ${dailyTotals.map((point, index) => {
      const centerX = padding.left + step * index + step / 2;
      const topY = padding.top + innerHeight - (point.total / range) * innerHeight;
      return `<text class="axis-total-label" x="${centerX}" y="${Math.max(padding.top - 6, topY - 8)}" text-anchor="middle">${trimNumber(point.total)}</text>`;
    }).join("")}
    ${dailyTotals.map((point, index) => {
      const centerX = padding.left + step * index + step / 2;
      return `
        <text class="axis-label" x="${centerX}" y="${height - 30}" text-anchor="middle">${shortDate(point.date)}</text>
        <text class="axis-sub-label" x="${centerX}" y="${height - 12}" text-anchor="middle">${point.count}件</text>
      `;
    }).join("")}
  `;
}

function renderWeekChart(weekSeries) {
  if (!weekSeries.length) {
    weekChartLegend.textContent = "";
    weekChart.innerHTML = "";
    weekChart.style.display = "none";
    return;
  }

  weekChart.style.display = "block";

  const width = 640;
  const height = 280;
  const padding = { top: 24, right: 24, bottom: 54, left: 56 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxAmount = Math.max(...weekSeries.flatMap((series) => series.points.map((point) => point.amount)), 1);

  const yLabels = Array.from({ length: 4 }, (_, index) => {
    const value = (maxAmount * (3 - index)) / 3;
    const y = padding.top + (innerHeight * index) / 3;
    return { value, y };
  });

  const xLabels = [0, 6, 12, 18, 24].map((hour) => {
    const x = padding.left + (innerWidth * hour) / 24;
    return { hour, x };
  });

  renderWeekChartLegend(weekSeries);

  weekChart.innerHTML = `
    ${yLabels.map(({ y }) => `<line class="grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>`).join("")}
    ${yLabels.map(({ value, y }) => `<text class="axis-label" x="${padding.left - 12}" y="${y + 4}" text-anchor="end">${formatAxisValue(value)}</text>`).join("")}
    ${xLabels.map(({ x }) => `<line class="grid-line" x1="${x}" y1="${padding.top}" x2="${x}" y2="${padding.top + innerHeight}"></line>`).join("")}
    ${weekSeries.map((series) => {
      const isSelected = highlightedWeekDate === series.date;
      const strokeOpacity = series.isToday ? 1 : (isSelected ? 0.7 : series.opacity);
      const strokeColor = isSelected && !series.isToday ? "#d26a32" : series.color;
      const path = series.points.map((point, index) => {
        const x = padding.left + (innerWidth * point.hour) / 24;
        const y = padding.top + innerHeight - (point.amount / maxAmount) * innerHeight;

        if (index === 0) {
          return `M ${x} ${y}`;
        }

        const previous = series.points[index - 1];
        const previousX = padding.left + (innerWidth * previous.hour) / 24;
        const previousY = padding.top + innerHeight - (previous.amount / maxAmount) * innerHeight;
        return `L ${x} ${previousY} L ${x} ${y}`;
      }).join(" ");
      return `<path class="week-line ${series.isToday ? "today" : "past"} ${isSelected ? "is-selected" : ""}" d="${path}" stroke="${strokeColor}" opacity="${strokeOpacity}" data-date="${series.date}"></path>`;
    }).join("")}
    ${xLabels.map(({ hour, x }) => `<text class="axis-label" x="${x}" y="${height - 12}" text-anchor="middle">${hour}</text>`).join("")}
  `;
}

function aggregateDailyTotals(source) {
  const totals = new Map();

  for (const record of source) {
    const date = getLocalDateKey(new Date(record.timestamp));
    const type = record.type || "";
    const daily = totals.get(date) ?? { total: 0, count: 0, types: {} };
    daily.total += record.amount;
    daily.count += 1;
    daily.types[type] = (daily.types[type] ?? 0) + record.amount;
    totals.set(date, daily);
  }

  return [...totals.entries()]
    .map(([date, summary]) => ({ date, total: summary.total, count: summary.count, types: summary.types }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildRecentWeekSeries(source) {
  if (!source.length) {
    return [];
  }

  const series = [];
  const today = new Date();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const key = getLocalDateKey(date);
    const recordsInDay = source
      .filter((record) => getLocalDateKey(new Date(record.timestamp)) === key)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let accumulated = 0;
    const points = [{ hour: 0, amount: 0 }];

    for (const record of recordsInDay) {
      const time = new Date(record.timestamp);
      accumulated += record.amount;
      points.push({
        hour: time.getHours() + time.getMinutes() / 60 + time.getSeconds() / 3600,
        amount: accumulated,
      });
    }

    points.push({ hour: 24, amount: accumulated });
    const opacity = offset === 0 ? 1 : 0.16 + ((6 - offset) / 5) * 0.34;
    series.push({
      date: key,
      isToday: offset === 0,
      color: offset === 0 ? "#1a7f64" : "#7ba99c",
      opacity,
      count: recordsInDay.length,
      total: accumulated,
      points,
    });
  }

  return series;
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

function formatAxisValue(value) {
  return Math.round(value).toLocaleString("ja-JP");
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

function getRelativeDateKey(offsetDays) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return getLocalDateKey(date);
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
  return `"${text.split("\"").join("\"\"")}"`;
}

function parseCsvRecords(text) {
  const normalized = text.replace(/^\uFEFF/, "");
  const rows = parseCsvRows(normalized);
  if (rows.length <= 1) {
    return [];
  }

  return rows
    .slice(1)
    .map((row) => normalizeImportedRow(row))
    .filter(Boolean);
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter((currentRow) => currentRow.some((value) => value !== ""));
}

function normalizeImportedRow(row) {
  const timestampText = row[0];
  const type = row[2] || "";
  const amount = Number(row[3]);

  if (!timestampText || Number.isNaN(amount)) {
    return null;
  }

  const timestamp = parseJaTimestamp(timestampText);
  if (!timestamp) {
    return null;
  }

  return {
    timestamp,
    type,
    amount,
  };
}

function parseJaTimestamp(text) {
  const value = String(text).trim();
  const match = value.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})$/)
    || value.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const date = new Date(year, month, day, hour, minute, 0, 0);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
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

function renderWeekChartLegend(weekSeries) {
  weekChartLegend.textContent = "";

  for (const series of weekSeries) {
    const item = document.createElement("span");
    item.className = "legend-item";

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = highlightedWeekDate === series.date && !series.isToday ? "#d26a32" : series.color;
    swatch.style.opacity = String(series.isToday ? 1 : (highlightedWeekDate === series.date ? 0.7 : series.opacity));

    const label = document.createElement("span");
    label.textContent = `${shortDate(series.date)}${series.isToday ? " 今日" : ""}`;
    if (highlightedWeekDate === series.date) {
      item.classList.add("is-active");
    }

    item.append(swatch, label);
    item.addEventListener("click", () => {
      toggleWeekHighlight(series.date);
    });
    weekChartLegend.appendChild(item);
  }
}

function toggleWeekHighlight(date) {
  highlightedWeekDate = highlightedWeekDate === date ? null : date;
  renderWeekChart(buildRecentWeekSeries(records));
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
