/* ==========================
   CRONO-ACUATICA - app.js
   Series consecutivas + pads cuadrados + panel scrolleable
   ========================== */

const LANE_COUNT = 5;
const STORAGE_KEY = "crono_acuatica_state_v2"; // ✅ subimos versión para evitar estados viejos

const els = {
  label: document.getElementById("label"),
  distance: document.getElementById("distance"),
  totalSeries: document.getElementById("totalSeries"),

  cfg: [
    document.getElementById("cfg1"),
    document.getElementById("cfg2"),
    document.getElementById("cfg3"),
    document.getElementById("cfg4"),
    document.getElementById("cfg5"),
  ],

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

  chrono: document.getElementById("chrono"),
  chronoHint: document.getElementById("chronoHint"),
  pillState: document.getElementById("pillState"),

  lanes: document.getElementById("lanes"),

  reportSection: document.getElementById("reportSection"),
  reportSub: document.getElementById("reportSub"),
  reportBody: document.getElementById("reportBody"),
  btnHideReport: document.getElementById("btnHideReport"),
  btnExport2: document.getElementById("btnExport2"),

  historyList: document.getElementById("historyList"),
};

/* Helpers */
const pad2 = (n) => String(n).padStart(2, "0");

function formatMs(ms){
  const total = Math.max(0, ms|0);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${pad2(m)}:${pad2(s)}.${pad2(cs)}`;
}

function laneLabel(i){ return `Carril ${i+1}`; }
function nowIso(){ return new Date().toISOString(); }

function newState(){
  return {
    config: {
      label: "",
      distance: 100,
      totalSeries: 20, // ✅ por defecto 20 (vos lo pediste muchas veces)
      lanes: Array.from({length: LANE_COUNT}, () => ({ swimmerCount: 0 })),
    },
    running: false,
    series: [], // historial (cada serie un objeto independiente)
  };
}

let state = loadState();

/* Cargar/Guardar */
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return newState();
    const parsed = JSON.parse(raw);
    if(!parsed || !parsed.config) return newState();
    return parsed;
  }catch{
    return newState();
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* Series */
function buildSeriesLabel(seriesIndex, total, dist, customLabel){
  const base = customLabel?.trim() ? customLabel.trim() : "Entrenamiento";
  return `${base} · Serie ${seriesIndex}/${total} · ${dist} m`;
}

function getActiveSeries(){
  return state.series.find(s => s.isActive) || null;
}

function syncConfigFromUI(){
  state.config.label = (els.label?.value || "").trim();
  state.config.distance = parseInt(els.distance?.value || "100", 10);
  state.config.totalSeries = parseInt(els.totalSeries?.value || "20", 10);
  for(let i=0;i<LANE_COUNT;i++){
    state.config.lanes[i].swimmerCount = Math.max(0, parseInt(els.cfg[i]?.value || "0", 10));
  }
}

/* Select series según distancia (1..20) */
function fillTotalSeriesSelect(){
  const dist = parseInt(els.distance.value, 10);
  els.totalSeries.innerHTML = "";
  for(let i=1;i<=20;i++){
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${i} serie${i>1?"s":""} x${dist}`;
    els.totalSeries.appendChild(opt);
  }

  // ✅ asegurar selección válida
  const wanted = state?.config?.totalSeries ?? 20;
  els.totalSeries.value = String(Math.min(20, Math.max(1, wanted)));
}

/* Cronómetro global */
let chronoRAF = null;

function stopChronoLoop(){
  if(chronoRAF) cancelAnimationFrame(chronoRAF);
  chronoRAF = null;
}

function startChronoLoop(){
  stopChronoLoop();
  const tick = () => {
    const a = getActiveSeries();
    if(a && state.running){
      const ms = Date.now() - a.startMs;
      els.chrono.textContent = formatMs(ms);
      els.chronoHint.textContent = `En curso: Serie ${a.seriesIndex}/${a.totalSeries} · ${a.distance} m`;
      els.pillState.textContent = "EN CURSO";
    }else{
      const a2 = getActiveSeries();
      if(a2 && a2.stopMs){
        els.chrono.textContent = formatMs(a2.stopMs - a2.startMs);
        els.chronoHint.textContent = `Detenida: Serie ${a2.seriesIndex}/${a2.totalSeries} · ${a2.distance} m`;
        els.pillState.textContent = "DETENIDA";
      }else{
        els.chrono.textContent = "00:00.00";
        els.chronoHint.textContent = "Configurá carriles → iniciar serie.";
        els.pillState.textContent = "DETENIDA";
      }
    }
    chronoRAF = requestAnimationFrame(tick);
  };
  chronoRAF = requestAnimationFrame(tick);
}

/* UI Estado */
function setStatus(main, msg){
  els.statusText.textContent = main;
  els.lastMsg.textContent = msg || "";
  els.pillState.textContent = main;
}

/* Crear serie (helper) */
function createSeries(seriesIndex, totalSeries, distance){
  return {
    id: crypto.randomUUID(),
    createdAtIso: nowIso(),
    label: buildSeriesLabel(seriesIndex, totalSeries, distance, state.config.label),
    seriesIndex,
    totalSeries,
    distance,
    startMs: Date.now(),
    stopMs: null,
    isActive: true,
    lanes: state.config.lanes.map(l => ({ swimmerCount: l.swimmerCount, nextArrivalIndex: 1 })),
    log: [], // {laneIndex, swimmerIndex, ms}
  };
}

/* ✅ Iniciar serie (NO pisa la anterior) */
function startSeries(){
  syncConfigFromUI();

  let active = getActiveSeries();

  // Si NO hay activa: crear Serie 1
  if(!active){
    active = createSeries(1, state.config.totalSeries, state.config.distance);
    state.series.unshift(active);
  } else {
    // Si hay una activa pero está detenida y ya tiene registros,
    // al tocar "Iniciar" creamos la siguiente serie automáticamente (para historial)
    const stopped = !state.running && active.stopMs;
    const hasData = active.log.length > 0;

    if(stopped && hasData){
      if(active.seriesIndex < active.totalSeries){
        // cerrar actual
        active.isActive = false;
        // crear siguiente
        active = createSeries(active.seriesIndex + 1, active.totalSeries, active.distance);
        state.series.unshift(active);
      } else {
        // si ya era la última, creamos una "extra" (no pisamos la anterior)
        active.isActive = false;
        active = createSeries(active.totalSeries, active.totalSeries, active.distance);
        active.label = `${active.label} (extra)`;
        state.series.unshift(active);
      }
    } else {
      // Si no tenía datos (o estaba en curso), reiniciamos la MISMA serie
      // (pero solo resetea si aún no hay registros)
      if(active.log.length === 0){
        active.startMs = Date.now();
        active.stopMs = null;
        active.lanes.forEach((l, i) => {
          l.swimmerCount = state.config.lanes[i].swimmerCount;
          l.nextArrivalIndex = 1;
        });
      }
    }
  }

  state.running = true;
  saveState();
  hideReport();
  setStatus("EN CURSO", `Serie ${active.seriesIndex}/${active.totalSeries} iniciada.`);
  render();
}

function stopSeries(){
  const a = getActiveSeries();
  if(!a) return;
  state.running = false;
  a.stopMs = Date.now();
  saveState();
  setStatus("DETENIDA", `Serie ${a.seriesIndex}/${a.totalSeries} detenida. Descanso y preparar siguiente.`);
  render();
}

function prepareNextSeries(){
  const a = getActiveSeries();
  if(!a){
    setStatus("DETENIDA", "Primero iniciá una serie.");
    return;
  }
  if(state.running){
    setStatus("EN CURSO", "Primero detené la serie actual.");
    return;
  }
  const next = a.seriesIndex + 1;
  if(next > a.totalSeries){
    setStatus("DETENIDA", "Ya completaste todas las series configuradas.");
    return;
  }

  a.isActive = false;
  const newS = createSeries(next, a.totalSeries, a.distance);
  newS.startMs = Date.now();
  newS.stopMs = null;
  state.series.unshift(newS);

  saveState();
  hideReport();
  setStatus("DETENIDA", `Lista la Serie ${next}/${a.totalSeries}. Tocá "Iniciar Serie".`);
  render();
}

function recordArrival(laneIndex, btnEl){
  const a = getActiveSeries();
  if(!a || !state.running) return;

  const lane = a.lanes[laneIndex];
  const swimmers = lane.swimmerCount || 0;
  if(swimmers <= 0) return;

  const swimmerIndex = lane.nextArrivalIndex;
  if(swimmerIndex > swimmers) return;

  const ms = Date.now() - a.startMs;
  a.log.push({ laneIndex, swimmerIndex, ms });
  lane.nextArrivalIndex++;

  // feedback rápido
  btnEl.classList.remove("pulse");
  void btnEl.offsetWidth;
  btnEl.classList.add("pulse");

  saveState();
  render();
}

function undoSmart(){
  const a = getActiveSeries();
  if(!a || a.log.length === 0) return;

  const last = a.log.pop();
  const lane = a.lanes[last.laneIndex];
  lane.nextArrivalIndex = Math.max(1, lane.nextArrivalIndex - 1);

  saveState();
  setStatus(state.running ? "EN CURSO" : "DETENIDA", "Última llegada deshecha.");
  render();
}

/* Reporte e historial */
function showReport(seriesId){
  const s = state.series.find(x => x.id === seriesId);
  if(!s) return;

  els.reportSub.textContent = s.label;
  els.reportBody.innerHTML = "";

  if(s.log.length === 0){
    els.reportBody.innerHTML = `<div class="muted">No hay llegadas registradas en esta serie.</div>`;
  }else{
    const rows = s.log
      .slice()
      .sort((a,b) => a.ms - b.ms)
      .map(r => `
        <tr>
          <td>${laneLabel(r.laneIndex)}</td>
          <td>Nadador ${r.swimmerIndex}</td>
          <td>${formatMs(r.ms)}</td>
        </tr>
      `).join("");

    els.reportBody.innerHTML = `
      <table class="tbl">
        <thead><tr><th>Carril</th><th>Nadador</th><th>Tiempo</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  els.reportSection.classList.remove("hidden");
  // ✅ scroll suave al informe
  els.reportSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function hideReport(){
  els.reportSection.classList.add("hidden");
}

function exportCSV(seriesId){
  const s = state.series.find(x => x.id === seriesId);
  if(!s) return;

  const header = ["serie","etiqueta","distancia_m","carril","nadador","tiempo_ms","tiempo"];
  const lines = [header.join(",")];

  for(const r of s.log){
    const row = [
      `"${s.seriesIndex}/${s.totalSeries}"`,
      `"${(state.config.label || "").replaceAll('"','""')}"`,
      s.distance,
      `"${laneLabel(r.laneIndex)}"`,
      `"Nadador ${r.swimmerIndex}"`,
      r.ms,
      `"${formatMs(r.ms)}"`
    ];
    lines.push(row.join(","));
  }

  const blob = new Blob([lines.join("\n")], { type:"text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `crono-acuatica_${s.seriesIndex}-de-${s.totalSeries}_${s.distance}m.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  setStatus(state.running ? "EN CURSO" : "DETENIDA", "CSV exportado.");
}

function renderHistory(){
  els.historyList.innerHTML = "";

  if(state.series.length === 0){
    els.historyList.innerHTML = `
      <div class="histEmpty">
        Aún no hay series guardadas.<br/>
        Cuando registres llegadas, el historial quedará aquí.
      </div>`;
    return;
  }

  const max = Math.min(20, state.series.length);
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
    item.querySelector('[data-act="view"]').onclick = () => showReport(s.id);
    item.querySelector('[data-act="csv"]').onclick = () => exportCSV(s.id);
    els.historyList.appendChild(item);
  }
}

/* Render carriles (pads) */
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
      txt.textContent = swimmers > 0 ? (done ? "Todas las llegadas registradas" : `Próxima: Nadador ${next}`) : "Sin nadadores";
    }else{
      txt.textContent = swimmers > 0 ? "Listo (sin iniciar)" : "Sin nadadores";
    }

    badge.appendChild(dot);
    badge.appendChild(txt);
    card.appendChild(badge);

    const btns = document.createElement("div");
    btns.className = "laneBtns";

    const bArrival = document.createElement("button");
    bArrival.className = "bigBtn";
    bArrival.type = "button";

    // ✅ PAD: solo icono
    bArrival.textContent = "✅";
    bArrival.title = "Registrar llegada";
    bArrival.setAttribute("aria-label", "Registrar llegada");

    bArrival.disabled = !active || !state.running || done || swimmers <= 0;
    bArrival.onclick = () => recordArrival(li, bArrival);

    btns.appendChild(bArrival);
    card.appendChild(btns);

    if(active && done) card.classList.add("done");
    els.lanes.appendChild(card);
  }

  renderHistory();
  saveState();
}

/* Borrar todo */
function clearAll(){
  if(!confirm("¿Seguro que querés borrar TODO (historial completo)?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = newState();
  saveState();
  hideReport();
  stopChronoLoop();
  els.chrono.textContent = "00:00.00";
  els.chronoHint.textContent = "Configurá carriles → iniciar serie.";
  setStatus("DETENIDA", "Todo borrado.");
  render();
}

/* Eventos UI */
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
  if(a) showReport(a.id);
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
startChronoLoop();
render();

/* PWA offline */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
}
