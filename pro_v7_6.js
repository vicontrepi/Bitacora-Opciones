import { drawBarChart, drawLineChart } from './charts.js';

const STORAGE_KEY = "options_positions_v7_6";
const VIEWS_KEY = "options_views_v7_6";
const ALERT_KEY = "options_alert_lead_hours_v7_6";

function loadPositions() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } }
function savePositions(ps) { localStorage.setItem(STORAGE_KEY, JSON.stringify(ps)); }
function loadViews() { try { return JSON.parse(localStorage.getItem(VIEWS_KEY) || "[]"); } catch { return []; } }
function saveViews(v) { localStorage.setItem(VIEWS_KEY, JSON.stringify(v)); }
function loadLeadHours() { return Number(localStorage.getItem(ALERT_KEY) || 36); }
function saveLeadHours(h) { localStorage.setItem(ALERT_KEY, String(h||36)); }

const todayISO = () => new Date().toISOString().slice(0,10);
const daysBetween = (a,b) => Math.max(0, Math.floor((new Date(b)-new Date(a))/86400000));
const dte = (exp) => exp ? daysBetween(todayISO(), exp) : "";

const fmt = (n,d=2) => (n===""||n==null||isNaN(Number(n))) ? "" : Number(n).toFixed(d);
const sum = arr => arr.reduce((a,b)=>a+Number(b||0),0);

// ===== Helpers: numbers, dates, OCC =====
function normalizeNumberString(s){
  if(s==null) return "";
  let v = String(s).trim().replace(/\s+/g,"");
  if(!v) return "";
  const euro = /^-?\d{1,3}(\.\d{3})+,\d+$/;
  const us = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/;
  if(euro.test(v)){ v = v.replace(/\./g,"").replace(",","."); }
  else if(us.test(v)){ v = v.replace(/,/g,""); }
  else if(v.includes(",") && !v.includes(".")){ v = v.replace(",","."); }
  return v;
}
function valueNum(v){ const s=normalizeNumberString(v); const n=Number(s.replace(/[^0-9.\-]/g,"")); return isFinite(n)?n:0; }

function normDate(raw){
  if(!raw) return "";
  let s = String(raw).trim();
  if(!s) return "";
  if(/^\d{8}$/.test(s)){
    if(s.startsWith("20")){ return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`; }
    const y = Number(s.slice(0,2)); const yyyy = (y>=70?1900+y:2000+y);
    return `${yyyy}-${s.slice(2,4)}-${s.slice(4,6)}`;
  }
  s = s.replace(/\//g,"-");
  const m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{4})/);
  if(m){
    const months = {"jan":"01","feb":"02","mar":"03","apr":"04","may":"05","jun":"06","jul":"07","aug":"08","sep":"09","sept":"09","oct":"10","nov":"11","dec":"12"};
    const mm = months[m[2].toLowerCase().slice(0,3)] || "01";
    const dd = String(m[1]).padStart(2,"0");
    return `${m[3]}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if(!isNaN(d.getTime())) return d.toISOString().slice(0,10);
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  return "";
}
function parseOCC(sym){
  if(!sym) return null;
  let s = String(sym).trim().toUpperCase().replace(/\s+/g," ");
  let m = s.match(/^([A-Z.]{1,6})\s+(\d{8})([CP])(\d{8})$/);
  if(m){
    const root=m[1];
    const yyyy=m[2].slice(0,4), mm=m[2].slice(4,6), dd=m[2].slice(6,8);
    const type=m[3]==="C"?"Call":"Put";
    const strike=(Number(m[4])/1000).toString();
    return {ticker:root, option_type:type, expiry:`${yyyy}-${mm}-${dd}`, strike};
  }
  m = s.match(/^([A-Z.]{1,6})\s+(\d{6})([CP])(\d{8})$/);
  if(m){
    const root=m[1];
    const yy=m[2].slice(0,2); const yyyy=(Number(yy)>=70?1900+Number(yy):2000+Number(yy));
    const mm=m[2].slice(2,4), dd=m[2].slice(4,6);
    const type=m[3]==="C"?"Call":"Put";
    const strike=(Number(m[4])/1000).toString();
    return {ticker:root, option_type:type, expiry:`${yyyy}-${mm}-${dd}`, strike};
  }
  return null;
}

// ====== Spreads & groups ======
function autoDetectSpreads(pos) {
  const legs = pos.legs||[];
  for (let i=0;i<legs.length;i++) for (let j=i+1;j<legs.length;j++) {
    const a=legs[i], b=legs[j];
    if (a.ticker===b.ticker && a.expiry===b.expiry && a.option_type===b.option_type && a.action!==b.action) {
      const width = Math.abs(Number(a.strike||0) - Number(b.strike||0));
      if (width>0){ a.width=width; b.width=width; }
    }
  }
}
function ensureGroups(pos){ if(!pos.groups) pos.groups=[]; }
function groupNamePair(a,b){ const lo=Math.min(Number(a.strike),Number(b.strike)); const hi=Math.max(Number(a.strike),Number(b.strike)); return `${a.option_type} Spread ${lo}/${hi} ${a.expiry}`; }
function autoCreateGroups(pos){
  ensureGroups(pos);
  const legs = pos.legs||[];
  for(let i=0;i<legs.length;i++) for(let j=i+1;j<legs.length;j++){
    const a=legs[i], b=legs[j];
    if(a.ticker===b.ticker && a.expiry===b.expiry && a.option_type===b.option_type && a.action!==b.action){
      const name=groupNamePair(a,b);
      if(!(pos.groups||[]).some(g=>g.name===name)) pos.groups.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()), name, legs:[i,j]});
    }
  }
  const callGroups=(pos.groups||[]).filter(g=>g.legs.every(i=>pos.legs[i]?.option_type==="Call"));
  const putGroups=(pos.groups||[]).filter(g=>g.legs.every(i=>pos.legs[i]?.option_type==="Put"));
  for(const cg of callGroups) for(const pg of putGroups){
    const expC = pos.legs[cg.legs[0]]?.expiry, expP=pos.legs[pg.legs[0]]?.expiry;
    if(expC && expP && expC===expP){
      const name=`Iron Condor ${expC}`;
      if(!(pos.groups||[]).some(g=>g.name===name)) pos.groups.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()), name, legs:[...cg.legs, ...pg.legs]});
    }
  }
}

// ====== CAR, PL, ROI ======
function capitalAtRisk(pos){
  const legs=pos.legs||[];
  let credit=0,debit=0,spreadLoss=0,hasSpread=false;
  for(const l of legs){
    const c=Number(l.contracts||0), prem=Number(l.premium||0);
    if(l.action==="Venta") credit+=prem*c*100; else debit+=prem*c*100;
    if(l.width){ hasSpread=true; spreadLoss += Number(l.width)*100*c; }
  }
  if(hasSpread) return Math.max(0, spreadLoss - credit + debit);
  if(pos.strategy==="Cash Secured Put"){
    const totalStrike = legs.filter(l=>l.option_type==="Put").reduce((a,l)=>a+Number(l.strike||0)*100*Number(l.contracts||0),0);
    return Math.max(0, totalStrike - credit + debit);
  }
  if(pos.strategy==="Covered Call"){
    const basis=Number(pos.cost_basis||0);
    const contracts=sum(legs.map(l=>l.contracts||0));
    const exposure = basis>0 ? basis*100*contracts : legs.reduce((a,l)=>a+Number(l.strike||0)*100*Number(l.contracts||0),0);
    return Math.max(0, exposure - credit + debit);
  }
  return Math.max(0, Math.abs(credit - debit));
}
function positionPL(pos){
  let pl=0, fees=0;
  for(const l of (pos.legs||[])){ if(["Cerrada","Asignada","Ejercitada"].includes(l.status) || pos.status==="Cerrada") pl+=Number(l.pl||0); fees+=Number(l.fees||0); }
  return pl - fees;
}
function positionROI(pos){
  const car=capitalAtRisk(pos);
  if(!car || !isFinite(car) || car<=0) return {roi:null, ann:null};
  const pl=positionPL(pos);
  let days=30;
  if(pos.open_date){
    const close=pos.close_date || (pos.legs||[]).map(l=>l.close_date).filter(Boolean).sort().slice(-1)[0] || todayISO();
    days=Math.max(1, daysBetween(pos.open_date, close));
  }
  const roi=pl/car; const ann=roi*(365/Math.max(1,days));
  return {roi, ann};
}

// ====== Render helpers ======
function badgeForStatus(s){ const map={"Abierta":"status-open","Cerrada":"status-closed","Rolled":"status-rolled","Asignada":"status-assigned","Ejercitada":"status-exercised"}; const cls=map[s]||"status-open"; return `<span class="badge ${cls}">${s||"Abierta"}</span>`; }

function renderGroup(pos, g, idx){
  let pl=0, fees=0;
  g.legs.forEach(i=>{ const l=pos.legs[i]; if(!l) return; if(["Cerrada","Asignada","Ejercitada"].includes(l.status)) pl+=Number(l.pl||0); fees+=Number(l.fees||0); });
  return `<div class="group">
    <div class="title">Grupo: <strong>${g.name}</strong> • P&L neto: ${fmt(pl-fees)}</div>
    <div class="row gap">
      <button class="ghost" data-act="grp-edit" data-idx="${idx}" data-gid="${g.id}">Editar</button>
      <button class="ghost" data-act="grp-del" data-idx="${idx}" data-gid="${g.id}">Eliminar</button>
      <button class="ghost" data-act="grp-close-partial" data-idx="${idx}" data-gid="${g.id}">Cierre parcial (grupo)</button>
      <button class="ghost" data-act="grp-close-all" data-idx="${idx}" data-gid="${g.id}">Cerrar todo el grupo</button>
    </div>
  </div>`;
}

function renderPosition(p, idx){
  const car=capitalAtRisk(p), pl=positionPL(p); const {roi,ann}=positionROI(p);
  const legsRows=(p.legs||[]).map((l,i)=>`
    <tr>
      <td>${l.ticker}</td><td>${l.option_type}</td><td>${l.action}</td>
      <td>${fmt(l.strike)}</td><td>${l.expiry||""} <span class="dte">${l.expiry?`(${dte(l.expiry)} DTE)`:''}</span></td><td>${fmt(l.premium)}</td>
      <td>${l.contracts}</td><td>${fmt(l.fees)}</td><td>${l.open_date||""}</td><td>${l.close_date||""}</td>
      <td>${l.status||"Abierta"}</td><td>${fmt(l.pl)}</td><td>${l.notes||""}</td>
      <td>
        <button class="ghost" data-act="leg-edit" data-idx="${idx}" data-leg="${i}">Editar</button>
        <button class="ghost" data-act="leg-close" data-idx="${idx}" data-leg="${i}">Cerrar</button>
        <button class="ghost" data-act="leg-close-partial" data-idx="${idx}" data-leg="${i}">Cierre parcial</button>
        <button class="ghost" data-act="leg-assign" data-idx="${idx}" data-leg="${i}">Asignar/Ejercitar</button>
        <button class="ghost" data-act="leg-del" data-idx="${idx}" data-leg="${i}">Eliminar</button>
      </td>
    </tr>
  `).join("");
  const groupsHTML=(p.groups||[]).map(g=>renderGroup(p,g,idx)).join("");
  return `<div class="position">
    <div class="head">
      <div>
        <strong>${p.title}</strong> ${badgeForStatus(p.status)}
        <div class="meta">Estrategia: ${p.strategy||"(mixta)"} • Tags: ${(p.tags||[]).join(", ")||"—"} • Abierta: ${p.open_date||""} ${p.close_date?("• Cerrada: "+p.close_date):""}</div>
        <div class="meta">Acciones: ${p.shares||0} • Basis: ${fmt(p.cost_basis||0)} • País: ${p.tax_country||"—"} • Cuenta: ${p.account_type||"—"}</div>
      </div>
      <div class="meta">
        CAR: <strong>${fmt(car)}</strong> • P&L neto: <strong>${fmt(pl)}</strong> • ROI: <strong>${roi!=null?fmt(roi*100)+"%":"—"}</strong> • Anual.: <strong>${ann!=null?fmt(ann*100)+"%":"—"}</strong>
      </div>
      <div class="row">
        <button class="ghost" data-act="pos-status" data-idx="${idx}">Estado</button>
        <button class="ghost" data-act="pos-close" data-idx="${idx}">Cerrar</button>
        <button class="ghost" data-act="pos-assign-put" data-idx="${idx}">Asignar Put</button>
        <button class="ghost" data-act="pos-assign-call" data-idx="${idx}">Asignar Call</button>
        <button class="ghost" data-act="pos-make-group" data-idx="${idx}">Crear grupo</button>
        <button class="ghost" data-act="pos-edit" data-idx="${idx}">Editar</button>
        <button class="ghost" data-act="pos-del" data-idx="${idx}">Eliminar</button>
      </div>
    </div>
    ${groupsHTML}
    <div class="legs tableWrap">
      <table>
        <thead><tr>
          <th>Ticker</th><th>Tipo</th><th>Acción</th><th>Strike</th><th>Venc./DTE</th><th>Prima</th><th>Contr.</th><th>Fees</th><th>Apertura</th><th>Cierre</th><th>Estado</th><th>P&L</th><th>Notas</th><th>Acciones</th>
        </tr></thead>
        <tbody>${legsRows || '<tr><td colspan="14" class="muted">Sin piernas aún.</td></tr>'}</tbody>
      </table>
    </div>
  </div>`;
}

// ====== KPIs with DTE ======
function median(arr){ const a=[...arr].sort((x,y)=>x-y); if(a.length===0) return null; const m=Math.floor(a.length/2); return a.length%2? a[m] : (a[m-1]+a[m])/2; }
function kpisAndStrategyTable(){
  const ps=loadPositions();
  let netPL=0, closed=0, wins=0;
  const strat=new Map();
  const dtes=[];
  for(const p of ps){
    const pl=positionPL(p); netPL+=pl;
    if(p.status==="Cerrada"){ closed++; if(pl>0) wins++; }
    const k=p.strategy||"(mixta)"; if(!strat.has(k)) strat.set(k, []); strat.get(k).push(p);
    for(const l of (p.legs||[])){ if((l.status||"Abierta")==="Abierta" && l.expiry){ dtes.push(dte(l.expiry)); } }
  }
  document.getElementById("kpiNetPL").textContent = fmt(netPL);
  document.getElementById("kpiWinRate").textContent = closed? fmt(wins/closed*100)+"%" : "—";
  const anns = ps.filter(p=>p.status==="Cerrada").map(p=>positionROI(p).ann).filter(a=>a!=null&&isFinite(a));
  const annAvg = anns.length? anns.reduce((a,b)=>a+b,0)/anns.length*100 : null;
  document.getElementById("kpiAnn").textContent = annAvg!=null? fmt(annAvg)+"%" : "—";

  const avg = dtes.length? dtes.reduce((a,b)=>a+b,0)/dtes.length : null;
  const med = median(dtes);
  const soon = dtes.length? (dtes.filter(x=>x<=7).length / dtes.length * 100) : null;
  document.getElementById("kpiDteAvg").textContent = avg!=null? fmt(avg,1) : "—";
  document.getElementById("kpiDteMed").textContent = med!=null? fmt(med,1) : "—";
  document.getElementById("kpiDteSoon").textContent = soon!=null? fmt(soon,1)+"%" : "—";

  const tbody=document.querySelector("#strategyTable tbody"); tbody.innerHTML="";
  for(const [name, list] of strat.entries()){
    const plSum=list.reduce((a,b)=>a+positionPL(b),0);
    const rois=list.map(p=>positionROI(p).roi).filter(x=>x!=null&&isFinite(x));
    const roiAvg=rois.length? rois.reduce((a,b)=>a+b,0)/rois.length*100 : null;
    const anns=list.map(p=>positionROI(p).ann).filter(x=>x!=null&&isFinite(x));
    const annAvgS=anns.length? anns.reduce((a,b)=>a+b,0)/anns.length*100 : null;
    const cls=list.filter(p=>p.status==="Cerrada"); const winsS=cls.filter(p=>positionPL(p)>0);
    const wr=cls.length? winsS.length/cls.length*100 : null;
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${name}</td><td>${list.length}</td><td>${fmt(plSum)}</td><td>${roiAvg!=null?fmt(roiAvg)+"%":"—"}</td><td>${annAvgS!=null?fmt(annAvgS)+"%":"—"}</td><td>${wr!=null?fmt(wr)+"%":"—"}</td>`;
    tbody.appendChild(tr);
  }
}

// ====== CSV parsing & presets (incl. IBKR + Tradier) ======
function normalizeHeader(h){
  return (h||"").toString().trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g," ").replace(/[^a-z0-9 %/._-]/g,"");
}
function detectDelimiter(line){
  const c = (line.match(/,/g)||[]).length;
  const s = (line.match(/;/g)||[]).length;
  const t = (line.match(/\t/g)||[]).length;
  const max = Math.max(c,s,t);
  if(max===0) return ",";
  if(s===max) return ";";
  if(t===max) return "\t";
  return ",";
}
function parseCSV(text){
  const lines = text.split(/\r?\n/);
  const nonEmpty = lines.filter((l,i)=> i===0 || l.trim().length>0);
  const delim = detectDelimiter(nonEmpty[0]||"");
  function splitCSV(line){
    const out=[]; let cur=""; let inQ=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){ if(inQ && line[i+1]==='"'){ cur+='"'; i++; } else { inQ=!inQ; } continue; }
      if(ch===delim && !inQ){ out.push(cur); cur=""; continue; }
      cur+=ch;
    }
    out.push(cur);
    return out;
  }
  const headers = splitCSV(nonEmpty[0]).map(h=>h.trim());
  const normHeaders = headers.map(h=>normalizeHeader(h));
  const rows = nonEmpty.slice(1).map(line => {
    const cells = splitCSV(line);
    const obj = {}; headers.forEach((h,idx)=> obj[h] = (cells[idx]!==undefined ? cells[idx] : ""));
    return obj;
  }).filter(r => Object.values(r).some(v => (v||"").trim()!==""));
  return { headers, normHeaders, rows };
}
function pickHeader(aliasList, headers, normHeaders){
  for(const a of aliasList){
    const na = normalizeHeader(a);
    const i = normHeaders.indexOf(na);
    if(i>=0) return headers[i];
    const j = normHeaders.findIndex(h => h.startsWith(na));
    if(j>=0) return headers[j];
    const k = normHeaders.findIndex(h => h.includes(na));
    if(k>=0) return headers[k];
  }
  return null;
}
const PRESETS = {
  ibkr: {
    ticker: ["underlying symbol","underlying","simbolo subyacente","root"],
    option_type: ["put/call","right","tipo","put o call","right type"],
    action: ["buy/sell","side","compra/venta","action"],
    open_close: ["open/close","open close","opening/closing","oc","opening or closing","open/close indicator"],
    strike: ["strike","strike price","precio de ejercicio"],
    expiry: ["expiration date","expiration","fecha de vencimiento","vencimiento","expiry"],
    premium: ["trade price","price","fill price","precio de la operacion","precio de ejecucion"],
    contracts: ["quantity","qty","cantidad","contracts"],
    fees: ["commission","commissions & fees","comisiones","comision","fees"],
    pl: ["realized p/l","p/l","profit/loss","ganancia/perdida realizada","p&l realizado"],
    open_date: ["trade date","trade date/time","fecha de operacion","fecha/hora de la operacion"],
    close_date: ["close date","closing date"],
    notes: ["description","descripcion","instrument","option symbol"],
    title: ["underlying symbol","underlying","root"]
  },
  tos: { ticker:["underlying symbol","symbol","root","symbol root"], option_type:["put/call","right","type","option type"], action:["buy/sell","side","action","b/s","order action","instruction"], open_close:["open/close","opening/closing","oc","position effect"], strike:["strike","strike price"], expiry:["expiration date","expiration","exp date"], premium:["price","trade price","fill price","avg price","average price"], contracts:["quantity","qty","contracts","filled quantity"], fees:["commission","fees","exchange fees","reg fees","clearing fees"], pl:["p/l","realized p/l","realized profit/loss"], open_date:["trade date","date","fill date","execution time"], close_date:[], notes:["description","instrument","order #","order id"], title:["underlying symbol","symbol","root"] },
  tasty: { ticker:["underlying symbol","underlying","symbol"], option_type:["put/call","right","type","option type"], action:["side","action","buy/sell","b/s","instruction"], open_close:["open/close","opening/closing","position effect","oc"], strike:["strike","strike price"], expiry:["expiration date","expiration","expiry"], premium:["price","trade price","fill price"], contracts:["qty","quantity","contracts"], fees:["commission","fees","clearing fee","exchange fee","reg fee"], pl:["realized p/l","p/l","realized profit/loss"], open_date:["date","trade date","fill date"], close_date:[], notes:["description","notes"], title:["underlying symbol","underlying","symbol"] },
  tradestation: { ticker:["symbol","underlying symbol"], option_type:["put/call","right","type","option type","call/put"], action:["buy/sell","side","action","b/s","instruction"], open_close:["open/close","opening/closing","position effect","oc"], strike:["strike","strike price"], expiry:["expiration date","expiration","expiry"], premium:["price","fill price","trade price","execution price"], contracts:["quantity","qty","contracts"], fees:["commission","fees","exchange fees","clearing fees","regulatory fees"], pl:["realized p/l","p/l","closed pl","realized profit/loss"], open_date:["date","trade date","execution time","fill date"], close_date:[], notes:["description","comment"], title:["symbol","underlying symbol"] },
  tradier: { ticker:["symbol","underlying symbol","underlying","root symbol","option symbol","instrument"], option_type:["put/call","right","type","option type","option side"], action:["buy/sell","side","action","b/s","order action","instruction","transaction"], open_close:["position effect","open/close","opening/closing","oc","effect"], strike:["strike","strike price","option strike"], expiry:["expiration","expiration date","expiry","option expiration"], premium:["price","trade price","fill price","execution price","amount"], contracts:["quantity","qty","contracts","filled quantity","filled qty"], fees:["commission","fees","exchange fees","regulatory fees","clearing fees","reg fee","clearing fee","other fees"], pl:["realized p/l","p/l","realized profit/loss","p/l realized","gain/loss"], open_date:["trade date","date","execution time","trade time","timestamp"], close_date:["close date","closing date"], notes:["description","memo","note","comment","details"], title:["symbol","underlying","root symbol","option symbol"] },
  tradier_activity: { ticker:["symbol"], option_type:["right","type","option type","description"], action:["type","transaction","action"], open_close:["position effect","effect","open/close"], strike:["strike","option strike","description"], expiry:["expiration","option expiration","description"], premium:["price","amount","trade price","execution price"], contracts:["quantity","qty"], fees:["commission","fees"], pl:["realized p/l","p/l","gain/loss"], open_date:["date","trade date","timestamp"], close_date:["close date"], notes:["description","memo","details"], title:["symbol"] },
  tradier_statement: { ticker:["root symbol","underlying","symbol"], option_type:["right","option right"], action:["buy/sell","side","action"], open_close:["position effect","open/close","effect"], strike:["strike","option strike"], expiry:["expiration","option expiration","expiry"], premium:["price","trade price","fill price"], contracts:["quantity","qty","contracts"], fees:["commission","fees","regulatory fees","clearing fees"], pl:["realized p/l","p/l","realized profit/loss"], open_date:["trade date","date","execution time"], close_date:["close date","closing date"], notes:["note","comment","description"], title:["root symbol","symbol"] }
};
const AUTO_UNION = (()=>{
  const out={};
  for(const key of Object.keys(PRESETS)) for(const field of Object.keys(PRESETS[key])){
    out[field] = Array.from(new Set([...(out[field]||[]), ...PRESETS[key][field]]));
  }
  return out;
})();

function detectPreset(normHeaders){
  const score = {ibkr:0,tos:0,tasty:0,tradestation:0,tradier:0,tradier_activity:0,tradier_statement:0};
  const sig = { ibkr:["underlying symbol","realized p/l","trade date/time","open/close indicator"],
    tos:["order #","execution time","avg price","position effect"],
    tasty:["tasty","fees","clearing fee"],
    tradestation:["trade station","closed pl","execution price"],
    tradier:["position effect","root symbol","option symbol"],
    tradier_activity:["activity id","amount","description"],
    tradier_statement:["root symbol","option symbol","realized p/l"] };
  const normSet = new Set(normHeaders);
  for(const p of Object.keys(score)){
    for(const s of sig[p]){
      for(const h of normSet){ if(h.includes(s)) { score[p]+=2; break; } }
    }
  }
  for(const p of Object.keys(score)){
    for(const f of Object.keys(PRESETS[p])){
      const arr = PRESETS[p][f];
      if(arr.some(a => normHeaders.some(h => h.includes(normalizeHeader(a))))) score[p]+=1;
    }
  }
  const best = Object.entries(score).sort((a,b)=>b[1]-a[1])[0];
  return best && best[1]>0 ? best[0] : null;
}
function headerFor(field, headers, normHeaders, presetKey){
  const dictionary = presetKey==="auto" ? AUTO_UNION : PRESETS[presetKey] || AUTO_UNION;
  return pickHeader(dictionary[field]||[], headers, normHeaders);
}
function classifyAction(rawAction, qty, openCloseVal){
  const s = (rawAction||"").toString().toLowerCase();
  const oc = (openCloseVal||"").toString().toLowerCase();
  const q = Number(qty||0);
  let act = "";
  let isClose = false;
  if(/buy\s*to\s*close|btc\b/.test(s) || /close/.test(oc)){ act="Compra"; isClose=true; }
  else if(/sell\s*to\s*close|stc\b/.test(s) || /close/.test(oc)){ act="Venta"; isClose=true; }
  else if(/buy\s*to\s*open|bto\b/.test(s) || /open/.test(oc)){ act="Compra"; isClose=false; }
  else if(/sell\s*to\s*open|sto\b/.test(s) || /open/.test(oc)){ act="Venta"; isClose=false; }
  else if(/sell/.test(s)){ act="Venta"; }
  else if(/buy/.test(s)){ act="Compra"; }
  if(!isClose){
    if(act==="Compra" && q<0) isClose=true;
    if(act==="Venta" && q<0) isClose=false;
  }
  return { act: act || "Venta", isClose };
}
function buildMapping(headers, normHeaders, presetKey){
  const fields = ["ticker","option_type","action","open_close","strike","expiry","premium","contracts","fees","pl","open_date","close_date","notes","title"];
  const mapping = {};
  for(const f of fields){ mapping[f] = headerFor(f, headers, normHeaders, presetKey); }
  const required = ["ticker","option_type","action","strike","expiry","premium","contracts"];
  const missing = required.filter(k => !mapping[k]);
  return { mapping, required, missing, headers, normHeaders };
}

function importCSV_parseOne(text, presetKey, globalSets){
  const { headers, normHeaders, rows } = parseCSV(text);
  let preset = presetKey;
  if(preset==="auto"){
    const guess = detectPreset(normHeaders);
    if(guess) preset = guess;
  }
  let { mapping, missing } = buildMapping(headers, normHeaders, presetKey==="auto"? "auto" : preset);

  const occHeader = pickHeader(["option symbol","symbol","symbol (occ)","occ symbol"], headers, normHeaders);

  if(missing.length && occHeader){
    missing = missing.filter(k => !["option_type","strike","expiry","ticker"].includes(k));
  }
  if(missing.length){
    return { error: `Preset "${presetKey}" ${presetKey==="auto" && preset ? "(auto→"+preset+")" : ""}: faltan columnas: ${missing.join(", ")}` };
  }

  const ps = globalSets.positions;
  const posIndex = globalSets.posIndex;
  const dedupe = globalSets.dedupe;

  let added = 0, skipped = 0;
  for(const row of rows){
    const titleKey = (mapping.title && row[mapping.title]) || (mapping.ticker && row[mapping.ticker]) || (occHeader && row[occHeader]) || "Import CSV";
    if(!posIndex.has(titleKey)){
      const pos = {
        id: crypto.randomUUID?crypto.randomUUID():String(Date.now()),
        title: String(titleKey||"Import CSV"),
        strategy: "",
        open_date: (mapping.open_date && normDate(row[mapping.open_date])) || todayISO(),
        close_date: "",
        status: "Abierta",
        cost_basis: "",
        shares: 0,
        tags: ["import_csv", preset||presetKey],
        notes: "",
        tax_country: "CA",
        account_type: "Margin",
        legs: [], groups: []
      };
      ps.push(pos); posIndex.set(titleKey, pos);
    }
    const pos = posIndex.get(titleKey);

    let ticker = mapping.ticker ? String(row[mapping.ticker]||"").toUpperCase() : "";
    let optTypeRaw = mapping.option_type ? String(row[mapping.option_type]||"") : "";
    let optType = /put/i.test(optTypeRaw) && !/call/i.test(optTypeRaw) ? "Put" : (/call|c\b/i.test(optTypeRaw) ? "Call" : (optTypeRaw.toLowerCase().includes("p") && !optTypeRaw.toLowerCase().includes("c") ? "Put" : ""));
    let strike = mapping.strike ? row[mapping.strike] : "";
    let expiry = mapping.expiry ? normDate(row[mapping.expiry]) : "";

    if((!ticker || !optType || !strike || !expiry) && occHeader){
      const occ = parseOCC(row[occHeader]);
      if(occ){
        ticker = ticker || occ.ticker;
        optType = optType || occ.option_type;
        strike = strike || occ.strike;
        expiry = expiry || occ.expiry;
      }
    }

    const rawAction = mapping.action ? String(row[mapping.action]||"") : "";
    const openCloseVal = mapping.open_close ? row[mapping.open_close] : "";
    const qtyRaw = mapping.contracts ? row[mapping.contracts] : "1";
    const qtyAbs = Math.abs(valueNum(qtyRaw)||1);
    const { act, isClose } = classifyAction(rawAction, valueNum(qtyRaw), openCloseVal);

    const key = [
      String(ticker||"").toUpperCase(),
      optType||"",
      act, isClose ? "CLOSE":"OPEN",
      String(strike||""),
      expiry||"",
      (mapping.open_date && normDate(row[mapping.open_date])) || "",
      String(mapping.premium ? normalizeNumberString(row[mapping.premium]) : ""),
      String(qtyAbs)
    ].join("|");
    if(dedupe.has(key)){ skipped++; continue; }
    dedupe.add(key);

    const leg = {
      id: crypto.randomUUID?crypto.randomUUID():String(Date.now()),
      ticker: String(ticker||"").toUpperCase(),
      option_type: optType || "Call",
      action: act,
      strike: strike,
      expiry: expiry,
      premium: mapping.premium ? normalizeNumberString(row[mapping.premium]) : "",
      contracts: String(qtyAbs),
      underlying: "",
      fees: String(mapping.fees ? normalizeNumberString(row[mapping.fees]) : "0"),
      open_date: mapping.open_date ? normDate(row[mapping.open_date]) : todayISO(),
      close_date: isClose ? ((mapping.close_date && normDate(row[mapping.close_date])) || (mapping.open_date ? normDate(row[mapping.open_date]) : todayISO())) : "",
      status: isClose ? "Cerrada" : "Abierta",
      pl: mapping.pl ? normalizeNumberString(row[mapping.pl]) : "",
      notes: mapping.notes ? row[mapping.notes] : (occHeader ? row[occHeader] : ""),
      width: ""
    };
    pos.legs.push(leg);
    autoDetectSpreads(pos);
    autoCreateGroups(pos);
    added++;
  }
  return { added, skipped, preset: preset||presetKey };
}
async function importCSV_multi(files, presetKey="auto"){
  const globalSets = { positions: loadPositions(), posIndex: new Map(), dedupe: new Set() };
  for(const p of globalSets.positions){ globalSets.posIndex.set(p.title, p); }
  let totalAdded=0, totalSkipped=0, usedPreset=null;
  for(const file of files){
    const text = await file.text();
    const res = importCSV_parseOne(text, presetKey, globalSets);
    if(res.error){ alert("Archivo: "+file.name+" → "+res.error); continue; }
    totalAdded += res.added||0; totalSkipped += res.skipped||0; usedPreset = usedPreset || res.preset;
  }
  savePositions(globalSets.positions);
  renderPositions();
  alert(`Importación múltiple completada (${presetKey}${usedPreset && presetKey==="auto" ? "→"+usedPreset : ""}).\nAñadidas: ${totalAdded}\nOmitidas (duplicadas): ${totalSkipped}`);
}

// Partial close
function partialCloseLeg(pos, legIdx, contractsToClose, plTotal, fees=0){
  const l = pos.legs[legIdx]; if(!l) return;
  const total = Number(l.contracts||0);
  contractsToClose = Math.min(total, Math.max(1, Number(contractsToClose||0)));
  const remaining = total - contractsToClose;
  if (remaining < 0) return;
  const closedLeg = {...l};
  closedLeg.id = crypto.randomUUID?crypto.randomUUID():String(Date.now());
  closedLeg.contracts = String(contractsToClose);
  closedLeg.status = "Cerrada";
  closedLeg.close_date = todayISO();
  closedLeg.pl = String(plTotal);
  closedLeg.fees = String(Number(closedLeg.fees||0) + Number(fees||0));
  l.contracts = String(remaining);
  if (remaining===0){ l.status="Cerrada"; l.close_date = l.close_date || todayISO(); }
  pos.legs.splice(legIdx+1, 0, closedLeg);
}

// Export CSV / backup JSON
function exportCSV(){
  const headers=["position_id","position_title","strategy","pos_status","open_date","close_date","cost_basis","shares","tags","tax_country","account_type","group_count","leg_id","ticker","option_type","action","strike","expiry","DTE","premium","contracts","underlying","fees","leg_status","pl","leg_open_date","leg_close_date","notes","width"];
  const rows=[headers.join(",")];
  for(const p of loadPositions()){
    const groupCount=(p.groups||[]).length;
    for(const l of (p.legs||[])){
      const vals=[p.id,p.title,p.strategy,p.status,p.open_date,p.close_date,p.cost_basis,p.shares,(p.tags||[]).join("|"),p.tax_country||"",p.account_type||"",groupCount,l.id,l.ticker,l.option_type,l.action,l.strike,l.expiry,String(dte(l.expiry)),l.premium,l.contracts,l.underlying,l.fees,l.status,l.pl,l.open_date,l.close_date,l.notes,l.width||""];
      const cells=vals.map(v=>{ const s=String(v??"").replace(/"/g,'""'); return /[",\n]/.test(s)?`"${s}"`:s; });
      rows.push(cells.join(","));
    }
  }
  const blob=new Blob([rows.join("\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="positions_v7_6.csv"; a.click(); URL.revokeObjectURL(url);
}
function exportCSVFiltered(){
  const headers=["position_id","position_title","strategy","pos_status","open_date","close_date","cost_basis","shares","tags","tax_country","account_type","group_count","leg_id","ticker","option_type","action","strike","expiry","DTE","premium","contracts","underlying","fees","leg_status","pl","leg_open_date","leg_close_date","notes","width"];
  const rows=[headers.join(",")];
  const filters = currentFilters();
  const list = applyFiltersToPositions(loadPositions(), filters);
  for(const p of list){
    const groupCount=(p.groups||[]).length;
    for(const l of (p.legs||[])){
      const vals=[p.id,p.title,p.strategy,p.status,p.open_date,p.close_date,p.cost_basis,p.shares,(p.tags||[]).join("|"),p.tax_country||"",p.account_type||"",groupCount,l.id,l.ticker,l.option_type,l.action,l.strike,l.expiry,String(dte(l.expiry)),l.premium,l.contracts,l.underlying,l.fees,l.status,l.pl,l.open_date,l.close_date,l.notes,l.width||""];
      const cells=vals.map(v=>{ const s=String(v??"").replace(/"/g,'""'); return /[",\n]/.test(s)?`"${s}"`:s; });
      rows.push(cells.join(","));
    }
  }
  const blob=new Blob([rows.join("\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="positions_v7_6_filtered.csv"; a.click(); URL.revokeObjectURL(url);
}
function backupJSON(){
  const payload={version:7.62, exported_at:new Date().toISOString(), positions:loadPositions()};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="positions_backup_v7_6_2.json"; a.click(); URL.revokeObjectURL(url);
}
function importJSONFile(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const data=JSON.parse(reader.result); const positions=Array.isArray(data)?data:(data.positions||[]);
      if(!Array.isArray(positions)) throw new Error("Formato inválido");
      const current=loadPositions(); const merged=[...positions, ...current];
      savePositions(merged); renderPositions(); alert("Importación completada.");
    }catch(e){ alert("No se pudo importar: "+e.message); }
  };
  reader.readAsText(file);
}

// Assignment helpers
function applyAssignment(pos, type){
  const idx=prompt("Índice de la pierna (0..n-1) para asignación/ejercicio:"); if(idx===null) return;
  const i=Number(idx); const leg=(pos.legs||[])[i]; if(!leg){ alert("Índice inválido."); return; }
  const qty=Number(leg.contracts||0)*100; const strike=Number(leg.strike||0);
  if(type==="PUT_ASSIGN"){
    const prevShares=Number(pos.shares||0), prevBasis=Number(pos.cost_basis||0);
    const newShares=prevShares+qty; const totalCost=strike*qty; const newBasis=newShares?((prevShares*prevBasis)+totalCost)/newShares:0;
    pos.shares=newShares; pos.cost_basis=newBasis; pos.status="Asignada"; leg.status="Asignada"; leg.close_date=todayISO();
  }else if(type==="CALL_ASSIGN"){
    const prevShares=Number(pos.shares||0); if(prevShares<qty){ alert("No hay suficientes acciones."); return; }
    const basis=Number(pos.cost_basis||0); const plShares=(strike-basis)*qty; leg.pl=Number(leg.pl||0)+plShares; pos.shares=prevShares-qty; pos.status="Asignada"; leg.status="Asignada"; leg.close_date=todayISO();
  }
}

// Rolling
function simulateRoll(){
  const ps=loadPositions(); if(ps.length===0){ alert("No hay posiciones."); return; }
  const pickTitle=prompt("Título de la posición a rolar (exacto):\n"+ps.map(p=>p.title).join("\n"));
  const pos=ps.find(p=>p.title===pickTitle); if(!pos){ alert("No encontrada."); return; }
  const legIdx=Number(prompt("Índice de la pierna a rolar (0..n-1):")); const leg=pos.legs[legIdx]; if(!leg){ alert("Índice inválido."); return; }
  const newExpiry=prompt("Nueva fecha de vencimiento (YYYY-MM-DD):", leg.expiry);
  const newStrike=prompt("Nuevo strike:", leg.strike);
  const addPremium=Number(prompt("Prima adicional que se recibe (+) o paga (−):","0")||0);
  const addFees=Number(prompt("Fees adicionales:","0")||0);
  const currentPL=Number(leg.pl||0); const netCredit=addPremium*Number(leg.contracts||0)*100 - addFees; const newPL=currentPL+netCredit;
  const car=capitalAtRisk(pos); const days=Math.max(1, daysBetween(pos.open_date || todayISO(), newExpiry)); const roi=car>0 ? (positionPL(pos)-Number(leg.pl||0)+newPL) / car : null; const ann=roi!=null ? roi*(365/Math.max(1,days)) : null;
  const msg=`Rolling de ${leg.ticker} ${leg.option_type} ${leg.action}
Prima neta (después de fees): ${fmt(netCredit)}
P&L de la pierna pasaría de ${fmt(currentPL)} a ${fmt(newPL)}
ROI hipotético posición: ${roi!=null?fmt(roi*100)+"%":"—"} • Anualizado: ${ann!=null?fmt(ann*100)+"%":"—"}

¿Aplicar cambios?`;
  if(confirm(msg)){ leg.expiry=newExpiry; leg.strike=newStrike; leg.pl=newPL; leg.notes=(leg.notes||"")+" | Rolled"; autoDetectSpreads(pos); autoCreateGroups(pos); savePositions(ps); renderPositions(); }
}
function autoRollByRules(){
  const ps=loadPositions(); if(ps.length===0){ alert("No hay posiciones."); return; }
  const dteTh=Number(prompt("Umbral de DTE (<=):", "7")||7);
  const addDays=Number(prompt("Agregar días al vencimiento (ej. 14):","14")||14);
  const minCreditPerContract=Number(prompt("Crédito neto mínimo por contrato (USD):","10")||10);
  const applyAll=confirm("¿Aplicar automáticamente todos los rollings sugeridos? (OK=Sí, Cancel=Revisar uno por uno)");
  let applied=0, suggested=0;
  for(const p of ps){
    for(let i=0;i<(p.legs||[]).length;i++){
      const l=p.legs[i];
      if((l.status||"Abierta")!=="Abierta") continue;
      if(l.action!=="Venta") continue;
      const d=dte(l.expiry);
      if(d==="" || d>dteTh) continue;
      suggested++;
      const newExp = new Date(l.expiry+"T00:00:00"); newExp.setDate(newExp.getDate()+addDays);
      const newExpiryISO = newExp.toISOString().slice(0,10);
      const estCredit = minCreditPerContract;
      const netCredit = estCredit*Number(l.contracts||0);
      const msg = `Sugerencia: ${p.title}\n${l.ticker} ${l.option_type} ${l.action} ${l.strike} exp ${l.expiry} (DTE ${d})\n→ Roll a ${newExpiryISO} (mismo strike)\nCrédito estimado: ${fmt(netCredit)}\n¿Aplicar?`;
      if(applyAll || confirm(msg)){
        l.expiry = newExpiryISO;
        l.pl = String(Number(l.pl||0) + netCredit);
        l.notes = (l.notes||"") + ` | Auto-rolled +${fmt(netCredit)} to ${newExpiryISO}`;
        applied++;
      }
    }
    autoDetectSpreads(p); autoCreateGroups(p);
  }
  savePositions(ps); renderPositions();
  alert(`Rolling por reglas: sugeridos=${suggested}, aplicados=${applied}`);
}

// Filters & charts
function currentFilters(){ return { q:(document.getElementById("search").value||"").trim(), status:document.getElementById("statusFilter").value, tag:(document.getElementById("tagFilter").value||"").trim(), from:document.getElementById("fromDate").value, to:document.getElementById("toDate").value }; }
function applyFiltersToPositions(list,f){ return list.filter(p=>{ const blob=`${p.title} ${p.notes} ${(p.tags||[]).join(" ")} ${(p.legs||[]).map(l=>l.ticker+" "+l.notes).join(" ")}`.toLowerCase(); if(f.q && !blob.includes(f.q.toLowerCase())) return false; if(f.status!=="all" && (p.status||"Abierta")!==f.status) return false; if(f.tag){ const tags=(p.tags||[]).map(t=>t.toLowerCase().trim()); if(!tags.includes(f.tag.toLowerCase().trim())) return false; } if(f.from && (!p.open_date || p.open_date < f.from)) return false; if(f.to && (!p.open_date || p.open_date > f.to)) return false; return true; }); }
function refreshViewsSelect(){ const sel=document.getElementById("savedViews"); const vs=loadViews(); sel.innerHTML=`<option value="">(vistas guardadas)</option>` + vs.map(v=>`<option>${v.name}</option>`).join(""); }
function saveCurrentView(){ const name=prompt("Nombre de la vista:"); if(!name) return; const views=loadViews(); views.push({name, filters:currentFilters()}); saveViews(views); refreshViewsSelect(); alert("Vista guardada."); }
function deleteCurrentView(){ const sel=document.getElementById("savedViews"); const name=sel.value; if(!name) return; const views=loadViews().filter(v=>v.name!==name); saveViews(views); refreshViewsSelect(); }
function applySelectedView(){ const sel=document.getElementById("savedViews"); const name=sel.value; if(!name) return; const v=loadViews().find(x=>x.name===name); if(!v) return; const f=v.filters; document.getElementById("search").value=f.q||""; document.getElementById("statusFilter").value=f.status||"all"; document.getElementById("tagFilter").value=f.tag||""; document.getElementById("fromDate").value=f.from||""; document.getElementById("toDate").value=f.to||""; renderPositions(); }

function enumerateDays(start,end){ const out=[]; let d=new Date(start); const E=new Date(end); while(d<=E){ out.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1);} return out; }
function dateBounds(){ const ps=loadPositions(); const opens=ps.map(p=>p.open_date).filter(Boolean).sort(); const closes=ps.map(p=>p.close_date || todayISO()).sort(); const start=opens[0]||todayISO(); const end=closes[closes.length-1]||todayISO(); return {start,end}; }
function timeSeries(){ const {start,end}=dateBounds(); const days=enumerateDays(start,end); const eq=[]; const cap=[]; let cum=0; for(const day of days){ let capDay=0, pnlDay=0; for(const p of loadPositions()){ const opened=p.open_date && day>=p.open_date; const closed=p.close_date && day>p.close_date; if(opened && !closed) capDay += capitalAtRisk(p); for(const l of (p.legs||[])){ if(l.close_date===day && ["Cerrada","Asignada","Ejercitada"].includes(l.status)){ pnlDay += Number(l.pl||0) - Number(l.fees||0); } } } cum+=pnlDay; eq.push(cum); cap.push(capDay);} return {days,eq,cap}; }
function wireCharts(){ const canvas=document.getElementById("chartCanvas"); document.getElementById("chartEq").addEventListener("click",()=>{ const {days,eq}=timeSeries(); drawLineChart(canvas, days, eq, "Equity (acumulado P&L)"); }); document.getElementById("chartCap").addEventListener("click",()=>{ const {days,cap}=timeSeries(); drawLineChart(canvas, days, cap, "Capital comprometido diario"); }); document.getElementById("chartPL").addEventListener("click",()=>{ const map=new Map(); for(const p of loadPositions()) for(const l of (p.legs||[])){ if(l.close_date && ["Cerrada","Asignada","Ejercitada"].includes(l.status)){ const m=l.close_date.slice(0,7); const net=Number(l.pl||0)-Number(l.fees||0); map.set(m,(map.get(m)||0)+net); } } const labels=Array.from(map.keys()).sort(); const values=labels.map(k=>map.get(k)); drawBarChart(canvas, labels, values, "P&L por mes (neto)"); }); document.getElementById("chartByTicker").addEventListener("click",()=>{ const map=new Map(); for(const p of loadPositions()) for(const l of (p.legs||[])){ if(l.close_date && ["Cerrada","Asignada","Ejercitada"].includes(l.status)){ const net=Number(l.pl||0)-Number(l.fees||0); map.set(l.ticker,(map.get(l.ticker)||0)+net); } } const labels=Array.from(map.keys()).sort(); const values=labels.map(k=>map.get(k)); drawBarChart(canvas, labels, values, "P&L por ticker (neto)"); }); document.getElementById("chartPremios").addEventListener("click",()=>{ let credit=0, fees=0; for(const p of loadPositions()) for(const l of (p.legs||[])){ const sign=l.action==="Venta"?1:-1; credit += sign*Number(l.premium||0)*Number(l.contracts||0)*100; fees += Number(l.fees||0);} drawBarChart(canvas, ["Crédito neto","Fees"], [credit, -fees], "Crédito neto vs Fees"); }); document.getElementById("chartROI").addEventListener("click",()=>{ const map=new Map(); for(const p of loadPositions()){ const {roi}=positionROI(p); const strat=p.strategy||"(mixta)"; if(roi==null || !isFinite(roi)) continue; map.set(strat, (map.get(strat)||[]).concat([roi*100])); } const labels=Array.from(map.keys()).sort(); const values=labels.map(k=>{ const arr=map.get(k); return arr.reduce((a,b)=>a+b,0)/arr.length; }); drawBarChart(canvas, labels, values, "ROI (%) medio por estrategia"); }); }

// CSV Tester
function testerSampleText(){
return `UNDERLYING SYMBOL,OPTION SYMBOL,BUY/SELL,OPEN/CLOSE INDICATOR,QUANTITY,TRADE PRICE,EXPIRATION DATE,STRIKE,RIGHT,TRADE DATE,TIME,COMMISSION,REALIZED P/L,DESCRIPTION
AAPL,AAPL  20250719C00180000,SELL,OPEN,1,1.25,2025-07-19,180.00,C,2025-07-01,10:31:00,-0.50,0.00,SELL 1 AAPL 19 JUL 25 180 C
AAPL,AAPL  20250719C00180000,BUY,CLOSE,1,0.50,2025-07-19,180.00,C,2025-07-10,14:12:00,-0.50,75.00,BUY 1 AAPL 19 JUL 25 180 C`;}

async function runCsvTester(){
  const presetSel=document.getElementById("testerPreset").value||"auto";
  const ta=document.getElementById("csvTester");
  const file=document.getElementById("testerFile").files[0];
  let text = ta.value.trim();
  if(file){ text = await file.text(); }
  if(!text){ alert("Pega algunas líneas o carga un archivo."); return; }

  const {headers, normHeaders, rows} = parseCSV(text);
  let detected = presetSel;
  if(presetSel==="auto"){
    const guess=detectPreset(normHeaders);
    if(guess) detected=guess;
  }
  const {mapping, missing} = buildMapping(headers, normHeaders, detected==="auto" ? "auto" : detected);

  const occHeader = pickHeader(["option symbol","symbol","symbol (occ)","occ symbol"], headers, normHeaders);

  const prev = rows.slice(0,3).map((row,idx)=>{
    let ticker = mapping.ticker? row[mapping.ticker] : "";
    let optType = mapping.option_type? String(row[mapping.option_type]||"") : "";
    optType = /put/i.test(optType) && !/call/i.test(optType) ? "Put" : (/call|c\b/i.test(optType) ? "Call" : (optType.toLowerCase().includes("p") && !optType.toLowerCase().includes("c") ? "Put" : ""));
    let strike = mapping.strike? row[mapping.strike] : "";
    let expiry = mapping.expiry? row[mapping.expiry] : "";
    if((!ticker || !optType || !strike || !expiry) && occHeader){
      const occ=parseOCC(row[occHeader]);
      if(occ){ ticker=ticker||occ.ticker; optType=optType||occ.option_type; strike=strike||occ.strike; expiry=expiry||occ.expiry; }
    }
    const rawAction = mapping.action ? String(row[mapping.action]||"") : "";
    const openCloseVal = mapping.open_close ? row[mapping.open_close] : "";
    const qtyRaw = mapping.contracts ? row[mapping.contracts] : "1";
    const qtyAbs = Math.abs(valueNum(qtyRaw)||1);
    const { act, isClose } = classifyAction(rawAction, valueNum(qtyRaw), openCloseVal);
    return {
      idx,
      ticker, type: optType||"Call", action: act + (isClose ? " (Cierre)" : " (Apertura)"),
      strike, expiry: normDate(expiry),
      premium: mapping.premium? normalizeNumberString(row[mapping.premium]) : "",
      qty: String(qtyAbs),
      fees: mapping.fees? normalizeNumberString(row[mapping.fees]) : "0",
      open_date: mapping.open_date? normDate(row[mapping.open_date]) : "",
      close_date: isClose ? ((mapping.close_date && normDate(row[mapping.close_date])) || (mapping.open_date ? normDate(row[mapping.open_date]) : "")) : "",
      notes: mapping.notes? row[mapping.notes] : (occHeader? row[occHeader] : "")
    };
  });

  const mapRows = Object.entries(mapping).map(([k,v])=>`<tr><td>${k}</td><td>${v||"<span class='muted'>—</span>"}</td></tr>`).join("");
  const prevRows = prev.map(p=>`<tr><td>${p.idx}</td><td>${p.ticker}</td><td>${p.type}</td><td>${p.action}</td><td>${p.strike}</td><td>${p.expiry}</td><td>${p.premium}</td><td>${p.qty}</td><td>${p.fees}</td><td>${p.open_date}</td><td>${p.close_date}</td><td>${p.notes}</td></tr>`).join("");

  document.getElementById("testerOut").innerHTML = `
    <h4>Resultado del Tester</h4>
    <div class="tableWrap"><table>
      <thead><tr><th>Campo interno</th><th>Columna detectada</th></tr></thead>
      <tbody>${mapRows}</tbody>
    </table></div>
    ${missing.length? `<p class="muted">⚠️ Faltan columnas requeridas: <strong>${missing.join(", ")}</strong></p>` : `<p>✅ Todas las columnas requeridas mapeadas (o resueltas por <em>Option Symbol</em> OCC).</p>`}
    <h4>Vista previa (primeras 3 filas)</h4>
    <div class="tableWrap"><table>
      <thead><tr><th>#</th><th>Ticker</th><th>Tipo</th><th>Acción</th><th>Strike</th><th>Venc.</th><th>Prima</th><th>Contr.</th><th>Fees</th><th>Open</th><th>Close</th><th>Notas</th></tr></thead>
      <tbody>${prevRows || '<tr><td colspan="12" class="muted">Sin datos</td></tr>'}</tbody>
    </table></div>
    <p class="muted">Preset seleccionado: <strong>${presetSel}</strong> • Detectado: <strong>${detected}</strong> • Cabeceras (${headers.length}): <code>${headers.join(", ")}</code></p>
  `;
}
function wireCsvTester(){
  document.getElementById("testerRun").addEventListener("click", runCsvTester);
  document.getElementById("testerSample").addEventListener("click", ()=>{
    document.getElementById("testerPreset").value = "ibkr";
    document.getElementById("csvTester").value = testerSampleText();
    document.getElementById("testerFile").value = "";
  });
}

// Wiring & init
function refreshPositionSelect(){ const sel=document.getElementById("positionSelect"); const positions=loadPositions(); const current=sel.value; sel.innerHTML=positions.map(p=>`<option value="${p.id}">${p.title}</option>`).join(""); if(current) sel.value=current; }
function renderPositions(){ const cont=document.getElementById("positionsContainer"); cont.innerHTML=""; const list=applyFiltersToPositions(loadPositions(), currentFilters()); list.forEach((p,idx)=>cont.insertAdjacentHTML("beforeend", renderPosition(p, idx))); wireButtons(); refreshDashboard(); refreshPositionSelect(); }
function refreshDashboard(){ kpisAndStrategyTable(); }
function wireTools(){ document.getElementById("simRoll").addEventListener("click", simulateRoll); document.getElementById("enableAlerts").addEventListener("click", enableAlerts); document.getElementById("autoRoll").addEventListener("click", autoRollByRules); document.getElementById("leadHours").value = loadLeadHours(); }

async function enableAlerts(){
  const lead=Number(document.getElementById("leadHours").value||36); saveLeadHours(lead);
  if(!("Notification" in window)){ alert("Tu navegador no soporta notificaciones."); return; }
  const perm=await Notification.requestPermission(); if(perm!=="granted"){ alert("Permiso no concedido."); return; }
  const now=new Date();
  for(const p of loadPositions()) for(const l of (p.legs||[])){
    if(!l.expiry) continue; const exp=new Date(l.expiry+"T16:00:00"); const diff=exp-now;
    if(diff>0 && diff<lead*3600*1000 && (l.status||"Abierta")==="Abierta"){
      setTimeout(()=>{ new Notification("Vencimiento próximo",{ body:`${p.title} — ${l.ticker} ${l.option_type} ${l.action} ${l.strike} vence ${l.expiry} (${dte(l.expiry)} DTE)` }); }, Math.min(diff, 5000));
    }
  }
  alert(`Alertas configuradas con ${lead}h de anticipo.`);
}
function wireButtons(){
  document.querySelectorAll("[data-act]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const act=btn.dataset.act; const idx=Number(btn.dataset.idx);
      const legIdx = btn.dataset.leg ? Number(btn.dataset.leg) : null;
      const gid = btn.dataset.gid || null;
      const ps=loadPositions(); const p=ps[idx]; if(!p) return;

      if(act==="pos-del"){ if(confirm("¿Eliminar posición?")){ ps.splice(idx,1); savePositions(ps); renderPositions(); } }
      if(act==="pos-edit"){ const fields=["title","strategy","open_date","close_date","cost_basis","shares","notes","status","tags","tax_country","account_type"]; for(const f of fields){ const cur=f==="tags"?(p.tags||[]).join(", "):(p[f]??""); const val=prompt(`Editar ${f}:`, cur); if(val===null) continue; if(f==="tags") p.tags=val.split(",").map(s=>s.trim()).filter(Boolean); else p[f]=val; } savePositions(ps); renderPositions(); }
      if(act==="pos-status"){ const st=prompt("Estado: Abierta, Cerrada, Rolled, Asignada, Ejercitada", p.status||"Abierta"); if(st){ p.status=st; if(st==="Cerrada" && !p.close_date) p.close_date=todayISO(); savePositions(ps); renderPositions(); } }
      if(act==="pos-close"){ p.status="Cerrada"; p.close_date=todayISO(); savePositions(ps); renderPositions(); }
      if(act==="pos-assign-put"){ applyAssignment(p, "PUT_ASSIGN"); savePositions(ps); renderPositions(); }
      if(act==="pos-assign-call"){ applyAssignment(p, "CALL_ASSIGN"); savePositions(ps); renderPositions(); }
      if(act==="pos-make-group"){ const name=prompt("Nombre del grupo:"); if(!name) return; const idxs=prompt("Índices de piernas (coma):"); if(!idxs) return; const arr=idxs.split(",").map(s=>Number(s.trim())).filter(Number.isInteger); p.groups=p.groups||[]; p.groups.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()), name, legs:arr}); savePositions(ps); renderPositions(); }

      if(act==="grp-del" && gid){ p.groups=(p.groups||[]).filter(g=>g.id!==gid); savePositions(ps); renderPositions(); }
      if(act==="grp-edit" && gid){ const g=(p.groups||[]).find(x=>x.id===gid); if(!g) return; const name=prompt("Nuevo nombre:", g.name); if(name!==null) g.name=name; const idxs=prompt("Nuevos índices (coma):", g.legs.join(",")); if(idxs!==null) g.legs=idxs.split(",").map(s=>Number(s.trim())).filter(Number.isInteger); savePositions(ps); renderPositions(); }
      if(act==="grp-close-partial" && gid){ const g=(p.groups||[]).find(x=>x.id===gid); if(!g) return; const pct=Number(prompt("Porcentaje a cerrar (0-100):","50")||50)/100; for(const li of g.legs){ const l=p.legs[li]; if(!l || (l.status||"Abierta")!=="Abierta") continue; const closeContr=Math.max(1, Math.floor(Number(l.contracts||0)*pct)); const pl=Number(prompt(`P&L total para cerrar ${closeContr} contr. de pierna ${li} (${l.ticker} ${l.option_type} ${l.action} ${l.strike})`,"0")||0); const fees=Number(prompt("Fees para esta pierna cerrada:","0")||0); partialCloseLeg(p, li, closeContr, pl, fees); } savePositions(ps); renderPositions(); }
      if(act==="grp-close-all" && gid){ const g=(p.groups||[]).find(x=>x.id===gid); if(!g) return; for(const li of g.legs){ const l=p.legs[li]; if(!l || (l.status||"Abierta")!=="Abierta") continue; const contr=Number(l.contracts||0); const pl=Number(prompt(`P&L total para cerrar ${contr} contr. de pierna ${li} (${l.ticker} ${l.option_type} ${l.action} ${l.strike})`,"0")||0); const fees=Number(prompt("Fees para esta pierna cerrada:","0")||0); partialCloseLeg(p, li, contr, pl, fees); } savePositions(ps); renderPositions(); }

      if(act==="leg-del" && legIdx!=null){ if(confirm("¿Eliminar pierna?")){ p.legs.splice(legIdx,1); savePositions(ps); renderPositions(); } }
      if(act==="leg-edit" && legIdx!=null){ const l=p.legs[legIdx]; const fields=["ticker","option_type","action","strike","expiry","premium","contracts","underlying","fees","open_date","close_date","status","pl","notes","width"]; for(const f of fields){ const val=prompt(`Editar ${f}:`, l[f]??""); if(val===null) continue; l[f]=(f==="ticker")?val.toUpperCase():val; } autoDetectSpreads(p); autoCreateGroups(p); savePositions(ps); renderPositions(); }
      if(act==="leg-close" && legIdx!=null){ const l=p.legs[legIdx]; l.status="Cerrada"; const pl=prompt("P&L de esta pierna:", l.pl||""); if(pl!==null) l.pl=pl; l.close_date=todayISO(); savePositions(ps); renderPositions(); }
      if(act==="leg-close-partial" && legIdx!=null){ const l=p.legs[legIdx]; const maxContr=Number(l.contracts||0); const c=Number(prompt(`Contratos a cerrar (1..${maxContr}):`, Math.max(1, Math.floor(maxContr/2)))||1); const pl=Number(prompt("P&L total de la parte cerrada:","0")||0); const fees=Number(prompt("Fees de la parte cerrada:","0")||0); partialCloseLeg(p, legIdx, c, pl, fees); savePositions(ps); renderPositions(); }
      if(act==="leg-assign" && legIdx!=null){ const l=p.legs[legIdx]; if(l.option_type==="Put" && l.action==="Venta"){ applyAssignment(p,"PUT_ASSIGN"); } else if(l.option_type==="Call" && l.action==="Venta"){ applyAssignment(p,"CALL_ASSIGN"); } else { alert("Asignación típica: venta de Put (recibes acciones) o venta de Call (entregas acciones)."); } savePositions(ps); renderPositions(); }
    });
  });
}

function createPosition(e){
  e.preventDefault();
  const data=Object.fromEntries(new FormData(e.target).entries());
  const pos={ id:crypto.randomUUID?crypto.randomUUID():String(Date.now()), title:data.title, strategy:data.strategy||"", open_date:data.open_date||todayISO(), close_date:"", status:"Abierta", cost_basis:data.cost_basis||"", shares:Number(data.shares||0), tags:(data.tags||"").split(",").map(s=>s.trim()).filter(Boolean), notes:data.notes||"", tax_country:data.tax_country||"CA", account_type:data.account_type||"Cash", legs:[], groups:[] };
  const ps=loadPositions(); ps.unshift(pos); savePositions(ps); e.target.reset(); renderPositions();
}
function addLeg(e){
  e.preventDefault();
  const data=Object.fromEntries(new FormData(e.target).entries());
  const ps=loadPositions(); const pos=ps.find(x=>x.id===data.position_id); if(!pos){ alert("Selecciona una posición válida."); return; }
  const leg={ id:crypto.randomUUID?crypto.randomUUID():String(Date.now()), ticker:(data.ticker||"").toUpperCase(), option_type:data.option_type, action:data.action, strike:data.strike, expiry:data.expiry, premium:data.premium, contracts:data.contracts, underlying:data.underlying||"", fees:data.fees||0, open_date:pos.open_date||todayISO(), close_date:"", status:"Abierta", pl:"", notes:data.notes||"", width:"" };
  pos.legs.push(leg); autoDetectSpreads(pos); autoCreateGroups(pos); savePositions(ps); e.target.reset(); renderPositions();
}

// Init
function init(){
  if(loadPositions().length===0){
    const seed={ id:"seed-v7-6", title:"IC AAPL OCT-18 180/190 (1x)", strategy:"Iron Condor", open_date: todayISO(), close_date:"", status:"Abierta", cost_basis:"", shares:0, tags:["alta IV","semana"], notes:"Ejemplo v7.6.4", tax_country:"CA", account_type:"Margin", legs:[ {id:"l1",ticker:"AAPL",option_type:"Call",action:"Venta",strike:"190",expiry: new Date(Date.now()+1000*60*60*24*20).toISOString().slice(0,10),premium:"0.80",contracts:"1",underlying:"",fees:"1.0",open_date: todayISO(),close_date:"",status:"Abierta",pl:"",notes:""}, {id:"l2",ticker:"AAPL",option_type:"Call",action:"Compra",strike:"195",expiry: new Date(Date.now()+1000*60*60*24*20).toISOString().slice(0,10),premium:"0.40",contracts:"1",underlying:"",fees:"1.0",open_date: todayISO(),close_date:"",status:"Abierta",pl:"",notes:""}, {id:"l3",ticker:"AAPL",option_type:"Put",action:"Venta",strike:"180",expiry: new Date(Date.now()+1000*60*60*24*20).toISOString().slice(0,10),premium:"0.90",contracts:"1",underlying:"",fees:"1.0",open_date: todayISO(),close_date:"",status:"Abierta",pl:"",notes:""}, {id:"l4",ticker:"AAPL",option_type:"Put",action:"Compra",strike:"175",expiry: new Date(Date.now()+1000*60*60*24*20).toISOString().slice(0,10),premium:"0.45",contracts:"1",underlying:"",fees:"1.0",open_date: todayISO(),close_date:"",status:"Abierta",pl:"",notes:""} ], groups:[] };
    autoDetectSpreads(seed); autoCreateGroups(seed); savePositions([seed]);
  }
  document.getElementById("positionForm").addEventListener("submit", createPosition);
  document.getElementById("legForm").addEventListener("submit", addLeg);

  document.getElementById("search").addEventListener("input", renderPositions);
  document.getElementById("statusFilter").addEventListener("change", renderPositions);
  document.getElementById("tagFilter").addEventListener("input", renderPositions);
  document.getElementById("fromDate").addEventListener("change", renderPositions);
  document.getElementById("toDate").addEventListener("change", renderPositions);

  document.getElementById("exportCsv").addEventListener("click", exportCSV);
  document.getElementById("exportCsvFiltered").addEventListener("click", exportCSVFiltered);
  document.getElementById("exportXls").addEventListener("click", exportExcelAll);
  document.getElementById("exportXlsFiltered").addEventListener("click", exportExcelFiltered);
  document.getElementById("exportXlsx").addEventListener("click", exportXLSX_All);
  document.getElementById("exportXlsxFiltered").addEventListener("click", exportXLSX_Filtered);
  document.getElementById("backupJson").addEventListener("click", backupJSON);
  document.getElementById("importJson").addEventListener("change", (e)=>{ const f=e.target.files[0]; if(f) importJSONFile(f); e.target.value=""; });

  document.getElementById("savedViews").addEventListener("change", applySelectedView);
  document.getElementById("saveView").addEventListener("click", saveCurrentView);
  document.getElementById("deleteView").addEventListener("click", deleteCurrentView);

  document.getElementById("chartEq").click();

  document.getElementById("importCsv").addEventListener("change", async (e)=>{
    const files = Array.from(e.target.files||[]);
    const preset = (document.getElementById("brokerSelect").value||"auto");
    if(files.length>0) await importCSV_multi(files, preset);
    e.target.value="";
  });

  wireCsvTester();
  wireCharts();
  wireTools();
  renderPositions();
}

// PWA
let deferredPrompt;
const installBtn=document.getElementById("installBtn");
const installStatus=document.getElementById("installStatus");
window.addEventListener('beforeinstallprompt',(e)=>{ e.preventDefault(); deferredPrompt=e; installStatus.textContent="App instalable (PWA)."; installBtn.disabled=false; });
installBtn.addEventListener('click', async ()=>{ if(!deferredPrompt){ installStatus.textContent="Si no aparece, ya está instalada o no es compatible."; return; } deferredPrompt.prompt(); const {outcome}=await deferredPrompt.userChoice; installStatus.textContent = outcome==="accepted" ? "Instalada 🎉" : "Instalación cancelada."; deferredPrompt=null; });

document.addEventListener("DOMContentLoaded", init);

function xmlEscape(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function buildExcelXML(headers, rows){
  // Excel 2003 XML Spreadsheet (nativo en Excel). Sin dependencias.
  const headCells = headers.map(h=>`<Cell><Data ss:Type="String">${xmlEscape(h)}</Data></Cell>`).join("");
  const body = rows.map(r=>{
    const cells = r.map(v=>{
      const n = Number(v);
      if(typeof v === "number" || (!isNaN(n) && v!=="" && /^-?\d+(\.\d+)?$/.test(String(v).replace(",", ".")))){
        return `<Cell><Data ss:Type="Number">${xmlEscape(String(v).replace(",", "."))}</Data></Cell>`;
      }
      // Detect YYYY-MM-DD dates -> Excel DateTime
      if(typeof v==="string" && /^\d{4}-\d{2}-\d{2}$/.test(v)){
        return `<Cell><Data ss:Type="DateTime">${v}T00:00:00.000</Data></Cell>`;
      }
      return `<Cell><Data ss:Type="String">${xmlEscape(v)}</Data></Cell>`;
    }).join("");
    return `<Row>${cells}</Row>`;
  }).join("");
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Positions">
    <Table>
      <Row>${headCells}</Row>
      ${body}
    </Table>
  </Worksheet>
</Workbook>`;
}
function exportExcelCommon(positions){
  const headers=["position_id","position_title","strategy","pos_status","open_date","close_date","cost_basis","shares","tags","tax_country","account_type","group_count","leg_id","ticker","option_type","action","strike","expiry","DTE","premium","contracts","underlying","fees","leg_status","pl","leg_open_date","leg_close_date","notes","width"];
  const rows=[];
  for(const p of positions){
    const groupCount=(p.groups||[]).length;
    for(const l of (p.legs||[])){
      rows.push([p.id,p.title,p.strategy,p.status,p.open_date,p.close_date,p.cost_basis,p.shares,(p.tags||[]).join("|"),p.tax_country||"",p.account_type||"",groupCount,l.id,l.ticker,l.option_type,l.action,l.strike,l.expiry,String(dte(l.expiry)),l.premium,l.contracts,l.underlying,l.fees,l.status,l.pl,l.open_date,l.close_date,l.notes,l.width||""]);
    }
  }
  const xml=buildExcelXML(headers, rows);
  const blob=new Blob([xml],{type:"application/vnd.ms-excel"});
  return blob;
}
function exportExcelAll(){
  const blob = exportExcelCommon(loadPositions());
  const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="positions_v7_6_3.xls"; a.click(); URL.revokeObjectURL(url);
}
function exportExcelFiltered(){
  const filters=currentFilters();
  const list=applyFiltersToPositions(loadPositions(), filters);
  const blob = exportExcelCommon(list);
  const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="positions_v7_6_3_filtrado.xls"; a.click(); URL.revokeObjectURL(url);
}

// ===== XLSX Export (no deps) =====
function _crc32Table(){ const t=new Uint32Array(256); for(let i=0;i<256;i++){ let c=i; for(let j=0;j<8;j++){ c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); } t[i]=c>>>0; } return t; }
const __CRC32_TBL = _crc32Table();
function crc32(buf){ let c=0xFFFFFFFF; for(let i=0;i<buf.length;i++){ c = __CRC32_TBL[(c^buf[i])&0xFF] ^ (c>>>8); } return (c^0xFFFFFFFF)>>>0; }
function u16(n){ return new Uint8Array([n&255,(n>>>8)&255]); }
function u32(n){ return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]); }
function strToU8(s){ const enc=new TextEncoder(); return enc.encode(s); }
function concatU8(arrs){ let len=0; for(const a of arrs) len+=a.length; const out=new Uint8Array(len); let off=0; for(const a of arrs){ out.set(a,off); off+=a.length; } return out; }
function makeDosTime(d=new Date()){ const dt=new Date(d.getTime()); // local
  const sec=Math.floor(dt.getSeconds()/2), min=dt.getMinutes(), hr=dt.getHours();
  const day=dt.getDate(), mon=dt.getMonth()+1, yr=dt.getFullYear()-1980;
  return { time: (hr<<11)|(min<<5)|sec, date: (yr<<9)|(mon<<5)|day };
}
function zipStore(files){
  let lfhs=[]; let cdirs=[]; let offset=0;
  const now=makeDosTime(new Date());
  for(const f of files){
    const nameU8 = strToU8(f.name);
    const data = f.data instanceof Uint8Array ? f.data : strToU8(String(f.data||""));
    const crc = crc32(data);
    const compMethod = 0; // store
    const lfh = concatU8([
      u32(0x04034b50), u16(20), u16(0), u16(compMethod),
      u16(now.time), u16(now.date), u32(crc), u32(data.length), u32(data.length),
      u16(nameU8.length), u16(0), nameU8, data
    ]);
    lfhs.push(lfh);
    const cdir = concatU8([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(compMethod),
      u16(now.time), u16(now.date), u32(crc), u32(data.length), u32(data.length),
      u16(nameU8.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset), nameU8
    ]);
    cdirs.push(cdir);
    offset += lfh.length;
  }
  const cd = concatU8(cdirs);
  const lf = concatU8(lfhs);
  const end = concatU8([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(cd.length), u32(lf.length), u16(0)
  ]);
  return new Blob([lf, cd, end], {type:"application/zip"});
}
function excelDateSerial(iso){
  if(!iso) return null;
  const [y,m,d] = iso.split("-").map(n=>parseInt(n,10));
  const utc = Date.UTC(y, m-1, d);
  const epoch = Date.UTC(1899,11,30); // Excel serial 1 = 1900-01-01 (handles 1900 leap bug implicitly for dates > 1900-03-01)
  const serial = Math.round((utc - epoch)/86400000);
  return serial;
}
function colName(n){ // 1-based
  let s=""; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); } return s;
}
function cellXML(r,c,val,kind){ const ref=colName(c)+r;
  if(val===""||val==null) return `<c r="${ref}"/>`;
  if(kind==="n"){ return `<c r="${ref}"><v>${val}</v></c>`; }
  if(kind==="d"){ return `<c r="${ref}" s="1"><v>${val}</v></c>`; } // style 1 -> date
  // inline string
  const esc = String(val).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc}</t></is></c>`;
}
function sheetXML_fromTable(name, headers, rows){
  let r=1; const cols= headers.length;
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>`;
  // header
  xml += `<row r="${r}">` + headers.map((h,i)=>cellXML(r, i+1, h, "s")).join("") + `</row>`; r++;
  for(const row of rows){
    xml += `<row r="${r}">` + row.map((v,i)=>{
      if(typeof v==="number") return cellXML(r, i+1, v, "n");
      if(typeof v==="object" && v && v.t==="d") return cellXML(r, i+1, v.v, "d");
      const s = String(v==null?"":v);
      if(/^-?\d+(\.\d+)?$/.test(s)) return cellXML(r, i+1, Number(s), "n");
      if(/^\d{4}-\d{2}-\d{2}$/.test(s)){ const ser=excelDateSerial(s); return cellXML(r, i+1, ser, "d"); }
      return cellXML(r, i+1, s, "s");
    }).join("") + `</row>`;
    r++;
  }
  xml += `</sheetData></worksheet>`;
  return xml;
}
function stylesXML(){
  return `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font/></fonts>
  <fills count="1"><fill/></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
</styleSheet>`;
}
function workbookXML(){ return `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Positions" sheetId="1" r:id="rId1"/>
    <sheet name="Resumen" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`; }
function workbookRelsXML(){ return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`; }
function rootRelsXML(){ return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`; }
function contentTypesXML(){ return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`; }

function rowsPositions(list){
  const rows=[];
  for(const p of list){
    const groupCount=(p.groups||[]).length;
    for(const l of (p.legs||[])){
      const DTE = l.expiry ? String(dte(l.expiry)) : "";
      rows.push([p.id,p.title,p.strategy,p.status,p.open_date,p.close_date,p.cost_basis,p.shares,(p.tags||[]).join("|"),p.tax_country||"",p.account_type||"",groupCount,l.id,l.ticker,l.option_type,l.action,l.strike,l.expiry,DTE,l.premium,l.contracts,l.underlying,l.fees,l.status,l.pl,l.open_date,l.close_date,l.notes,l.width||""]);
    }
  }
  return rows;
}
function kpiSummary(ps){
  let netPL=0, closed=0, wins=0; const dtes=[];
  for(const p of ps){
    const pl=positionPL(p); netPL+=pl;
    if(p.status==="Cerrada"){ closed++; if(pl>0) wins++; }
    for(const l of (p.legs||[])){ if((l.status||"Abierta")==="Abierta" && l.expiry){ dtes.push(dte(l.expiry)); } }
  }
  const winRate = closed? (wins/closed*100) : null;
  const anns = ps.filter(p=>p.status==="Cerrada").map(p=>positionROI(p).ann).filter(a=>a!=null&&isFinite(a));
  const annAvg = anns.length? anns.reduce((a,b)=>a+b,0)/anns.length*100 : null;
  const avg = dtes.length? dtes.reduce((a,b)=>a+b,0)/dtes.length : null;
  function median(arr){ const a=[...arr].sort((x,y)=>x-y); if(a.length===0) return null; const m=Math.floor(a.length/2); return a.length%2? a[m] : (a[m-1]+a[m])/2; }
  const med = median(dtes);
  const soon = dtes.length? (dtes.filter(x=>x<=7).length / dtes.length * 100) : null;
  return { netPL, winRate, annAvg, avg, med, soon };
}
function rowsResumen(ps){
  const k=kpiSummary(ps);
  const rows = [
    ["KPIs", "", "", "", ""],
    ["P&L neto", k.netPL],
    ["Win rate (%)", k.winRate!=null? k.winRate : ""],
    ["ROI anualizado prom. cerradas (%)", k.annAvg!=null? k.annAvg : ""],
    ["DTE promedio (abiertas)", k.avg!=null? k.avg : ""],
    ["DTE mediana (abiertas)", k.med!=null? k.med : ""],
    ["% con DTE <= 7", k.soon!=null? k.soon : ""],
    [""],
    ["Por estrategia"],
    ["Estrategia","Operaciones","P&L neto","ROI medio (%)","ROI anualizado (%)","Win rate (%)"]
  ];
  const strat=new Map();
  for(const p of ps){
    const key=p.strategy||"(mixta)"; if(!strat.has(key)) strat.set(key, []); strat.get(key).push(p);
  }
  for(const [name, list] of strat.entries()){
    const plSum=list.reduce((a,b)=>a+positionPL(b),0);
    const rois=list.map(p=>positionROI(p).roi).filter(x=>x!=null&&isFinite(x));
    const roiAvg=rois.length? rois.reduce((a,b)=>a+b,0)/rois.length*100 : null;
    const anns=list.map(p=>positionROI(p).ann).filter(x=>x!=null&&isFinite(x));
    const annAvgS=anns.length? anns.reduce((a,b)=>a+b,0)/anns.length*100 : null;
    const cls=list.filter(p=>p.status==="Cerrada"); const winsS=cls.filter(p=>positionPL(p)>0);
    const wr=cls.length? winsS.length/cls.length*100 : null;
    rows.push([name, list.length, plSum, roiAvg!=null?roiAvg:"", annAvgS!=null?annAvgS:"", wr!=null?wr:""]);
  }
  return rows;
}
function exportXLSXCommon(list){
  const headers=["position_id","position_title","strategy","pos_status","open_date","close_date","cost_basis","shares","tags","tax_country","account_type","group_count","leg_id","ticker","option_type","action","strike","expiry","DTE","premium","contracts","underlying","fees","leg_status","pl","leg_open_date","leg_close_date","notes","width"];
  const positionsRows = rowsPositions(list);
  const resumenRows = rowsResumen(list);

  const files = [
    {name:"[Content_Types].xml", data: contentTypesXML()},
    {name:"_rels/.rels", data: rootRelsXML()},
    {name:"xl/workbook.xml", data: workbookXML()},
    {name:"xl/_rels/workbook.xml.rels", data: workbookRelsXML()},
    {name:"xl/styles.xml", data: stylesXML()},
    {name:"xl/worksheets/sheet1.xml", data: sheetXML_fromTable("Positions", headers, positionsRows)},
    {name:"xl/worksheets/sheet2.xml", data: sheetXML_fromTable("Resumen",
      ["Col1","Col2","Col3","Col4","Col5","Col6"],
      resumenRows
    )}
  ];
  const zip = zipStore(files);
  return zip;
}
function exportXLSX_All(){
  const blob = exportXLSXCommon(loadPositions());
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="positions_v7_6_4.xlsx"; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 2500);
}
function exportXLSX_Filtered(){
  const list=applyFiltersToPositions(loadPositions(), currentFilters());
  const blob = exportXLSXCommon(list);
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="positions_v7_6_4_filtrado.xlsx"; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 2500);
}
