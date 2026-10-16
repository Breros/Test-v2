const STORAGE_KEY = "wiegemoment.entries.v1";
const DAYS_IN_WEEK = 7;
const MAX_HISTORY = 14;
const MS_PER_DAY = 86_400_000;

const form = document.querySelector("#entry-form");
const dateInput = document.querySelector("#entry-date");
const weightInput = document.querySelector("#entry-weight");
const saveButton = form.querySelector("button[type='submit']");
const saveButtonLabel = document.querySelector("#save-button-label");
const formMessage = document.querySelector("#form-message");
const storageError = document.querySelector("#storage-error");
const forecastDirection = document.querySelector("#forecast-direction");
const forecastChange = document.querySelector("#forecast-change");
const forecastCaption = document.querySelector("#forecast-caption");
const chartContainer = document.querySelector("#chart-container");
const chartLegend = document.querySelector("#chart-legend");
const historyList = document.querySelector("#history-list");
const exportButton = document.querySelector("#export-button");

const today = localDateString(new Date());
dateInput.max = today;
dateInput.value = today;
document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "numeric",
  month: "short",
}).format(new Date());

let entries = [];
let storageAvailable = true;

try {
  entries = loadEntries();
} catch (error) {
  storageAvailable = false;
  showStorageError(`Deine gespeicherten Daten konnten nicht gelesen werden. Es wurde nichts geändert. ${error.message}`);
  saveButton.disabled = true;
}

render();

dateInput.addEventListener("change", () => {
  const existing = entries.find((entry) => entry.date === dateInput.value);
  weightInput.value = existing ? formatInputNumber(existing.weight) : "";
  saveButtonLabel.textContent = existing ? "Eintrag aktualisieren" : "Eintrag speichern";
  formMessage.textContent = "";
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  formMessage.classList.remove("error");
  formMessage.textContent = "";

  const date = dateInput.value;
  const weight = Number(weightInput.value.replace(",", "."));
  if (!isValidDate(date) || date > today) {
    showFormMessage("Bitte wähle ein gültiges Datum bis einschließlich heute.", true);
    return;
  }
  if (!Number.isFinite(weight) || weight < 20 || weight > 500) {
    showFormMessage("Bitte gib ein Gewicht zwischen 20 und 500 kg ein.", true);
    return;
  }
  if (!storageAvailable) {
    showFormMessage("Speichern ist nicht möglich, solange der lokale Speicher nicht verfügbar ist.", true);
    return;
  }

  const nextEntries = entries.filter((entry) => entry.date !== date);
  nextEntries.push({ date, weight: roundToTenth(weight) });
  nextEntries.sort((a, b) => a.date.localeCompare(b.date));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
    entries = nextEntries;
    render();
    saveButtonLabel.textContent = "Eintrag aktualisieren";
    showFormMessage("Dein Eintrag ist gespeichert.");
  } catch (error) {
    showFormMessage(`Speichern fehlgeschlagen: ${error.message}`, true);
  }
});

exportButton.addEventListener("click", () => {
  if (entries.length === 0) return;
  const csvRows = [["Datum", "Gewicht (kg)"], ...entries.map(({ date, weight }) => [date, formatInputNumber(weight)])];
  const csv = `\uFEFF${csvRows.map((row) => row.map(escapeCsv).join(";")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "wiegemoment-eintraege.csv";
  link.click();
  URL.revokeObjectURL(url);
});

function loadEntries() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Die gespeicherten Einträge haben ein ungültiges Format.");
  const valid = parsed.every((entry) =>
    entry !== null &&
    typeof entry === "object" &&
    isValidDate(entry.date) &&
    Number.isFinite(entry.weight) &&
    entry.weight >= 20 &&
    entry.weight <= 500
  );
  if (!valid) throw new Error("Mindestens ein gespeicherter Eintrag ist ungültig.");
  const uniqueDates = new Set(parsed.map((entry) => entry.date));
  if (uniqueDates.size !== parsed.length) throw new Error("Es gibt doppelte Datumsangaben in den gespeicherten Einträgen.");
  return [...parsed].sort((a, b) => a.date.localeCompare(b.date));
}

function render() {
  renderForecast();
  renderChart();
  renderHistory();
  exportButton.disabled = entries.length === 0;
}

function renderForecast() {
  const trend = calculateTrend();
  if (entries.length < 2 || trend === null) {
    forecastDirection.textContent = entries.length === 0 ? "Noch kein Trend" : "Trend noch offen";
    forecastChange.innerHTML = "–<span> kg</span>";
    forecastCaption.textContent = entries.length === 0
      ? "Trage mindestens zwei Gewichte ein, um deinen Trend zu sehen."
      : "Ein weiterer Eintrag an einem anderen Tag zeigt dir deine erste Tendenz.";
    return;
  }

  const difference = trend.slope * DAYS_IN_WEEK;
  const roundedDifference = roundToTenth(difference);
  if (Math.abs(roundedDifference) < 0.1) {
    forecastDirection.textContent = "Voraussichtlich stabil";
    forecastChange.innerHTML = "±0,0<span> kg</span>";
    forecastCaption.textContent = "Wenn dein bisheriger Trend anhält, bleibt dein Gewicht in 7 Tagen etwa gleich.";
  } else {
    const gaining = roundedDifference > 0;
    forecastDirection.textContent = gaining ? "Mögliche Zunahme in 7 Tagen" : "Mögliche Abnahme in 7 Tagen";
    forecastChange.innerHTML = `${gaining ? "+" : "−"}${formatGermanNumber(Math.abs(roundedDifference))}<span> kg</span>`;
    const latest = entries.at(-1);
    const latestDate = latest.date === today ? "heute" : `am ${formatLongDate(latest.date)}`;
    forecastCaption.textContent = `Ausgehend von ${formatGermanNumber(latest.weight)} kg ${latestDate} und deinem bisherigen Trend.`;
  }
}

function calculateTrend() {
  if (entries.length < 2) return null;
  const recent = entries.slice(-MAX_HISTORY);
  const firstDay = dateToDay(recent[0].date);
  const points = recent.map((entry) => ({
    day: dateToDay(entry.date) - firstDay,
    weight: entry.weight,
  }));
  const meanDay = points.reduce((sum, point) => sum + point.day, 0) / points.length;
  const meanWeight = points.reduce((sum, point) => sum + point.weight, 0) / points.length;
  const numerator = points.reduce((sum, point) => sum + (point.day - meanDay) * (point.weight - meanWeight), 0);
  const denominator = points.reduce((sum, point) => sum + (point.day - meanDay) ** 2, 0);
  if (denominator === 0) return null;
  return { slope: numerator / denominator };
}

function renderChart() {
  if (entries.length === 0) {
    chartContainer.innerHTML = `<div class="empty-chart">
      <span class="empty-chart-icon" aria-hidden="true">
        <svg viewBox="0 0 40 40" fill="none"><path d="M7 31V9m0 22h27M12 25l7-8 6 4 9-11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
      <p>Deine ersten Einträge erscheinen hier.</p>
    </div>`;
    chartLegend.hidden = true;
    return;
  }

  const trend = calculateTrend();
  const actual = entries.slice(-MAX_HISTORY).map((entry) => ({ date: entry.date, weight: entry.weight }));
  const latest = entries.at(-1);
  const forecast = trend
    ? Array.from({ length: DAYS_IN_WEEK }, (_, index) => {
      const date = addDays(latest.date, index + 1);
      return { date, weight: latest.weight + trend.slope * (index + 1) };
    })
    : [];
  const points = [...actual, ...forecast];
  const firstDay = dateToDay(points[0].date);
  const lastDay = dateToDay(points.at(-1).date);
  const minWeight = Math.min(...points.map((point) => point.weight));
  const maxWeight = Math.max(...points.map((point) => point.weight));
  const padding = Math.max((maxWeight - minWeight) * 0.2, 0.5);
  const low = minWeight - padding;
  const high = maxWeight + padding;
  const width = 640;
  const height = 190;
  const margin = { top: 12, right: 10, bottom: 27, left: 39 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const x = (date) => margin.left + ((dateToDay(date) - firstDay) / Math.max(1, lastDay - firstDay)) * plotWidth;
  const y = (weight) => margin.top + ((high - weight) / (high - low)) * plotHeight;
  const actualLine = actual.map((point) => `${x(point.date)},${y(point.weight)}`).join(" ");
  const forecastLine = trend
    ? `${x(latest.date)},${y(latest.weight)} ${forecast.map((point) => `${x(point.date)},${y(point.weight)}`).join(" ")}`
    : "";
  const labels = [0, 1, 2].map((index) => {
    const value = high - ((high - low) * index) / 2;
    const position = margin.top + (plotHeight * index) / 2;
    return `<line x1="${margin.left}" y1="${position}" x2="${width - margin.right}" y2="${position}" stroke="#edf0eb" stroke-width="1"/>
      <text x="${margin.left - 8}" y="${position + 3}" text-anchor="end" fill="#929b93" font-size="9">${formatGermanNumber(value, 1)}</text>`;
  }).join("");
  const dateLabels = Array.from(new Set([actual[0].date, latest.date, forecast.at(-1)?.date].filter(Boolean)))
    .map((date) => `<text x="${x(date)}" y="${height - 3}" text-anchor="${date === actual[0].date ? "start" : date === forecast.at(-1)?.date ? "end" : "middle"}" fill="#929b93" font-size="9">${formatChartDate(date)}</text>`)
    .join("");
  const circles = actual.map((point, index) => {
    const isLatest = index === actual.length - 1;
    return `<circle cx="${x(point.date)}" cy="${y(point.weight)}" r="${isLatest ? 4 : 3}" fill="${isLatest ? "#fff" : "#315f46"}" stroke="#315f46" stroke-width="2"/>`;
  }).join("");
  const label = trend
    ? `Gewichtsverlauf und 7-Tage-Prognose, ${actual.length} gespeicherte Einträge`
    : `Gewichtsverlauf, ${actual.length} gespeicherte Einträge`;

  chartContainer.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">
    ${labels}
    ${forecastLine ? `<polyline points="${forecastLine}" fill="none" stroke="#b47742" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
    <polyline points="${actualLine}" fill="none" stroke="#315f46" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${circles}
    ${dateLabels}
  </svg>`;
  chartLegend.hidden = false;
  chartLegend.lastElementChild.hidden = !trend;
}

function renderHistory() {
  if (entries.length === 0) {
    historyList.innerHTML = `<p class="empty-history">Noch keine Einträge. Dein erster Schritt muss nicht groß sein.</p>`;
    return;
  }
  const rows = entries.slice(-7).reverse().map(({ date, weight }) => {
    const label = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "long" })
      .format(parseLocalDate(date));
    const relative = date === today ? "Heute" : date === addDays(today, -1) ? "Gestern" : "";
    return `<div class="history-row">
      <span class="history-date">${label}${relative ? `<small>${relative}</small>` : ""}</span>
      <span class="history-value">${formatGermanNumber(weight)} <span>kg</span></span>
    </div>`;
  }).join("");
  historyList.innerHTML = rows;
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateToDay(date) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

function addDays(date, amount) {
  const result = parseLocalDate(date);
  result.setDate(result.getDate() + amount);
  return localDateString(result);
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseLocalDate(value);
  return localDateString(parsed) === value;
}

function roundToTenth(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function formatInputNumber(value) {
  return String(value).replace(".", ",");
}

function formatGermanNumber(value, digits = 1) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function formatChartDate(date) {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(parseLocalDate(date));
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long" }).format(parseLocalDate(date));
}

function escapeCsv(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function showFormMessage(message, isError = false) {
  formMessage.textContent = message;
  formMessage.classList.toggle("error", isError);
}

function showStorageError(message) {
  storageError.textContent = message;
  storageError.hidden = false;
}

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("./service-worker.js").catch((error) => {
    console.error("Der Offline-Modus konnte nicht aktiviert werden.", error);
  });
}
