export const DASHBOARD_JS = `
console.log("[Dashboard] Script loaded, starting init...");
var I18N = { locale: '{LOCALE}', translations: {} };

async function initI18n() {
  var cached = localStorage.getItem('cortex_i18n_' + I18N.locale);
  if (cached) { try { I18N.translations = JSON.parse(cached); return; } catch(e) {} }
  var r = await fetch('/api/i18n/' + I18N.locale);
  I18N.translations = await r.json();
  localStorage.setItem('cortex_i18n_' + I18N.locale, JSON.stringify(I18N.translations));
}

function t(key, params) {
  var parts = key.split('.');
  var val = I18N.translations;
  for (var i = 0; i < parts.length; i++) {
    if (!val || typeof val !== 'object') break;
    val = val[parts[i]];
  }
  if (typeof val !== 'string') return key;
  if (params) {
    for (var k in params) val = val.split('{' + k + '}').join(params[k]);
  }
  return val;
}

function initNavLabels() {
  var map = {
    'nav-dashboard': 'ui.nav.dashboard',
    'nav-sessions': 'ui.nav.sessions',
    'nav-sandbox': 'ui.nav.sandbox',
    'nav-settings': 'ui.nav.settings'
  };
  for (var id in map) {
    var el = document.getElementById(id);
    if (!el) continue;
    var nodes = el.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].nodeType === 3 && nodes[i].textContent.trim()) {
        nodes[i].textContent = ' ' + t(map[id]);
        break;
      }
    }
  }
  var ml = document.getElementById('model-label');
  if (ml && ml.textContent === 'loading\u2026') ml.textContent = t('common.loading');
}

function initPageLabels() {
  document.querySelectorAll('button').forEach(function(btn) {
    var txt = btn.textContent.trim();
    if (txt === 'Save') btn.textContent = t('common.save');
    else if (txt === 'Cancel') btn.textContent = t('common.cancel');
    else if (txt === 'Delete') btn.textContent = t('common.delete');
    else if (txt === 'Confirm') btn.textContent = t('common.confirm');
  });
}
var WIDGET_DEFS = {
  "kpi-grid":{label:"ui.dashboard.widgets.kpiGrid",icon:"\uD83D\uDCCA",defaultW:4,defaultH:1},
  "server-info":{label:"ui.dashboard.widgets.serverInfo",icon:"\uD83D\uDD50",defaultW:2,defaultH:1},
  "system-resources":{label:"ui.dashboard.widgets.systemResources",icon:"\uD83D\uDCBB",defaultW:2,defaultH:2},
  "daemon-status":{label:"ui.dashboard.widgets.daemonStatus",icon:"\u26A1",defaultW:2,defaultH:2},
  "memory-stats":{label:"ui.dashboard.widgets.memoryStats",icon:"\uD83E\uDDE0",defaultW:2,defaultH:1},
  "recent-sessions":{label:"ui.dashboard.widgets.recentSessions",icon:"\uD83D\uDCAC",defaultW:2,defaultH:2},
  "daily-tokens-chart":{label:"ui.dashboard.widgets.dailyTokensChart",icon:"\uD83D\uDCC8",defaultW:2,defaultH:2},
  "recent-lens":{label:"ui.dashboard.widgets.recentActivity",icon:"\uD83D\uDCCB",defaultW:2,defaultH:2},
  "model-breakdown":{label:"ui.dashboard.widgets.modelBreakdown",icon:"\uD83E\uDD16",defaultW:2,defaultH:2},
  "agent-breakdown":{label:"ui.dashboard.widgets.agentBreakdown",icon:"\uD83D\uDC64",defaultW:2,defaultH:2},
  "custom":{label:"ui.dashboard.widgets.custom",icon:"\uD83C\uDFA8",defaultW:2,defaultH:2}
};
var dashboardConfig=null,dashboardEditMode=false,dashboardCharts={};

async function initDashboard(){
  console.log("[Dashboard] initDashboard running");
  dashboardEditMode=false;
  var btn=document.getElementById("dashboard-edit-btn");
  if(btn)btn.textContent=t('common.edit');else console.log("[Dashboard] No edit btn");
  var c=document.getElementById("dashboard-content");
  if(c)c.classList.remove("dashboard-edit-mode");else console.log("[Dashboard] No content div");
  try{
    var r=await fetch("/api/dashboard/config");
    dashboardConfig=await r.json();
    console.log("[Dashboard] Config loaded:", dashboardConfig);
  }catch(e){
    console.log("[Dashboard] Config fetch error:", e);
    dashboardConfig=null;
  }
  if(!dashboardConfig||!dashboardConfig.widgets||!dashboardConfig.widgets.length){
    console.log("[Dashboard] Using default widgets");
    dashboardConfig={widgets:[
      {id:"dw-kpi",type:"kpi-grid",row:1,col:1,width:4,height:1},
      {id:"dw-srv",type:"server-info",row:2,col:1,width:2,height:1},
      {id:"dw-daemon",type:"daemon-status",row:2,col:3,width:2,height:2},
      {id:"dw-mem",type:"memory-stats",row:3,col:1,width:2,height:1},
      {id:"dw-sys",type:"system-resources",row:4,col:1,width:2,height:2},
      {id:"dw-sessions",type:"recent-sessions",row:4,col:3,width:2,height:2},
      {id:"dw-tokens",type:"daily-tokens-chart",row:6,col:1,width:2,height:2},
      {id:"dw-lens",type:"recent-lens",row:6,col:3,width:2,height:2}
    ]};
  }
  renderWidgets();
}

async function saveConfig(){
  try{await fetch("/api/dashboard/config",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(dashboardConfig)})}catch(e){console.log("[Dashboard] Save error:",e)}
}

function renderWidgets(){
  console.log("[Dashboard] Rendering widgets");
  var c=document.getElementById("dashboard-content");if(!c)return;
  Object.keys(dashboardCharts).forEach(function(k){if(dashboardCharts[k]){dashboardCharts[k].destroy();delete dashboardCharts[k]}});
  var ws=dashboardConfig.widgets;
  if(!ws||!ws.length){c.innerHTML="<div class=widget-empty-state><p>"+t('ui.dashboard.noWidgets')+"</p><span class=sub>"+t('ui.dashboard.addWidgetsHint')+"</span></div>";return}
  var h="<div class=dashboard-grid>";
  for(var i=0;i<ws.length;i++){
    var w=ws[i];var de=WIDGET_DEFS[w.type]||{label:w.type,icon:"\uD83D\uDCE6"};
    h+="<div class=widget id=widget-"+w.id+" draggable=true style=grid-column:span+"+w.width+";grid-row:span+"+w.height+" data-wid="+w.id+">"
    h+="<div class=widget-header><span>"+de.icon+" "+(w.title||t(de.label))+"</span>"
    h+="<div class=widget-actions><span class=drag-handle>\u283F</span>"
    h+="<button class=widget-remove data-rid="+w.id+">\u2715</button></div></div>"
    h+="<div class=widget-body id=body-"+w.id+"><div class=widget-loading>"+t('common.loading')+"</div></div></div>"
  }
  h+="</div><div class=widget-add-bar><button class=add-btn onclick=showPicker()>+ "+t('ui.dashboard.addWidget')+"</button></div>"
  c.innerHTML=h;
  console.log("[Dashboard] Widget HTML set");
  if(dashboardEditMode)c.classList.add("dashboard-edit-mode");
  for(var i=0;i<ws.length;i++)loadWidget(ws[i]);
  setupDragDrop();
  setupClicks();
  console.log("[Dashboard] Render complete");
}

function setupClicks(){
  var c=document.getElementById("dashboard-content");if(!c)return;
  c.querySelectorAll(".widget-remove").forEach(function(el){el.onclick=function(){removeWidget(el.dataset.rid)}});
}

function setupDragDrop(){
  var els=document.querySelectorAll(".dashboard-grid .widget[draggable=true]");
  for(var i=0;i<els.length;i++){
    els[i].addEventListener("dragstart",onDragStart);
    els[i].addEventListener("dragover",onDragOver);
    els[i].addEventListener("dragleave",onDragLeave);
    els[i].addEventListener("drop",onDrop);
    els[i].addEventListener("dragend",onDragEnd);
  }
}

var dragSource=null;
function onDragStart(e){if(!dashboardEditMode){e.dataTransfer.effectAllowed="none";e.preventDefault();return}dragSource=e.currentTarget.dataset.wid;e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",dragSource);e.currentTarget.style.opacity="0.4"}
function onDragOver(e){if(!dashboardEditMode)return;e.preventDefault();e.dataTransfer.dropEffect="move";e.currentTarget.classList.add("drag-over")}
function onDragLeave(e){e.currentTarget.classList.remove("drag-over")}
function onDrop(e){
  e.preventDefault();e.currentTarget.classList.remove("drag-over");
  var target=e.currentTarget.dataset.wid;if(!dragSource||dragSource===target)return;
  var ws=dashboardConfig.widgets;var si=-1,ti=-1;
  for(var i=0;i<ws.length;i++){if(ws[i].id===dragSource)si=i;if(ws[i].id===target)ti=i}
  if(si===-1||ti===-1)return;
  // Swap positions in array (CSS grid auto-flow follows array order)
  var tmp=ws[si];ws[si]=ws[ti];ws[ti]=tmp;
  saveConfig();renderWidgets();
}
function onDragEnd(e){e.currentTarget.style.opacity="";document.querySelectorAll(".widget.drag-over").forEach(function(e){e.classList.remove("drag-over")});dragSource=null}

function toggleEdit(){
  dashboardEditMode=!dashboardEditMode;
  var btn=document.getElementById("dashboard-edit-btn");
  var c=document.getElementById("dashboard-content");
  if(btn)btn.textContent=dashboardEditMode?t('common.done'):t('common.edit');
  c.classList.toggle("dashboard-edit-mode",dashboardEditMode);
  if(dashboardEditMode){if(!c.querySelector(".widget-add-bar"))renderWidgets()}else saveConfig()
}

function showPicker(){
  var c=document.getElementById("dashboard-content");if(!c||!dashboardEditMode)return;
  var ex=c.querySelector(".widget-picker");if(ex){ex.remove();return}
  var p=document.createElement("div");p.className="widget-picker";p.style.cssText="padding:12px 20px;border-bottom:1px solid var(--border);background:var(--bg2)";
  p.innerHTML="<div style=display:flex;align-items:center;justify-content:space-between;margin-bottom:8px><span style=font-size:12px;font-weight:600;color:var(--text2)>"+t('ui.dashboard.addWidget')+"</span><button class=btn onclick=this.parentElement.parentElement.remove()>\u2715</button></div>";
  var div=document.createElement("div");div.style.cssText="display:flex;flex-wrap:wrap;gap:6px";
  var keys=Object.keys(WIDGET_DEFS).filter(function(k){return k!=="custom"});
  for(var i=0;i<keys.length;i++){
    var d=WIDGET_DEFS[keys[i]];var btn=document.createElement("button");
    btn.className="btn";btn.style.cssText="font-size:11px;padding:6px 10px;background:rgba(99,102,241,0.12);color:var(--accent2)";
    btn.textContent=d.icon+" "+t(d.label);
    btn.onclick=(function(k){return function(){addWidget(k)}})(keys[i]);
    div.appendChild(btn);
  }
  p.appendChild(div);c.insertBefore(p,c.firstChild);
}

function addWidget(type){
  var def=WIDGET_DEFS[type];if(!def)return;
  var id="dw-"+Date.now().toString(36);var mr=0;
  for(var i=0;i<dashboardConfig.widgets.length;i++){var b=dashboardConfig.widgets[i].row+dashboardConfig.widgets[i].height-1;if(b>mr)mr=b}
  dashboardConfig.widgets.push({id:id,type:type,row:mr+1,col:1,width:def.defaultW,height:def.defaultH});
  saveConfig();renderWidgets();
}
function removeWidget(id){dashboardConfig.widgets=dashboardConfig.widgets.filter(function(w){return w.id!==id});saveConfig();renderWidgets()}

function loadWidget(w){
  var body=document.getElementById("body-"+w.id);if(!body)return;
  var fns={
    "kpi-grid":renderKpiGrid,"server-info":renderServerInfo,"system-resources":renderSysRes,"daemon-status":renderDaemon,
    "memory-stats":renderMemStats,"recent-sessions":renderSessions,"daily-tokens-chart":renderTokenChart,
    "recent-lens":renderLensEvents,"model-breakdown":renderModelBreak,"agent-breakdown":renderAgentBreak,
    "custom":renderCustom
  };
  var fn=fns[w.type];if(fn)fn(body,w.id,w);else body.innerHTML="<div class=empty>"+t('ui.dashboard.emptyUnknown')+"</div>";
}

async function renderKpiGrid(body){
  var sys=await fetchJSON("/api/system",{});var ana=await fetchJSON("/api/analytics?days=1",{});var t=ana.totals||{};
  body.innerHTML="<div class=kpi-grid>"
    +"<div class=kpi><div class=kpi-num>"+fmtNum(sys.activeSessions||0)+"</div><div class=kpi-label>Active Sessions</div></div>"
    +"<div class=kpi><div class=kpi-num style=color:#818cf8>"+fmtNum(t.total_tokens_in||0)+"</div><div class=kpi-label>Tokens In (24h)</div></div>"
    +"<div class=kpi><div class=kpi-num style=color:#34d399>"+fmtNum(t.total_tokens_out||0)+"</div><div class=kpi-label>Tokens Out (24h)</div></div>"
    +"<div class=kpi><div class=kpi-num style=color:#4ade80>"+fmtCost(t.total_cost||0)+"</div><div class=kpi-label>Est. Cost (24h)</div></div></div>"
}

async function renderServerInfo(body){
  var sys=await fetchJSON("/api/system",{});var upH=Math.floor((sys.uptime||0)/3600),upM=Math.floor(((sys.uptime||0)%3600)/60);
  body.innerHTML="<div class=kpi-grid>"
    +"<div class=kpi><div class=kpi-num style=color:#22d3ee>"+upH+"h "+upM+"m</div><div class=kpi-label>Server Uptime</div></div>"
    +"<div class=kpi><div class=kpi-num style=color:#fbbf24;font-size:0.9em>"+esc(sys.provider||"—")+"</div><div class=kpi-label>LLM Provider</div><div style=font-size:9px;color:var(--text3);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap>"+esc(sys.model||"—")+"</div></div>"
    +"<div class=kpi><div class=kpi-num style=color:#4ade80>v"+esc(sys.version||"—")+"</div><div class=kpi-label>Cortex Build</div></div>"
    +"<div class=kpi><div class=kpi-num style=color:#10b981>●</div><div class=kpi-label>System Status</div></div></div>"
}

async function renderSysRes(body){
  var sys=await fetchJSON("/api/system",{});var mem=sys.memory||{},disk=sys.disk||{};
  var mp=mem.total?((mem.used/mem.total)*100).toFixed(1):0;var dp=disk.total?((disk.used/disk.total)*100).toFixed(1):0;
  function fb(v){if(!v)return"0 B";var u=["B","KB","MB","GB","TB"],i=0;while(v>=1024&&i<4){v/=1024;i++}return v.toFixed(1)+" "+u[i]}
  body.innerHTML="<div class=stat-row><span class=stat-label>Memory</span><span>"+fb(mem.used)+" / "+fb(mem.total)+" ("+mp+"%)</span></div>"
    +"<div class=bar><div class=bar-fill style=width:"+mp+"%;background:"+(mp>85?"#f87171":mp>60?"#f59e0b":"#06b6d4")+"></div></div>"
    +"<div class=stat-row><span class=stat-label>Disk</span><span>"+fb(disk.used)+" / "+fb(disk.total)+" ("+dp+"%)</span></div>"
    +"<div class=bar><div class=bar-fill style=width:"+dp+"%;background:"+(dp>85?"#f87171":dp>60?"#f59e0b":"#06b6d4")+"></div></div>"
    +"<div style=display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px>"
    +"<div style=padding:10px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;text-align:center>"
    +"<div style=font-size:10px;color:var(--text3);margin-bottom:3px;font-family:monospace>CPU CORES</div>"
    +"<div style=font-size:18px;font-weight:700;color:var(--accent2);font-family:monospace>"+(sys.cpuCores||"N/A")+"</div></div>"
    +"<div style=padding:10px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;text-align:center>"
    +"<div style=font-size:10px;color:var(--text3);margin-bottom:3px;font-family:monospace>PLATFORM</div>"
    +"<div style=font-size:14px;font-weight:600;color:var(--accent2);font-family:monospace>"+esc(sys.platform||"LINUX").toUpperCase()+"</div></div></div>"
}

async function renderDaemon(body){
  var st=await fetchJSON("/api/status",{});var d=st.daemons||{};
  var daemons=[
    {key:"validator",label:"Validator",desc:"Policy enforcement daemon"},
    {key:"executor",label:"Executor",desc:"Agent task execution daemon"},
    {key:"scheduler",label:"Scheduler",desc:"Cron and job scheduling daemon"}
  ];
  var onlineCount=daemons.filter(function(dd){return d[dd.key]}).length;
  var allOn=onlineCount===daemons.length;
  var statusLine="<div style=margin-bottom:12px;padding:8px 12px;border-radius:6px;font-size:11px;font-family:monospace;border-left:3px solid "+(allOn?"#10b981":"#f59e0b")+";background:"+(allOn?"rgba(16,185,129,0.1)":"rgba(245,158,11,0.1)")+">";
  statusLine+=allOn?"<span style=color:#10b981>✓ ALL SYSTEMS OPERATIONAL</span>":"<span style=color:#fbbf24>⚠ "+onlineCount+"/"+daemons.length+" DAEMONS ONLINE</span>";
  statusLine+="</div>";
  body.innerHTML=statusLine+daemons.map(function(dd){
    var on=d[dd.key];
    return"<div style=display:flex;align-items:center;justify-content:space-between;padding:10px 12px;margin-bottom:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;>"
    +"<div style=display:flex;align-items:center;gap:10px>"
    +"<div style=width:8px;height:8px;border-radius:50%;background:"+(on?"#10b981":"#ef4444")+";box-shadow:0 0 8px "+(on?"rgba(16,185,129,0.4)":"rgba(239,68,68,0.4)")+"></div>"
    +"<div><div style=font-size:12px;font-weight:500;color:var(--text)>"+dd.label+"</div><div style=font-size:10px;color:var(--text3)>"+dd.desc+"</div></div></div>"
    +"<span style=font-size:10px;font-weight:600;letter-spacing:0.05em;color:"+(on?"#10b981":"#ef4444")+";padding:3px 8px;background:"+(on?"rgba(16,185,129,0.12)":"rgba(239,68,68,0.12)")+";border-radius:4px;font-family:monospace>"
    +(on?"ONLINE":"OFFLINE")+"</span></div>"
  }).join("")
}

async function renderMemStats(body){
  var s=await fetchJSON("/api/memory/stats",{});
  body.innerHTML="<div class=stat-row><span class=stat-label>Episodic</span><span>"+fmtNum(s.episodic||0)+"</span></div>"
    +"<div class=stat-row><span class=stat-label>Semantic</span><span>"+fmtNum(s.semantic||0)+"</span></div>"
    +"<div class=stat-row><span class=stat-label>Reflections</span><span>"+fmtNum(s.reflection||0)+"</span></div>"
    +"<div class=stat-row><span class=stat-label>Procedural</span><span>"+fmtNum(s.procedural||0)+"</span></div>"
}

async function renderSessions(body){
  var list=await fetchJSON("/api/sessions?limit=8",[]);
  if(!list.length){body.innerHTML="<div class=empty>"+t('ui.dashboard.emptyNoSessions')+"</div>";return}
  var cs={active:"#4ade80",idle:"#fbbf24",closed:"#6b7280",archived:"#6b7280"};
  body.innerHTML=list.map(function(s){
    var c=cs[s.status]||"#6b7280";
    var ts=new Date(s.started_at).toLocaleDateString([],{month:"short",day:"numeric"});
    return "<div class=list-item><span class=dot style=background:"+c+"></span><span class=list-text>"+esc(s.id.slice(-10))+"</span><span class=list-meta>"+ts+"</span></div>"
  }).join("")
}

async function renderTokenChart(body,wid){
  var ana=await fetchJSON("/api/analytics?days=14",{});var daily=ana.daily||[];
  if(!daily.length){body.innerHTML="<div class=empty>"+t('ui.dashboard.emptyNoData')+"</div>";return}
  body.innerHTML="<div style=height:140px><canvas id=ch-"+wid+"></canvas></div>";
  var cv=document.getElementById("ch-"+wid);if(!cv)return;var ctx=cv.getContext("2d");if(!ctx)return;
  if(dashboardCharts[wid])dashboardCharts[wid].destroy();
  dashboardCharts[wid]=new Chart(ctx,{
    type:"bar",
    data:{
      labels:daily.map(function(d){return d.date.slice(5)}),
      datasets:[
        {label:"Tokens In",data:daily.map(function(d){return d.tokens_in}),backgroundColor:"rgba(99,102,241,0.6)",borderColor:"#818cf8",borderWidth:1},
        {label:"Tokens Out",data:daily.map(function(d){return d.tokens_out}),backgroundColor:"rgba(52,211,153,0.6)",borderColor:"#34d399",borderWidth:1}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:"#6b7280",font:{size:9}},grid:{display:false}},
        y:{ticks:{color:"#6b7280",font:{size:9}},grid:{color:"rgba(255,255,255,0.04)"}}
      }
    }
  })
}

async function renderLensEvents(body){
  var evts=await fetchJSON("/api/lens/recent?limit=10",[]);
  if(!evts.length){body.innerHTML="<div class=empty>"+t('ui.dashboard.emptyNoActivity')+"</div>";return}
  body.innerHTML=evts.map(function(e){
    var ts=new Date(e.started_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    var txt=esc((e.summary||e.event_type||"").slice(0,45));
    return "<div class=list-item><span class=list-meta>"+ts+"</span><span class=list-text>"+txt+"</span></div>"
  }).join("")
}

async function renderModelBreak(body){
  var ana=await fetchJSON("/api/analytics?days=7",{});var models=ana.models||[];
  if(!models.length){body.innerHTML="<div class=empty>"+t('ui.dashboard.emptyNoModelData')+"</div>";return}
  body.innerHTML=models.slice(0,8).map(function(m){
    var n=esc(m.model.length>18?m.model.slice(0,18)+"..":m.model);
    var toks=m.tokens_in+m.tokens_out;
    var ts=toks>=1e6?(toks/1e6).toFixed(1)+"M":toks>=1e3?(toks/1e3).toFixed(0)+"K":toks;
    return "<div class=stat-row><span class=stat-label title=\\""+esc(m.model)+"\\">"+n+"</span><span style=width:30px;text-align:right;color:var(--text3)>"+fmtNum(m.calls)+"</span><span style=width:50px;text-align:right;font-family:monospace>"+ts+"</span><span style=width:50px;text-align:right;font-family:monospace;color:var(--accent-green)>"+fmtCost(m.cost_usd)+"</span></div>"
  }).join("")
}

async function renderAgentBreak(body){
  var ana=await fetchJSON("/api/analytics?days=7",{});var agents=ana.perAgent||[];
  if(!agents.length){body.innerHTML="<div class=empty>"+t('ui.dashboard.emptyNoAgentData')+"</div>";return}
  body.innerHTML=agents.slice(0,8).map(function(a){
    var n=esc(a.agent_id.length>16?a.agent_id.slice(0,16)+"..":a.agent_id);
    return "<div class=stat-row><span class=stat-label title=\\""+esc(a.agent_id)+"\\">"+n+"</span><span style=width:25px;text-align:right;color:var(--text3)>"+a.sessions+"</span><span style=width:50px;text-align:right;font-family:monospace;color:var(--accent-green)>"+fmtCost(a.cost_usd)+"</span></div>"
  }).join("")
}

function renderCustom(body, wid, w){
  var content=w.content||"<div style=text-align:center;color:var(--text3);padding:20px>Custom widget — add <code>content</code> via dashboard config</div>";
  var safe=sanitizeHtml(content);
  body.innerHTML=safe;
  if(w.refresh&&Number(w.refresh)>0){
    var interval=Math.max(5,Number(w.refresh))*1000;
    setInterval(function(){
      var el=document.getElementById("body-"+wid);
      if(el){var fresh=w.content||"";el.innerHTML=sanitizeHtml(fresh)}
    },interval)
  }
}
function sanitizeHtml(html){
  return String(html||"")
    .replace(/<script[\\s\\S]*?<\\/script>/gi,"")
    .replace(/<iframe[\\s\\S]*?<\\/iframe>/gi,"")
    .replace(/<object[\\s\\S]*?<\\/object>/gi,"")
    .replace(/<embed[\\s\\S]*?>/gi,"")
    .replace(/<style[\\s\\S]*?<\\/style>/gi,"")
    .replace(/<link[\\s\\S]*?>/gi,"")
    .replace(/<meta[\\s\\S]*?>/gi,"")
    .replace(/\\bon\\w+\\s*=\\s*["'][^"']*["']/gi,"data-blocked=\\"\\"")
    .replace(/javascript\\s*:/gi,"blocked:")
    .replace(/expression\\s*\\(/gi,"blocked(")
    .replace(/<svg[\\s\\S]*?<\\/svg>/gi,"")
    .replace(/<a\\s[^>]*href\\s*=\\s*["']javascript:/gi,"<a href=\\"#blocked\\"")
    .replace(/<form[\\s\\S]*?<\\/form>/gi,"")
}

function fmtCost(v){if(!v||v<=0)return"$0";if(v<0.01)return"$"+(v*1000).toFixed(1)+"m";return"$"+v.toFixed(4)}
function fmtBytes(b){if(!b)return"0 B";var u=["B","KB","MB","GB","TB"],i=0;while(b>=1024&&i<4){b/=1024;i++}return b.toFixed(1)+" "+u[i]}

(function(){document.querySelectorAll('input[type=password]').forEach(function(i){if(!i.closest('form')){var f=document.createElement('form');f.onsubmit=function(){return false};f.style.display='contents';i.parentNode.insertBefore(f,i);f.appendChild(i)}})})();
initI18n().then(function(){initNavLabels();initPageLabels();initDashboard()});

`;
