const STORAGE_KEY = "bmiwatch-records";
const SETTINGS_KEY = "bmiwatch-settings";
const STANDARD_BMI_LOWER = 18.5;
const STANDARD_BMI_UPPER = 25;
const DEFAULT_TARGET_BMI = 22;

const form = document.getElementById("record-form");
const weightInput = document.getElementById("weight-input");
const heightInput = document.getElementById("height-input");
const targetBmiInput = document.getElementById("target-bmi-input");
const importButton = document.getElementById("import-button");
const importFileInput = document.getElementById("import-file-input");
const exportButton = document.getElementById("export-button");
const resetButton = document.getElementById("reset-button");
const currentBmi = document.getElementById("current-bmi");
const latestWeight = document.getElementById("latest-weight");
const targetWeight = document.getElementById("target-weight");
const remainingWeight = document.getElementById("remaining-weight");
const chartLegend = document.getElementById("chart-legend");
const chart = document.getElementById("chart");
const chartEmpty = document.getElementById("chart-empty");
const recordsBody = document.getElementById("records-body");
const historyEmpty = document.getElementById("history-empty");
const rowTemplate = document.getElementById("record-row-template");

let settings = loadSettings();
let records = loadRecords();
let editingRecordId = null;

weightInput.value = "";
heightInput.value = "";
targetBmiInput.value = "";

render();

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const weightKg = Number(weightInput.value);
  const heightCm = Number(heightInput.value);
  const targetBmi = resolveTargetBmi(weightKg, heightCm);

  if (!isValidWeight(weightKg) || !isValidHeight(heightCm) || !isValidBmi(targetBmi)) {
    return;
  }

  settings = { heightCm, targetBmi };
  targetBmiInput.value = trimNumber(targetBmi);
  persistSettings();
  addRecord(weightKg);
  weightInput.select();
});

weightInput.addEventListener("input", updateInitialTargetBmi);
heightInput.addEventListener("input", updateInitialTargetBmi);
heightInput.addEventListener("change", updateSettingsFromInputs);
targetBmiInput.addEventListener("change", updateSettingsFromInputs);

resetButton.addEventListener("click", () => {
  if (!records.length) {
    return;
  }

  const confirmed = window.confirm("保存済みの体重記録をすべて削除しますか？");
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
  link.download = `bmiwatch-${getLocalDateKey(new Date())}.csv`;
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

    records = [...records, ...imported.map((record) => ({ ...record, id: createRecordId() }))]
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    persistRecords();
    render();
    window.alert(`${imported.length}件の記録を読み込みました。`);
  } catch {
    window.alert("CSVの読み込みに失敗しました。");
  } finally {
    importFileInput.value = "";
  }
});

function loadSettings() {
  const raw = window.localStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return { heightCm: null, targetBmi: null };
  }

  try {
    const parsed = JSON.parse(raw);
    const heightCm = Number(parsed?.heightCm);
    const targetBmi = Number(parsed?.targetBmi);
    return {
      heightCm: isValidHeight(heightCm) ? heightCm : null,
      targetBmi: isValidBmi(targetBmi) ? targetBmi : null,
    };
  } catch {
    return { heightCm: null, targetBmi: null };
  }
}

function persistSettings() {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

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

function updateSettingsFromInputs() {
  const heightCm = Number(heightInput.value);
  const targetBmi = Number(targetBmiInput.value);
  if (!isValidHeight(heightCm)) {
    return;
  }
  if (targetBmiInput.value.trim() === "") {
    settings = { heightCm, targetBmi: null };
    persistSettings();
    render();
    return;
  }
  if (!isValidBmi(targetBmi)) {
    return;
  }

  settings = { heightCm, targetBmi };
  persistSettings();
  render();
}

function render() {
  renderStats();
  renderTable();
  renderChart(records);
}

function renderStats() {
  const latest = records.at(-1);
  const targetKg = getTargetWeight(settings.targetBmi);

  currentBmi.textContent = latest && settings.heightCm ? formatBmi(calcBmi(latest.weightKg)) : "-";
  latestWeight.textContent = latest ? `${formatWeight(latest.weightKg)} / ${formatDateTime(latest.timestamp)}` : "まだ記録がありません";
  targetWeight.textContent = targetKg ? formatWeight(targetKg) : "-";
  remainingWeight.textContent = latest && targetKg ? formatWeightDiff(latest.weightKg - targetKg) : "-";
}

function renderTable() {
  recordsBody.textContent = "";
  historyEmpty.style.display = records.length ? "none" : "block";

  for (const record of [...records].reverse()) {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    const timeCell = row.querySelector(".time-cell");
    const targetKg = getTargetWeight(settings.targetBmi);

    row.querySelector(".weight-cell").textContent = formatWeight(record.weightKg);
    row.querySelector(".bmi-cell").textContent = settings.heightCm ? formatBmi(calcBmi(record.weightKg)) : "-";
    row.querySelector(".diff-cell").textContent = targetKg ? formatWeightDiff(record.weightKg - targetKg) : "-";

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
      const confirmed = window.confirm("この記録を削除しますか？");
      if (!confirmed) {
        return;
      }

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

function renderChart(source) {
  if (!source.length || !settings.heightCm) {
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
  const targetKg = getTargetWeight(settings.targetBmi);
  const standardLowerKg = getTargetWeight(STANDARD_BMI_LOWER);
  const standardUpperKg = getTargetWeight(STANDARD_BMI_UPPER);
  const targetIsStandardLower = settings.targetBmi === STANDARD_BMI_LOWER;
  const targetIsStandardUpper = settings.targetBmi === STANDARD_BMI_UPPER;
  const showTargetLine = targetKg && !targetIsStandardLower && !targetIsStandardUpper;
  chartLegend.innerHTML = `
    <span class="legend-item"><span class="legend-swatch weight-swatch"></span><span>体重</span></span>
    ${showTargetLine ? `<span class="legend-item"><span class="legend-swatch target-swatch"></span><span>目標体重</span></span>` : ""}
    <span class="legend-item"><span class="legend-swatch standard-lower-swatch"></span><span>${targetIsStandardLower ? "標準下限/目標" : "標準下限"}</span></span>
    <span class="legend-item"><span class="legend-swatch standard-upper-swatch"></span><span>${targetIsStandardUpper ? "標準上限/目標" : "標準上限"}</span></span>
  `;
  const weights = source.map((record) => record.weightKg);
  const guideWeights = [standardLowerKg, standardUpperKg];
  if (targetKg) {
    guideWeights.push(targetKg);
  }
  const minWeight = Math.min(...weights, ...guideWeights);
  const maxWeight = Math.max(...weights, ...guideWeights);
  const margin = Math.max(2, (maxWeight - minWeight) * 0.18);
  const minY = Math.floor((minWeight - margin) * 10) / 10;
  const maxY = Math.ceil((maxWeight + margin) * 10) / 10;
  const range = Math.max(1, maxY - minY);
  const step = source.length > 1 ? innerWidth / (source.length - 1) : innerWidth;

  const yForWeight = (weightKg) => padding.top + innerHeight - ((weightKg - minY) / range) * innerHeight;
  const xForIndex = (index) => source.length > 1 ? padding.left + step * index : padding.left + innerWidth / 2;
  const points = source.map((record, index) => ({
    x: xForIndex(index),
    y: yForWeight(record.weightKg),
    record,
  }));
  const yLabels = Array.from({ length: 4 }, (_, index) => {
    const value = maxY - (range * index) / 3;
    const y = padding.top + (innerHeight * index) / 3;
    return { value, y };
  });
  const targetY = targetKg ? yForWeight(targetKg) : null;
  const standardLowerY = yForWeight(standardLowerKg);
  const standardUpperY = yForWeight(standardUpperKg);
  const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");

  chart.innerHTML = `
    ${yLabels.map(({ y }) => `<line class="grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>`).join("")}
    ${yLabels.map(({ value, y }) => `<text class="axis-label" x="${padding.left - 12}" y="${y + 4}" text-anchor="end">${formatWeightNumber(value)}</text>`).join("")}
    <line class="standard-line standard-lower-line" x1="${padding.left}" y1="${standardLowerY}" x2="${width - padding.right}" y2="${standardLowerY}"></line>
    <text class="standard-label" x="${width - padding.right}" y="${Math.max(14, standardLowerY - 8)}" text-anchor="end">${targetIsStandardLower ? "下限/目標" : "下限"} ${formatWeight(standardLowerKg)}</text>
    <line class="standard-line standard-upper-line" x1="${padding.left}" y1="${standardUpperY}" x2="${width - padding.right}" y2="${standardUpperY}"></line>
    <text class="standard-label" x="${width - padding.right}" y="${Math.max(14, standardUpperY - 8)}" text-anchor="end">${targetIsStandardUpper ? "上限/目標" : "上限"} ${formatWeight(standardUpperKg)}</text>
    ${showTargetLine ? `<line class="target-line" x1="${padding.left}" y1="${targetY}" x2="${width - padding.right}" y2="${targetY}"></line>` : ""}
    ${showTargetLine ? `<text class="target-label" x="${width - padding.right}" y="${Math.max(14, targetY - 8)}" text-anchor="end">目標 ${formatWeight(targetKg)}</text>` : ""}
    <path class="weight-line" d="${path}"></path>
    ${points.map(({ x, y }) => `<circle class="weight-point" cx="${x}" cy="${y}" r="4"></circle>`).join("")}
    ${source.map((record, index) => {
      const x = xForIndex(index);
      return `
        <text class="axis-label" x="${x}" y="${height - 30}" text-anchor="middle">${shortDate(getLocalDateKey(new Date(record.timestamp)))}</text>
        <text class="axis-sub-label" x="${x}" y="${height - 12}" text-anchor="middle">${formatBmi(calcBmi(record.weightKg))}</text>
      `;
    }).join("")}
  `;
}

function normalizeRecord(item) {
  const weightKg = Number(item?.weightKg ?? item?.weight);
  const timestamp = item?.timestamp;
  if (!isValidWeight(weightKg) || typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) {
    return null;
  }

  return {
    id: typeof item.id === "string" ? item.id : createRecordId(),
    timestamp,
    weightKg,
  };
}

function addRecord(weightKg) {
  records.push({
    id: createRecordId(),
    timestamp: new Date().toISOString(),
    weightKg,
  });
  records.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  persistRecords();
  render();
}

function calcBmi(weightKg) {
  const heightM = settings.heightCm / 100;
  return weightKg / (heightM * heightM);
}

function getTargetWeight(bmi) {
  if (!settings.heightCm || !bmi) {
    return null;
  }
  const heightM = settings.heightCm / 100;
  return bmi * heightM * heightM;
}

function resolveTargetBmi(weightKg, heightCm) {
  const enteredTargetBmi = Number(targetBmiInput.value);
  if (targetBmiInput.value.trim() !== "" && isValidBmi(enteredTargetBmi)) {
    return enteredTargetBmi;
  }
  if (!isValidWeight(weightKg) || !isValidHeight(heightCm)) {
    return null;
  }

  const bmi = calcBmiWithHeight(weightKg, heightCm);
  if (!records.length && bmi > STANDARD_BMI_UPPER) {
    return STANDARD_BMI_UPPER;
  }
  if (bmi < STANDARD_BMI_LOWER) {
    return STANDARD_BMI_LOWER;
  }
  return DEFAULT_TARGET_BMI;
}

function updateInitialTargetBmi() {
  if (records.length || targetBmiInput.value.trim() !== "") {
    return;
  }

  const weightKg = Number(weightInput.value);
  const heightCm = Number(heightInput.value);
  if (!isValidWeight(weightKg) || !isValidHeight(heightCm)) {
    return;
  }

  const bmi = calcBmiWithHeight(weightKg, heightCm);
  if (bmi > STANDARD_BMI_UPPER) {
    targetBmiInput.value = trimNumber(STANDARD_BMI_UPPER);
  }
}

function calcBmiWithHeight(weightKg, heightCm) {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

function isValidWeight(value) {
  return Number.isFinite(value) && value >= 1 && value <= 300;
}

function isValidHeight(value) {
  return Number.isFinite(value) && value >= 80 && value <= 250;
}

function isValidBmi(value) {
  return Number.isFinite(value) && value >= 10 && value <= 40;
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

function buildCsv(source) {
  const rows = [
    ["日時", "日付", "体重kg", "BMI", "身長cm", "目標BMI", "目標体重kg", "目標差kg"],
    ...source.map((record) => {
      const targetKg = getTargetWeight(settings.targetBmi);
      return [
        formatDateTime(record.timestamp),
        getLocalDateKey(new Date(record.timestamp)),
        String(record.weightKg),
        settings.heightCm ? formatBmi(calcBmi(record.weightKg)) : "",
        settings.heightCm ? String(settings.heightCm) : "",
        settings.targetBmi ? String(settings.targetBmi) : "",
        targetKg ? formatWeightNumber(targetKg) : "",
        targetKg ? formatSignedNumber(record.weightKg - targetKg) : "",
      ];
    }),
  ];

  return rows
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n");
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

function normalizeImportedRow(row) {
  const timestampText = row[0];
  const weightKg = Number(row[2]);
  const heightCm = Number(row[4]);
  const targetBmi = Number(row[5]);

  if (!timestampText || !isValidWeight(weightKg)) {
    return null;
  }

  if (isValidHeight(heightCm) && isValidBmi(targetBmi)) {
    settings = { heightCm, targetBmi };
    heightInput.value = trimNumber(heightCm);
    targetBmiInput.value = trimNumber(targetBmi);
    persistSettings();
  }

  const timestamp = parseJaTimestamp(timestampText);
  if (!timestamp) {
    return null;
  }

  return { timestamp, weightKg };
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

function parseJaTimestamp(text) {
  const value = String(text).trim();
  const match = value.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})$/)
    || value.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/)
    || value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T\s](\d{1,2}):(\d{2})/);
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

function escapeCsvCell(value) {
  const text = String(value);
  if (!/[",\r\n]/.test(text)) {
    return text;
  }
  return `"${text.split("\"").join("\"\"")}"`;
}

function formatWeight(value) {
  return `${formatWeightNumber(value)}kg`;
}

function formatWeightDiff(value) {
  if (Math.abs(value) < 0.05) {
    return "達成";
  }
  return `${formatSignedNumber(value)}kg`;
}

function formatSignedNumber(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatWeightNumber(value)}`;
}

function formatWeightNumber(value) {
  return Number(value).toLocaleString("ja-JP", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatBmi(value) {
  return Number(value).toLocaleString("ja-JP", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function trimNumber(value) {
  return Number(value).toLocaleString("ja-JP", {
    maximumFractionDigits: 2,
    useGrouping: false,
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
  const [, month, day] = value.split("-");
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
