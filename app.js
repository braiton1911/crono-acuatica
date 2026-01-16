const LANE_COUNT = 5;
const STORAGE_KEY = "CRONO_ACUATICA_V3";

const els = {
  label: document.getElementById("label"),
  totalSeries: document.getElementById("totalSeries"),
  distance: document.getElementById("distance"),

  btnBuild: document.getElementById("btnBuild"),
  btnStart: document.getElementById("btnStart"),
  btnStop: document.getElementById("btnStop"),
  btnUndo: document.getElementById("btnUndo"),
  btnDuplicate: document.getElementById("btnDuplicate"),
  btnNewSeries: document.getElementById("btnNewSeries"),
  btnReport: document.getElementById("btnReport"),
  btnExport: document.getElementById("btnExport"),
  btnClearAll: document.getElementById("btnClearAll"),

  statusText: document.getElementById("statusText"),
  lastMsg: document.getElementById("lastMsg"),
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

let state = loadState() || newState();
let chronoTimer = null;

function newState(){
  return {
    running: false,

    config: {
      distanceM: 100,
      label: "",
      totalSeries: 20,
      nextSeriesNumber: 1, // ← aquí vive el contador (1..total)
      lanes: Array.from({length: LANE_COUNT}, () => ({ swimmerCount: 0 })),
    },

    activeSeriesId: null,

    series: []
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
function setStatus(text, msg){
  els.statusText.textContent = text;
  if (msg) els.lastMsg.textContent = msg;
}
function formatMs(ms){
  ms = Math.max(0, Math.floor(ms));
  const totalSec = Math.floor(ms/1000);
  const min = Math.floor(totalSec/60);
  const sec = totalSec % 60;
  const cent = Math.floor((ms%1000)/10);
  return `${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}.${String(cent).padStart(2,"0")}`;
}
function nowIso(){ return new Date().toISOString(); }
function laneLabel(li){ return `Carril ${li+1}`; }
function uuid(){ return crypto.randomUUID(); }

function getActiveSeries(){
  if(!state.activeSeriesId) return null;
  return state.series.find(s => s.id === state.activeSeriesId) || null;
}

function anyLaneConfigured(){
  return state.config.lanes.some(l => (l.swimmerCount || 0) > 0);
}

function laneIsDone(series, li){
  const lane = series.lanes[li];
  return lane.swimmerCount > 0 && (lane.nextArrivalIndex > lane.swimmerCount);
}

function nextArrivalNumber(series, li){
  const lane = series.lanes[li];
  if(!lane || lane.swimmerCount <= 0) return 0;
  return Math.min(lane.nextArrivalIndex, lane.swimmerCount);
}

/* =========================
   Cronómetro vivo
   ========================= */
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

/* =========================
   Etiqueta automática
   ========================= */
function autoLabel(distanceM, seriesNumber, totalSeries){
  return `${distanceM} m · Serie ${seriesNumber}/${totalSeries}`;
}

function ensureLabelFilled_(){
  const distanceM = Number(els.distance.value) || 100;
  const total = clamp(Number(els.totalSeries.value || state.config.totalSeries || 20), 1, 20);
  const n = clamp(Number(state.config.nextSeriesNumber || 1), 1, total);

  // Si el usuario dejó etiqueta vacía, la generamos
  if(!(els.label.value || "").trim()){
    els.label.value = autoLabel(distanceM, n, total);
  }
}

/* =========================
   Guardar config actual
   ========================= */
function buildLanes(){
  state.config.label = (els.label.value || "").trim();
  state.config.distanceM = Number(els.distance.value) || 100;
  state.config.totalSeries = clamp(Number(els.totalSeries.value || 20), 1, 20);

  for(let li=0; li<LANE_COUNT; li++){
    const count = clamp(Number(els.cfg[li].value || 0), 0, 10);
    state.config.lanes[li].swimmerCount = count;
  }

  saveState();
  render();
  setStatus(state.running ? "EN CURSO" : "DETENIDA", "Carriles generados. Ahora tocá “Iniciar serie”.");
}

/* =========================
   Crear serie desde config
   ========================= */
function createSeriesFromConfig_(){
  const id = uuid();
  const distanceM = Number(els.distance.value) || state.config.distanceM || 100;
  const total = clamp(Number(els.totalSeries.value || state.config.totalSeries || 20), 1, 20);
  const n = clamp(Number(state.config.nextSeriesNumber || 1), 1, total);

  ensureLabelFilled_();
  const label = (els.label.value || "").trim();

  const lanes = Array.from({length: LANE_COUNT}, (_, li) => ({
    swimmerCount: clamp(Number(els.cfg[li].value || state.config.lanes[li].swimmerCount || 0), 0, 10),
    nextArrivalIndex: 1
  }));

  return {
    id,
    createdAtIso: nowIso(),
    label,
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

/* =========================
   Iniciar / Detener
   ========================= */
function startSeries(){
  buildLanes();

  if(!anyLaneConfigured()){
    alert("Configurá al menos un carril con nadadores.");
    return;
  }

  // Si la etiqueta está vacía, auto etiqueta con N/TOTAL
  ensureLabelFilled_();

  const s = createSeriesFromConfig_();
  s.startMs = Date.now();

  state.series.unshift(s);
  state.activeSeriesId = s.id;
  state.running = true;

  hideReport();
  saveState();
  render();

  setStatus("EN CURSO", "⏱️ Tiempo iniciado. Registrá llegadas por carril.");
  els.chronoHint.textContent = `En curso (Serie ${s.seriesNumber}/${s.totalSeries})`;
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

  setStatus("DETENIDA", "Serie detenida. Podés duplicar para la siguiente o ver el informe.");
  els.chronoHint.textContent = `Detenida (Serie ${s.seriesNumber}/${s.totalSeries})`;
  startChronoLoop();
}

function ensureRunning(){
  if(!state.running){
    alert("Primero iniciá la serie.");
    return false;
  }
  return true;
}

/* =========================
   Registrar llegada
   ========================= */
function recordArrival(li){
  if(!ensureRunning()) return;

  const s = getActiveSeries();
  if(!s) return;

  const lane = s.lanes[li];
  if(!lane || lane.swimmerCount <= 0){
    setStatus("EN CURSO", `⚠️ ${laneLabel(li)} sin nadadores configurados.`);
    return;
  }

  if(lane.nextArrivalIndex > lane.swimmerCount){
    setStatus("EN CURSO", `🏁 ${laneLabel(li)}: ya registraste las ${lane.swimmerCount} llegadas.`);
    return;
  }

  const now = Date.now();
  const timeMs = now - s.startMs;
  const swimmerOrder = lane.nextArrivalIndex;

  const row = {
    timestampIso: new Date(now).toISOString(),
    seriesId: s.id,
    seriesLabel: s.label,
    distanceM: s.distanceM,
    lane: li+1,
    swimmer: swimmerOrder,
    event: "LLEGADA",
    timeMs,
    time: formatMs(timeMs)
  };

  s.log.push(row);
  s.events.push({ type:"arrival", li, swimmerOrder });
  lane.nextArrivalIndex += 1;

  saveState();
  render();

  setStatus("EN CURSO", `✅ ${laneLabel(li)} — Nadador ${swimmerOrder} — ${row.time}`);
}

/* =========================
   Deshacer
   ========================= */
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
      if(r.lane === ev.li+1 && r.event === "LLEGADA" && r.swimmer === ev.swimmerOrder){
        s.log.splice(i,1);
        break;
      }
    }

    lane.nextArrivalIndex = Math.max(1, lane.nextArrivalIndex - 1);

    saveState();
    render();
    setStatus(state.running ? "EN CURSO" : "DETENIDA", `↩ Deshecha llegada en ${laneLabel(ev.li)} (Nadador ${ev.swimmerOrder}).`);

    if(!els.reportSection.classList.contains("hidden")) showReport(s.id, true);
  }
}

/* =========================
   NUEVO: Duplicar serie (sube contador)
   ========================= */
function duplicateSeries(){
  if(state.running){
    alert("Primero detené la serie actual.");
    return;
  }

  const total = clamp(Number(els.totalSeries.value || state.config.totalSeries || 20), 1, 20);

  // Subir contador hasta total
  const next = clamp(Number(state.config.nextSeriesNumber || 1), 1, total);
  const newN = clamp(next + 1, 1, total);

  state.config.totalSeries = total;
  state.config.nextSeriesNumber = newN;

  // Ajustar etiqueta automática para la siguiente serie
  const distanceM = Number(els.distance.value) || state.config.distanceM || 100;
  els.label.value = autoLabel(distanceM, newN, total);

  saveState();
  render();
  setStatus("DETENIDA", `📌 Preparada ${distanceM} m · Serie ${newN}/${total}. Tocá “Iniciar serie”.`);
  els.chrono.textContent = "00:00.00";
  els.chronoHint.textContent = `Listo (Serie ${newN}/${total})`;
}

/* =========================
   Nueva serie (solo reset visual)
   ========================= */
function newSeriesQuick(){
  if(state.running){
    alert("Primero detené la serie actual.");
    return;
  }
  els.label.value = "";
  els.chrono.textContent = "00:00.00";
  els.chronoHint.textContent = "Listo para iniciar";
  setStatus("DETENIDA", "Listo. Configurá (si hace falta) y tocá “Iniciar serie”.");
}

/* =========================
   CSV (por serie)
   ========================= */
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
  a.download = `crono_acuatica_${stamp}_${(s.label || "serie").replaceAll(" ","_")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  setStatus(state.running ? "EN CURSO" : "DETENIDA", "📄 CSV exportado.");
}

/* =========================
   Informe
   ========================= */
function hideReport(){ els.reportSection.classList.add("hidden"); }

function showReport(seriesId, refreshOnly=false){
  const s = state.series.find(x => x.id === seriesId) || getActiveSeries();
  if(!s || s.log.length === 0){
    alert("Aún no hay registros para mostrar.");
    return;
  }

  const when = new Date(s.createdAtIso).toLocaleString();
  els.reportSub.textContent = `Serie ${s.seriesNumber}/${s.totalSeries} · ${when} · ${s.distanceM} m · ${s.label || "Sin etiqueta"}`;

  els.reportBody.innerHTML = buildReportHtml_(s);
  els.reportSection.classList.remove("hidden");
  els.btnExport2.onclick = () => exportCSV(s.id);

  if(!refreshOnly){
    els.reportSection.scrollIntoView({behavior:"smooth", block:"start"});
  }
}

function buildReportHtml_(s){
  const rows = [...s.log].sort((a,b) => (a.lane-b.lane) || (a.swimmer-b.swimmer));

  const byLane = new Map();
  for(const r of rows){
    if(!byLane.has(r.lane)) byLane.set(r.lane, []);
    byLane.get(r.lane).push(r);
  }

  let bestOverall = null;
  for(const r of rows){
    if(!bestOverall || r.timeMs < bestOverall.timeMs) bestOverall = r;
  }

  const totalReg = rows.length;
  const totalEsperado = s.lanes.reduce((acc, l) => acc + (l.swimmerCount || 0), 0);

  let html = `<div class="kpiRow">`;

  if(bestOverall){
    html += `
      <div class="kpi">
        <div class="kpiLabel">Mejor tiempo general</div>
        <div class="kpiValue">${formatMs(bestOverall.timeMs)} (Carril ${bestOverall.lane} · Nadador ${bestOverall.swimmer})</div>
      </div>
    `;
  }

  html += `
    <div class="kpi">
      <div class="kpiLabel">Registros</div>
      <div class="kpiValue">${totalReg} / ${totalEsperado}</div>
    </div>
  `;
  html += `</div>`;

  for(let li=0; li<LANE_COUNT; li++){
    const laneNum = li+1;
    const configured = s.lanes[li].swimmerCount || 0;
    const regs = byLane.get(laneNum) || [];

    let bestLane = null;
    for(const r of regs){
      if(!bestLane || r.timeMs < bestLane.timeMs) bestLane = r;
    }

    const faltan = Math.max(0, configured - regs.length);

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
      </div>
    `;
  }

  return html;
}

/* =========================
   Historial
   ========================= */
function renderHistory(){
  els.historyList.innerHTML = "";

  if(state.series.length === 0){
    els.historyList.innerHTML = `<div class="histItem"><div class="histName">Sin series guardadas</div><div class="histMeta">Cuando detengas una serie, quedará aquí.</div></div>`;
    return;
  }

  const max = Math.min(12, state.series.length);
  for(let i=0; i<max; i++){
    const s = state.series[i];
    const when = new Date(s.createdAtIso).toLocaleString();
    const label = s.label ? s.label : "Sin etiqueta";
    const regs = s.log.length;
    const expected = s.lanes.reduce((acc,l)=>acc+(l.swimmerCount||0),0);

    const item = document.createElement("div");
    item.className = "histItem";

    item.innerHTML = `
      <div class="histTop">
        <div>
          <div class="histName">${label}</div>
          <div class="histMeta">Serie ${s.seriesNumber}/${s.totalSeries} · ${when} · ${s.distanceM} m · Registros ${regs}/${expected}</div>
        </div>
      </div>
      <div class="histBtns">
        <button class="miniBtn primaryMini" data-act="view">Ver informe</button>
        <button class="miniBtn" data-act="csv">Exportar CSV</button>
        <button class="miniBtn dangerMini" data-act="del">Borrar</button>
      </div>
    `;

    item.querySelector('[data-act="view"]').onclick = () => showReport(s.id, false);
    item.querySelector('[data-act="csv"]').onclick = () => exportCSV(s.id);
    item.querySelector('[data-act="del"]').onclick = () => deleteSeries(s.id);

    els.historyList.appendChild(item);
  }
}

function deleteSeries(id){
  if(!confirm("¿Borrar esta serie del historial?")) return;
  state.series = state.series.filter(s => s.id !== id);

  if(state.activeSeriesId === id){
    state.activeSeriesId = null;
    state.running = false;
  }

  saveState();
  render();
}

/* =========================
   Render UI
   ========================= */
function render(){
  const active = getActiveSeries();

  // Botones panel
  els.btnReport.disabled = !(active && active.log.length > 0);
  els.btnExport.disabled = !(active && active.log.length > 0);

  // Carriles
  els.lanes.innerHTML = "";

  for(let li=0; li<LANE_COUNT; li++){
    const card = document.createElement("section");
    card.className = "laneCard";

    const title = document.createElement("div");
    title.className = "laneTitle";
    title.textContent = `${laneLabel(li)} · Nadadores: ${active ? active.lanes[li].swimmerCount : state.config.lanes[li].swimmerCount}`;
    card.appendChild(title);

    const badge = document.createElement("div");
    badge.className = "badge";
    const dot = document.createElement("span");
    dot.className = "dot";
    const txt = document.createElement("span");

    let done = false;

    if(active){
      done = laneIsDone(active, li);
      const next = nextArrivalNumber(active, li);
      const configured = active.lanes[li].swimmerCount;

      txt.textContent = configured > 0
        ? (done ? "Todas las llegadas registradas" : `Próxima llegada: Nadador ${next}`)
        : "Sin nadadores";
    }else{
      const configured = state.config.lanes[li].swimmerCount;
      txt.textContent = configured > 0 ? "Listo (sin iniciar)" : "Sin nadadores";
    }

    badge.appendChild(dot);
    badge.appendChild(txt);
    card.appendChild(badge);

    const btns = document.createElement("div");
    btns.className = "laneBtns";

    const bArrival = document.createElement("button");
    bArrival.className = "bigBtn";
    bArrival.textContent = "Registrar llegada ✅";

    const disabled = !active || !state.running || done || (active && active.lanes[li].swimmerCount <= 0);
    bArrival.disabled = disabled;

    bArrival.onclick = () => recordArrival(li);

    btns.appendChild(bArrival);
    card.appendChild(btns);

    const info = document.createElement("div");
    info.className = "small";
    if(active){
      if(done) card.classList.add("done");
      const registered = Math.max(0, active.lanes[li].nextArrivalIndex - 1);
      const configured = active.lanes[li].swimmerCount;
      info.textContent = `Registradas: ${registered}/${configured} · Distancia: ${active.distanceM} m · ${state.running ? "Serie en curso" : "Serie detenida"}`;
    }else{
      info.textContent = `Configurá carriles y tocá “Iniciar serie”.`;
    }
    card.appendChild(info);

    els.lanes.appendChild(card);
  }

  renderHistory();
  saveState();
}

/* =========================
   Borrar todo
   ========================= */
function clearAll(){
  if(!confirm("¿Seguro que querés borrar TODO (todas las series e historial)?")) return;
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

/* =========================
   Eventos
   ========================= */
els.btnBuild.addEventListener("click", buildLanes);
els.btnStart.addEventListener("click", startSeries);
els.btnStop.addEventListener("click", stopSeries);
els.btnUndo.addEventListener("click", undoSmart);
els.btnDuplicate.addEventListener("click", duplicateSeries);
els.btnNewSeries.addEventListener("click", newSeriesQuick);

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

// Si cambian distancia/total series y la etiqueta está vacía, prellenar
els.distance.addEventListener("change", () => {
  if(!(els.label.value||"").trim()){
    const total = clamp(Number(els.totalSeries.value||20),1,20);
    const n = clamp(Number(state.config.nextSeriesNumber||1),1,total);
    els.label.value = autoLabel(Number(els.distance.value||100), n, total);
  }
});
els.totalSeries.addEventListener("change", () => {
  const total = clamp(Number(els.totalSeries.value||20),1,20);
  state.config.totalSeries = total;
  state.config.nextSeriesNumber = clamp(Number(state.config.nextSeriesNumber||1),1,total);
  if(!(els.label.value||"").trim()){
    els.label.value = autoLabel(Number(els.distance.value||100), state.config.nextSeriesNumber, total);
  }
  saveState();
});

// Inicial
setStatus(state.running ? "EN CURSO" : "DETENIDA", "Configurá carriles → “Generar carriles” → “Iniciar serie”.");
els.chronoHint.textContent = state.running ? "En curso" : "Listo para iniciar";
startChronoLoop();
render();

// Offline
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
}
