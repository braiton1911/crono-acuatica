const LANE_COUNT = 5;
const STORAGE_KEY = "CRONO_ACUATICA_V5";

const els = {
  label: document.getElementById("label"),
  distance: document.getElementById("distance"),
  totalSeries: document.getElementById("totalSeries"),

  btnBuild: document.getElementById("btnBuild"),
  btnStart: document.getElementById("btnStart"),
  btnStop: document.getElementById("btnStop"),
  btnUndo: document.getElementById("btnUndo"),
  btnNextSeries: document.getElementById("btnNextSeries"),
  btnReport: document.getElementById("btnReport"),
  btnExport: document.getElementById("btnExport"),
  btnClearAll: document.getElementById("btnClearAll"),

  statusText: document.getElementById("statusText"),
  lastMsg: document.getElementById("lastMsg"),
  pillState: document.getElementById("pillState"),

  lanes: document.getElementById("lanes"),
  cfg: [1,2,3,4,5].map(i => document.getElementById("cfg"+i)),

  chrono: document.getElementById("chrono"),
  chronoHint: document.getElementById("chronoHint"),

  reportSection: document.getElementById("reportSection"),
  reportBody: document.getElementById("reportBody"),
  reportSub: document.getElementById("reportSub"),
  btnHideReport: document.getElementById("btnHideReport"),
  btnExport2: document.getElementById("btnExport2"),

  historyList: document.getElementById("historyList"),
};

let chronoTimer = null;
let state = loadState() || newState();

function newState(){
  return {
    running: false,

    config: {
      label: "",
      distanceM: 100,
      totalSeries: 20,
      lanes: Array.from({length: LANE_COUNT}, () => ({ swimmerCount: 0 })),
    },

    // “serie actual” dentro del bloque (1..total)
    currentSeriesNumber: 1,

    // historial de series realizadas (cada una es independiente)
    series: [],

    activeSeriesId: null
  };
}

function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch{ return null; }
}

function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }
function uuid(){ return crypto.randomUUID(); }

function formatMs(ms){
  ms = Math.max(0, Math.floor(ms));
  const totalSec = Math.floor(ms/1000);
  const min = Math.floor(totalSec/60);
  const sec = totalSec % 60;
  const cent = Math.floor((ms%1000)/10);
  return `${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}.${String(cent).padStart(2,"0")}`;
}

function laneLabel(li){ return `Carril ${li+1}`; }

function setStatus(text, msg){
  els.statusText.textContent = text;
  els.pillState.textContent = text;
  if (msg) els.lastMsg.textContent = msg;
}

function getActiveSeries(){
  if(!state.activeSeriesId) return null;
  return state.series.find(s => s.id === state.activeSeriesId) || null;
}

function anyLaneConfigured(){
  return state.config.lanes.some(l => (l.swimmerCount || 0) > 0);
}

function autoSeriesLabel(){
  const d = Number(els.distance.value) || state.config.distanceM || 100;
  const t = clamp(Number(els.totalSeries.value || 20), 1, 20);
  const n = clamp(Number(state.currentSeriesNumber || 1), 1, t);
  // etiqueta base opcional + serie
  const base = (els.label.value || state.config.label || "").trim();
  const main = `Serie ${n}/${t} · ${d} m`;
  return base ? `${main} · ${base}` : main;
}

/* -----------------------
   Cronómetro visible
----------------------- */
function startChronoLoop(){
  stopChronoLoop();
  chronoTimer = setInterval(() => {
    const s = getActiveSeries();
    if(!s || !s.startMs) return;
    const base = s.stopMs ? s.stopMs : Date.now();
    els.chrono.textContent = formatMs(base - s.startMs);
  }, 50);
}
function stopChronoLoop(){
  if(chronoTimer){
    clearInterval(chronoTimer);
    chronoTimer = null;
  }
}

/* -----------------------
   UI: selector series (1..20) mostrando “x100”
----------------------- */
function fillTotalSeriesSelect(){
  const d = Number(els.distance.value) || 100;
  const current = Number(els.totalSeries.value || state.config.totalSeries || 20);
  els.totalSeries.innerHTML = "";
  for(let i=1; i<=20; i++){
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = i === 1 ? `1 serie x${d}` : `${i} series x${d}`;
    if(i === current) opt.selected = true;
    els.totalSeries.appendChild(opt);
  }
}

/* -----------------------
   Config
----------------------- */
function syncConfigFromUI(){
  state.config.label = (els.label.value || "").trim();
  state.config.distanceM = Number(els.distance.value) || 100;
  state.config.totalSeries = clamp(Number(els.totalSeries.value || 20), 1, 20);

  for(let li=0; li<LANE_COUNT; li++){
    state.config.lanes[li].swimmerCount = clamp(Number(els.cfg[li].value || 0), 0, 10);
  }

  // ajustar currentSeriesNumber al rango
  state.currentSeriesNumber = clamp(Number(state.currentSeriesNumber || 1), 1, state.config.totalSeries);
}

/* -----------------------
   Crear serie (una repetición real)
----------------------- */
function createSeries(){
  const id = uuid();
  const distanceM = Number(els.distance.value) || state.config.distanceM || 100;
  const total = clamp(Number(els.totalSeries.value || state.config.totalSeries || 20), 1, 20);
  const n = clamp(Number(state.currentSeriesNumber || 1), 1, total);

  const lanes = Array.from({length: LANE_COUNT}, (_, li) => ({
    swimmerCount: clamp(Number(els.cfg[li].value || state.config.lanes[li].swimmerCount || 0), 0, 10),
    nextArrivalIndex: 1
  }));

  return {
    id,
    createdAtIso: new Date().toISOString(),
    label: autoSeriesLabel(),
    distanceM,
    totalSeries: total,
    seriesNumber: n,
    startMs: null,
    stopMs: null,
    lanes,
    log: [],
    events: []
  };
}

/* -----------------------
   Iniciar/Detener serie actual
----------------------- */
function startSeries(){
  syncConfigFromUI();
  saveState();

  if(!anyLaneConfigured()){
    alert("Configurá al menos un carril con nadadores.");
    return;
  }

  const s = createSeries();
  s.startMs = Date.now();

  state.series.unshift(s);
  state.activeSeriesId = s.id;
  state.running = true;

  hideReport();

  saveState();
  render();

  setStatus("EN CURSO", `⏱️ Iniciada ${s.label}. Registrá llegadas por carril.`);
  els.chronoHint.textContent = `Corriendo: ${s.label}`;
  startChronoLoop();
}

function stopSeries(){
  const s = getActiveSeries();
  if(!s){
    state.running = false;
    saveState();
    render();
    setStatus("DETENIDA", "No hay serie activa.");
    els.chronoHint.textContent = "Listo para iniciar";
    return;
  }

  s.stopMs = Date.now();
  state.running = false;

  saveState();
  render();

  setStatus("DETENIDA", `Serie ${s.seriesNumber}/${s.totalSeries} detenida. Descanso y prepará la siguiente.`);
  els.chronoHint.textContent = `Detenida: ${s.label}`;
  startChronoLoop();
}

/* -----------------------
   Preparar serie siguiente (SIN iniciar)
----------------------- */
function prepareNextSeries(){
  if(state.running){
    alert("Primero detené la serie actual.");
    return;
  }
  syncConfigFromUI();
  const total = state.config.totalSeries;
  const next = clamp(state.currentSeriesNumber + 1, 1, total);
  state.currentSeriesNumber = next;

  saveState();
  render();
  setStatus("DETENIDA", `Lista Serie ${next}/${total}. Tocá “Iniciar Serie” cuando vuelvan a largar.`);
  els.chrono.textContent = "00:00.00";
  els.chronoHint.textContent = `Lista: ${autoSeriesLabel()}`;
}

/* -----------------------
   Llegadas
----------------------- */
function ensureRunning(){
  if(!state.running){
    alert("Primero iniciá la serie.");
    return false;
  }
  return true;
}

function recordArrival(li, cardEl, btnEl){
  if(!ensureRunning()) return;

  const s = getActiveSeries();
  if(!s) return;

  const lane = s.lanes[li];
  if(!lane || lane.swimmerCount <= 0){
    setStatus("EN CURSO", `⚠️ ${laneLabel(li)} sin nadadores.`);
    return;
  }

  if(lane.nextArrivalIndex > lane.swimmerCount){
    setStatus("EN CURSO", `🏁 ${laneLabel(li)}: ya registraste las ${lane.swimmerCount} llegadas.`);
    return;
  }

  const now = Date.now();
  const timeMs = now - s.startMs;
  const swimmer = lane.nextArrivalIndex;

  s.log.push({
    timestampIso: new Date(now).toISOString(),
    seriesId: s.id,
    seriesLabel: s.label,
    distanceM: s.distanceM,
    lane: li+1,
    swimmer,
    event: "LLEGADA",
    timeMs,
    time: formatMs(timeMs)
  });

  s.events.push({ type:"arrival", li, swimmer });
  lane.nextArrivalIndex += 1;

  if(btnEl){
    btnEl.classList.remove("pulse"); void btnEl.offsetWidth; btnEl.classList.add("pulse");
  }
  if(cardEl){
    cardEl.classList.remove("flash"); void cardEl.offsetWidth; cardEl.classList.add("flash");
  }

  saveState();
  render();
  setStatus("EN CURSO", `✅ ${laneLabel(li)} — Nadador ${swimmer} — ${formatMs(timeMs)}`);
}

function undoSmart(){
  const s = getActiveSeries();
  if(!s || s.events.length === 0){
    setStatus(state.running ? "EN CURSO" : "DETENIDA", "No hay nada para deshacer.");
    return;
  }

  const ev = s.events.pop();
  if(ev.type === "arrival"){
    const lane = s.lanes[ev.li];
    for(let i=s.log.length-1; i>=0; i--){
      const r = s.log[i];
      if(r.lane === ev.li+1 && r.event === "LLEGADA" && r.swimmer === ev.swimmer){
        s.log.splice(i,1);
        break;
      }
    }
    lane.nextArrivalIndex = Math.max(1, lane.nextArrivalIndex - 1);
    saveState();
    render();
    setStatus(state.running ? "EN CURSO" : "DETENIDA", `↩ Deshecha llegada en ${laneLabel(ev.li)} (Nadador ${ev.swimmer}).`);
    if(!els.reportSection.classList.contains("hidden")) showReport(s.id, true);
  }
}

/* -----------------------
   Informe + CSV
----------------------- */
function hideReport(){ els.reportSection.classList.add("hidden"); }

function showReport(seriesId, refreshOnly=false){
  const s = state.series.find(x => x.id === seriesId) || getActiveSeries();
  if(!s || s.log.length === 0){
    alert("Aún no hay registros para mostrar.");
    return;
  }

  const when = new Date(s.createdAtIso).toLocaleString();
  els.reportSub.textContent = `${when} · ${s.label}`;
  els.reportBody.innerHTML = buildReportHtml(s);
  els.reportSection.classList.remove("hidden");
  els.btnExport2.onclick = () => exportCSV(s.id);

  if(!refreshOnly){
els.reportSection.scrollIntoView({behavior:"smooth", block:"center"});

  }
}

function buildReportHtml(s){
  const rows = [...s.log].sort((a,b) => (a.lane-b.lane) || (a.swimmer-b.swimmer));
  const byLane = new Map();
  for(const r of rows){
    if(!byLane.has(r.lane)) byLane.set(r.lane, []);
    byLane.get(r.lane).push(r);
  }

  const totalReg = rows.length;
  const totalEsperado = s.lanes.reduce((acc,l)=>acc+(l.swimmerCount||0),0);

  let bestOverall = null;
  for(const r of rows){
    if(!bestOverall || r.timeMs < bestOverall.timeMs) bestOverall = r;
  }

  let html = `<div class="kpiRow">`;

  if(bestOverall){
    html += `
      <div class="kpi">
        <div class="kpiLabel">Mejor tiempo general</div>
        <div class="kpiValue">${formatMs(bestOverall.timeMs)} (Carril ${bestOverall.lane} · Nadador ${bestOverall.swimmer})</div>
      </div>`;
  }

  html += `
      <div class="kpi">
        <div class="kpiLabel">Registros</div>
        <div class="kpiValue">${totalReg} / ${totalEsperado}</div>
      </div>
    </div>`;

  for(let li=0; li<LANE_COUNT; li++){
    const laneNum = li+1;
    const configured = s.lanes[li].swimmerCount || 0;
    const regs = byLane.get(laneNum) || [];
    const faltan = Math.max(0, configured - regs.length);

    let bestLane = null;
    for(const r of regs){
      if(!bestLane || r.timeMs < bestLane.timeMs) bestLane = r;
    }

    html += `
      <div class="reportCard">
        <div class="reportTitle">
          Carril ${laneNum} · Configurados: ${configured} · Registrados: ${regs.length}
          ${bestLane ? ` · Mejor: ${formatMs(bestLane.timeMs)}` : ""}
        </div>
        <table class="table">
          <thead><tr><th>Nadador</th><th>Tiempo</th></tr></thead>
          <tbody>
            ${
              regs.length
                ? regs.map(r => `<tr><td>Nadador ${r.swimmer}</td><td>${r.time}</td></tr>`).join("")
                : `<tr><td colspan="2">Sin registros</td></tr>`
            }
          </tbody>
        </table>
        ${faltan > 0 ? `<div class="warn">Faltan ${faltan} llegadas por registrar.</div>` : ""}
      </div>`;
  }

  return html;
}

function exportCSV(seriesId){
  const s = state.series.find(x => x.id === seriesId) || getActiveSeries();
  if(!s || s.log.length === 0){
    alert("No hay datos para exportar en esta serie.");
    return;
  }

  const headers = ["FechaHoraISO","IdSerie","EtiquetaSerie","DistanciaM","Carril","Nadador","Evento","TiempoMs","Tiempo"];
  const lines = [headers.join(",")];

  for(const r of s.log){
    const line = [
      r.timestampIso, r.seriesId, r.seriesLabel || "", r.distanceM,
      r.lane, r.swimmer, r.event, r.timeMs, r.time
    ].map(v => `"${String(v).replaceAll('"','""')}"`).join(",");
    lines.push(line);
  }

  const blob = new Blob([lines.join("\n")], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0,19).replaceAll(":","-");
  a.href = url;
  a.download = `crono_acuatica_${stamp}_${(s.label||"serie").replaceAll(" ","_")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus(state.running ? "EN CURSO" : "DETENIDA", "📄 CSV exportado.");
}

/* -----------------------
   Historial
----------------------- */
function renderHistory(){
  els.historyList.innerHTML = "";

  if(state.series.length === 0){
    els.historyList.innerHTML = `
      <div class="histItem">
        <div class="histName">Sin series guardadas</div>
        <div class="histMeta">Cuando detengas una serie, quedará aquí.</div>
      </div>`;
    return;
  }

  const max = Math.min(12, state.series.length);
  for(let i=0; i<max; i++){
    const s = state.series[i];
    const when = new Date(s.createdAtIso).toLocaleString();
    const regs = s.log.length;
    const expected = s.lanes.reduce((acc,l)=>acc+(l.swimmerCount||0),0);

    const item = document.createElement("div");
    item.className = "histItem";
    item.innerHTML = `
      <div class="histName">${s.label}</div>
      <div class="histMeta">${when} · Registros ${regs}/${expected}</div>
      <div class="histBtns">
        <button class="miniBtn primaryMini" data-act="view">Ver informe</button>
        <button class="miniBtn" data-act="csv">Exportar CSV</button>
      </div>`;
    item.querySelector('[data-act="view"]').onclick = () => showReport(s.id, false);
    item.querySelector('[data-act="csv"]').onclick = () => exportCSV(s.id);
    els.historyList.appendChild(item);
  }
}

/* -----------------------
   Render carriles
----------------------- */
function render(){
  const active = getActiveSeries();

  els.btnReport.disabled = !(active && active.log.length > 0);
  els.btnExport.disabled = !(active && active.log.length > 0);

  els.lanes.innerHTML = "";

  for(let li=0; li<LANE_COUNT; li++){
    const card = document.createElement("section");
    card.className = "laneCard";

    const swimmers = active ? active.lanes[li].swimmerCount : state.config.lanes[li].swimmerCount;

    const title = document.createElement("div");
    title.className = "laneTitle";
    title.textContent = `${laneLabel(li)} · Nadadores: ${swimmers}`;
    card.appendChild(title);

    const badge = document.createElement("div");
    badge.className = "badge";
    const dot = document.createElement("span"); dot.className = "dot";
    const txt = document.createElement("span");

    let done = false;
    if(active){
      done = swimmers > 0 && (active.lanes[li].nextArrivalIndex > swimmers);
      const next = active.lanes[li].swimmerCount > 0 ? Math.min(active.lanes[li].nextArrivalIndex, swimmers) : 0;
      txt.textContent = swimmers > 0 ? (done ? "Todas las llegadas registradas" : `Próxima llegada: Nadador ${next}`) : "Sin nadadores";
    }else{
      txt.textContent = swimmers > 0 ? "Listo (sin iniciar)" : "Sin nadadores";
    }

    badge.appendChild(dot); badge.appendChild(txt);
    card.appendChild(badge);

    const btns = document.createElement("div");
    btns.className = "laneBtns";

    const bArrival = document.createElement("button");
    bArrival.className = "bigBtn";
    bArrival.textContent = "Registrar llegada ✅";

    bArrival.disabled = !active || !state.running || done || swimmers <= 0;
    bArrival.onclick = () => recordArrival(li, card, bArrival);

    btns.appendChild(bArrival);
    card.appendChild(btns);

    const info = document.createElement("div");
    info.className = "small";
    if(active){
      if(done) card.classList.add("done");
      const registered = Math.max(0, active.lanes[li].nextArrivalIndex - 1);
      info.textContent = `Registradas: ${registered}/${swimmers} · ${state.running ? "Serie en curso" : "Serie detenida"}`;
    }else{
      info.textContent = "Esperando largada.";
    }
    card.appendChild(info);

    els.lanes.appendChild(card);
  }

  renderHistory();
  saveState();
}

/* -----------------------
   Borrar todo
----------------------- */
function clearAll(){
  if(!confirm("¿Seguro que querés borrar TODO (historial completo)?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = newState();
  saveState();
  hideReport();
  stopChronoLoop();
  els.chrono.textContent = "00:00.00";
  els.chronoHint.textContent = "Listo para iniciar";
  setStatus("DETENIDA", "Todo borrado.");
  render();
}

/* -----------------------
   Eventos UI
----------------------- */
els.btnBuild.addEventListener("click", () => {
  syncConfigFromUI();
  saveState();
  render();
  setStatus(state.running ? "EN CURSO" : "DETENIDA", "Carriles generados.");
});

els.btnStart.addEventListener("click", startSeries);
els.btnStop.addEventListener("click", stopSeries);
els.btnUndo.addEventListener("click", undoSmart);
els.btnNextSeries.addEventListener("click", prepareNextSeries);

els.btnReport.addEventListener("click", () => {
  const a = getActiveSeries();
  if(a) showReport(a.id, false);
});

els.btnExport.addEventListener("click", () => {
  const a = getActiveSeries();
  if(a) exportCSV(a.id);
});

els.btnHideReport.addEventListener("click", hideReport);
els.btnExport2.addEventListener("click", () => {
  const a = getActiveSeries();
  if(a) exportCSV(a.id);
});

els.btnClearAll.addEventListener("click", clearAll);

els.distance.addEventListener("change", () => {
  fillTotalSeriesSelect();
  syncConfigFromUI();
  saveState();
  render();
});

els.totalSeries.addEventListener("change", () => {
  syncConfigFromUI();
  saveState();
  render();
});

/* Inicial */
fillTotalSeriesSelect();
syncConfigFromUI();
saveState();

setStatus(state.running ? "EN CURSO" : "DETENIDA", "Listo.");
els.chronoHint.textContent = "Configurá carriles → iniciar serie.";
startChronoLoop();
render();

/* PWA offline */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
}

