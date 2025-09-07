
/* Bitácora de Opciones — Addon v7.6.7
 * - Agrupar por Ticker / Estrategia
 * - Solo cabeceras, Expandir/Contraer todo
 * - Borrar TODO con backup JSON
 * - **Nuevo**: Restaurar JSON (reemplaza datos locales desde un archivo)
 */
(function(){
  function ready(fn){ if(document.readyState!=="loading"){ fn(); } else { document.addEventListener("DOMContentLoaded", fn); } }
  const LS_GROUP_ENABLED = "ui_group_enabled_v2";
  const LS_GROUP_MODE     = "ui_group_mode_v2"; // 'ticker' | 'strategy'
  const LS_COLLAPSE_TKR   = "ui_collapse_by_ticker_v2";
  const LS_COLLAPSE_STRAT = "ui_collapse_by_strategy_v2";
  const LS_COMPACT        = "ui_group_compact_v1";
  const DATA_KEY          = "options_positions_v7_6";

  function loadJSON(k, fb){ try{ const v = localStorage.getItem(k); return v? JSON.parse(v): fb; }catch(_){ return fb; } }
  function saveJSON(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(_){} }
  function getCollapseMap(mode){ return loadJSON(mode==="strategy"?LS_COLLAPSE_STRAT:LS_COLLAPSE_TKR, {}); }
  function setCollapse(mode, key, collapsed){
    const storeKey = (mode==="strategy")? LS_COLLAPSE_STRAT: LS_COLLAPSE_TKR;
    const m = loadJSON(storeKey, {}); m[key] = !!collapsed; saveJSON(storeKey, m);
  }
  function isCollapsed(mode, key){ const m=getCollapseMap(mode); return !!m[key]; }
  function getMode(){ const m = localStorage.getItem(LS_GROUP_MODE); return (m==="strategy"||m==="ticker")? m : "ticker"; }
  function setMode(m){ localStorage.setItem(LS_GROUP_MODE, (m==="strategy")?"strategy":"ticker"); }
  function isEnabled(){ return localStorage.getItem(LS_GROUP_ENABLED)==="1"; }
  function setEnabled(on){ localStorage.setItem(LS_GROUP_ENABLED, on?"1":"0"); }
  function isCompact(){ return localStorage.getItem(LS_COMPACT)==="1"; }
  function setCompact(on){ localStorage.setItem(LS_COMPACT, on?"1":"0"); }

  function safe(arr){ return Array.isArray(arr)? arr: []; }
  function fmtMoney(n){ if(n==null || !isFinite(n)) return ""; try{ return (n<0?"-":"") + "$" + Math.abs(n).toFixed(2); }catch(_){ return String(n); } }
  function firstTicker(p){ const legs = safe(p.legs); for(const l of legs){ if(l && l.ticker) return String(l.ticker).toUpperCase(); } if(p.title){ const m = String(p.title).toUpperCase().match(/^([A-Z\.]{1,6})\b/); if(m) return m[1]; } return "(SIN_TICKER)"; }
  function firstStrategy(p){ return (p.strategy && String(p.strategy).trim()) || "(mixta)"; }
  function group(list, mode){ const map=new Map(); for(const p of list){ const k=(mode==="strategy")? firstStrategy(p): firstTicker(p); if(!map.has(k)) map.set(k, []); map.get(k).push(p); } return map; }
  function kpisFor(list){ let pl=0, open=0; const dtes=[]; for(const p of list){ const x=(typeof positionPL==="function")? positionPL(p): 0; pl += (isFinite(x)? x:0); if(p.status==="Abierta") open++; for(const l of safe(p.legs)){ if(l && l.expiry){ try{ const v=dte(l.expiry); if(isFinite(v)) dtes.push(v);}catch(_){ } } } } const avgDTE = dtes.length? (dtes.reduce((a,b)=>a+b,0)/dtes.length): null; return { pl, open, count:list.length, avgDTE }; }

  function renderGroup(mode, key, list){
    const wrap = document.createElement("div"); wrap.className="tg-group";
    const k = kpisFor(list);
    const collapsed = isCollapsed(mode, key);
    const bodyStyle = collapsed? 'style="display:none"':"";
    wrap.innerHTML = `
      <div class="tg-header" data-key="${key}">
        <button class="tg-toggle" aria-label="Toggle ${key}">${collapsed?"▸":"▾"}</button>
        <span class="tg-ticker">${key}</span>
        <span class="tg-meta">Posiciones: ${k.count} · Abiertas: ${k.open} · P&L: ${fmtMoney(k.pl)} ${k.avgDTE!=null?("· DTE prom: "+k.avgDTE.toFixed(1)):""}</span>
      </div>
      <div class="tg-body" ${bodyStyle}></div>
    `;
    const body = wrap.querySelector(".tg-body");
    const compact = isCompact();
    if(!compact){
      for(const p of list){
        const pl = (typeof positionPL === "function") ? positionPL(p) : null;
        const roi = (typeof positionROI === "function") ? positionROI(p) : null;
        const status = p.status || "";
        const legs = safe(p.legs).map(l=>{
          const side = l.action || ""; const tkr = l.ticker || key; const type = l.option_type || "";
          const strike = l.strike!=null? l.strike : ""; const exp = l.expiry || "";
          return `${side} ${tkr} ${type}${strike} ${exp}`;
        }).join(" · ");
        const card = document.createElement("div"); card.className="tg-card";
        card.innerHTML = `
          <div class="tg-card-top">
            <div class="tg-title">${p.title || (p.strategy||"")}</div>
            <div class="tg-pill ${status==="Abierta"?"open":"closed"}">${status||""}</div>
          </div>
          <div class="tg-row tg-legs">${legs}</div>
          <div class="tg-row tg-meta2">
            ${p.open_date?`<span>Apertura: ${p.open_date}</span>`:""}
            ${p.close_date?`<span>Cierre: ${p.close_date}</span>`:""}
            ${pl!=null?`<span>P&L: ${fmtMoney(pl)}</span>`:""}
            ${roi && roi.roi!=null?`<span>ROI: ${(roi.roi*100).toFixed(1)}%</span>`:""}
          </div>
        `;
        body.appendChild(card);
      }
    }else{
      body.innerHTML = `<div class="tg-compact-note">Vista compacta: solo cabeceras por grupo.</div>`;
    }
    // toggle
    wrap.querySelector(".tg-header").addEventListener("click", ()=>{
      const b = wrap.querySelector(".tg-body");
      const now = (b.style.display === "none");
      b.style.display = now ? "" : "none";
      setCollapse(mode, key, !now? true : false);
      wrap.querySelector(".tg-toggle").textContent = now ? "▾" : "▸";
    });
    return wrap;
  }

  function readPositionsFiltered(){
    let positions = [];
    try{
      positions = (typeof loadPositions === "function") ? loadPositions() : [];
      if(typeof currentFilters === "function" && typeof applyFiltersToPositions === "function"){
        positions = applyFiltersToPositions(positions, currentFilters());
      }
    }catch(e){ console.warn("No se pudo leer posiciones:", e); }
    return positions;
  }
  function render(container){
    const list = readPositionsFiltered();
    const mode = getMode();
    const map = group(list, mode);
    container.innerHTML = "";
    const keys = Array.from(map.keys()).sort();
    for(const key of keys){ container.appendChild(renderGroup(mode, key, map.get(key))); }
  }

  function ensureUI(){
    const ref = document.getElementById("exportCsvFiltered");
    const bar = ref ? ref.parentElement : document.querySelector("#toolbar,#topbar,.toolbar,.topbar,header,main") || document.body;
    let controls = document.getElementById("tgControls");
    if(!controls){
      controls = document.createElement("div"); controls.id="tgControls"; controls.style.marginTop="6px"; bar.appendChild(controls);
      const select = document.createElement("select"); select.id="tgMode";
      select.innerHTML = `<option value="none">Tabla original</option><option value="ticker">Agrupar por Ticker</option><option value="strategy">Agrupar por Estrategia</option>`;
      controls.appendChild(select);
      const ex = document.createElement("button"); ex.id="expandAllGroups"; ex.textContent="Expandir todo";
      const co = document.createElement("button"); co.id="collapseAllGroups"; co.textContent="Contraer todo";
      const cm = document.createElement("button"); cm.id="toggleCompact"; cm.textContent="Solo cabeceras: OFF";
      const del = document.createElement("button"); del.id="wipeAll"; del.textContent="Borrar TODO"; del.className="tg-danger";
      const rs = document.createElement("button"); rs.id="restoreJson"; rs.textContent="Restaurar JSON";
      controls.appendChild(ex); controls.appendChild(co); controls.appendChild(cm); controls.appendChild(del); controls.appendChild(rs);
    }
    let gc = document.getElementById("groupedContainer");
    if(!gc){ gc = document.createElement("div"); gc.id="groupedContainer"; gc.style.display="none"; bar.insertAdjacentElement("afterend", gc); }
    return {bar, controls, gc};
  }

  function setGroupedVisibility(on){
    const {gc} = ensureUI();
    const mainTables = document.querySelectorAll("#positionsTable, #positions, table.positions, .positions-table");
    mainTables.forEach(el=> el.style.display = on? "none": "");
    gc.style.display = on? "" : "none";
  }
  function setModeAndRender(newMode){
    const enable = (newMode==="ticker" || newMode==="strategy");
    setEnabled(enable); if(enable){ setMode(newMode); }
    setGroupedVisibility(enable); if(enable){ render(document.getElementById("groupedContainer")); }
  }

  function attachEvents(){
    const {controls, gc} = ensureUI();
    const sl = controls.querySelector("#tgMode");
    const ex = controls.querySelector("#expandAllGroups");
    const co = controls.querySelector("#collapseAllGroups");
    const cm = controls.querySelector("#toggleCompact");
    const del = controls.querySelector("#wipeAll");
    const rs = controls.querySelector("#restoreJson");

    const enabled = isEnabled(); sl.value = enabled ? getMode() : "none";
    setGroupedVisibility(enabled); if(enabled){ render(gc); }

    sl.addEventListener("change", ()=>{
      const val = sl.value; if(val==="none"){ setModeAndRender("none"); } else if(val==="ticker"){ setModeAndRender("ticker"); } else { setModeAndRender("strategy"); }
    });
    ex.addEventListener("click", ()=>{
      document.querySelectorAll(".tg-group .tg-body").forEach(el=> el.style.display="");
      document.querySelectorAll(".tg-group .tg-header .tg-toggle").forEach(el=> el.textContent="▾");
      saveJSON(getMode()==="strategy"?LS_COLLAPSE_STRAT:LS_COLLAPSE_TKR, {});
    });
    co.addEventListener("click", ()=>{
      const mode=getMode(); const m={};
      document.querySelectorAll(".tg-group .tg-header").forEach(h=>{ const k=h.getAttribute("data-key"); if(k) m[k]=true; });
      document.querySelectorAll(".tg-group .tg-body").forEach(el=> el.style.display="none");
      document.querySelectorAll(".tg-group .tg-header .tg-toggle").forEach(el=> el.textContent="▸");
      saveJSON(mode==="strategy"?LS_COLLAPSE_STRAT:LS_COLLAPSE_TKR, m);
    });
    cm.addEventListener("click", ()=>{
      const now = !isCompact(); setCompact(now); cm.textContent = "Solo cabeceras: " + (now? "ON":"OFF"); if(isEnabled()){ render(gc); }
    });
    del.addEventListener("click", ()=>{
      const backup = confirm("¿Deseas exportar un respaldo JSON antes de borrar? (Aceptar = sí, Cancelar = no)");
      if(backup){
        try{
          const data = (typeof loadPositions==="function") ? loadPositions() : [];
          const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "backup_positions.json"; a.click();
          setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
        }catch(e){ alert("No se pudo generar el backup automático. Puedes usar 'Respaldar JSON' en la app."); }
      }
      const text = prompt("Escribe BORRAR y presiona Aceptar para confirmar el borrado TOTAL de datos locales.");
      if(text!=="BORRAR"){ alert("Operación cancelada."); return; }
      wipeAllLocal(); alert("Datos locales borrados. La página se recargará."); location.reload();
    });
    rs.addEventListener("click", ()=>{
      const inp = document.createElement("input"); inp.type="file"; inp.accept="application/json,.json";
      inp.addEventListener("change", async ()=>{
        const file = inp.files && inp.files[0]; if(!file) return;
        try{
          const text = await file.text();
          let obj = JSON.parse(text);
          // Detectar forma: array de posiciones o {positions:[...]}
          let positions = Array.isArray(obj) ? obj : (Array.isArray(obj.positions)? obj.positions : null);
          if(!positions){ alert("El JSON no tiene el formato esperado (array de posiciones o {positions:[...]})."); return; }
          const ok = confirm("Esto REEMPLAZARÁ todos los datos locales con el contenido del JSON seleccionado. ¿Continuar?");
          if(!ok) return;
          localStorage.setItem(DATA_KEY, JSON.stringify(positions));
          alert("Restauración completada. Se recargará la página."); location.reload();
        }catch(e){ console.error(e); alert("No se pudo leer el archivo JSON. Asegúrate de seleccionar el backup correcto."); }
      }, {once:true});
      inp.click();
    });
  }

  function wipeAllLocal(){
    try{
      const keysToNuke = [DATA_KEY, LS_GROUP_ENABLED, LS_GROUP_MODE, LS_COLLAPSE_TKR, LS_COLLAPSE_STRAT, LS_COMPACT];
      const extraPrefixes = ["options_", "ui_", "filters_", "views_"];
      for(const k of keysToNuke){ localStorage.removeItem(k); }
      // barrido por prefijos
      for(let i=0;i<localStorage.length;i++){
        const key = localStorage.key(i); if(!key) continue;
        if(extraPrefixes.some(p=> key.startsWith(p))){ try{ localStorage.removeItem(key); i--; }catch(_){} }
      }
    }catch(_){}
  }

  function injectStyles(){
    if(document.getElementById("tgStylesV67")) return;
    const css = `
#groupedContainer{ margin:1rem 0; display:none; }
#tgControls select, #tgControls button{ margin-left:.4rem; }
#tgControls .tg-danger{ border:1px solid #ef4444; color:#991b1b; background:#fee2e2; }
.tg-group{ border:1px solid #e5e7eb; border-radius:14px; margin:0 0 12px 0; overflow:hidden; background:#fff; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
.tg-header{ display:flex; align-items:center; gap:.75rem; padding:.65rem .9rem; background:#f8fafc; cursor:pointer; font-weight:600; }
.tg-header .tg-ticker{ font-size:1rem; letter-spacing:.5px; }
.tg-header .tg-meta{ font-weight:500; opacity:.8; margin-left:auto; }
.tg-header .tg-toggle{ border:0; background:transparent; font-size:1rem; cursor:pointer; }
.tg-body{ padding:.5rem .9rem .9rem; }
.tg-compact-note{ opacity:.7; font-style: italic; }
.tg-card{ border:1px solid #eef2f7; border-radius:12px; padding:.6rem .7rem; margin:.5rem 0; }
.tg-card-top{ display:flex; align-items:center; gap:.75rem; }
.tg-title{ font-weight:600; }
.tg-pill{ margin-left:auto; padding:.15rem .55rem; border-radius:999px; font-size:.8rem; border:1px solid #e5e7eb; }
.tg-pill.open{ background:#e6fffa; border-color:#99f6e4; }
.tg-pill.closed{ background:#f1f5f9; }
.tg-row{ margin-top:.35rem; font-size:.92rem; opacity:.95; }
@media (prefers-color-scheme: dark){
  #tgControls .tg-danger{ border-color:#7f1d1d; color:#fecaca; background:#450a0a; }
  .tg-group{ background:#0b1220; border-color:#111827; }
  .tg-header{ background:#0f172a; }
  .tg-card{ border-color:#1f2937; }
  .tg-pill{ border-color:#334155; }
}
`;
    const s = document.createElement("style"); s.id="tgStylesV67"; s.appendChild(document.createTextNode(css)); document.head.appendChild(s);
  }

  ready(function(){
    try{ injectStyles(); ensureUI(); attachEvents(); }catch(e){ console.error("Addon grouping v7.6.7 error:", e); }
  });
})();
