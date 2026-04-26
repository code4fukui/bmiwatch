const STORAGE_KEY = "daily-sum-records";

const form = document.getElementById("record-form");
const amountInput = document.getElementById("amount-input");
const resetButton = document.getElementById("reset-button");
const recentShortcuts = document.getElementById("recent-shortcuts");
const shortcutEmpty = document.getElementById("shortcut-empty");
const todayTotal = document.getElementById("today-total");
const todayCount = document.getElementById("today-count");
const latestValue = document.getElementById("latest-value");
const recordDays = document.getElementById("record-days");
const chart = document.getElementById("chart");
const chartEmpty = document.getElementById("chart-empty");
const recordsBody = document.getElementById("records-body");
const historyEmpty = document.getElementById("history-empty");
const rowTemplate = document.getElementById("record-row-template");

let records = loadRecords();

render();

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const amount = Number(amountInput.value);

  if (Number.isNaN(amount) || amount < 0) {
    return;
  }

  addRecord(amount);
  form.reset();
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
  latestValue.textContent = latest ? `${formatAmount(latest.amount)} / ${formatDateTime(latest.timestamp)}` : "-";
  recordDays.textContent = String(dayCount);
}

function renderTable() {
  recordsBody.textContent = "";
  historyEmpty.style.display = records.length ? "none" : "block";

  for (const record of [...records].reverse()) {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector(".time-cell").textContent = formatDateTime(record.timestamp);
    row.querySelector(".amount-cell").textContent = formatAmount(record.amount);
    row.querySelector(".delete-button").addEventListener("click", () => {
      records = records.filter((entry) => entry.id !== record.id);
      persistRecords();
      render();
    });
    recordsBody.appendChild(row);
  }
}

function renderShortcuts() {
  recentShortcuts.textContent = "";

  const latestAmounts = [];

  for (const record of [...records].reverse()) {
    if (latestAmounts.includes(record.amount)) {
      continue;
    }
    latestAmounts.push(record.amount);
    if (latestAmounts.length === 5) {
      break;
    }
  }

  shortcutEmpty.style.display = latestAmounts.length ? "none" : "block";

  for (const amount of latestAmounts) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shortcut-button";
    button.textContent = formatAmount(amount);
    button.addEventListener("click", () => {
      addRecord(amount);
    });
    recentShortcuts.appendChild(button);
  }
}

function renderChart(dailyTotals) {
  if (!dailyTotals.length) {
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
  const maxAmount = Math.max(...dailyTotals.map((record) => record.amount), 1);
  const minAmount = Math.min(...dailyTotals.map((record) => record.amount), 0);
  const range = Math.max(maxAmount - minAmount, 1);

  const points = dailyTotals.map((record, index) => {
    const x = padding.left + (dailyTotals.length === 1 ? innerWidth / 2 : (innerWidth * index) / (dailyTotals.length - 1));
    const y = padding.top + innerHeight - ((record.amount - minAmount) / range) * innerHeight;
    return { ...record, x, y };
  });

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = [
    `M ${points[0].x} ${padding.top + innerHeight}`,
    ...points.map((point) => `L ${point.x} ${point.y}`),
    `L ${points.at(-1).x} ${padding.top + innerHeight}`,
    "Z",
  ].join(" ");

  const yLabels = Array.from({ length: 4 }, (_, index) => {
    const value = minAmount + (range * (3 - index)) / 3;
    const y = padding.top + (innerHeight * index) / 3;
    return { value, y };
  });

  chart.innerHTML = `
    ${yLabels.map(({ y }) => `<line class="grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>`).join("")}
    ${yLabels.map(({ value, y }) => `<text class="axis-label" x="${padding.left - 12}" y="${y + 4}" text-anchor="end">${trimNumber(value)}</text>`).join("")}
    <path class="chart-area" d="${areaPath}"></path>
    <path class="chart-line" d="${linePath}"></path>
    ${points.map((point) => `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="5"></circle>`).join("")}
    ${points.map((point) => `<text class="axis-label" x="${point.x}" y="${height - 14}" text-anchor="middle">${shortDate(point.date)}</text>`).join("")}
  `;
}

function aggregateDailyTotals(source) {
  const totals = new Map();

  for (const record of source) {
    const date = getLocalDateKey(new Date(record.timestamp));
    totals.set(date, (totals.get(date) ?? 0) + record.amount);
  }

  return [...totals.entries()]
    .map(([date, amount]) => ({ date, amount }))
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
      amount: Number(item.amount),
    };
  }

  if (typeof item?.date === "string") {
    return {
      id: createRecordId(),
      timestamp: `${item.date}T00:00:00`,
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

function addRecord(amount) {
  records.push({
    id: createRecordId(),
    timestamp: new Date().toISOString(),
    amount,
  });
  records.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  persistRecords();
  render();
}
