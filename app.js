const LANE_COUNT = 5;

const els = {
  label: document.getElementById("label"),
  distance: document.getElementById("distance"),
  btnBuild: document.getElementById("btnBuild"),
  btnStart: document.getElementById("btnStart"),
  btnStop: document.getElementById("btnStop"),
  btnUndo: document.getElementById("btnUndo"),
  btnReport: document.getElementById("btnReport"),
  btnExport: document.getElementById("btnExport"),
  btnClear: document.getElementById("btnClear"),
  statusText: document.getElementById("statusText"),
  lastMsg: document.getElementById("lastMsg"),
  lanes: document.getElementById("lanes"),
  cfg: [1,2,3,4,5].map(i => document.getElementById("cfg"+i)),

  // Informe embebido (no modal)
  reportSection: document.getElementById("reportSection"),
  reportBody: document.getElementById("reportBody"),
  reportSub: document.getElementById("reportSub"),
  btnHideReport: document.getElementById("btnHideReport"),
  btnExport2: document.getElementById("btnExport2")
};

let state = loadState() || newState();

function newState(){
  return {
    running: false,
    seriesId: null,
    seriesLabel: "",
    distanceM: 100,
    seriesStartMs: null,
    lanes: Array.from({length: LANE_COUNT}, () => ({
      swimmerCount: 0,
      nextArrivalIndex: 1
    })),
    events: [],
    log: []
  };
}

function saveState(){ localStorage.setItem("CRONO_ACUATICA_STATE", JSON.stringify(state)); }
function loadState(){
  try{
    const r = localStorage.getItem("CRONO_ACUATICA_STATE");
    return r ? JSON.parse(r) : null;
  }catch{
    return null;
  }
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

function laneLabel(li){ return `Carril ${li+1}`; }

function laneIsDone(li){
  const lane = state.lanes[li];
  return lane.swimmerCount > 0 && (lane.nextArrivalIndex > lane.swimmerCount);
}

function nextArrivalNumber(li){
  const lane = state.lanes[li];
  if(!lane || lane.swimmerCount <= 0) return 0;
  return Math.min(lane.nextArrivalIndex, lane.swimmerCount);
}

function anyLaneConfigured(){
  return state.lanes.some(l => l.swimmerCount > 0);
}

/* =========================
   Configurar carriles
   ========================= */
function buildLanes(){
  for(let li=0; li<LANE_COUNT; li++){
    const count = clamp(Number(els.cfg[li].value || 0), 0, 10);
    state.lanes[li].swimmerCount = count;
    state.lanes[li].nextArrivalIndex = 1;
  }
  saveState();
  render();
  setStatus(state.running ? "EN CURSO" : "DETENIDA", "Carriles generados. Ahora tocá “Iniciar serie”.");
}

/* =========================
   Iniciar / Detener
   ========================= */
function startSeries(){
  const distanceM = Number(els.distance.value);
  if(!distanceM){
    alert("Elegí una distancia.");
    return;
  }
  if(!anyLaneConfigured()){
    alert("Configurá al menos un carril con nadadores.");
    return;
  }

  state.seriesId = crypto.randomUUID();
  state.seriesLabel = els.label.value || "";
  state.distanceM = distanceM;
  state.seriesStartMs = Date.now();
  state.running = true;

  state.events = [];
  state.log = [];

  for(let li=0; li<LANE_COUNT; li++){
    state.lanes[li].nextArrivalIndex = 1;
  }

  // ocultar informe al iniciar nueva serie
  hideReport();

  saveState();
  render();
  setStatus("EN CURSO", "⏱️ Tiempo iniciado (largada global). Registrá llegadas por carril.");
}

function stopSeries(){
  state.running = false;
  saveState();
  render();
  setStatus("DETENIDA", "Serie detenida. Podés abrir el informe cuando quieras (no bloquea).");

  // NO abre automático (para que no moleste)
  // Si querés que se muestre automáticamente, avisame y lo activamos.
}

function ensureRunning(){
  if(!state.running){
    alert("Primero iniciá la serie.");
    return false;
  }
  return true;
}

/* =========================
   Registrar llegada por carril
   ========================= */
function recordArrival(li){
  if(!ensureRunning()) return;

  const lane = state.lanes[li];

  if(!lane || lane.swimmerCount <= 0){
    setStatus("EN CURSO", `⚠️ ${laneLabel(li)} sin nadadores configurados.`);
    return;
  }

  if(lane.nextArrivalIndex > lane.swimmerCount){
    setStatus("EN CURSO", `🏁 ${laneLabel(li)}: ya registraste las ${lane.swimmerCount} llegadas.`);
    return;
  }

  const now = Date.now();
  const timeMs = now - state.seriesStartMs;
  const swimmerOrder = lane.nextArrivalIndex;

  const row = {
    timestampIso: new Date(now).toISOString(),
    seriesId: state.seriesId,
    seriesLabel: state.seriesLabel,
    distanceM: state.distanceM,
    lane: li+1,
    swimmer: swimmerOrder,
    event: "LLEGADA",
    timeMs,
    time: formatMs(timeMs)
  };

  state.log.push(row);

  state.events.push({
    type: "arrival",
    li,
    swimmerOrder
  });

  lane.nextArrivalIndex += 1;

  saveState();
  render();
  setStatus("EN CURSO", `✅ ${laneLabel(li)} — Nadador ${swimmerOrder} — ${row.time}`);
}

/* =========================
   Deshacer inteligente
   ========================= */
function undoSmart(){
  if(state.events.length === 0){
    setStatus(state.running ? "EN CURSO" : "DETENIDA", "No hay nada para deshacer.");
    return;
  }

  const ev = state.events.pop();

  if(ev.type === "arrival"){
    const lane = state.lanes[ev.li];

    for(let i=state.log.length-1; i>=0; i--){
      const r = state.log[i];
      if(r.lane === ev.li+1 && r.event === "LLEGADA" && r.swimmer === ev.swimmerOrder){
        state.log.splice(i,1);
        break;
      }
    }

    lane.nextArrivalIndex = Math.max(1, lane.nextArrivalIndex - 1);

    saveState();
    render();
    setStatus(state.running ? "EN CURSO" : "DETENIDA", `↩ Deshecha llegada en ${laneLabel(ev.li)} (Nadador ${ev.swimmerOrder}).`);

    // si el informe está visible, lo refrescamos
    if(!els.reportSection.classList.contains("hidden")) showReport(true);
    return;
  }

  saveState();
  render();
}

/* =========================
   Exportar CSV
   ========================= */
function exportCSV(){
  if(state.log.length === 0){
    alert("No hay datos para exportar.");
    return;
  }

  const headers = ["FechaHoraISO","IdSerie","EtiquetaSerie","DistanciaM","Carril","Nadador","Evento","TiempoMs","Tiempo"];
  const lines = [headers.join(",")];

  for(const r of state.log){
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
  a.download = `crono_acuatica_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  setStatus(state.running ? "EN CURSO" : "DETENIDA", "📄 CSV exportado.");
}

/* =========================
   Borrar todo
   ========================= */
function clearAll(){
  if(!confirm("¿Seguro que querés borrar TODO (configuración y registros)?")) return;
  localStorage.removeItem("CRONO_ACUATICA_STATE");
  state = newState();
  saveState();
  render();
  hideReport();
  setStatus("DETENIDA", "Todo borrado. Configurá carriles y generá de nuevo.");
}

/* =========================
   Informe (panel embebido)
   ========================= */
function hideReport(){
  els.reportSection.classList.add("hidden");
}

function showReport(refreshOnly=false){
  if(state.log.length === 0){
    alert("Aún no hay registros para mostrar.");
    return;
  }

  const label = state.seriesLabel ? ` · ${state.seriesLabel}` : "";
  els.reportSub.textContent = `Distancia: ${state.distanceM} m${label}`;
  els.reportBody.innerHTML = buildReportHtml_();
  els.reportSection.classList.remove("hidden");

  if(!refreshOnly){
    els.reportSection.scrollIntoView({behavior:"smooth", block:"start"});
  }
}

function buildReportHtml_(){
  const rows = [...state.log].sort((a,b) => (a.lane-b.lane) || (a.swimmer-b.swimmer));

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
  const totalEsperado = state.lanes.reduce((acc, l) => acc + (l.swimmerCount || 0), 0);

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
    const configured = state.lanes[li].swimmerCount || 0;
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
          <thead>
            <tr>
              <th>Nadador</th>
              <th>Tiempo</th>
            </tr>
          </thead>
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
   Render UI
   ========================= */
function render(){
  els.lanes.innerHTML = "";

  for(let li=0; li<LANE_COUNT; li++){
    const lane = state.lanes[li];
    const done = laneIsDone(li);

    const card = document.createElement("section");
    card.className = "laneCard" + (done ? " done" : "");

    const title = document.createElement("div");
    title.className = "laneTitle";
    title.textContent = `${laneLabel(li)} · Nadadores: ${lane.swimmerCount}`;
    card.appendChild(title);

    const badge = document.createElement("div");
    badge.className = "badge";
    const dot = document.createElement("span");
    dot.className = "dot";

    const next = nextArrivalNumber(li);
    const txt = document.createElement("span");
    txt.textContent = lane.swimmerCount > 0
      ? (done ? "Todas las llegadas registradas" : `Próxima llegada: Nadador ${next}`)
      : "Sin nadadores";

    badge.appendChild(dot);
    badge.appendChild(txt);
    card.appendChild(badge);

    const btns = document.createElement("div");
    btns.className = "laneBtns";

    const bArrival = document.createElement("button");
    bArrival.className = "bigBtn";
    bArrival.textContent = "Registrar llegada ✅";
    bArrival.disabled = done || lane.swimmerCount <= 0 || !state.running;

    bArrival.onclick = () => {
      bArrival.classList.remove("pulse");
      void bArrival.offsetWidth;
      bArrival.classList.add("pulse");

      card.classList.remove("flash");
      void card.offsetWidth;
      card.classList.add("flash");

      recordArrival(li);
    };

    btns.appendChild(bArrival);
    card.appendChild(btns);

    const info = document.createElement("div");
    info.className = "small";
    info.textContent =
      `Registradas: ${Math.max(0, lane.nextArrivalIndex - 1)}/${lane.swimmerCount} · ` +
      `Distancia: ${state.distanceM} m · ` +
      (state.running ? "Serie en curso" : "Serie detenida");
    card.appendChild(info);

    els.lanes.appendChild(card);
  }

  // Botón informe habilitado solo si hay datos
  els.btnReport.disabled = (state.log.length === 0);
}

/* =========================
   Eventos
   ========================= */
els.btnBuild.addEventListener("click", buildLanes);
els.btnStart.addEventListener("click", startSeries);
els.btnStop.addEventListener("click", stopSeries);
els.btnUndo.addEventListener("click", undoSmart);
els.btnReport.addEventListener("click", () => showReport(false));
els.btnExport.addEventListener("click", exportCSV);
els.btnClear.addEventListener("click", clearAll);

els.btnHideReport.addEventListener("click", hideReport);
els.btnExport2.addEventListener("click", exportCSV);

// Estado inicial
render();
setStatus(
  state.running ? "EN CURSO" : "DETENIDA",
  state.running ? "Serie en curso (guardada)." : "Configurá carriles y tocá “Generar carriles”."
);
saveState();

// Offline
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
}
