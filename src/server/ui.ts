export function serveUi(): Response {
  return new Response(HTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

const PROVIDER_OPTIONS = [
  { kind: 'openai', label: 'OpenAI' },
  { kind: 'anthropic', label: 'Anthropic' },
  { kind: 'google', label: 'Google Gemini' },
  { kind: 'mistral', label: 'Mistral' },
  { kind: 'groq', label: 'Groq' },
  { kind: 'deepseek', label: 'DeepSeek' },
  { kind: 'openrouter', label: 'OpenRouter' },
  { kind: 'xai', label: 'xAI (Grok)' },
  { kind: 'together', label: 'Together AI' },
  { kind: 'bedrock', label: 'AWS Bedrock' },
  { kind: 'cohere', label: 'Cohere' },
  { kind: 'kilo', label: 'Kilo (AI Gateway)' },
  { kind: 'ollama', label: 'Ollama' },
  { kind: 'cerebras', label: 'Cerebras' },
  { kind: 'fireworks', label: 'Fireworks AI' },
  { kind: 'perplexity', label: 'Perplexity' },
  { kind: 'nvidia', label: 'NVIDIA NIM' },
  { kind: 'moonshot', label: 'Moonshot (Kimi)' },
  { kind: 'novita', label: 'Novita AI' },
  { kind: 'lmstudio', label: 'LM Studio' },
  { kind: 'litellm', label: 'LiteLLM' },
  { kind: 'huggingface', label: 'Hugging Face' },
  { kind: 'alibaba', label: 'Alibaba (Qwen)' },
  { kind: 'venice', label: 'Venice AI' },
];
const PROVIDER_OPTIONS_HTML = PROVIDER_OPTIONS.map((p) =>
  `<option value="${p.kind}">${p.label}</option>`
).join('');

const DASHBOARD_JS = `
console.log("[Dashboard] Script loaded, starting init...");
var WIDGET_DEFS = {
  "kpi-grid":{label:"KPI Cards",icon:"\uD83D\uDCCA",defaultW:4,defaultH:1},
  "server-info":{label:"Server Info",icon:"\uD83D\uDD50",defaultW:2,defaultH:1},
  "system-resources":{label:"System Resources",icon:"\uD83D\uDCBB",defaultW:2,defaultH:2},
  "daemon-status":{label:"Daemon Status",icon:"\u26A1",defaultW:2,defaultH:2},
  "memory-stats":{label:"Memory Stats",icon:"\uD83E\uDDE0",defaultW:2,defaultH:1},
  "recent-sessions":{label:"Recent Sessions",icon:"\uD83D\uDCAC",defaultW:2,defaultH:2},
  "daily-tokens-chart":{label:"Token Chart",icon:"\uD83D\uDCC8",defaultW:2,defaultH:2},
  "recent-lens":{label:"Recent Activity",icon:"\uD83D\uDCCB",defaultW:2,defaultH:2},
  "model-breakdown":{label:"Model Breakdown",icon:"\uD83E\uDD16",defaultW:2,defaultH:2},
  "agent-breakdown":{label:"Agent Breakdown",icon:"\uD83D\uDC64",defaultW:2,defaultH:2},
  "custom":{label:"Custom HTML",icon:"\uD83C\uDFA8",defaultW:2,defaultH:2}
};
var dashboardConfig=null,dashboardEditMode=false,dashboardCharts={};

async function initDashboard(){
  console.log("[Dashboard] initDashboard running");
  dashboardEditMode=false;
  var btn=document.getElementById("dashboard-edit-btn");
  if(btn)btn.textContent="Edit";else console.log("[Dashboard] No edit btn");
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
  if(!ws||!ws.length){c.innerHTML="<div class=widget-empty-state><p>No widgets</p><span class=sub>Click Edit to add widgets</span></div>";return}
  var h="<div class=dashboard-grid>";
  for(var i=0;i<ws.length;i++){
    var w=ws[i];var de=WIDGET_DEFS[w.type]||{label:w.type,icon:"\uD83D\uDCE6"};
    h+="<div class=widget id=widget-"+w.id+" draggable=true style=grid-column:span+"+w.width+";grid-row:span+"+w.height+" data-wid="+w.id+">"
    h+="<div class=widget-header><span>"+de.icon+" "+(w.title||de.label)+"</span>"
    h+="<div class=widget-actions><span class=drag-handle>\u283F</span>"
    h+="<button class=widget-remove data-rid="+w.id+">\u2715</button></div></div>"
    h+="<div class=widget-body id=body-"+w.id+"><div class=widget-loading>Loading...</div></div></div>"
  }
  h+="</div><div class=widget-add-bar><button class=add-btn onclick=showPicker()>+ Add Widget</button></div>"
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
  if(btn)btn.textContent=dashboardEditMode?"Done":"Edit";
  c.classList.toggle("dashboard-edit-mode",dashboardEditMode);
  if(dashboardEditMode){if(!c.querySelector(".widget-add-bar"))renderWidgets()}else saveConfig()
}

function showPicker(){
  var c=document.getElementById("dashboard-content");if(!c||!dashboardEditMode)return;
  var ex=c.querySelector(".widget-picker");if(ex){ex.remove();return}
  var p=document.createElement("div");p.className="widget-picker";p.style.cssText="padding:12px 20px;border-bottom:1px solid var(--border);background:var(--bg2)";
  p.innerHTML="<div style=display:flex;align-items:center;justify-content:space-between;margin-bottom:8px><span style=font-size:12px;font-weight:600;color:var(--text2)>Add Widget</span><button class=btn onclick=this.parentElement.parentElement.remove()>\u2715</button></div>";
  var div=document.createElement("div");div.style.cssText="display:flex;flex-wrap:wrap;gap:6px";
  var keys=Object.keys(WIDGET_DEFS).filter(function(k){return k!=="custom"});
  for(var i=0;i<keys.length;i++){
    var d=WIDGET_DEFS[keys[i]];var btn=document.createElement("button");
    btn.className="btn";btn.style.cssText="font-size:11px;padding:6px 10px;background:rgba(99,102,241,0.12);color:var(--accent2)";
    btn.textContent=d.icon+" "+d.label;
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
  var fn=fns[w.type];if(fn)fn(body,w.id,w);else body.innerHTML="<div class=empty>Unknown</div>";
}

async function fetchJSON(url,fallback){try{return await fetch(url).then(function(r){return r.json()})}catch(e){console.log("[Dashboard] fetch error",url,e);return fallback}}

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
  if(!list.length){body.innerHTML="<div class=empty>No sessions</div>";return}
  var cs={active:"#4ade80",idle:"#fbbf24",closed:"#6b7280",archived:"#6b7280"};
  body.innerHTML=list.map(function(s){
    var c=cs[s.status]||"#6b7280";
    var ts=new Date(s.started_at).toLocaleDateString([],{month:"short",day:"numeric"});
    return "<div class=list-item><span class=dot style=background:"+c+"></span><span class=list-text>"+esc(s.id.slice(-10))+"</span><span class=list-meta>"+ts+"</span></div>"
  }).join("")
}

async function renderTokenChart(body,wid){
  var ana=await fetchJSON("/api/analytics?days=14",{});var daily=ana.daily||[];
  if(!daily.length){body.innerHTML="<div class=empty>No data</div>";return}
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
  if(!evts.length){body.innerHTML="<div class=empty>No recent activity</div>";return}
  body.innerHTML=evts.map(function(e){
    var ts=new Date(e.started_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    var txt=esc((e.summary||e.event_type||"").slice(0,45));
    return "<div class=list-item><span class=list-meta>"+ts+"</span><span class=list-text>"+txt+"</span></div>"
  }).join("")
}

async function renderModelBreak(body){
  var ana=await fetchJSON("/api/analytics?days=7",{});var models=ana.models||[];
  if(!models.length){body.innerHTML="<div class=empty>No model data</div>";return}
  body.innerHTML=models.slice(0,8).map(function(m){
    var n=esc(m.model.length>18?m.model.slice(0,18)+"..":m.model);
    var toks=m.tokens_in+m.tokens_out;
    var ts=toks>=1e6?(toks/1e6).toFixed(1)+"M":toks>=1e3?(toks/1e3).toFixed(0)+"K":toks;
    return "<div class=stat-row><span class=stat-label title=\\""+esc(m.model)+"\\">"+n+"</span><span style=width:30px;text-align:right;color:var(--text3)>"+fmtNum(m.calls)+"</span><span style=width:50px;text-align:right;font-family:monospace>"+ts+"</span><span style=width:50px;text-align:right;font-family:monospace;color:var(--accent-green)>"+fmtCost(m.cost_usd)+"</span></div>"
  }).join("")
}

async function renderAgentBreak(body){
  var ana=await fetchJSON("/api/analytics?days=7",{});var agents=ana.perAgent||[];
  if(!agents.length){body.innerHTML="<div class=empty>No agent data</div>";return}
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
    .replace(new RegExp("<script[\\\\s\\\\S]*?<\\\\/script>","gi"),"")
    .replace(new RegExp("\\\\bon\\\\w+\\\\s*=","gi"),"data-blocked-");
}

function fmtCost(v){if(!v||v<=0)return"$0";if(v<0.01)return"$"+(v*1000).toFixed(1)+"m";return"$"+v.toFixed(4)}
function fmtBytes(b){if(!b)return"0 B";var u=["B","KB","MB","GB","TB"],i=0;while(b>=1024&&i<4){b/=1024;i++}return b.toFixed(1)+" "+u[i]}

initDashboard();

`;

const HTML = `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Cortex</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.min.css">
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/javascript/javascript.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/python/python.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/xml/xml.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/css/css.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/markdown/markdown.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/yaml/yaml.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/sql/sql.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/htmlmixed/htmlmixed.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/search/search.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/search/searchcursor.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/dialog/dialog.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/dialog/dialog.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0a0e1a;
    --bg2: #0d1117;
    --bg3: #151b26;
    --border: rgba(255,255,255,0.08);
    --accent: #06b6d4;
    --accent2: #22d3ee;
    --accent-green: #22c55e;
    --accent-amber: #f59e0b;
    --accent-red: #ef4444;
    --accent-cyan: #06b6d4;
    --green: #10b981;
    --text: #e5e7eb;
    --text2: #9ca3af;
    --text3: #6b7280;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Inter', system-ui, sans-serif; height: 100vh; overflow: hidden; }
  body::before { content:''; position:fixed; inset:0; pointer-events:none; z-index:9999; opacity:0.03; background: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E") repeat; }

  /* Consistent heading classes */
  .h1 { font-size:15px; font-weight:600; }
  .h2 { font-size:13px; font-weight:600; }
  .h3 { font-size:12px; font-weight:500; }
  .sub { font-size:12px; color:var(--text3); margin-top:2px; }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

  /* Sidebar nav items */
  .nav-item { display:flex; align-items:center; gap:10px; padding:8px 12px; border-radius:8px; cursor:pointer; font-size:13px; color:var(--text2); transition: all 0.15s; border:none; background:transparent; width:100%; text-align:left; }
  .nav-item:hover { background: rgba(255,255,255,0.05); color:var(--text); }
  .nav-item.active { background: rgba(6,182,212,0.15); color: var(--accent2); }
  .nav-item .icon { width:16px; text-align:center; opacity:0.7; }
  .nav-item.active .icon { opacity:1; }

  /* Markdown in chat */
  .md h1,.md h2,.md h3 { font-weight:600; margin: 12px 0 6px; color: var(--text); }
  .md h1 { font-size:1.1em; } .md h2 { font-size:1em; } .md h3 { font-size:0.95em; }
  .md p { margin-bottom:8px; line-height:1.65; }
  .md ul,.md ol { margin: 6px 0 6px 18px; }
  .md li { margin-bottom:3px; line-height:1.5; }
  .md code { font-family:'JetBrains Mono',monospace; font-size:0.82em; background:rgba(255,255,255,0.08); padding:1px 5px; border-radius:4px; }
  .md pre { background:#0d0d14; border:1px solid var(--border); border-radius:8px; padding:14px; overflow-x:auto; margin:10px 0; }
  .md pre code { background:none; padding:0; font-size:0.83em; line-height:1.6; }
  .md blockquote { border-left:3px solid var(--accent); padding-left:12px; color:var(--text2); margin:8px 0; }
  .md table { width:100%; border-collapse:collapse; margin:10px 0; font-size:0.88em; }
  .md th,.md td { padding:6px 10px; border:1px solid var(--border); text-align:left; }
  .md th { background:rgba(255,255,255,0.05); }
  .md a { color:var(--accent2); text-decoration:underline; }
  .md strong { color:var(--text); font-weight:600; }
  .md hr { border:none; border-top:1px solid var(--border); margin:12px 0; }

  /* Chat bubbles */
  .bubble-user { background: rgba(6,182,212,0.12); border: 1px solid rgba(6,182,212,0.25); border-radius:12px 12px 4px 12px; padding:12px 16px; max-width:80%; align-self:flex-end; }
  .bubble-agent { background: var(--bg3); border: 1px solid var(--border); border-radius:12px 12px 12px 4px; padding:12px 16px; max-width:88%; align-self:flex-start; }
  .bubble-error { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius:8px; padding:10px 14px; align-self:flex-start; font-size:13px; color:#fca5a5; }
  .bubble-tool { background: rgba(234,179,8,0.07); border: 1px solid rgba(234,179,8,0.2); border-radius:8px; padding:8px 12px; align-self:flex-start; font-size:12px; color:#fde68a; font-family:'JetBrains Mono',monospace; max-width:88%; }
  
  /* Delete message button */
  .delete-msg-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    background: rgba(239,68,68,0.8);
    color: white;
    border: none;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s, background 0.2s;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .delete-msg-btn:hover { background: rgba(239,68,68,1); }
  div[data-message-id]:hover .delete-msg-btn { opacity: 1; }

  /* Typing indicator */
  .typing-dot { width:6px; height:6px; background:var(--accent2); border-radius:50%; }
  .typing-dot:nth-child(2) { animation-delay:0.2s; }
  .typing-dot:nth-child(3) { animation-delay:0.4s; }
  @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
  @media (prefers-reduced-motion: no-preference) {
    .typing-dot { animation: bounce 1.2s infinite; }
    .status-pulse { animation: pulse 2s infinite; }
    .skeleton { animation: shimmer 1.5s infinite; }
  }

  /* Voice recording indicator */
  .voice-recording { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); animation: rec-pulse 1.5s infinite; border-color:#ef4444 !important; }
  @keyframes rec-pulse { 0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); } 70% { box-shadow: 0 0 0 8px rgba(239,68,68,0); } 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); } }
  .voice-speaking { display:inline-block; animation: speak-glow 0.8s ease-in-out infinite alternate; }
  @keyframes speak-glow { from { opacity:0.6; transform:scale(0.95); } to { opacity:1; transform:scale(1.05); } }

  /* Status dot pulse */
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

  /* Card */
  .card { background:var(--bg3); border:1px solid var(--border); border-radius:8px; padding:14px; transition:all 0.2s ease; }
  .card:hover { border-color:rgba(6,182,212,0.3); }
  .card-sm { background:var(--bg2); border:1px solid var(--border); border-radius:8px; padding:10px 12px; }
  .card-mp { background:var(--bg2); border:1px solid var(--border); border-radius:10px; padding:14px 16px; transition:border-color 0.2s, box-shadow 0.2s, transform 0.15s; }
  .card-mp:hover { border-color:rgba(6,182,212,0.25); box-shadow:0 2px 12px rgba(0,0,0,0.15); transform:translateY(-1px); }

  /* Memory tabs */
  .mem-tab { padding:8px 16px; border:none; background:transparent; color:var(--text3); font-size:12px; font-weight:500; cursor:pointer; border-bottom:2px solid transparent; transition:all 0.15s; }
  .mem-tab:hover { color:var(--text2); }
  .mem-tab.active { color:var(--accent2); border-bottom-color:var(--accent); }

  /* Decay bar */
  .decay-bar { height:3px; border-radius:2px; background:var(--border); overflow:hidden; }
  .decay-bar-fill { height:100%; border-radius:2px; transition:width 0.3s; }

  /* Entity chip */
  .entity-chip { display:inline-flex; align-items:center; gap:3px; padding:2px 7px; border-radius:4px; font-size:10px; font-weight:500; cursor:pointer; transition:all 0.15s; }
  .entity-chip:hover { opacity:0.8; }

  /* Pill badge */
  .badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:9999px; font-size:11px; font-weight:500; }

  /* Input */
  .inp { background:var(--bg3); border:1px solid var(--border); border-radius:8px; padding:8px 12px; color:var(--text); font-size:13px; outline:none; transition:border-color 0.15s; width:100%; }
  .inp:focus { border-color: rgba(6,182,212,0.5); }
  .inp::placeholder { color: var(--text3); }

  /* Button */
  .btn { padding:8px 16px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; border:none; transition:all 0.15s; }
  .btn-primary { background:var(--accent); color:#fff; }
  .btn-primary:hover { background:#0891b2; }
  .btn-ghost { background:rgba(255,255,255,0.05); color:var(--text2); }
  .btn-ghost:hover { background:rgba(255,255,255,0.1); color:var(--text); }

  /* Skill filter tabs */
  .skill-tab { padding:4px 12px; border-radius:6px; cursor:pointer; font-size:11px; color:var(--text3); border:1px solid var(--border); background:transparent; }
  .skill-tab:hover { background:rgba(255,255,255,0.05); color:var(--text2); }
  .skill-tab.active { background:rgba(6,182,212,0.15); color:var(--accent2); border-color:rgba(6,182,212,0.3); }
  /* Skill search / toolbar */
  .skill-search { background:var(--bg2); border:1px solid var(--border); border-radius:6px; padding:6px 10px; font-size:11px; color:var(--text); font-family:'Inter',sans-serif; width:200px; outline:none; }
  .skill-search:focus { border-color:var(--accent); }
  .skill-search::placeholder { color:var(--text3); }
  .skill-view-btn { padding:4px 8px; border-radius:4px; cursor:pointer; font-size:10px; color:var(--text3); border:1px solid var(--border); background:transparent; transition:all 0.15s; }
  .skill-view-btn:hover { color:var(--text2); border-color:var(--text3); }
  .skill-view-btn.active { background:rgba(6,182,212,0.15); color:var(--accent2); border-color:rgba(6,182,212,0.3); }
  .skill-sort { background:var(--bg2); border:1px solid var(--border); border-radius:6px; padding:4px 8px; font-size:10px; color:var(--text2); font-family:'Inter',sans-serif; cursor:pointer; outline:none; }
  .skill-sort:focus { border-color:var(--accent); }
  /* Inline edit mode */
  .skill-inline-input { background:var(--bg); border:1px solid var(--accent); border-radius:4px; padding:3px 6px; font-size:12px; color:var(--text); font-family:'Inter',sans-serif; outline:none; width:100%; }
  .skill-inline-input.small { font-size:10px; }
  .skill-inline-textarea { background:var(--bg); border:1px solid var(--accent); border-radius:4px; padding:6px 8px; font-size:11px; color:var(--text); font-family:'JetBrains Mono',monospace; outline:none; width:100%; min-height:60px; resize:vertical; }
  .skill-check { display:none; }
  .skill-check:checked + .skill-check-label::before { content:'✓'; position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:10px; color:var(--bg); font-weight:700; background:var(--accent); border-radius:2px; }
  .skill-check-label { width:14px; height:14px; border:1px solid var(--text3); border-radius:2px; cursor:pointer; position:relative; flex-shrink:0; }
  .skill-card.selected { border-color:var(--accent); background:rgba(6,182,212,0.06); }
  /* Bulk toolbar */
  .skill-bulk-bar { display:none; align-items:center; gap:8px; padding:6px 10px; background:var(--bg2); border:1px solid var(--accent); border-radius:6px; font-size:11px; }
  .skill-bulk-bar.visible { display:flex; }
  /* List view */
  .skill-list-item { display:flex; align-items:center; gap:12px; padding:10px 14px; background:var(--bg3); border:1px solid var(--border); border-radius:6px; cursor:pointer; transition:all 0.15s; }
  .skill-list-item:hover { border-color:rgba(6,182,212,0.3); }
  /* Inline edit row */
  .skill-edit-row { display:flex; gap:6px; align-items:flex-start; }
  .skill-edit-row .skill-inline-input { flex-shrink:0; }
  .skill-inline-tags { display:flex; flex-wrap:wrap; gap:4px; }
  .skill-inline-tag { display:inline-flex; align-items:center; gap:2px; padding:1px 5px; border-radius:3px; font-size:9px; background:rgba(59,130,246,0.1); color:var(--accent2); }
  .skill-inline-tag .remove-tag { cursor:pointer; color:var(--text3); font-size:10px; }
  .skill-inline-tag .remove-tag:hover { color:#f87171; }
  /* Skill Designer */
  .sd-tab { padding:8px 16px; cursor:pointer; font-size:11px; color:var(--text3); background:transparent; border:none; border-bottom:2px solid transparent; }
  .sd-tab:hover { color:var(--text2); background:rgba(255,255,255,0.03); }
  .sd-tab.active { color:var(--accent2); border-bottom-color:var(--accent2); }
  .sd-step { display:flex; gap:8px; align-items:flex-start; padding:8px; border:1px solid var(--border); border-radius:6px; margin-bottom:6px; background:var(--bg2); cursor:default; }
  .sd-step:hover { border-color:var(--accent2); }
  .sd-step-drag { cursor:grab; padding:4px 2px; color:var(--text3); font-size:14px; user-select:none; }
  .sd-step-drag:active { cursor:grabbing; }
  .sd-preview h1 { font-size:18px; font-weight:700; margin:16px 0 8px; color:var(--text); }
  .sd-preview h2 { font-size:15px; font-weight:600; margin:14px 0 6px; color:var(--text); }
  .sd-preview h3 { font-size:13px; font-weight:600; margin:12px 0 4px; color:var(--text2); }
  .sd-preview p { margin:6px 0; }
  .sd-preview ul, .sd-preview ol { padding-left:20px; margin:6px 0; }
  .sd-preview li { margin:2px 0; }
  .sd-preview code { background:var(--bg2); padding:1px 4px; border-radius:3px; font-size:12px; font-family:'JetBrains Mono',monospace; }
  .sd-preview pre { background:var(--bg2); padding:12px; border-radius:6px; overflow-x:auto; font-size:12px; line-height:1.5; margin:8px 0; }
  .sd-preview pre code { background:none; padding:0; }
  .sd-preview strong { font-weight:600; color:var(--text); }
  .sd-preview em { font-style:italic; color:var(--text2); }
  .sd-preview blockquote { border-left:3px solid var(--accent2); padding-left:12px; margin:8px 0; color:var(--text2); }
  .sd-preview hr { border:none; border-top:1px solid var(--border); margin:16px 0; }
  .sd-preview a { color:var(--accent); text-decoration:underline; }

  /* Lens event row */
  .lens-row { display:flex; gap:10px; padding:6px 0; border-bottom:1px solid var(--border); align-items:flex-start; font-size:12px; }
  .lens-row:last-child { border-bottom:none; }

  /* Session sidebar item */
  .sess-item { padding:8px 10px; border-radius:6px; cursor:pointer; border:none; background:transparent; width:100%; text-align:left; transition:background 0.12s; }
  .sess-item:hover { background:rgba(255,255,255,0.05); }
  .sess-item.active { background:rgba(6,182,212,0.12); }

  /* Stat card */
  .stat { text-align:center; padding:14px; background:var(--bg3); border:1px solid var(--border); border-radius:8px; }
  .stat-num { font-size:1.8em; font-weight:600; color:var(--accent2); font-family:'JetBrains Mono',monospace; }
  .stat-label { font-size:11px; color:var(--text3); margin-top:2px; text-transform:uppercase; letter-spacing:0.05em; }

  /* Textarea auto-resize */
  #chat-input { resize:none; min-height:44px; max-height:160px; font-family:'Inter',sans-serif; line-height:1.5; }

  /* Divider */
  .divider { height:1px; background:var(--border); margin:8px 0; }

  /* ── Skeleton loading ─────────────────────────── */
  .skeleton { background: linear-gradient(90deg, var(--bg3) 25%, rgba(255,255,255,0.06) 50%, var(--bg3) 75%); background-size:200% 100%; border-radius:6px; }
  @keyframes shimmer { 0% { background-position:200% 0; } 100% { background-position:-200% 0; } }
  .skeleton-line { height:14px; margin-bottom:8px; width:100%; }
  .skeleton-line:nth-child(2) { width:85%; }
  .skeleton-line:nth-child(3) { width:60%; }
  .skeleton-card { height:80px; margin-bottom:10px; }

  /* ── Toast notifications ──────────────────────── */
  #toast-container { position:fixed; bottom:24px; right:24px; z-index:9999; display:flex; flex-direction:column; gap:8px; max-width:360px; }
  .toast { padding:12px 16px; border-radius:10px; font-size:13px; line-height:1.4; box-shadow:0 8px 32px rgba(0,0,0,0.4); display:flex; align-items:flex-start; gap:10px; backdrop-filter:blur(8px); }
  .toast-success { background:rgba(34,197,94,0.15); border:1px solid rgba(34,197,94,0.3); color:#4ade80; }
  .toast-error { background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:#f87171; }
  .toast-info { background:rgba(6,182,212,0.15); border:1px solid rgba(6,182,212,0.3); color:#22d3ee; }
  .toast-warning { background:rgba(234,179,8,0.15); border:1px solid rgba(234,179,8,0.3); color:#fbbf24; }
  @keyframes toastIn { from { transform:translateX(100%); opacity:0; } to { transform:translateX(0); opacity:1; } }
  .toast-out { animation: toastOut 0.25s ease-in forwards; }
  @keyframes toastOut { from { transform:translateX(0); opacity:1; } to { transform:translateX(100%); opacity:0; } }
  @media (prefers-reduced-motion: no-preference) {
    .toast { animation: toastIn 0.25s ease-out; }
  }

  /* ── Responsive sidebar ───────────────────────── */
  .sidebar-overlay { display:none; }
  @media (max-width:768px) {
    .sidebar { position:fixed; left:-260px; top:0; bottom:0; z-index:50; }
    .sidebar.open { left:0; }
    .sidebar-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:49; }
    .sidebar-overlay.open { display:block; }
    .main-area { margin-left:0 !important; }
    #hamburger { display:flex !important; }
  }
  @media (prefers-reduced-motion: no-preference) {
    @media (max-width:768px) {
      .sidebar { transition:left 0.25s ease; }
    }
  }
  #hamburger { display:none; align-items:center; justify-content:center; width:36px; height:36px; border-radius:8px; cursor:pointer; border:none; background:rgba(255,255,255,0.05); color:var(--text2); transition:background 0.15s; flex-shrink:0; }
  #hamburger:hover { background:rgba(255,255,255,0.1); color:var(--text); }

  /* ── Tooltip ──────────────────────────────────── */
  [data-tip] { position:relative; }
  [data-tip]:hover::after { content:attr(data-tip); position:absolute; top:calc(100% + 4px); left:50%; transform:translateX(-50%); background:#1a1a24; color:var(--text); font-size:11px; padding:4px 10px; border-radius:6px; white-space:nowrap; border:1px solid var(--border); pointer-events:none; z-index:100; }
  /* Multi-line tooltip for context bar */
  #context-bar-container[data-tip]:hover::after { white-space:pre-line; text-align:left; font-family:'JetBrains Mono',monospace; font-size:10px; padding:8px 12px; line-height:1.5; min-width:180px; }

  /* ── Code block enhancements ──────────────────── */
  .md pre { position:relative; }
  .md pre .copy-btn { position:absolute; top:6px; right:6px; opacity:0; transition:opacity 0.15s; background:rgba(255,255,255,0.08); border:none; color:var(--text3); cursor:pointer; padding:4px 8px; border-radius:4px; font-size:11px; }
  .md pre:hover .copy-btn { opacity:1; }
  .md pre .copy-btn:hover { background:rgba(255,255,255,0.15); color:var(--text); }

  /* ── Fade transitions ─────────────────────────── */
  @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  @media (prefers-reduced-motion: no-preference) {
    .page-fade-in { animation: fadeIn 0.2s ease-out; }
  }

  /* ── Editor ──────────────────────────────────── */
  .editor-tree-item { display:flex; align-items:center; gap:6px; padding:4px 8px; border-radius:5px; cursor:pointer; font-size:12px; color:var(--text2); transition:all 0.12s; border:none; background:transparent; width:100%; text-align:left; font-family:'Inter',sans-serif; }
  .editor-tree-item:hover { background:rgba(255,255,255,0.05); color:var(--text); }
  .editor-tree-item.active { background:rgba(6,182,212,0.12); color:var(--accent2); }
  .editor-tree-item .icon { width:16px; text-align:center; opacity:0.6; flex-shrink:0; }
  .editor-tab { padding:6px 12px; border-radius:6px 6px 0 0; font-size:12px; cursor:pointer; background:transparent; color:var(--text3); border:1px solid transparent; border-bottom:none; transition:all 0.12s; white-space:nowrap; display:inline-flex; align-items:center; gap:6px; }
  .editor-tab.active { background:var(--bg3); color:var(--text); border-color:var(--border); }
  .editor-tab:hover:not(.active) { color:var(--text2); }
  .editor-tab .editor-tab-icon { width:12px; height:12px; opacity:0.5; flex-shrink:0; }
  .editor-tab.active .editor-tab-icon { opacity:0.8; }
  .editor-tab .editor-tab-modified { width:8px; height:8px; border-radius:50%; background:var(--accent-amber); flex-shrink:0; }
  .editor-tab .editor-tab-close { width:16px; height:16px; border-radius:3px; display:none; align-items:center; justify-content:center; font-size:10px; color:var(--text3); cursor:pointer; flex-shrink:0; margin-left:2px; }
  .editor-tab:hover .editor-tab-close { display:flex; }
  .editor-tab .editor-tab-close:hover { background:rgba(239,68,68,0.2); color:var(--accent-red); }
  #editor-container { position:relative; }
  .CodeMirror { position:absolute; top:0; left:0; right:0; bottom:0; height:auto !important; font-size:13px; font-family:'JetBrains Mono',monospace; background:var(--bg3) !important; color:var(--text) !important; }
  .CodeMirror-gutters { background:var(--bg2) !important; border-right:1px solid var(--border) !important; }
  .CodeMirror-linenumber { color:var(--text3) !important; }
  .CodeMirror-cursor { border-left:2px solid var(--accent2) !important; }
  .cm-s-default .cm-keyword { color:#818cf8; }
  .cm-s-default .cm-atom { color:#f472b6; }
  .cm-s-default .cm-number { color:#f472b6; }
  .cm-s-default .cm-def { color:#a5b4fc; }
  .cm-s-default .cm-variable { color:var(--text); }
  .cm-s-default .cm-variable-2 { color:#e2e2ea; }
  .cm-s-default .cm-variable-3 { color:#34d399; }
  .cm-s-default .cm-string { color:#34d399; }
  .cm-s-default .cm-string-2 { color:#34d399; }
  .cm-s-default .cm-comment { color:#55556a; font-style:italic; }
  .cm-s-default .cm-tag { color:#f87171; }
  .cm-s-default .cm-attribute { color:#fbbf24; }
  .cm-s-default .cm-meta { color:#38bdf8; }
  .cm-s-default .cm-qualifier { color:#38bdf8; }
  .cm-s-default .cm-builtin { color:#fb923c; }
  .cm-s-default .cm-bracket { color:var(--text3); }
  .cm-s-default .cm-hr { color:var(--text3); }
  .cm-s-default .cm-link { color:#818cf8; }
  .cm-s-default .cm-error { color:#f87171; }
  .cm-s-default .cm-m-markup { color:var(--text2); }
  .cm-s-default .cm-m-md { color:var(--text2); }
  .cm-s-default .cm-m-xml { color:#f87171; }
  .CodeMirror-selected { background:rgba(6,182,212,0.2) !important; }
  .CodeMirror-focused .CodeMirror-selected { background:rgba(6,182,212,0.25) !important; }
  .CodeMirror-matchingbracket { outline:1px solid rgba(6,182,212,0.4); color:var(--text) !important; }
  .CodeMirror-nonmatchingbracket { color:#f87171 !important; }

  /* ── Card hover effects ───────────────────────── */
  .card, .card-sm { transition: border-color 0.2s, box-shadow 0.2s; }
  .card:hover, .card-sm:hover { border-color: rgba(255,255,255,0.12); box-shadow:0 0 0 1px rgba(6,182,212,0.1); }
  .sess-item, .nav-item { transition: all 0.15s; }

  /* ── Scrollbar for log tables ─────────────────── */
  .log-table-scroll { overflow-y:auto; }
  .log-table-scroll::-webkit-scrollbar { width:6px; }

  /* ── Sidebar section headers ──────────────────── */
  .nav-section { padding:12px 12px 4px; font-size:10px; color:var(--text3); font-weight:600; letter-spacing:0.08em; text-transform:uppercase; display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none; }
  .nav-section:hover { color:var(--text2); }
  .nav-section .nav-section-toggle { font-size:8px; transition:transform 0.15s; }
  .nav-section.collapsed .nav-section-toggle { transform:rotate(-90deg); }
  .nav-section.collapsed + .nav-item,
  .nav-section.collapsed ~ .nav-item.nav-in-section { display:none !important; }
  .nav-section + .nav-item[style*="display:none"] ~ .nav-item { display:none !important; }
  .nav-item { position:relative; padding-left:12px; }
  .nav-item .icon { width:18px; text-align:center; opacity:0.6; }
  .nav-item.active .icon { opacity:1; }
  .nav-item.active::before { content:''; position:absolute; left:0; top:50%; transform:translateY(-50%); width:3px; height:18px; background:var(--accent); border-radius:0 3px 3px 0; }
  .nav-item.compact { padding:6px 12px; font-size:12px; }

  /* ── Command palette ──────────────────────────── */
  #cmd-palette { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:9998; align-items:flex-start; justify-content:center; padding-top:10vh; backdrop-filter:blur(4px); }
  #cmd-palette.open { display:flex; }
  .cmd-modal { width:540px; max-width:90vw; background:var(--bg2); border:1px solid var(--border); border-radius:12px; overflow:hidden; box-shadow:0 24px 80px rgba(0,0,0,0.5); }
  .cmd-input-wrap { display:flex; align-items:center; gap:10px; padding:14px 16px; border-bottom:1px solid var(--border); }
  .cmd-input-wrap input { flex:1; background:transparent; border:none; outline:none; color:var(--text); font-size:14px; font-family:'Inter',sans-serif; }
  .cmd-input-wrap input::placeholder { color:var(--text3); }
  .cmd-hint { font-size:11px; color:var(--text3); padding:8px 16px; border-bottom:1px solid var(--border); }
  .cmd-results { max-height:360px; overflow-y:auto; }
  .cmd-item { display:flex; align-items:center; gap:12px; padding:10px 16px; cursor:pointer; transition:background 0.1s; border:none; background:transparent; width:100%; text-align:left; color:var(--text); font-size:13px; font-family:'Inter',sans-serif; }
  .cmd-item:hover, .cmd-item.active { background:rgba(6,182,212,0.12); }
  .cmd-item .cmd-icon { flex-shrink:0; width:20px; color:var(--text3); }
  .cmd-item .cmd-label { flex:1; }
  .cmd-item .cmd-shortcut { font-size:10px; color:var(--text3); background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px; }

  /* ── Sidebar quick search ─────────────────────── */
  #sidebar-search { width:100%; background:var(--bg3); border:1px solid var(--border); border-radius:6px; padding:6px 10px; color:var(--text); font-size:12px; outline:none; font-family:'Inter',sans-serif; transition:border-color 0.15s; margin:0 0 8px; }
  #sidebar-search:focus { border-color:rgba(6,182,212,0.4); }
  #sidebar-search::placeholder { color:var(--text3); }
  .nav-hidden { display:none !important; }

  /* ── Confirm dialog ──────────────────────────── */
  .confirm-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:200; align-items:center; justify-content:center; }
  .confirm-overlay.open { display:flex; }
  .confirm-box { background:var(--bg2); border:1px solid var(--border); border-radius:12px; padding:24px; width:420px; max-width:90vw; box-shadow:0 24px 80px rgba(0,0,0,0.5); }
  .confirm-box h2 { font-size:14px; font-weight:600; margin-bottom:8px; }
  .confirm-box p { font-size:13px; color:var(--text2); margin-bottom:20px; line-height:1.5; }
  .confirm-box .confirm-actions { display:flex; gap:8px; justify-content:flex-end; }
  .btn-danger { background:var(--accent-red); color:#fff; }
  .btn-danger:hover { background:#dc2626; }

  /* ── Agent panel (right sidebar) ──────────────── */
  #agent-panel-toggle { display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:8px; cursor:pointer; border:1px solid var(--border); background:var(--bg3); color:var(--text2); transition:all 0.15s; flex-shrink:0; font-size:14px; }
  #agent-panel-toggle:hover { background:rgba(6,182,212,0.15); border-color:rgba(6,182,212,0.3); color:var(--accent2); }
  #agent-panel-toggle.active { background:rgba(6,182,212,0.15); border-color:rgba(6,182,212,0.3); color:var(--accent2); }

  #agent-panel { display:none; width:280px; min-width:280px; max-width:280px; background:var(--bg2); border-left:1px solid var(--border); flex-direction:column; overflow:hidden; transition:width 0.2s ease; }
  #agent-panel.open { display:flex; }
  .agent-panel-header { padding:12px 14px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
  .agent-panel-header h2 { font-size:13px; font-weight:600; color:var(--text); }
  .agent-panel-body { flex:1; overflow-y:auto; padding:8px; }
  .agent-panel-footer { padding:8px 14px; border-top:1px solid var(--border); font-size:11px; color:var(--text3); display:flex; align-items:center; justify-content:space-between; }

  /* Agent tree items */
  .agent-section { margin-bottom:4px; }
  .agent-section-header { display:flex; align-items:center; gap:6px; padding:6px 8px; border-radius:6px; cursor:pointer; transition:background 0.12s; font-size:11px; font-weight:600; color:var(--text3); text-transform:uppercase; letter-spacing:0.05em; }
  .agent-section-header:hover { background:rgba(255,255,255,0.03); }

  .agent-item { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; cursor:pointer; transition:background 0.12s; border:none; background:transparent; width:100%; text-align:left; font-family:'Inter',sans-serif; }
  .agent-item:hover { background:rgba(255,255,255,0.04); }
  .agent-item.active { background:rgba(6,182,212,0.1); }
  .agent-item-child { margin-left:16px; }
  .agent-item-name { font-size:12px; font-weight:500; color:var(--text2); flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .agent-item-meta { font-size:11px; color:var(--text3); white-space:nowrap; }
  .agent-item-toggle { width:14px; height:14px; display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--text3); font-size:10px; transition:transform 0.15s; }
  .agent-item-toggle.expanded { transform:rotate(90deg); }

  .agent-item-actions { display:none; gap:2px; align-items:center; margin-left:6px; }
  .agent-item:hover .agent-item-actions { display:flex; }
  .agent-item-action { width:22px; height:22px; border-radius:4px; border:none; background:transparent; color:var(--text3); cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:11px; transition:all 0.1s; padding:0; }
  .agent-item-action:hover { background:rgba(255,255,255,0.08); color:var(--text); }
  .agent-item-action.danger:hover { background:rgba(239,68,68,0.15); color:#f87171; }

  .agent-status { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .agent-status.active { background:#22c55e; box-shadow:0 0 6px rgba(34,197,94,0.4); }
  .agent-status.idle { background:#eab308; }
  .agent-status.closed { background:var(--text3); }
  .agent-status.error { background:#ef4444; }

  .agent-type-badge { display:inline-block; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:0.03em; }
  .agent-type-badge.explore { background:rgba(56,189,248,0.12); color:#38bdf8; }
  .agent-type-badge.general { background:rgba(168,85,247,0.12); color:#a855f7; }
  .agent-type-badge.plan { background:rgba(34,197,94,0.12); color:#22c55e; }
  .agent-type-badge.code { background:rgba(245,158,11,0.12); color:#f59e0b; }
  .agent-type-badge.research { background:rgba(236,72,153,0.12); color:#ec4899; }

  /* Empty state */
  .agent-empty { text-align:center; padding:24px 16px; color:var(--text3); font-size:12px; }

  @media (max-width:768px) {
    #agent-panel { position:fixed; right:-280px; top:0; bottom:0; z-index:50; }
    #agent-panel.open { right:0; }
  }
  @media (prefers-reduced-motion: no-preference) {
    @media (max-width:768px) {
      #agent-panel { transition:right 0.25s ease; }
    }
  }

  /* Dashboard */
  .dashboard-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; padding:16px 20px; }
  .widget { background:var(--bg3); border:1px solid var(--border); border-radius:10px; overflow:hidden; display:flex; flex-direction:column; transition:border-color 0.2s; }
  .widget:hover { border-color:rgba(255,255,255,0.12); }
  .widget-header { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid var(--border); font-size:12px; font-weight:600; color:var(--text2); flex-shrink:0; }
  .widget-body { flex:1; overflow-y:auto; padding:10px 12px; font-size:12px; min-height:60px; }
  .widget-actions { display:none; gap:4px; align-items:center; }
  .dashboard-edit-mode .widget-actions { display:flex; }
  .dashboard-edit-mode .widget { border-color:rgba(6,182,212,0.3); cursor:grab; }
  .dashboard-edit-mode .widget.drag-over { border-color:var(--accent2); box-shadow:0 0 0 2px rgba(6,182,212,0.3); }
  .drag-handle { cursor:grab; color:var(--text3); padding:2px; font-size:14px; user-select:none; }
  .widget-remove { cursor:pointer; color:var(--text3); background:transparent; border:none; padding:2px 5px; border-radius:4px; font-size:13px; }
  .widget-remove:hover { background:rgba(239,68,68,0.15); color:#f87171; }
  .widget-add-bar { padding:8px 20px 4px; display:none; }
  .dashboard-edit-mode .widget-add-bar { display:block; }
  .widget-picker { padding:12px 20px; border-bottom:1px solid var(--border); background:var(--bg2); }
  .widget-loading { text-align:center; padding:16px; color:var(--text3); font-size:12px; }
  .widget-empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; color:var(--text3); text-align:center; }
  .kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(90px,1fr)); gap:8px; }
  .kpi { text-align:center; padding:8px; background:var(--bg2); border-radius:8px; }
  .kpi-num { font-size:1.3em; font-weight:600; color:var(--accent2); font-family:'JetBrains Mono',monospace; }
  .kpi-label { font-size:10px; color:var(--text3); margin-top:2px; text-transform:uppercase; letter-spacing:0.04em; }
  .stat-row { display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid var(--border); font-size:12px; }
  .stat-row:last-child { border-bottom:none; }
  .stat-label { color:var(--text3); }
  .bar { height:5px; background:var(--border); border-radius:3px; overflow:hidden; margin:2px 0 8px; }
  .bar-fill { height:100%; border-radius:3px; transition:width 0.3s; }
  .list-item { display:flex; align-items:center; gap:6px; padding:3px 0; border-bottom:1px solid var(--border); font-size:12px; }
  .list-item:last-child { border-bottom:none; }
  .dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
  .list-text { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text2); }
  .list-meta { color:var(--text3); font-size:10px; flex-shrink:0; }
  .empty { text-align:center; padding:20px; color:var(--text3); font-size:12px; }
</style>
</head>
<body>

<div style="display:flex;height:100vh;overflow:hidden;" role="application">

<!-- ── Sidebar overlay (mobile) ─────────────────────────── -->
<div id="sidebar-overlay" class="sidebar-overlay" onclick="toggleSidebar()" role="presentation"></div>

<!-- ── Sidebar ──────────────────────────────────────────── -->
<aside id="sidebar" class="sidebar" style="width:220px;min-width:220px;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;" role="navigation" aria-label="Main navigation">

  <!-- Logo -->
  <div style="padding:18px 16px 12px;border-bottom:1px solid var(--border);">
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="width:28px;height:28px;background:linear-gradient(135deg,#06b6d4,#0891b2);border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:14px;">⬡</div>
      <span style="font-weight:600;font-size:15px;letter-spacing:-0.3px;">Cortex</span>
      <span id="ws-badge" class="badge" style="background:rgba(234,179,8,0.15);color:#fbbf24;margin-left:auto;">●</span>
    </div>
    <div id="model-label" style="font-size:11px;color:var(--text3);margin-top:6px;padding-left:36px;">loading…</div>
  </div>

  <!-- Nav -->
  <nav style="padding:6px 8px;flex:1;overflow-y:auto;">
    <!-- Quick search -->
    <input id="sidebar-search" placeholder="Search pages…" oninput="filterNav(this.value)" aria-label="Search navigation pages" />

    <!-- Recent pages -->
    <div id="recent-pages-section" style="display:none;">
      <div class="nav-section">Recent</div>
      <div id="recent-pages-list"></div>
    </div>

    <!-- Core -->
    <div class="nav-section" onclick="toggleSidebarSection(event)" aria-expanded="true">Core <span class="nav-section-toggle">▼</span></div>
    <button class="nav-item active" onclick="showPage('dashboard');closeMobileSidebar()" id="nav-dashboard">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></span> Dashboard
    </button>
    <button class="nav-item" onclick="showPage('chat');closeMobileSidebar()" id="nav-chat">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span> Chat
    </button>
    <button class="nav-item" onclick="showPage('sessions');closeMobileSidebar()" id="nav-sessions">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span> Sessions
    </button>

    <!-- Intelligence -->
    <div class="nav-section" onclick="toggleSidebarSection(event)" aria-expanded="true">Intelligence <span class="nav-section-toggle">▼</span></div>
    <button class="nav-item" onclick="showPage('memory');closeMobileSidebar()" id="nav-memory">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></span> Memory
    </button>
    <button class="nav-item" onclick="showPage('skills');closeMobileSidebar()" id="nav-skills">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span> Skills
    </button>
    <button class="nav-item" onclick="showPage('soul');closeMobileSidebar()" id="nav-soul">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></span> Soul
    </button>
    <button class="nav-item" onclick="showPage('lens');closeMobileSidebar()" id="nav-lens">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg></span> Activity
    </button>

    <!-- Development -->
    <div class="nav-section" onclick="toggleSidebarSection(event)" aria-expanded="true">Development <span class="nav-section-toggle">▼</span></div>
    <button class="nav-item" onclick="showPage('editor');closeMobileSidebar()" id="nav-editor">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span> Editor
    </button>
    <button class="nav-item" onclick="showPage('coderunner');closeMobileSidebar()" id="nav-coderunner">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg></span> Code Runner
    </button>
    <button class="nav-item" onclick="showPage('vcs');closeMobileSidebar()" id="nav-vcs">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="18" r="4"/><circle cx="12" cy="6" r="4"/><path d="M18 12h-4"/><path d="M10 12H6"/></svg></span> Version Control
    </button>
    <button class="nav-item" onclick="showPage('projects');closeMobileSidebar()" id="nav-projects">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span> Projects
    </button>

    <!-- Infrastructure -->
    <div class="nav-section" onclick="toggleSidebarSection(event)" aria-expanded="true">Infrastructure <span class="nav-section-toggle">▼</span></div>
    <button class="nav-item" onclick="showPage('agents');closeMobileSidebar()" id="nav-agents">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span> Agents
    </button>
    <button class="nav-item" onclick="showPage('services');closeMobileSidebar()" id="nav-services">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><path d="M6 6h.01M6 18h.01"/></svg></span> Services
    </button>
    <button class="nav-item" onclick="showPage('nodes');closeMobileSidebar()" id="nav-nodes">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span> Nodes
    </button>
    <button class="nav-item" onclick="showPage('jobs');closeMobileSidebar()" id="nav-jobs">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span> Jobs
    </button>
    <button class="nav-item" onclick="showPage('automation');closeMobileSidebar()" id="nav-automation">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span> Automation
    </button>
    <button class="nav-item" onclick="showPage('channels');closeMobileSidebar()" id="nav-channels">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h12M4 14h9M4 18h6"/><path d="M18 8a2 2 0 1 0 4 0 2 2 0 0 0-4 0z"/><path d="M18 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0z"/><line x1="20" y1="10" x2="20" y2="14"/></svg></span> Channels
    </button>

    <!-- System -->
    <div class="nav-section" onclick="toggleSidebarSection(event)" aria-expanded="true">System <span class="nav-section-toggle">▼</span></div>
    <button class="nav-item" onclick="showPage('settings');closeMobileSidebar()" id="nav-settings">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span> Settings
    </button>
    <button class="nav-item" onclick="showPage('policies');closeMobileSidebar()" id="nav-policies">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span> Policies
    </button>
    <button class="nav-item" onclick="showPage('extensions');closeMobileSidebar()" id="nav-extensions">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg></span> Extensions
    </button>
    <button class="nav-item" onclick="showPage('analytics');closeMobileSidebar()" id="nav-analytics">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span> Analytics
    </button>
    <button class="nav-item" onclick="showPage('quartermaster');closeMobileSidebar()" id="nav-quartermaster">
      <span class="icon">🧠</span>Quartermaster
    </button>

    <!-- Plugin Panels (dynamic) -->
    <div class="nav-section" onclick="toggleSidebarSection(event)" aria-expanded="true" id="nav-section-plugin-panels" style="display:none;">Plugin Panels <span class="nav-section-toggle">▼</span></div>
    <div id="plugin-panels-nav"></div>
  </nav>

  <!-- Daemon status -->
  <div style="padding:10px 12px;border-top:1px solid var(--border);">
    <div style="font-size:11px;color:var(--text3);margin-bottom:6px;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;">Daemons</div>
    <div id="daemon-status" style="display:flex;flex-direction:column;gap:3px;"></div>
  </div>
</aside>

<!-- ── Main area ─────────────────────────────────────────── -->
<main class="main-area" style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;" role="main" aria-label="Content area">

  <!-- Page: Chat -->
  <div id="page-chat" style="display:flex;flex:1;overflow:hidden;flex-direction:column;">

    <!-- Chat header -->
    <div style="padding:10px 20px;border-bottom:1px solid var(--border);background:var(--bg2);display:flex;align-items:center;gap:12px;flex-shrink:0;">
      <button id="hamburger" onclick="toggleSidebar()" data-tip="Toggle sidebar" aria-label="Toggle sidebar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <span id="chat-agent-name" style="font-size:13px;font-weight:500;color:var(--accent2);"></span>
      <span id="chat-session-id" style="font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;"></span>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center;">
        <select id="chat-agent-select" class="inp" style="width:140px;font-size:12px;padding:5px 8px;" onchange="switchChatAgent(this.value)">
          <option value="">Loading agents…</option>
        </select>
        <button class="btn btn-ghost" onclick="newChat()" style="font-size:12px;padding:5px 12px;" data-tip="Start new session">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:middle;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New
        </button>
        <button class="btn btn-ghost" onclick="showPage('sessions')" style="font-size:12px;padding:5px 12px;" data-tip="Browse sessions">History</button>
        <button id="agent-panel-toggle" onclick="toggleAgentPanel()" data-tip="Agent panel">⎇</button>
        <span id="voice-indicator" style="display:none;font-size:16px;"></span>
      </div>
    </div>

    <!-- Model / reasoning / context bar -->
    <div style="padding:6px 20px;border-bottom:1px solid var(--border);background:var(--bg2);display:flex;align-items:center;gap:10px;flex-shrink:0;flex-wrap:wrap;">
      <select id="chat-model-select" class="inp" style="width:200px;font-size:11px;padding:4px 6px;" onchange="onModelChange()" title="Model">
        <option value="">Default model</option>
      </select>
      <select id="chat-reasoning-select" class="inp" style="width:110px;font-size:11px;padding:4px 6px;" onchange="onReasoningChange()" title="Reasoning effort">
        <option value="">Reasoning: auto</option>
        <option value="low">Reasoning: low</option>
        <option value="medium">Reasoning: medium</option>
        <option value="high">Reasoning: high</option>
      </select>
      <div style="flex:1;min-width:120px;max-width:260px;" id="context-bar-container" title="Context usage">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-bottom:2px;">
          <span id="context-label">context</span>
          <span id="context-pct">—</span>
        </div>
        <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;">
          <div id="context-bar-fill" style="height:100%;width:0%;border-radius:2px;background:var(--accent);transition:width 0.3s;"></div>
        </div>
      </div>
    </div>

    <div style="flex:1;display:flex;overflow:hidden;">
    <!-- Message list -->
    <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;">
      <div id="chat-log" style="flex:1;overflow-y:auto;padding:24px 28px;display:flex;flex-direction:column;gap:14px;"></div>

      <!-- Input bar -->
      <div style="border-top:1px solid var(--border);padding:16px 24px;background:var(--bg2);">
        <div id="file-preview" style="display:none;max-width:900px;margin:0 auto 8px;padding:8px 12px;background:var(--bg3);border-radius:8px;font-size:12px;color:var(--text2);align-items:center;gap:8px;" class="flex"></div>
        <div style="display:flex;gap:10px;align-items:flex-end;max-width:900px;margin:0 auto;">
          <input type="file" id="file-input" style="display:none;" multiple onchange="handleFileSelect(event)" />
          <button class="btn" onclick="document.getElementById('file-input').click()" style="height:44px;width:44px;padding:0;font-size:18px;" title="Attach files">📎</button>
          <textarea id="chat-input" class="inp" placeholder="Message Cortex… (Enter to send, Shift+Enter for newline)" style="flex:1;"></textarea>
          <button id="voice-mic-btn" class="btn" onclick="toggleMic()" style="height:44px;width:44px;padding:0;font-size:18px;display:none;" title="Voice input">🎤</button>
          <button class="btn btn-primary" onclick="sendMessage()" style="height:44px;padding:0 18px;white-space:nowrap;">Send ↵</button>
        </div>
        <div id="thinking-bar" style="display:none;max-width:900px;margin:8px auto 0;gap:6px;align-items:center;" class="flex">
          <div style="display:flex;gap:4px;">
            <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
          </div>
          <span style="font-size:12px;color:var(--text3);">Thinking…</span>
          <button id="reasoning-toggle" class="btn btn-ghost" onclick="toggleReasoningPanel()" style="padding:2px 8px;font-size:11px;margin-left:auto;display:none;" data-tip="View reasoning & tool calls">🔬 Reasoning</button>
          <span id="token-live" style="font-size:11px;color:var(--text3);margin-left:8px;"></span>
        </div>
      </div>
    </div>

    <!-- Agent panel (right sidebar) -->
    <div id="agent-panel">
      <div class="agent-panel-header">
        <h2>Agents</h2>
        <button class="btn btn-ghost" onclick="loadAgentPanel()" data-tip="Refresh" style="padding:2px 8px;font-size:11px;">↻</button>
      </div>
      <div id="agent-panel-body" class="agent-panel-body">
        <div class="agent-empty">Loading…</div>
      </div>
      <div class="agent-panel-footer">
        <span id="agent-panel-count"></span>
      </div>
    </div>
    </div>
  </div>

  <!-- Page: Editor -->
  <div id="page-editor" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="display:flex;flex:1;overflow:hidden;">
      <!-- Editor sidebar: file tree / tabs -->
      <div style="width:240px;min-width:240px;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:10px 12px;border-bottom:1px solid var(--border);display:flex;gap:6px;align-items:center;">
          <select id="editor-workspace-select" class="inp" style="flex:1;font-size:12px;padding:5px 8px;" onchange="editorSwitchWorkspace(this.value)">
            <option value="global">Global</option>
          </select>
          <button class="btn btn-ghost" onclick="editorRefreshTree()" style="padding:4px 8px;font-size:12px;" data-tip="Refresh">↻</button>
        </div>
        <div style="padding:6px 8px;border-bottom:1px solid var(--border);display:flex;gap:4px;">
          <button class="btn btn-ghost" onclick="editorNewFile()" style="flex:1;padding:4px 6px;font-size:11px;">+ New File</button>
          <button class="btn btn-ghost" onclick="editorNewFolder()" style="flex:1;padding:4px 6px;font-size:11px;">+ Folder</button>
        </div>
        <div id="editor-tree" style="flex:1;overflow-y:auto;padding:6px 4px;font-size:13px;"></div>
      </div>
      <!-- Editor main pane -->
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <!-- Tabs bar -->
        <div id="editor-tabs" style="display:flex;background:var(--bg2);border-bottom:1px solid var(--border);overflow-x:auto;padding:0 8px;flex-shrink:0;"></div>
      <!-- CodeMirror container -->
      <div id="editor-container" style="flex:1;overflow:hidden;display:flex;">
          <div style="text-align:center;color:var(--text3);">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.3;margin-bottom:12px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            <p style="font-size:14px;font-weight:500;">File Editor</p>
            <p style="font-size:12px;margin-top:4px;">Select a file from the tree to start editing</p>
          </div>
        </div>
        <!-- Status bar -->
        <div id="editor-statusbar" style="display:none;padding:6px 16px;background:var(--bg2);border-top:1px solid var(--border);font-size:11px;color:var(--text3);justify-content:space-between;align-items:center;flex-shrink:0;">
          <span id="editor-file-info"></span>
          <div style="display:flex;gap:10px;align-items:center;">
            <span id="editor-git-status"></span>
            <button class="btn btn-ghost" onclick="editorUndo()" style="padding:2px 8px;font-size:11px;" data-tip="Undo">↩ Undo</button>
            <button class="btn btn-ghost" onclick="editorRedo()" style="padding:2px 8px;font-size:11px;" data-tip="Redo">↪ Redo</button>
            <span id="editor-modified" style="color:#fbbf24;"></span>
            <button class="btn btn-ghost" onclick="editorDeleteFile()" style="padding:2px 8px;font-size:11px;color:#f87171;" data-tip="Delete file">✕ Delete</button>
            <button class="btn btn-primary" onclick="editorSave()" style="padding:3px 12px;font-size:11px;">Save</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Page: Git -->
  <div id="page-vcs" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Version Control</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Local Git operations and remote GitHub management</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <select id="git-agent-select" class="inp" style="width:160px;font-size:12px;padding:5px 8px;">
          <option value="">Current directory</option>
        </select>
        <button class="btn btn-ghost" onclick="vcsRefresh()" style="padding:5px 12px;font-size:12px;">↻ Refresh</button>
      </div>
    </div>
    <!-- VCS tab bar -->
    <div style="padding:8px 24px;border-bottom:1px solid var(--border);display:flex;gap:2px;flex-shrink:0;">
      <button class="mem-tab active" onclick="vcsShowTab('local')" id="vcs-tab-local">Local</button>
      <button class="mem-tab" onclick="vcsShowTab('remote')" id="vcs-tab-remote">Remote</button>
    </div>
    <!-- Tab: Local (Git) -->
    <div id="vcs-pane-local" style="flex:1;overflow:hidden;display:flex;flex-direction:column;">
      <div style="padding:12px 24px;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:center;flex-wrap:wrap;flex-shrink:0;">
        <span id="git-branch" style="font-size:13px;font-weight:500;color:var(--accent2);font-family:'JetBrains Mono',monospace;">—</span>
        <span id="git-status-text" style="font-size:12px;color:var(--text3);">loading…</span>
        <span id="git-ahead-behind" style="font-size:11px;color:var(--text3);"></span>
        <div style="margin-left:auto;display:flex;gap:6px;">
          <button class="btn btn-ghost" onclick="gitStageAll()" style="padding:4px 10px;font-size:11px;">Stage All</button>
          <button class="btn btn-ghost" onclick="gitShowCommitInput()" style="padding:4px 10px;font-size:11px;">Commit</button>
          <button class="btn btn-ghost" onclick="gitPush()" style="padding:4px 10px;font-size:11px;">Push</button>
          <button class="btn btn-ghost" onclick="gitPull()" style="padding:4px 10px;font-size:11px;">Pull</button>
        </div>
      </div>
      <div id="git-commit-area" style="display:none;padding:12px 24px;border-bottom:1px solid var(--border);flex-shrink:0;">
        <div style="display:flex;gap:8px;">
          <input id="git-commit-message" class="inp" placeholder="Commit message…" style="flex:1;font-size:13px;" onkeydown="if(event.key==='Enter'){event.preventDefault();gitDoCommit()}"/>
          <button class="btn btn-primary" onclick="gitDoCommit()" style="padding:5px 16px;font-size:12px;">Commit</button>
          <button class="btn btn-ghost" onclick="document.getElementById('git-commit-area').style.display='none'" style="padding:5px 12px;font-size:12px;">Cancel</button>
        </div>
      </div>
      <div style="flex:1;overflow:hidden;display:flex;">
        <div style="flex:1;overflow-y:auto;padding:16px 20px;border-right:1px solid var(--border);">
          <div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:10px;">Changes</div>
          <div id="git-changes-list" style="font-size:12px;"></div>
        </div>
        <div style="flex:1;overflow-y:auto;padding:16px 20px;">
          <div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:10px;">Recent Commits</div>
          <div id="git-log-list" style="font-size:12px;"></div>
        </div>
      </div>
    </div>
    <!-- Tab: Remote (GitHub) -->
    <div id="vcs-pane-remote" style="flex:1;overflow:hidden;display:none;flex-direction:column;">
      <div style="padding:10px 24px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:center;flex-shrink:0;">
        <span id="gh-token-status" style="font-size:11px;color:var(--text3);"></span>
        <input id="gh-repo-input" class="inp" placeholder="owner/repo (e.g. user/myrepo)" style="width:260px;font-size:13px;" onkeydown="if(event.key==='Enter')ghLoadRepo()"/>
        <button class="btn btn-primary" onclick="ghLoadRepo()" style="padding:5px 14px;font-size:12px;">Load</button>
        <button class="nav-item compact" onclick="ghShowTab('pulls')" id="gh-tab-pulls" style="display:none;">Pull Requests</button>
        <button class="nav-item compact" onclick="ghShowTab('issues')" id="gh-tab-issues" style="display:none;">Issues</button>
        <button class="nav-item compact" onclick="ghShowTab('info')" id="gh-tab-info" style="display:none;">Repo Info</button>
      </div>
      <div id="gh-content" style="flex:1;overflow-y:auto;padding:16px 24px;font-size:13px;">
        <div style="text-align:center;color:var(--text3);padding:60px 20px;">
          <p>Enter a repository (owner/repo) and click Load to get started.</p>
          <p style="font-size:12px;margin-top:8px;">Requires a GitHub token in <code style="color:var(--text2);">GITHUB_TOKEN</code> env, <code style="color:var(--text2);">githubToken</code> config, or vault.</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Page: Code Runner -->
  <div id="page-coderunner" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Code Runner</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Execute code in a sandboxed environment (Docker or subprocess)</p>
      </div>
    </div>
    <!-- Language selector + run button -->
    <div style="padding:12px 24px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:center;flex-shrink:0;">
      <select id="coderunner-lang" class="inp" style="width:140px;font-size:13px;padding:6px 10px;">
        <option value="python">Python</option>
        <option value="javascript">JavaScript</option>
        <option value="typescript">TypeScript</option>
        <option value="bash">Bash</option>
        <option value="ruby">Ruby</option>
      </select>
      <button class="btn btn-primary" onclick="codeRunnerRun()" style="padding:6px 20px;font-size:13px;">▶ Run</button>
      <button class="btn btn-ghost" onclick="codeRunnerClear()" style="padding:6px 14px;font-size:12px;">Clear</button>
      <span id="coderunner-status" style="font-size:11px;color:var(--text3);margin-left:auto;"></span>
    </div>
    <!-- Code input -->
    <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <textarea id="coderunner-input" class="inp" placeholder="Write your code here…" style="flex:1;border-radius:0;border:none;font-family:'JetBrains Mono',monospace;font-size:13px;padding:16px 20px;resize:none;background:var(--bg3);" spellcheck="false"></textarea>
      </div>
      <!-- Output area -->
      <div style="height:200px;min-height:120px;border-top:1px solid var(--border);background:var(--bg2);overflow-y:auto;padding:12px 20px;font-family:'JetBrains Mono',monospace;font-size:12px;">
        <div style="font-size:11px;color:var(--text3);margin-bottom:6px;">Output</div>
        <pre id="coderunner-output" style="margin:0;white-space:pre-wrap;word-break:break-all;color:var(--text);"></pre>
      </div>
    </div>
  </div>

  <!-- Page: Activity -->
  <div id="page-lens" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Activity</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Audit log of all agent events — filterable with cost tracking</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <select id="lens-filter" class="inp" style="width:140px;" onchange="loadLens()">
          <option value="">All events</option>
          <option value="llm_call">LLM calls</option>
          <option value="tool_call">Tool calls</option>
          <option value="policy_check">Policy checks</option>
          <option value="memory_write">Memory writes</option>
          <option value="session_start">Sessions</option>
          <option value="error">Errors</option>
        </select>
        <select id="lens-level" class="inp" style="width:130px;" onchange="loadLens()">
          <option value="">All levels</option>
          <option value="error">Errors only</option>
          <option value="warning">Warnings+</option>
        </select>
        <select id="lens-lines" class="inp" style="width:100px;" onchange="loadLens()">
          <option value="50">50 lines</option>
          <option value="100" selected>100 lines</option>
          <option value="200">200 lines</option>
          <option value="500">500 lines</option>
        </select>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer;">
          <input type="checkbox" id="lens-autorefresh" onchange="toggleLensAutoRefresh()" style="accent-color:var(--accent);"> Auto
        </label>
        <button class="btn btn-ghost" onclick="loadLens()">↻ Refresh</button>
      </div>
    </div>
    <div id="lens-log" style="flex:1;overflow-y:auto;padding:16px 24px;"></div>
  </div>

  <!-- Page: Memory -->
  <div id="page-memory" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:12px 24px 0;border-bottom:1px solid var(--border);display:flex;gap:0;">
      <div style="display:flex;gap:2px;">
        <button class="mem-tab active" onclick="switchMemoryTab('search')" id="memtab-search">Search</button>
        <button class="mem-tab" onclick="switchMemoryTab('graph')" id="memtab-graph">Graph</button>
        <button class="mem-tab" onclick="switchMemoryTab('reflections')" id="memtab-reflections">Reflections</button>
        <button class="mem-tab" onclick="switchMemoryTab('health')" id="memtab-health">Health</button>
        <button class="mem-tab" onclick="switchMemoryTab('persistent')" id="memtab-persistent">Persistent</button>
      </div>
    </div>

    <!-- Search Tab -->
    <div id="mem-pane-search" style="display:flex;flex:1;overflow:hidden;flex-direction:column;">
      <div style="padding:14px 24px;border-bottom:1px solid var(--border);">
        <div id="mem-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px;"></div>
        <div style="display:flex;gap:8px;">
          <input id="mem-query" class="inp" placeholder="Search memory… (keyword + vector)" style="flex:1;" />
          <button class="btn btn-primary" onclick="searchMemory()">Search</button>
        </div>
      </div>
      <div id="mem-results" style="flex:1;overflow-y:auto;padding:12px 24px;display:flex;flex-direction:column;gap:8px;"></div>
    </div>

    <!-- Graph Tab -->
    <div id="mem-pane-graph" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
      <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;gap:8px;">
        <input id="graph-query" class="inp" placeholder="Search entity by name…" style="flex:1;" onkeydown="if(event.key==='Enter')searchGraphEntities()" />
        <button class="btn btn-primary" onclick="searchGraphEntities()">Search</button>
      </div>
      <div style="padding:12px 24px;display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text3);">
        <span id="graph-breadcrumb"></span>
      </div>
      <div id="graph-results" style="flex:1;overflow-y:auto;padding:0 24px 16px;display:flex;flex-direction:column;gap:6px;"></div>
    </div>

    <!-- Reflections Tab -->
    <div id="mem-pane-reflections" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
      <div style="padding:14px 24px;border-bottom:1px solid var(--border);">
        <p style="font-size:12px;color:var(--text3);">Meta-patterns observed across sessions. Higher confidence = more reliable.</p>
      </div>
      <div id="reflections-list" style="flex:1;overflow-y:auto;padding:12px 24px;display:flex;flex-direction:column;gap:6px;"></div>
    </div>

    <!-- Health Tab -->
    <div id="mem-pane-health" style="display:none;flex:1;overflow:auto;padding:16px 24px;">
      <div id="health-content"></div>
    </div>

    <!-- Persistent Memory Tab (MEMORY.md) -->
    <div id="mem-pane-persistent" style="display:none;flex:1;overflow-y:auto;padding:20px 24px;">
      <div style="max-width:700px;display:flex;flex-direction:column;gap:14px;">
        <div style="display:flex;gap:8px;">
          <input class="inp" id="memory-note" placeholder="Append a note to MEMORY.md…" style="flex:1;" />
          <button class="btn btn-ghost" onclick="appendMemoryNote()">+ Add Note</button>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">MEMORY.md</label>
          <textarea id="soul-raw-memory-text" style="width:100%;min-height:460px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:14px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.7;resize:vertical;outline:none;box-sizing:border-box;"></textarea>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveMemoryMd()">Save MEMORY.md</button>
          <span id="mem-persist-status" style="font-size:11px;color:var(--text3);align-self:center;"></span>
        </div>
        <p style="font-size:11px;color:var(--text3);">Injected into every session prompt. The agent writes here automatically via the <code style="background:var(--bg3);padding:1px 4px;border-radius:3px;">memory_note</code> tool.</p>
      </div>
    </div>
  </div>

  <!-- Page: Nodes -->
  <div id="page-nodes" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Cortex Nodes</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Registered remote nodes — status, tier, heartbeats, and directive metrics</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn btn-ghost" onclick="loadNodes()">↻ Refresh</button>
        <span id="nodes-auto-refresh" style="font-size:11px;color:var(--text3);">Auto: 10s</span>
      </div>
    </div>
    <!-- Summary cards -->
    <div style="padding:12px 24px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
      <div class="stat"><div class="stat-num" id="nodes-total">—</div><div class="stat-label">Total Nodes</div></div>
      <div class="stat"><div class="stat-num" style="color:#22c55e;" id="nodes-connected">—</div><div class="stat-label">Connected</div></div>
      <div class="stat"><div class="stat-num" style="color:#fbbf24;" id="nodes-disconnected">—</div><div class="stat-label">Disconnected</div></div>
      <div class="stat"><div class="stat-num" style="color:#818cf8;" id="nodes-groups">—</div><div class="stat-label">Groups</div></div>
    </div>
    <!-- Filter bar -->
    <div style="padding:10px 24px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;">
      <select id="nodes-filter-tier" class="inp" style="width:120px;font-size:12px;" onchange="loadNodes()">
        <option value="">All tiers</option>
        <option value="root">Root</option>
        <option value="sudo">Sudo</option>
        <option value="unprivileged">Unprivileged</option>
      </select>
      <select id="nodes-filter-status" class="inp" style="width:130px;font-size:12px;" onchange="loadNodes()">
        <option value="">All status</option>
        <option value="connected">Connected</option>
        <option value="disconnected">Disconnected</option>
        <option value="connecting">Connecting</option>
        <option value="error">Error</option>
      </select>
      <select id="nodes-filter-group" class="inp" style="width:140px;font-size:12px;" onchange="loadNodes()">
        <option value="">All groups</option>
      </select>
    </div>
    <!-- Node list -->
    <div id="nodes-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:10px;">
      <div style="text-align:center;color:var(--text3);padding:60px 20px;">Loading nodes…</div>
    </div>
  </div>

  <!-- Page: Jobs -->
  <div id="page-jobs" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Scheduled Jobs</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Cron, interval, and one-shot jobs</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="showCronModal()">+ New Job</button>
        <button class="btn btn-ghost" onclick="loadJobs()">↻ Refresh</button>
      </div>
    </div>
    <div id="jobs-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:8px;"></div>
  </div>

  <!-- Page: Projects -->
  <div id="page-projects" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Projects</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Workspace projects — organize work by context and agent</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="openProjectForm()">+ New Project</button>
        <button class="btn btn-ghost" onclick="loadProjects()">↻ Refresh</button>
      </div>
    </div>
    <!-- Stats bar -->
    <div style="padding:10px 24px;border-bottom:1px solid var(--border);display:flex;gap:16px;align-items:center;font-size:12px;color:var(--text3);">
      <span>Total: <strong id="projects-total">—</strong></span>
    </div>
    <!-- New project form -->
    <div id="project-form-panel" style="display:none;padding:16px 24px;border-bottom:1px solid var(--border);background:var(--bg2);">
      <div style="font-size:13px;font-weight:600;margin-bottom:12px;">New Project</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;">
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="font-size:11px;color:var(--text3);">Name *</label>
          <input id="proj-name" class="inp" style="width:180px;" placeholder="my-project" />
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="font-size:11px;color:var(--text3);">Description</label>
          <input id="proj-desc" class="inp" style="width:220px;" placeholder="Optional description" />
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="font-size:11px;color:var(--text3);">Agent ID</label>
          <input id="proj-agent" class="inp" style="width:140px;" placeholder="default" />
        </div>
        <button class="btn btn-primary" onclick="saveProject()" style="height:34px;">Create</button>
        <button class="btn btn-ghost" onclick="closeProjectForm()" style="height:34px;">Cancel</button>
      </div>
      <div id="project-form-error" style="color:#f87171;font-size:12px;margin-top:8px;display:none;"></div>
    </div>
    <!-- Project list -->
    <div id="projects-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:10px;">
      <div style="text-align:center;color:var(--text3);padding:60px 20px;">Loading projects…</div>
    </div>
  </div>

  <!-- Page: Automation -->
  <div id="page-automation" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Automation</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Pipeline hooks, webhook/file/git triggers — in-memory, session lifetime</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span id="hooks-count-badge" style="font-size:11px;background:var(--bg3);border:1px solid var(--border);padding:2px 8px;border-radius:10px;color:var(--text2);">— hooks</span>
        <button class="btn btn-ghost" id="auto-add-trigger-btn" onclick="openTriggerForm()">+ Add Trigger</button>
        <button class="btn btn-ghost" onclick="autoRefresh()">↻ Refresh</button>
      </div>
    </div>
    <!-- Tab bar -->
    <div style="padding:8px 24px;border-bottom:1px solid var(--border);display:flex;gap:2px;flex-shrink:0;">
      <button class="mem-tab active" onclick="autoShowTab('hooks')" id="auto-tab-hooks">Hooks</button>
      <button class="mem-tab" onclick="autoShowTab('triggers')" id="auto-tab-triggers">Triggers</button>
    </div>
    <!-- Tab: Hooks -->
    <div id="auto-pane-hooks" style="flex:1;overflow-y:auto;padding:16px 24px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--border);color:var(--text3);font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">
            <th style="text-align:left;padding:6px 10px;">Name</th>
            <th style="text-align:left;padding:6px 10px;">Stages</th>
            <th style="text-align:left;padding:6px 10px;">Priority</th>
            <th style="text-align:left;padding:6px 10px;">Async</th>
            <th style="text-align:left;padding:6px 10px;">Source</th>
            <th style="text-align:left;padding:6px 10px;">Plugin</th>
            <th style="text-align:left;padding:6px 10px;">Actions</th>
          </tr>
        </thead>
        <tbody id="hooks-tbody">
          <tr><td colspan="7" style="text-align:center;color:var(--text3);padding:40px;">Loading hooks…</td></tr>
        </tbody>
      </table>
    </div>
    <!-- Tab: Triggers -->
    <div id="auto-pane-triggers" style="flex:1;overflow:hidden;display:none;flex-direction:column;">
      <div style="padding:8px 24px;background:rgba(251,191,36,0.08);border-bottom:1px solid rgba(251,191,36,0.25);display:flex;align-items:center;gap:8px;font-size:12px;color:#fbbf24;flex-shrink:0;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Triggers are stored in memory only — they will be lost on server restart.
      </div>
      <div style="padding:12px 24px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;border-bottom:1px solid var(--border);flex-shrink:0;">
        <div class="stat"><div class="stat-num" id="triggers-total">—</div><div class="stat-label">Total</div></div>
        <div class="stat"><div class="stat-num" style="color:#22c55e;" id="triggers-enabled">—</div><div class="stat-label">Enabled</div></div>
        <div class="stat"><div class="stat-num" style="color:#818cf8;" id="triggers-webhooks">—</div><div class="stat-label">Webhooks</div></div>
        <div class="stat"><div class="stat-num" style="color:#38bdf8;" id="triggers-watchers">—</div><div class="stat-label">Watchers</div></div>
      </div>
      <div id="trigger-form-panel" style="display:none;padding:16px 24px;border-bottom:1px solid var(--border);background:var(--bg2);flex-shrink:0;">
        <div style="font-size:13px;font-weight:600;margin-bottom:12px;">Add Trigger</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:720px;">
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:11px;color:var(--text3);">Name *</label>
            <input id="trig-name" class="inp" placeholder="my-trigger" />
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:11px;color:var(--text3);">Source *</label>
            <select id="trig-source" class="inp" onchange="triggerFormSourceChanged()">
              <option value="webhook">Webhook</option>
              <option value="watcher">File Watcher</option>
              <option value="git_hook">Git Hook</option>
            </select>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:11px;color:var(--text3);">Agent ID</label>
            <input id="trig-agent" class="inp" placeholder="default" />
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:11px;color:var(--text3);">Prompt Template</label>
            <input id="trig-prompt" class="inp" placeholder="Process event: {{event}}" />
          </div>
          <div id="trig-webhook-fields" style="display:contents;">
            <div style="display:flex;flex-direction:column;gap:4px;">
              <label style="font-size:11px;color:var(--text3);">Provider</label>
              <select id="trig-webhook-provider" class="inp">
                <option value="generic">Generic</option>
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
              </select>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <label style="font-size:11px;color:var(--text3);">Secret Env Var</label>
              <input id="trig-webhook-secret-env" class="inp" placeholder="WEBHOOK_SECRET" />
            </div>
          </div>
          <div id="trig-watcher-fields" style="display:none;grid-column:1/-1;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div style="display:flex;flex-direction:column;gap:4px;">
                <label style="font-size:11px;color:var(--text3);">Paths (comma-separated)</label>
                <input id="trig-watcher-paths" class="inp" placeholder="/home/user/project,/tmp/watch" />
              </div>
              <div style="display:flex;flex-direction:column;gap:4px;">
                <label style="font-size:11px;color:var(--text3);">Debounce (ms)</label>
                <input id="trig-watcher-debounce" class="inp" type="number" value="500" />
              </div>
            </div>
          </div>
          <div id="trig-githook-fields" style="display:none;">
            <div style="display:flex;flex-direction:column;gap:4px;">
              <label style="font-size:11px;color:var(--text3);">Repo Path</label>
              <input id="trig-githook-repo" class="inp" placeholder="/path/to/repo" />
            </div>
          </div>
          <div style="grid-column:1/-1;display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="trig-enabled" checked style="width:14px;height:14px;" />
            <label for="trig-enabled" style="font-size:12px;">Enable immediately</label>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="btn btn-primary" onclick="saveTrigger()">Add Trigger</button>
          <button class="btn btn-ghost" onclick="closeTriggerForm()">Cancel</button>
        </div>
        <div id="trigger-form-error" style="color:#f87171;font-size:12px;margin-top:8px;display:none;"></div>
      </div>
      <div id="triggers-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:8px;"></div>
    </div>
  </div>

  <!-- Page: Channels -->
  <div id="page-channels" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Channels</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Communication channel adapters — registered via plugins</p>
      </div>
      <button class="btn btn-ghost" onclick="loadChannels()">↻ Refresh</button>
    </div>
    <!-- Info banner -->
    <div style="padding:8px 24px;background:rgba(251,191,36,0.08);border-bottom:1px solid rgba(251,191,36,0.25);display:flex;align-items:center;gap:8px;font-size:12px;color:#fbbf24;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      Channels are registered via plugins. Install a channel plugin to add new channels. The list below reflects what is currently registered in memory.
    </div>
    <!-- Summary cards -->
    <div style="padding:12px 24px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;border-bottom:1px solid var(--border);">
      <div class="stat"><div class="stat-num" id="channels-total">—</div><div class="stat-label">Total</div></div>
      <div class="stat"><div class="stat-num" style="color:#22c55e;" id="channels-active">—</div><div class="stat-label">Active</div></div>
      <div class="stat"><div class="stat-num" style="color:#fbbf24;" id="channels-inactive">—</div><div class="stat-label">Inactive</div></div>
    </div>
    <!-- Channel list -->
    <div id="channels-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:8px;"></div>
  </div>

  <!-- Page: Skills -->
  <div id="page-skills" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div>
          <h1 style="font-size:15px;font-weight:600;">Skills</h1>
          <p style="font-size:12px;color:var(--text3);margin-top:2px;">Skills are codified expertise — reusable patterns that bridge reasoning and action. Human-authored skills provide domain knowledge; learned skills capture emerging patterns from agent experience.</p>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-ghost" onclick="loadHumanSkills()" style="font-size:11px;">📥 Load .cortex/skills</button>
          <button class="btn btn-ghost" onclick="openSkillDesigner()" style="font-size:11px;">+ New Skill</button>
        </div>
      </div>
      <!-- Stats bar -->
      <div id="skills-stats" style="display:flex;gap:16px;margin-top:10px;font-size:11px;color:var(--text3);"></div>
      <!-- Toolbar: search, view toggle, sort, filter tabs -->
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <input class="skill-search" id="skill-search" type="text" placeholder="🔍 Search skills..." oninput="skillSearch(this.value)" />
          <select class="skill-sort" id="skill-sort" onchange="skillSort()">
            <option value="name">Sort: Name</option>
            <option value="rate">Sort: Success rate</option>
            <option value="uses">Sort: Usage</option>
            <option value="date">Sort: Date</option>
          </select>
          <!-- Filter tabs -->
          <div id="skills-tabs" style="display:flex;gap:4px;">
            <button class="skill-tab active" onclick="setSkillFilter('all')" data-filter="all">All</button>
            <button class="skill-tab" onclick="setSkillFilter('human')" data-filter="human">✍️ Human</button>
            <button class="skill-tab" onclick="setSkillFilter('llm')" data-filter="llm">🧠 Learned</button>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <!-- Bulk actions -->
          <div id="skill-bulk-bar" class="skill-bulk-bar">
            <span id="skill-bulk-count" style="color:var(--accent2);"></span>
            <button class="btn btn-ghost" onclick="skillBulkDelete()" style="font-size:10px;padding:3px 8px;color:#f87171;">🗑 Delete</button>
            <button class="btn btn-ghost" onclick="skillSelectNone()" style="font-size:10px;padding:3px 8px;">✕ Clear</button>
          </div>
          <!-- View toggle -->
          <button class="skill-view-btn active" onclick="setSkillView('card')" id="view-btn-card" title="Card view">▦</button>
          <button class="skill-view-btn" onclick="setSkillView('list')" id="view-btn-list" title="List view">≡</button>
        </div>
      </div>
    </div>
    <div id="skills-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:8px;"></div>
  </div>

  <!-- Page: Policies -->
  <div id="page-policies" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);">
      <h1 style="font-size:15px;font-weight:600;">Security Policies</h1>
      <p style="font-size:12px;color:var(--text3);margin-top:2px;">Cortex Policy Language rules — allow/deny by kind and pattern</p>
    </div>
    <div id="policies-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:6px;"></div>
  </div>

  <!-- Page: Status -->
  <div id="page-status" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:var(--bg2);">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:32px;height:32px;background:linear-gradient(135deg,#06b6d4,#0891b2);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:16px;">⬡</div>
        <div>
          <h1 style="font-size:14px;font-weight:600;letter-spacing:-0.2px;">CORTEX OPERATOR CONSOLE</h1>
           <p id="status-version" style="font-size:11px;color:var(--text3);margin-top:1px;font-family:'JetBrains Mono',monospace;">loading…</p>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span id="status-timestamp" style="font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;"></span>
        <button class="btn btn-ghost" onclick="loadStatus()" style="padding:4px 10px;font-size:11px;">↻ REFRESH</button>
      </div>
    </div>
    <div id="status-content" style="flex:1;overflow-y:auto;padding:20px 24px;background:var(--bg);"><p style="color:var(--text3);font-size:13px;">Loading…</p></div>
  </div>

  <!-- Page: Analytics -->
  <div id="page-analytics" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Analytics</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Token usage, cost, and session statistics</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <select id="analytics-days" class="inp" style="width:120px;" onchange="loadAnalytics()">
          <option value="7">7 days</option>
          <option value="30" selected>30 days</option>
          <option value="90">90 days</option>
        </select>
        <button class="btn btn-ghost" onclick="loadAnalytics()">↻ Refresh</button>
      </div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:20px 24px;">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
        <div class="stat"><div class="stat-num" id="an-sessions">—</div><div class="stat-label">Sessions</div></div>
        <div class="stat"><div class="stat-num" style="color:#818cf8;" id="an-tokens-in">—</div><div class="stat-label">Tokens In</div></div>
        <div class="stat"><div class="stat-num" style="color:#34d399;" id="an-tokens-out">—</div><div class="stat-label">Tokens Out</div></div>
        <div class="stat"><div class="stat-num" style="color:#4ade80;" id="an-cost">—</div><div class="stat-label">Est. Cost</div></div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:14px;">Daily Token Usage</div>
        <div style="height:220px;"><canvas id="tokens-chart"></canvas></div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:14px;">Per-Model Breakdown</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="border-bottom:1px solid var(--border);">
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Model</th>
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Calls</th>
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Tokens In</th>
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Tokens Out</th>
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Cost</th>
          </tr></thead>
          <tbody id="model-table-body"></tbody>
        </table>
      </div>
      <div class="card">
        <div style="font-size:13px;font-weight:600;margin-bottom:14px;">Per-Agent Breakdown</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="border-bottom:1px solid var(--border);">
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Agent</th>
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Sessions</th>
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">LLM Calls</th>
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Tokens In</th>
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Tokens Out</th>
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Cost</th>
          </tr></thead>
          <tbody id="agent-table-body"></tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Page: Dashboard -->
  <div id="page-dashboard" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:12px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-shrink:0;">
      <h1 style="font-size:15px;font-weight:600;">Dashboard</h1>
      <span style="font-size:12px;color:var(--text3);">Customizable widget overview</span>
      <div style="flex:1;"></div>
      <button class="btn btn-ghost" onclick="loadDashboard()" style="font-size:11px;padding:5px 10px;">Refresh</button>
      <button class="btn" id="dashboard-edit-btn" onclick="toggleEdit()" style="font-size:11px;padding:5px 10px;background:rgba(99,102,241,0.12);color:var(--accent2);">Edit</button>
    </div>
    <div id="dashboard-content" style="flex:1;overflow-y:auto;">
      <div class="widget-empty-state">
        <p>Loading dashboard...</p>
      </div>
    </div>
  </div>

  <!-- Page: Sessions -->
  <div id="page-sessions" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <!-- List view -->
    <div id="sessions-list-view" style="display:flex;flex:1;overflow:hidden;flex-direction:column;">
      <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">
        <div style="flex:1;">
          <h1 style="font-size:15px;font-weight:600;">Sessions</h1>
          <p style="font-size:12px;color:var(--text3);margin-top:2px;">Browse, search, export, and delete sessions</p>
        </div>
        <select id="sess-agent-filter" class="inp" style="width:140px;font-size:12px;" onchange="loadSessionsList()">
          <option value="">All agents</option>
        </select>
        <input id="sess-search" class="inp" placeholder="Search sessions…" style="width:220px;" oninput="searchSessions()" />
        <button class="btn btn-ghost" onclick="loadSessionsList()">↻ Refresh</button>
      </div>
      <div id="sessions-table" style="flex:1;overflow-y:auto;padding:16px 24px;"></div>
    </div>
    <!-- Detail view -->
    <div id="sessions-detail-view" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
      <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-ghost" onclick="backToSessions()" style="padding:5px 10px;">← Back</button>
        <nav id="session-breadcrumb" style="font-size:11px;color:var(--text3);display:flex;align-items:center;gap:4px;" aria-label="Breadcrumb">
          <span style="color:var(--text2);">Sessions</span>
          <span>/</span>
          <span id="session-breadcrumb-id" style="color:var(--accent2);font-family:'JetBrains Mono',monospace;"></span>
        </nav>
        <span id="session-detail-title" style="font-size:12px;font-family:'JetBrains Mono',monospace;color:var(--accent2);"></span>
        <span id="session-detail-meta" style="font-size:11px;color:var(--text3);display:flex;align-items:center;gap:8px;"></span>
        <span id="session-detail-children" style="font-size:11px;display:flex;align-items:center;gap:6px;"></span>
        <button class="btn" style="margin-left:auto;font-size:12px;background:rgba(99,102,241,0.15);color:var(--accent2);" onclick="continueSession(document.getElementById('session-detail-title').textContent)">▶ Continue</button>
        <button class="btn btn-ghost" style="font-size:12px;" onclick="exportSession(document.getElementById('session-detail-title').textContent)">⬇ Export JSON</button>
      </div>
      <div id="session-detail-log" style="flex:1;overflow-y:auto;padding:20px 28px;display:flex;flex-direction:column;gap:10px;"></div>
    </div>
  </div>

  <!-- Page: Settings -->
  <div id="page-settings" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Settings</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Configure providers, API keys, agent behaviour, and model router</p>
      </div>
    </div>
    <div id="settings-content" style="flex:1;overflow-y:auto;padding:20px 24px;"><p style="color:var(--text3);font-size:13px;">Loading…</p></div>
  </div>

  <!-- Page: Agents -->
  <div id="page-agents" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Agent Manager</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Manage agent identities, select active agent, define behaviours</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="showNewAgentForm()" data-tip="Create new agent">+ New Agent</button>
        <button class="btn btn-ghost" onclick="loadAgents()">↻ Refresh</button>
      </div>
    </div>
    <div id="agents-content" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <p style="color:var(--text3);font-size:13px;">Loading agents…</p>
      </div>
    </div>
  </div>

  <!-- Page: Services -->
  <div id="page-services" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Micro-Services</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Long-running agent processes with health monitoring</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="loadServices()">↻ Refresh</button>
      </div>
    </div>
    <div id="services-content" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:10px;">
      <p style="color:var(--text3);font-size:13px;">Loading services…</p>
    </div>
  </div>

  <!-- Plugin install modal (shared) -->
  <div id="new-agent-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;">
    <div class="card" style="width:540px;max-height:90vh;overflow-y:auto;">
      <div style="font-size:14px;font-weight:600;margin-bottom:14px;" id="agent-modal-title">Create Agent</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Name *</label><input class="inp" id="ag-name" placeholder="My Agent" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Description</label><input class="inp" id="ag-desc" placeholder="What this agent does" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Provider (optional override)</label>
          <select class="inp" id="ag-provider" onchange="onAgentProviderChange()"><option value="">Default (use global)</option></select>
        </div>
        <div id="ag-model-wrap">
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Model (optional override) <span id="ag-model-status" style="color:var(--text3);font-weight:400;"></span></label>
          <select class="inp" id="ag-model" style="display:none;"><option value="">Default for provider</option></select>
          <input class="inp" id="ag-model-text" placeholder="e.g. gpt-4o-mini" />
        </div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Temperature (0–2)</label><input class="inp" id="ag-temp" type="number" step="0.1" min="0" max="2" placeholder="Default" style="width:100px;" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">System Prompt (appended to soul)</label><textarea class="inp" id="ag-sysprompt" placeholder="Additional instructions…" style="resize:vertical;min-height:60px;font-size:12px;"></textarea></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Tool Allow-list (comma-separated, empty=all)</label><input class="inp" id="ag-tools" placeholder="file_read, web_search, code_exec" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Tags (comma-separated)</label><input class="inp" id="ag-tags" placeholder="coding, research" /></div>
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:5px;">Agent Behaviour / Soul</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:7px;">
            <button type="button" class="ag-tmpl-btn" data-val="developer" onclick="agSoulTemplate(this)" style="padding:3px 10px;border-radius:14px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:10px;">👨‍💻 Developer</button>
            <button type="button" class="ag-tmpl-btn" data-val="professional" onclick="agSoulTemplate(this)" style="padding:3px 10px;border-radius:14px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:10px;">💼 Professional</button>
            <button type="button" class="ag-tmpl-btn" data-val="friendly" onclick="agSoulTemplate(this)" style="padding:3px 10px;border-radius:14px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:10px;">😊 Friendly</button>
            <button type="button" class="ag-tmpl-btn" data-val="analyst" onclick="agSoulTemplate(this)" style="padding:3px 10px;border-radius:14px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:10px;">📊 Analyst</button>
            <button type="button" class="ag-tmpl-btn" data-val="minimalist" onclick="agSoulTemplate(this)" style="padding:3px 10px;border-radius:14px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:10px;">◻ Minimalist</button>
            <button type="button" class="ag-tmpl-btn" data-val="creative" onclick="agSoulTemplate(this)" style="padding:3px 10px;border-radius:14px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:10px;">🎨 Creative</button>
            <button type="button" onclick="document.getElementById('ag-soul').value=''" style="padding:3px 10px;border-radius:14px;border:1px solid var(--border);background:var(--bg3);color:var(--text3);cursor:pointer;font-size:10px;">✕ Clear</button>
          </div>
          <textarea class="inp" id="ag-soul" placeholder="Leave blank to use the default SOUL.md, or paste / pick a template above…" style="resize:vertical;min-height:80px;font-family:'JetBrains Mono',monospace;font-size:12px;"></textarea>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" onclick="submitAgentForm()" id="agent-submit-btn">Create Agent</button>
        <button class="btn btn-ghost" onclick="hideAgentModal()">Cancel</button>
        <span id="ag-status" style="font-size:12px;align-self:center;margin-left:4px;"></span>
      </div>
      <input type="hidden" id="ag-edit-id" value="" />
    </div>
  </div>

  <!-- Page: Extensions -->
  <div id="page-extensions" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Extensions</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Installed plugins and discoverable extensions from the marketplace</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn btn-ghost" onclick="showInstallModal()">+ Install Plugin</button>
        <button class="btn btn-ghost" onclick="extRefresh()">↻ Refresh</button>
      </div>
    </div>
    <!-- Tab bar -->
    <div style="padding:8px 24px;border-bottom:1px solid var(--border);display:flex;gap:2px;flex-shrink:0;">
      <button class="mem-tab active" onclick="extShowTab('installed')" id="ext-tab-installed">Installed</button>
      <button class="mem-tab" onclick="extShowTab('discover')" id="ext-tab-discover">Discover</button>
    </div>
    <!-- Tab: Installed -->
    <div id="ext-pane-installed" style="flex:1;overflow:hidden;display:flex;flex-direction:column;">
      <div id="plugins-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:8px;"></div>
    </div>
    <!-- Tab: Discover -->
    <div id="ext-pane-discover" style="flex:1;overflow:hidden;display:none;flex-direction:column;">
      <div style="padding:12px 24px;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;flex-shrink:0;">
        <input id="mp-search" class="inp" placeholder="Search marketplace…" style="flex:1;" oninput="marketplaceDelayedSearch()" />
        <select id="mp-kind" class="inp" style="width:140px;" onchange="loadMarketplace()">
          <option value="">All kinds</option>
          <option value="esm">ESM</option>
          <option value="mcp">MCP</option>
          <option value="wasm">WASM</option>
        </select>
        <select id="mp-category" class="inp" style="width:160px;" onchange="loadMarketplace()">
          <option value="">All categories</option>
        </select>
      </div>
      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);padding:0 24px;flex-shrink:0;">
        <button id="mp-tab-plugins" class="btn" style="flex:1;border-radius:0;padding:10px;font-size:13px;background:rgba(99,102,241,0.1);color:var(--accent2);border-bottom:2px solid var(--accent);" onclick="switchMarketplaceTab('plugins')">Plugins</button>
        <button id="mp-tab-agents" class="btn" style="flex:1;border-radius:0;padding:10px;font-size:13px;background:transparent;color:var(--text2);border-bottom:2px solid transparent;" onclick="switchMarketplaceTab('agents')">Agents</button>
      </div>
      <div id="mp-content" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:10px;"></div>
    </div>
    <!-- Install modal -->
    <div id="plugin-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;">
      <div class="card" style="width:480px;">
        <div style="font-size:14px;font-weight:600;margin-bottom:14px;">Install Plugin</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Name *</label><input class="inp" id="pm-name" placeholder="my-plugin" /></div>
          <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Version</label><input class="inp" id="pm-version" value="1.0.0" /></div>
          <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Kind</label><select class="inp" id="pm-kind"><option value="esm">ESM</option><option value="mcp">MCP</option><option value="wasm">WASM</option></select></div>
          <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Entry Point / URL *</label><input class="inp" id="pm-entry" placeholder="https://… or file:///…" /></div>
          <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Description</label><input class="inp" id="pm-desc" /></div>
          <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Author</label><input class="inp" id="pm-author" /></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:16px;">
          <button class="btn btn-primary" onclick="submitInstallPlugin()">Install</button>
          <button class="btn btn-ghost" onclick="hideInstallModal()">Cancel</button>
          <span id="pm-status" style="font-size:12px;align-self:center;margin-left:4px;"></span>
        </div>
      </div>
    </div>
  </div>

  <!-- Page: Plugin Panels -->
  <div id="page-pluginpanels" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div><h1 style="font-size:15px;font-weight:600;">Plugin Panels</h1><p style="font-size:12px;color:var(--text3);margin-top:2px;">Active plugin UI panels</p></div>
    </div>
    <div id="plugin-panels-tabs" style="display:flex;gap:0;border-bottom:1px solid var(--border);padding:0 24px;"></div>
    <div id="plugin-panels-content" style="flex:1;overflow:hidden;"></div>
  </div>

  <!-- Page: Soul / Profile -->
  <div id="page-soul" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:16px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">User Profile</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Tells the assistant who you are — injected into every session prompt via USER.md</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn btn-ghost" id="soul-raw-toggle" onclick="soulToggleRaw()" style="font-size:11px;">⌨ Raw</button>
        <button class="btn btn-primary" onclick="soulSaveActive()" id="soul-save-btn">Save</button>
      </div>
    </div>

    <!-- ── Profile tab (USER.md) ── -->
    <div id="soul-pane-profile" style="flex:1;overflow-y:auto;padding:24px;">
      <div id="soul-profile-form" style="max-width:680px;display:flex;flex-direction:column;gap:18px;">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">YOUR NAME</label>
            <input class="inp" id="prof-name" placeholder="e.g. Alice" style="width:100%;" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">ROLE / PROFESSION</label>
            <input class="inp" id="prof-role" placeholder="e.g. Full-stack developer" style="width:100%;" />
          </div>
        </div>

        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">GOALS & OBJECTIVES</label>
          <textarea class="inp" id="prof-goals" placeholder="What are you working toward?" style="width:100%;min-height:70px;resize:vertical;font-size:12px;"></textarea>
        </div>

        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">CURRENT PROJECTS</label>
          <textarea class="inp" id="prof-projects" placeholder="Active projects you want help with" style="width:100%;min-height:60px;resize:vertical;font-size:12px;"></textarea>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">OPERATING SYSTEM</label>
            <input class="inp" id="prof-os" placeholder="e.g. macOS 14, Ubuntu 22" style="width:100%;" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">EDITOR / IDE</label>
            <input class="inp" id="prof-editor" placeholder="e.g. VS Code, Neovim" style="width:100%;" />
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">LANGUAGES</label>
            <input class="inp" id="prof-langs" placeholder="e.g. TypeScript, Python, Rust" style="width:100%;" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">OTHER TOOLS</label>
            <input class="inp" id="prof-tools" placeholder="e.g. Docker, Postgres, Git" style="width:100%;" />
          </div>
        </div>

        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">COMMUNICATION STYLE</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;" id="prof-style-btns">
            <button class="prof-style-btn" data-val="direct and concise" onclick="soulPickStyle(this)" style="padding:5px 12px;border-radius:20px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:11px;">Direct & Concise</button>
            <button class="prof-style-btn" data-val="detailed and thorough" onclick="soulPickStyle(this)" style="padding:5px 12px;border-radius:20px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:11px;">Detailed & Thorough</button>
            <button class="prof-style-btn" data-val="casual and friendly" onclick="soulPickStyle(this)" style="padding:5px 12px;border-radius:20px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:11px;">Casual & Friendly</button>
            <button class="prof-style-btn" data-val="technical and precise" onclick="soulPickStyle(this)" style="padding:5px 12px;border-radius:20px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:11px;">Technical & Precise</button>
          </div>
          <input class="inp" id="prof-style" placeholder="or describe your preferred style…" style="width:100%;margin-top:8px;" />
        </div>

        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">WORKING CONTEXT</label>
          <textarea class="inp" id="prof-context" placeholder="Describe your project, environment, or ongoing work" style="width:100%;min-height:80px;resize:vertical;font-size:12px;"></textarea>
        </div>

        <div style="display:flex;gap:8px;padding:14px;background:var(--bg2);border-radius:8px;border:1px solid var(--border);align-items:flex-start;">
          <span style="font-size:18px;">✨</span>
          <div style="flex:1;">
            <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:4px;">Ask the assistant to fill this in</div>
            <div style="font-size:11px;color:var(--text3);margin-bottom:8px;">Start a chat and say: <em>"Please fill out my user profile based on what you know about me"</em></div>
            <button class="btn btn-ghost" onclick="soulAskLlm('profile')" style="font-size:11px;">Open Chat with Prompt</button>
          </div>
        </div>

        <!-- Raw fallback for profile -->
        <div id="soul-raw-profile" style="display:none;">
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">RAW USER.md</label>
          <textarea id="soul-raw-profile-text" style="width:100%;min-height:300px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:14px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.7;resize:vertical;outline:none;box-sizing:border-box;"></textarea>
        </div>
      </div>
    </div>

  </div>

  <!-- Page: Quartermaster (unified — Tool Orchestration + Model Intelligence) -->
  <div id="page-quartermaster" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Quartermaster</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Adaptive orchestration — tool pattern learning &amp; intelligent model routing</p>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <span id="qm-auto-refresh-label" style="font-size:10px;color:var(--text3);display:none;">Auto-refresh: 5s</span>
        <button class="btn btn-ghost" onclick="loadQuartermaster()" style="font-size:11px;">↻ Refresh</button>
      </div>
    </div>

    <!-- Section selector: Tools | Models -->
    <div style="display:flex;gap:0;border-bottom:1px solid var(--border);padding:0 24px;background:var(--bg2);flex-shrink:0;">
      <button class="qm-section active" id="qmsec-tools" onclick="switchQmSection('tools')"
        style="padding:9px 18px;background:none;border:none;border-bottom:2px solid var(--accent);color:var(--accent);cursor:pointer;font-size:12px;font-weight:600;letter-spacing:0.02em;">
        🔧 Tool Orchestration
      </button>
      <button class="qm-section" id="qmsec-models" onclick="switchQmSection('models')"
        style="padding:9px 18px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text2);cursor:pointer;font-size:12px;font-weight:600;letter-spacing:0.02em;">
        🧠 Model Intelligence
      </button>
      <button onclick="qmOpenSettings()" title="Settings"
        style="margin-left:auto;padding:6px 10px;background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color='var(--text3)'">⚙</button>
    </div>

    <!-- ── Tool Orchestration section ── -->
    <div id="qm-section-tools" style="display:flex;flex:1;flex-direction:column;overflow:hidden;">
      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);padding:0 24px;flex-shrink:0;">
        <button class="qm-tab active" onclick="switchQmTab('overview')" id="qmtab-overview" style="padding:7px 12px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text2);cursor:pointer;font-size:11px;">Overview</button>
        <button class="qm-tab" onclick="switchQmTab('patterns')" id="qmtab-patterns" style="padding:7px 12px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text2);cursor:pointer;font-size:11px;">Patterns</button>
        <button class="qm-tab" onclick="switchQmTab('decisions')" id="qmtab-decisions" style="padding:7px 12px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text2);cursor:pointer;font-size:11px;">Decisions</button>
      </div>
      <div id="qm-pane-overview" style="display:flex;flex:1;overflow-y:auto;padding:18px 24px;flex-direction:column;gap:14px;">
        <div id="qm-summary-cards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div id="qm-accuracy-card" class="card" style="padding:14px;">
            <h3 style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">Prediction Accuracy</h3>
            <div style="height:140px;"><canvas id="qm-accuracy-chart"></canvas></div>
          </div>
          <div id="qm-weights-card" class="card" style="padding:14px;">
            <h3 style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">Signal Weights</h3>
            <div id="qm-weights-content"></div>
          </div>
        </div>
        <div id="qm-tool-stats" class="card" style="padding:14px;">
          <h3 style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">Tool Statistics</h3>
          <div id="qm-tool-stats-content"></div>
        </div>
      </div>
      <div id="qm-pane-patterns" style="display:none;flex:1;overflow-y:auto;padding:18px 24px;flex-direction:column;gap:8px;">
        <div id="qm-patterns-content"></div>
      </div>
      <div id="qm-pane-decisions" style="display:none;flex:1;overflow-y:auto;padding:18px 24px;flex-direction:column;gap:8px;">
        <div id="qm-decisions-content"></div>
      </div>
    </div>

    <!-- ── Model Intelligence section ── -->
    <div id="qm-section-models" style="display:none;flex:1;flex-direction:column;overflow:hidden;">
      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);padding:0 24px;flex-shrink:0;">
        <button class="mqm-tab active" onclick="switchMqmTab('overview')" id="mqmtab-overview" style="padding:7px 12px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text2);cursor:pointer;font-size:11px;">Overview</button>
        <button class="mqm-tab" onclick="switchMqmTab('models')" id="mqmtab-models" style="padding:7px 12px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text2);cursor:pointer;font-size:11px;">Models</button>
        <button class="mqm-tab" onclick="switchMqmTab('accuracy')" id="mqmtab-accuracy" style="padding:7px 12px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text2);cursor:pointer;font-size:11px;">Accuracy</button>
      </div>
      <div id="mqm-pane-overview" style="display:flex;flex:1;overflow-y:auto;padding:18px 24px;flex-direction:column;gap:14px;">
        <div id="mqm-summary-cards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div id="mqm-weights-card" class="card" style="padding:14px;">
            <h3 style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">Signal Weights</h3>
            <div id="mqm-weights-content"></div>
          </div>
          <div id="mqm-topmodels-card" class="card" style="padding:14px;">
            <h3 style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">Top Models</h3>
            <div id="mqm-topmodels-content"></div>
          </div>
        </div>
        <div id="mqm-recent-decisions-card" class="card" style="padding:14px;">
          <h3 style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">Recent Decisions</h3>
          <div id="mqm-decisions-content"></div>
        </div>
      </div>
      <div id="mqm-pane-models" style="display:none;flex:1;overflow-y:auto;padding:18px 24px;flex-direction:column;gap:10px;">
        <div id="mqm-models-filter" style="display:flex;gap:8px;align-items:center;margin-bottom:4px;">
          <span style="font-size:11px;color:var(--text3);">Filter:</span>
          <button class="mqm-cat-btn active" onclick="filterMqmModels('all')" id="mqm-cat-all" style="font-size:10px;padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;">All</button>
          <button class="mqm-cat-btn" onclick="filterMqmModels('code')" id="mqm-cat-code" style="font-size:10px;padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;">Code</button>
          <button class="mqm-cat-btn" onclick="filterMqmModels('analysis')" id="mqm-cat-analysis" style="font-size:10px;padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;">Analysis</button>
          <button class="mqm-cat-btn" onclick="filterMqmModels('creative')" id="mqm-cat-creative" style="font-size:10px;padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;">Creative</button>
          <button class="mqm-cat-btn" onclick="filterMqmModels('factual')" id="mqm-cat-factual" style="font-size:10px;padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;">Factual</button>
        </div>
        <div id="mqm-models-content"></div>
      </div>
      <div id="mqm-pane-accuracy" style="display:none;flex:1;overflow-y:auto;padding:18px 24px;flex-direction:column;gap:14px;">
        <div class="card" style="padding:14px;">
          <h3 style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">Prediction Accuracy (24h)</h3>
          <div style="height:200px;"><canvas id="mqm-accuracy-chart"></canvas></div>
        </div>
        <div class="card" style="padding:14px;">
          <h3 style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">Accuracy by Category</h3>
          <div id="mqm-category-accuracy"></div>
        </div>
      </div>
    </div>

    <!-- ── Settings section (shared, always available via gear) ── -->
    <div id="qm-pane-settings" style="display:none;flex:1;overflow-y:auto;padding:18px 24px;flex-direction:column;gap:14px;">
      <div class="card" style="padding:18px;max-width:560px;">
        <h3 style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:14px;">Model Intelligence Settings</h3>
        <div style="display:flex;flex-direction:column;gap:14px;">
          <label style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <div>
              <div style="font-size:12px;font-weight:500;color:var(--text);">Enable Model Intelligence (MQM)</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px;">Automatically route agent requests to the best-fit LLM based on learned patterns</div>
            </div>
            <input type="checkbox" id="qm-cfg-enabled" style="width:18px;height:18px;cursor:pointer;" onchange="qmCfgDirty()">
          </label>
          <div style="border-top:1px solid var(--border);padding-top:14px;">
            <div style="font-size:12px;font-weight:500;color:var(--text);margin-bottom:8px;">Dedicated Quartermaster LLM</div>
            <div style="font-size:11px;color:var(--text3);margin-bottom:10px;">Pin model routing to a specific provider — ideal for local models (Ollama, LM Studio). Leave blank to use all configured providers.</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div>
                <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Provider</label>
                <select id="qm-cfg-provider" class="inp" style="width:100%;font-size:12px;" onchange="qmCfgDirty();qmFetchModels()">
                  <option value="">— any configured provider —</option>
                </select>
              </div>
              <div>
                <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Model</label>
                <div style="display:flex;gap:6px;">
                  <input type="text" id="qm-cfg-model" class="inp" placeholder="e.g. llama3.2, gpt-4o-mini" list="qm-cfg-model-list" style="flex:1;font-size:12px;" oninput="qmCfgDirty()">
                  <datalist id="qm-cfg-model-list"></datalist>
                  <button class="btn btn-ghost" onclick="qmFetchModels()" style="font-size:11px;padding:4px 8px;white-space:nowrap;" id="qm-fetch-models-btn" title="Fetch available models">↻</button>
                </div>
                <span id="qm-model-fetch-status" style="font-size:10px;color:var(--text3);margin-top:2px;display:block;"></span>
              </div>
            </div>
          </div>
          <div style="border-top:1px solid var(--border);padding-top:14px;">
            <div style="font-size:12px;font-weight:500;color:var(--text);margin-bottom:10px;">Behaviour</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div>
                <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Strategy</label>
                <select id="qm-cfg-mode" class="inp" style="width:100%;font-size:12px;" onchange="qmCfgDirty()">
                  <option value="conservative">Conservative — high confidence required</option>
                  <option value="balanced" selected>Balanced — default</option>
                  <option value="aggressive">Aggressive — prefers switching models</option>
                </select>
              </div>
              <div>
                <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Observe Threshold</label>
                <input type="number" id="qm-cfg-threshold" class="inp" min="10" max="500" step="10" style="width:100%;font-size:12px;" oninput="qmCfgDirty()">
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;padding-top:4px;">
            <button class="btn btn-primary" id="qm-cfg-save" onclick="saveQmConfig()" style="font-size:12px;">Save Settings</button>
            <span id="qm-cfg-status" style="font-size:11px;color:var(--text3);"></span>
          </div>
        </div>
      </div>
      <div class="card" style="padding:18px;max-width:560px;">
        <h3 style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px;">Reset</h3>
        <p style="font-size:12px;color:var(--text3);margin-bottom:12px;">Clear all learned patterns, decisions, tool stats, and signal weights. This cannot be undone.</p>
        <button class="btn" style="font-size:12px;background:var(--bg3);color:#f87171;border-color:#f87171;" onclick="qmResetAll()">Reset All QM Data</button>
      </div>
    </div>
  </div>

  <!-- Cron modal (shared by Jobs page) -->
  <div id="cron-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;">
    <div class="card" style="width:480px;">
      <div style="font-size:14px;font-weight:600;margin-bottom:14px;">New Scheduled Job</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Name *</label><input class="inp" id="cj-name" placeholder="daily-summary" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Kind</label>
          <select class="inp" id="cj-kind" onchange="toggleCronFields()">
            <option value="cron">Cron (schedule expression)</option>
            <option value="interval">Interval</option>
            <option value="once">Once (immediate)</option>
          </select>
        </div>
        <div id="cj-schedule-row"><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Schedule <span style="color:var(--text3);">(e.g. <code style="font-size:11px;">0 9 * * *</code>)</span></label><input class="inp" id="cj-schedule" placeholder="0 9 * * *" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Command *</label><input class="inp" id="cj-command" placeholder="cortex:consolidate:daily" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Max Attempts</label><input class="inp" id="cj-max" type="number" value="3" style="width:80px;" /></div>
      </div>
      <div style="margin-top:8px;font-size:11px;color:var(--text3);">Preset commands: <code style="background:rgba(255,255,255,0.05);padding:1px 4px;border-radius:3px;">cortex:consolidate:hourly</code> · <code style="background:rgba(255,255,255,0.05);padding:1px 4px;border-radius:3px;">cortex:consolidate:daily</code> · <code style="background:rgba(255,255,255,0.05);padding:1px 4px;border-radius:3px;">cortex:consolidate:weekly</code></div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button class="btn btn-primary" onclick="submitCronJob()">Create</button>
        <button class="btn btn-ghost" onclick="hideCronModal()">Cancel</button>
        <span id="cj-status" style="font-size:12px;align-self:center;margin-left:4px;"></span>
      </div>
    </div>
  </div>

  <!-- Modal: Create/Edit Skill -->
  <div id="skill-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;">
    <div class="card" style="width:620px;max-height:90vh;overflow-y:auto;">
      <div style="font-size:14px;font-weight:600;margin-bottom:14px;" id="skill-modal-title">Create Skill</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Name * <span style="color:var(--text3);">(snake_case, unique)</span></label><input class="inp" id="sk-name" placeholder="my-skill" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Description</label><input class="inp" id="sk-desc" placeholder="What this skill does" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Trigger Pattern</label><input class="inp" id="sk-trigger" placeholder="Phrase that triggers this skill (optional)" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Content / Instructions <span style="color:var(--text3);">(Markdown)</span></label><textarea class="inp" id="sk-content" placeholder="Write the skill body in Markdown..." style="resize:vertical;min-height:200px;font-family:'JetBrains Mono',monospace;font-size:12px;"></textarea></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" onclick="submitSkillForm()" id="skill-submit-btn">Create Skill</button>
        <button class="btn btn-ghost" onclick="hideSkillModal()">Cancel</button>
        <span id="sk-status" style="font-size:12px;align-self:center;margin-left:4px;"></span>
      </div>
      <input type="hidden" id="sk-edit-name" value="" />
    </div>
  </div>

</main>
</div>

<div id="toast-container" role="status" aria-live="polite"></div>

<!-- ── Confirm dialog ───────────────────────────── -->
<div id="confirm-overlay" class="confirm-overlay" onclick="closeConfirmDialog(event)">
  <div class="confirm-box" onclick="event.stopPropagation()" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
    <h2 id="confirm-title"></h2>
    <p id="confirm-message"></p>
    <div class="confirm-actions">
      <button class="btn btn-ghost" id="confirm-cancel-btn" onclick="closeConfirmDialog()">Cancel</button>
      <button class="btn btn-danger" id="confirm-ok-btn"></button>
    </div>
  </div>
</div>

<!-- ── Command palette (Ctrl+K) ──────────────────── -->
<div id="cmd-palette" onclick="closeCmdPalette(event)">
  <div class="cmd-modal" onclick="event.stopPropagation()">
    <div class="cmd-input-wrap">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text3);flex-shrink:0;"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
      <input id="cmd-input" type="text" placeholder="Search pages and actions…" oninput="filterCmdPalette(this.value)" autofocus />
      <span style="font-size:10px;color:var(--text3);background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;">ESC</span>
    </div>
    <div class="cmd-hint">Type to filter pages. Press Enter to navigate, Esc to close.</div>
    <div id="cmd-results" class="cmd-results"></div>
  </div>
</div>

  <!-- Skill Designer (full-screen overlay) -->
  <div id="skill-designer" style="display:none;position:fixed;inset:0;background:var(--bg);z-index:120;flex-direction:column;">
    <!-- Toolbar -->
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;border-bottom:1px solid var(--border);background:var(--bg2);min-height:44px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <button class="btn btn-ghost" onclick="closeSkillDesigner()" style="font-size:11px;" title="Back to skills (Esc)">← Back</button>
        <span style="font-size:12px;color:var(--text3);">|</span>
        <span style="font-size:13px;font-weight:600;" id="sd-title">New Skill</span>
        <span style="font-size:10px;color:var(--accent2);display:none;" id="sd-dirty">(unsaved)</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span id="sd-status" style="font-size:11px;color:var(--text3);margin-right:4px;"></span>
        <button class="btn btn-ghost" onclick="skillDesignerExport()" style="font-size:10px;" title="Export to .cortex/skills/<name>/SKILL.md">📤 Export</button>
        <button class="btn btn-primary" onclick="skillDesignerSave()" style="font-size:11px;" id="sd-save-btn">💾 Save</button>
      </div>
    </div>
    <!-- Body: Split pane -->
    <div style="flex:1;display:flex;overflow:hidden;">
      <!-- Left: Editor -->
      <div style="width:55%;display:flex;flex-direction:column;border-right:1px solid var(--border);overflow:hidden;min-width:400px;">
        <!-- Tabs -->
        <div style="display:flex;gap:0;border-bottom:1px solid var(--border);background:var(--bg2);">
          <button class="sd-tab active" onclick="sdSwitchTab('content')" data-sd-tab="content">📝 Content</button>
          <button class="sd-tab" onclick="sdSwitchTab('meta')" data-sd-tab="meta">⚙️ Metadata</button>
          <button class="sd-tab" onclick="sdSwitchTab('steps')" data-sd-tab="steps">🔢 Steps</button>
        </div>
        <!-- Tab: Content -->
        <div id="sd-tab-content" style="flex:1;overflow:hidden;display:flex;flex-direction:column;">
          <div style="padding:6px 12px;font-size:10px;color:var(--text3);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;">
            <span>Markdown instructions</span>
            <span>Ctrl+S to save</span>
          </div>
          <textarea id="sd-editor" class="inp" style="flex:1;resize:none;border:none;border-radius:0;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.6;padding:12px;background:var(--bg);color:var(--text);" placeholder="Write skill instructions in Markdown..."></textarea>
        </div>
        <!-- Tab: Metadata -->
        <div id="sd-tab-meta" style="flex:1;overflow-y:auto;padding:16px;display:none;">
          <div style="display:flex;flex-direction:column;gap:12px;max-width:500px;">
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Name * <span style="color:var(--text3);">(snake_case, unique, no spaces)</span></label>
              <input class="inp" id="sd-name" placeholder="my-skill-name" />
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Description</label>
              <input class="inp" id="sd-desc" placeholder="What this skill does and when to use it" />
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Trigger Pattern</label>
              <input class="inp" id="sd-trigger" placeholder="Phrase that triggers this skill (optional)" />
            </div>
            <div style="font-size:11px;color:var(--text3);border-top:1px solid var(--border);padding-top:12px;margin-top:4px;">
              <b>Frontmatter preview:</b>
              <pre id="sd-frontmatter-preview" style="background:var(--bg2);padding:10px;border-radius:4px;margin-top:6px;font-size:11px;overflow-x:auto;white-space:pre-wrap;"></pre>
            </div>
            <div style="font-size:11px;color:var(--text3);border-top:1px solid var(--border);padding-top:12px;margin-top:4px;">
              <b>Skill metadata (tags, difficulty, examples):</b>
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Difficulty <span style="color:var(--text3);">(beginner, intermediate, advanced)</span></label>
              <input class="inp" id="sd-meta-difficulty" placeholder="intermediate" onchange="sdUpdateMetadataFromUI()" />
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Tags <span style="color:var(--text3);">(comma-separated)</span></label>
              <input class="inp" id="sd-meta-tags" placeholder="design, frontend, ui" onchange="sdUpdateMetadataFromUI()" />
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Examples <span style="color:var(--text3);">(newline-separated)</span></label>
              <textarea class="inp" id="sd-meta-examples" style="font-size:11px;height:80px;resize:none;" placeholder="Example 1
Example 2" onchange="sdUpdateMetadataFromUI()"></textarea>
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Prerequisites <span style="color:var(--text3);">(comma-separated)</span></label>
              <input class="inp" id="sd-meta-prerequisites" placeholder="JavaScript knowledge, API familiarity" onchange="sdUpdateMetadataFromUI()" />
            </div>
            <div style="font-size:11px;color:var(--text3);border-top:1px solid var(--border);padding-top:12px;margin-top:4px;">
              <b>Metadata preview:</b>
              <pre id="sd-meta-preview" style="background:var(--bg2);padding:10px;border-radius:4px;margin-top:6px;font-size:10px;overflow-x:auto;white-space:pre-wrap;">(no metadata set)</pre>
            </div>
          </div>
        </div>
        <!-- Tab: Steps -->
        <div id="sd-tab-steps" style="flex:1;overflow:hidden;display:none;flex-direction:column;">
          <div style="padding:6px 12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:10px;color:var(--text3);">Define ordered steps (drag ⠿ to reorder)</span>
            <button class="btn btn-ghost" onclick="sdAddStep()" style="font-size:10px;padding:2px 8px;">+ Add Step</button>
          </div>
          <div id="sd-steps-list" style="flex:1;overflow-y:auto;padding:8px;"></div>
        </div>
      </div>
      <!-- Right: Preview -->
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:6px 12px;font-size:10px;color:var(--text3);border-bottom:1px solid var(--border);background:var(--bg2);flex-shrink:0;">Live Preview</div>
        <div id="sd-preview" style="flex:1;overflow-y:auto;padding:20px;font-size:13px;line-height:1.7;"></div>
      </div>
    </div>
    <!-- Resize handle -->
    <div id="sd-resize-handle" style="position:absolute;top:45px;bottom:0;left:55%;width:4px;cursor:col-resize;z-index:10;background:transparent;" onmousedown="sdStartResize(event)"></div>
  </div>

<script>
const BASE = window.location.origin;
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';
let ws, sessionId = null, agentBubble = null, agentRaw = '';
let currentPage = 'chat';
let currentReasoningData = '';
let reasoningPanelOpen = false;

// ── Toast notifications ─────────────────────────
function toast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  const icons = { success:'✓', error:'✕', info:'●', warning:'⚠' };
  el.innerHTML = '<span style="flex-shrink:0;font-weight:700;">' + (icons[type] || '●') + '</span><span>' + message + '</span>';
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 250);
  }, duration);
}

// ── Confirm dialog ──────────────────────────
let _confirmResolve = null;

function confirmAction(title, message, actionLabel = 'Delete') {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-ok-btn').textContent = actionLabel;
    document.getElementById('confirm-overlay').classList.add('open');
    document.getElementById('confirm-cancel-btn').focus();
  });
}

function closeConfirmDialog(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('confirm-overlay').classList.remove('open');
  if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
}

document.getElementById('confirm-ok-btn').addEventListener('click', () => {
  document.getElementById('confirm-overlay').classList.remove('open');
  if (_confirmResolve) { _confirmResolve(true); _confirmResolve = null; }
});

// Close confirm on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('confirm-overlay').classList.contains('open')) {
    closeConfirmDialog();
  }
});

// ── Sidebar toggle (responsive) ─────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
function closeMobileSidebar() {
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  }
}

// ── Relative time ───────────────────────────────
function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const sec = Math.floor((now - then) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return sec + 's ago';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  const days = Math.floor(hr / 24);
  if (days < 30) return days + 'd ago';
  return new Date(dateStr).toLocaleDateString();
}

// ── New chat ────────────────────────────────────
function newChat() {
  chatLog.innerHTML = '';
  sessionId = null;
  agentBubble = null;
  agentRaw = '';
  document.getElementById('chat-session-id').textContent = '';
  document.getElementById('thinking-bar').style.display = 'none';
  updateContextBar(0, 200000, 0);
  try { localStorage.removeItem('cortex_session_id'); } catch {}
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'new_session' }));
  }
}

// ── Agent selector ──────────────────────────────
let currentAgentId = null;

async function loadAgentSelector() {
  const sel = document.getElementById('chat-agent-select');
  if (!sel) return;
  try {
    const agents = await fetch(BASE + '/api/agents').then(r => r.json());
    const current = await fetch(BASE + '/api/agents/current').then(r => r.json());
    const activeId = current?.id || 'default';
    currentAgentId = activeId;
    document.getElementById('chat-agent-name').textContent = current?.name || 'Cortex';
    sel.innerHTML = agents.map(a =>
      \`<option value="\${a.id}" \${a.id === activeId ? 'selected' : ''}>\${esc(a.name)}\${a.id === 'default' ? ' (default)' : ''}</option>\`
    ).join('');
    // If more than 1 agent, show the selector; otherwise hide it
    sel.style.display = agents.length > 1 ? 'inline-block' : 'none';
  } catch { /* ignore */ }
}

function switchChatAgent(agentId) {
  if (!agentId) return;
  currentAgentId = agentId;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'select_agent', agentId }));
  }
  const sel = document.getElementById('chat-agent-select');
  const name = sel.options[sel.selectedIndex]?.text || agentId;
  document.getElementById('chat-agent-name').textContent = name;
  loadModelSelector();
}

let currentModel = null;
let currentReasoning = null;

async function loadModelSelector() {
  try {
    const config = await fetch(BASE + '/api/config').then(r => r.json());
    const providerKind = config.defaultProvider || 'anthropic';
    const sel = document.getElementById('chat-model-select');
    const current = sel.value || config.providers[providerKind]?.model || '';

    const ml = document.getElementById('model-label');
    if (ml && (!ml.textContent || ml.textContent === 'loading…')) {
      ml.textContent = (config.providers[providerKind]?.model || providerKind) + ' · ' + providerKind;
    }

    let models = [];
    try {
      const resp = await fetch(BASE + '/api/providers/' + providerKind + '/models');
      if (resp.ok) models = await resp.json();
    } catch { models = []; }

    sel.innerHTML = '<option value="">Default (' + esc(current || 'auto') + ')</option>';
    const seen = new Set();
    for (const m of models) {
      const id = m.id || m;
      if (seen.has(id)) continue;
      seen.add(id);
      const label = m.name ? m.name + ' (' + id + ')' : id;
      sel.innerHTML += '<option value="' + esc(id) + '"' + (id === currentModel ? ' selected' : '') + '>' + esc(label) + '</option>';
    }
    if (!models.length && current) {
      sel.innerHTML += '<option value="' + esc(current) + '" selected>' + esc(current) + '</option>';
    }
    if (currentModel) sel.value = currentModel;
  } catch {}
}

function onModelChange() {
  currentModel = document.getElementById('chat-model-select').value || null;
}

function onReasoningChange() {
  currentReasoning = document.getElementById('chat-reasoning-select').value || null;
}

function updateContextBar(usedTokens, maxContext, percentage, breakdown) {
  const pct = Math.min(percentage || 0, 100);
  const bar = document.getElementById('context-bar-fill');
  const label = document.getElementById('context-label');
  const pctEl = document.getElementById('context-pct');
  if (bar) {
    bar.style.width = pct + '%';
    if (pct > 80) bar.style.background = '#ef4444';
    else if (pct > 60) bar.style.background = '#f59e0b';
    else bar.style.background = 'var(--accent)';
  }
  if (label) label.textContent = fmtNum(usedTokens || 0) + ' / ' + fmtNum(maxContext || 0) + ' tokens';
  if (pctEl) pctEl.textContent = pct + '% used';
  if (breakdown) {
    const container = document.getElementById('context-bar-container');
    if (container) {
      container.setAttribute('data-tip', [
        'System prompt: ' + fmtNum(breakdown.systemPrompt || 0),
        'User messages: ' + fmtNum(breakdown.userMessages || 0),
        'Assistant: ' + fmtNum(breakdown.assistantMessages || 0),
        'Reasoning overhead: ' + fmtNum(breakdown.reasoningOverhead || 0),
        '',
        'Total estimated: ' + fmtNum(usedTokens || 0) + ' / ' + fmtNum(maxContext || 0),
      ].join('\\n'));
    }
  }
}

// ── Markdown ────────────────────────────────────────────────
marked.setOptions({ breaks: true, gfm: true });
function md(text) { return marked.parse(text || ''); }

// ── Session persistence ──────────────────────────────────
function saveSession() {
  try {
    if (sessionId) localStorage.setItem('cortex_session_id', sessionId);
    if (currentAgentId) localStorage.setItem('cortex_agent_id', currentAgentId);
  } catch {}
}

async function restoreSession() {
  try {
    const sid = localStorage.getItem('cortex_session_id');
    const aid = localStorage.getItem('cortex_agent_id');
    if (sid && aid) {
      sessionId = sid;
      currentAgentId = aid;
      document.getElementById('chat-session-id').textContent = sid.slice(-12);
      // Reopen the session server-side
      await fetch(BASE + '/api/sessions/' + encodeURIComponent(sid) + '/resume', { method: 'POST' });
      const res = await fetch(BASE + '/api/sessions/' + encodeURIComponent(sid) + '/messages');
      if (!res.ok) return;
      const msgs = await res.json();
      let lastRole = '';
      for (const m of msgs) {
        if (m.role === 'user') {
          appendBubble('user', m.content);
          lastRole = 'user';
        } else if (m.role === 'assistant') {
          const isToolCall = /^\s*\{[^}]*"tool"\s*:\s*"/.test(m.content);
          if (isToolCall) {
            const label = (m.content.match(/"tool"\s*:\s*"([^"]+)"/) || [])[1] || 'tool';
            appendBubble('tool', '\u2699 ' + label);
          } else {
            const b = appendBubble('agent', m.content);
            b.innerHTML = md(m.content);
            if (m.token_count) appendMeta(0, m.token_count, 0, 0);
          }
          lastRole = 'assistant';
        }
      }
      scrollChat();
    }
   } catch {}
}

// ── Reasoning Panel ──────────────────────────────────────────
function toggleReasoningPanel() {
  reasoningPanelOpen = !reasoningPanelOpen;
  const chatArea = document.getElementById('chat-area');
  if (!chatArea) return;
  
  let panel = document.getElementById('reasoning-panel');
  if (reasoningPanelOpen) {
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'reasoning-panel';
      panel.style.cssText = 'border-top:1px solid var(--border);padding:12px 24px;background:var(--bg3);max-width:900px;margin:0 auto;max-height:300px;overflow-y:auto;font-size:12px;font-family:JetBrains Mono,monospace;color:var(--text2);white-space:pre-wrap;word-break:break-word;';
      chatArea.appendChild(panel);
    }
    // Extract thinking content from XML tags
    let thinkingContent = currentReasoningData || '';
    const re = new RegExp('<thinking>([\\s\\S]*?)</thinking>');
    const thinkingMatch = thinkingContent.match(re);
    if (thinkingMatch) {
      thinkingContent = thinkingMatch[1].trim();
    }
    panel.textContent = thinkingContent || '(No reasoning data)';
    panel.style.display = 'block';
    const btn = document.getElementById('reasoning-toggle');
    if (btn) btn.style.background = 'rgba(6,182,212,0.2)';
  } else {
    if (panel) panel.style.display = 'none';
    const btn = document.getElementById('reasoning-toggle');
    if (btn) btn.style.background = '';
  }
}

// ── WebSocket ───────────────────────────────────────────────
function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => setBadge('connected');
  ws.onclose = () => { setBadge('disconnected'); setTimeout(connect, 3000); };
  ws.onerror = () => setBadge('disconnected');
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    switch (msg.type) {
      case 'session':
        sessionId = msg.sessionId;
        document.getElementById('chat-session-id').textContent = sessionId ? sessionId.slice(-12) : '';
        if (msg.agentName) {
          document.getElementById('chat-agent-name').textContent = msg.agentName;
        }
        saveSession();
        loadSessionsSidebar();
        loadAgentPanel();
        loadModelSelector();
        break;
      case 'agent_selected':
        document.getElementById('chat-agent-name').textContent = msg.agentName;
        toast('Switched to agent: ' + msg.agentName, 'info');
        break;
      case 'session_ended':
        sessionId = null;
        document.getElementById('chat-session-id').textContent = '';
        loadAgentPanel();
        break;
       case 'start':
         agentRaw = '';
         currentReasoningData = '';
         reasoningPanelOpen = false;
         const reasoningBtn = document.getElementById('reasoning-toggle');
         if (reasoningBtn) {
           reasoningBtn.style.display = 'none';
           reasoningBtn.style.background = '';
         }
         const reasoningPanel = document.getElementById('reasoning-panel');
         if (reasoningPanel) {
           reasoningPanel.style.display = 'none';
           reasoningPanel.remove();
         }
         agentBubble = appendBubble('agent', '');
         document.getElementById('thinking-bar').style.display = 'flex';
         break;
      case 'chunk':
         agentRaw += msg.delta;
         if (agentBubble) {
           agentBubble.innerHTML = md(agentRaw);
           scrollChat();
         }
         break;
       case 'reasoning':
         // Show reasoning toggle button when we have reasoning data
         const reasoningBtnToggle = document.getElementById('reasoning-toggle');
         if (reasoningBtnToggle) reasoningBtnToggle.style.display = 'inline-block';
         // Store reasoning for later display
         currentReasoningData = msg.content;
         break;
       case 'done':
         document.getElementById('thinking-bar').style.display = 'none';
         agentBubble = null;
         appendMeta(msg.tokensIn, msg.tokensOut, msg.costUsd, msg.durationMs);
         saveSession();
         if (currentPage === 'lens') loadLens();
         loadAgentPanel();
         const ml = document.getElementById('model-label');
         if (ml && msg.model) ml.textContent = msg.model + (msg.reasoningEffort ? ' · reasoning: ' + msg.reasoningEffort : '');
         break;
      case 'error':
        document.getElementById('thinking-bar').style.display = 'none';
        appendBubble('error', msg.error);
        loadAgentPanel();
        break;
      case 'audio':
        playAudio(msg.data, msg.format || 'mp3');
        break;
      case 'transcribed':
        appendBubble('user', msg.text);
        // Server already processes the transcribed text as a chat; just show the bubble
        break;
      case 'voice_state':
        updateVoiceIndicator(msg.speaking);
        break;
      case 'file_change':
        if (currentPage === 'editor') {
          editorRefreshTree();
          if (editorCurrentFile && msg.filePath && editorCurrentFile === msg.filePath.split(/[\\/]/).pop()) {
            editorOpenFile(editorCurrentFile);
          }
        }
        break;
      case 'context_usage':
        updateContextBar(msg.usedTokens, msg.maxContext, msg.percentage, msg.breakdown);
        break;
    }
  };
}

function setBadge(state) {
  const b = document.getElementById('ws-badge');
  if (state === 'connected') {
    b.style.background = 'rgba(34,197,94,0.15)';
    b.style.color = '#4ade80';
    b.textContent = '● live';
  } else {
    b.style.background = 'rgba(239,68,68,0.15)';
    b.style.color = '#f87171';
    b.textContent = '● off';
  }
}

// ── Chat ────────────────────────────────────────────────────
const chatLog = document.getElementById('chat-log');

function appendBubble(role, content, messageId) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.alignItems = role === 'user' ? 'flex-end' : 'flex-start';
  wrap.style.position = 'relative';
  if (messageId !== undefined) {
    wrap.dataset.messageId = messageId;
  }

  const bubble = document.createElement('div');
  if (role === 'user') { bubble.className = 'bubble-user'; bubble.style.fontSize = '14px'; bubble.textContent = content; }
  else if (role === 'agent') {
    bubble.className = 'bubble-agent md';
    bubble.style.fontSize = '14px';
    bubble.innerHTML = md(content);
    // Add speaker button for TTS
    const voiceBtn = document.createElement('button');
    voiceBtn.textContent = '🔊';
    voiceBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:14px;padding:2px 6px;margin-top:4px;color:var(--text3);';
    voiceBtn.title = 'Read aloud';
    voiceBtn.onclick = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'speak', text: content }));
      }
    };
    bubble.appendChild(voiceBtn);
  }
  else if (role === 'tool') { bubble.className = 'bubble-tool'; bubble.textContent = content; }
  else { bubble.className = 'bubble-error'; bubble.textContent = content; }

  // Add delete button if messageId is provided
  if (messageId !== undefined) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-msg-btn';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Delete message';
    deleteBtn.onclick = async () => {
      if (confirm('Delete this message?')) {
        await deleteMessage(messageId);
        wrap.remove();
      }
    };
    wrap.appendChild(deleteBtn);
  }

  wrap.appendChild(bubble);
  chatLog.appendChild(wrap);
  scrollChat();
  return bubble;
}

function appendMeta(tokIn, tokOut, cost, ms) {
  const div = document.createElement('div');
  div.style.cssText = 'font-size:11px;color:var(--text3);text-align:right;padding:0 2px;';
  const parts = [];
  if (ms) parts.push(\`\${ms}ms\`);
  if (tokIn || tokOut) parts.push(\`\${(tokIn||0)}↑ \${(tokOut||0)}↓ tokens\`);
  if (cost > 0) parts.push(\`$\${cost.toFixed(5)}\`);
  div.textContent = parts.join(' · ');
  chatLog.appendChild(div);
}

// ── Voice / Audio ───────────────────────────────────────────
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

async function toggleMic() {
  const btn = document.getElementById('voice-mic-btn');
  if (isRecording) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRecording = false;
    btn.classList.remove('voice-recording');
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast('Microphone access requires HTTPS or localhost. Voice input is not available in insecure contexts.', 'error');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const base64 = btoa(String.fromCharCode(...bytes));

      // Send audio chunks
      const chunkSize = 65536;
      for (let i = 0; i < base64.length; i += chunkSize) {
        ws.send(JSON.stringify({
          type: 'audio_chunk',
          data: base64.slice(i, i + chunkSize),
          format: 'webm',
          session: true,
        }));
      }
      ws.send(JSON.stringify({ type: 'audio_end', session: true }));

      // Cleanup
      stream.getTracks().forEach(t => t.stop());
      isRecording = false;
      btn.classList.remove('voice-recording');
    };

    mediaRecorder.start(100);
    isRecording = true;
    btn.classList.add('voice-recording');
    toast('Recording... Click mic to stop', 'info');
  } catch (e) {
    toast('Microphone access denied: ' + e.message, 'error');
    isRecording = false;
    btn.classList.remove('voice-recording');
  }
}

function playAudio(base64Data, format) {
  try {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'audio/' + format });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play().catch(e => console.warn('Audio playback:', e.message));
  } catch (e) {
    console.warn('Audio playback error:', e.message);
  }
}

let voiceIndicatorInterval = null;

function updateVoiceIndicator(speaking) {
  const el = document.getElementById('voice-indicator');
  if (!el) return;
  if (speaking) {
    el.style.display = 'inline-block';
    el.textContent = '🔊';
    el.className = 'voice-speaking';
  } else {
    el.style.display = 'none';
    el.className = '';
  }
}

// Check if voice is enabled and show mic button
async function checkVoiceEnabled() {
  try {
    const config = await fetch(BASE + '/api/config').then(r => r.json());
    const btn = document.getElementById('voice-mic-btn');
    if (config.voice?.enabled && btn) {
      btn.style.display = '';
    }
  } catch {}
}

function scrollChat() { chatLog.scrollTop = chatLog.scrollHeight; }

async function sendMessage() {
  const el = document.getElementById('chat-input');
  const text = el.value.trim();
  if ((!text && !attachedFiles.length) || !ws || ws.readyState !== WebSocket.OPEN) return;
  let filesData = null;
  if (attachedFiles.length) {
    try { filesData = await readFilesAsBase64(); } catch (e) { showToast('Failed to read files: ' + (e.message || e), 'error'); return; }
  }
  if (text) appendBubble('user', text);
  if (filesData && filesData.length) {
    for (const f of filesData) {
      const previewEl = document.createElement('div');
      if (f.mimeType.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = 'data:' + f.mimeType + ';base64,' + f.data;
        img.style.cssText = 'max-width:200px;max-height:150px;border-radius:8px;margin:4px 0;';
        previewEl.appendChild(img);
      } else {
        previewEl.style.cssText = 'font-size:12px;color:var(--text2);padding:6px 10px;background:var(--bg3);border-radius:6px;margin:4px 0;';
        previewEl.textContent = '📎 ' + f.filename;
      }
      chatLog.appendChild(previewEl);
    }
  }
  ws.send(JSON.stringify({ type: 'chat', message: text, sessionId, agentId: currentAgentId, model: currentModel || undefined, reasoningEffort: currentReasoning || undefined, files: filesData || undefined }));
  el.value = '';
  el.style.height = 'auto';
  attachedFiles = [];
  renderFilePreview();
}

document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// Auto-resize textarea
document.getElementById('chat-input').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 160) + 'px';
  // Save draft
  try { localStorage.setItem('cortex_message_draft', this.value); } catch {}
});

// Restore message draft on page load
(function restoreDraft() {
  try {
    const draft = localStorage.getItem('cortex_message_draft');
    if (draft) {
      const el = document.getElementById('chat-input');
      el.value = draft;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    }
  } catch {}
})();

// Clear draft when message is sent (in sendMessage)
const _origSendMessage = sendMessage;
sendMessage = function() {
  try { localStorage.removeItem('cortex_message_draft'); } catch {}
  _origSendMessage();
};

// ── File attachments ───────────────────
let attachedFiles = [];

function handleFileSelect(event) {
  const files = event.target.files;
  if (!files || !files.length) return;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (attachedFiles.length >= 5) { showToast('Max 5 files per message', 'warning'); break; }
    if (file.size > 50 * 1024 * 1024) { showToast('File too large (max 50MB): ' + file.name, 'warning'); continue; }
    attachedFiles.push(file);
  }
  event.target.value = '';
  renderFilePreview();
}

function renderFilePreview() {
  const container = document.getElementById('file-preview');
  if (!container) return;
  if (!attachedFiles.length) { container.style.display = 'none'; container.innerHTML = ''; return; }
  container.style.display = 'flex';
  container.innerHTML = attachedFiles.map((f, i) => {
    const sizeStr = f.size < 1024 ? f.size + 'B' : f.size < 1048576 ? (f.size / 1024).toFixed(1) + 'KB' : (f.size / 1048576).toFixed(1) + 'MB';
    return '<span style="display:inline-flex;align-items:center;gap:4px;background:var(--bg2);padding:4px 8px;border-radius:6px;">' +
      '<span>' + (f.type.startsWith('image/') ? '🖼 ' : '📄 ') + esc(f.name) + ' (' + sizeStr + ')</span>' +
      '<button onclick="removeFile(' + i + ')" style="background:none;border:none;cursor:pointer;padding:0;color:var(--text3);">✕</button></span>';
  }).join(' ');
}

function removeFile(index) {
  attachedFiles.splice(index, 1);
  renderFilePreview();
}

async function readFilesAsBase64() {
  const results = [];
  for (const file of attachedFiles) {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    results.push({ filename: file.name, mimeType: file.type, data: data });
  }
  return results;
}

// ── Recent pages tracking ─────────────────
const MAX_RECENT = 5;
function trackRecentPage(name) {
  if (name === 'chat') return;
  try {
    let recent = JSON.parse(localStorage.getItem('cortex_recent_pages') || '[]');
    recent = recent.filter(p => p !== name);
    recent.unshift(name);
    if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
    localStorage.setItem('cortex_recent_pages', JSON.stringify(recent));
    renderRecentPages();
  } catch {}
}

function renderRecentPages() {
  const section = document.getElementById('recent-pages-section');
  const list = document.getElementById('recent-pages-list');
  if (!section || !list) return;
  try {
    const recent = JSON.parse(localStorage.getItem('cortex_recent_pages') || '[]');
    if (!recent.length) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    const titles = { chat:'Chat', memory:'Memory', skills:'Skills', lens:'Activity',
      editor:'Editor', vcs:'Version Control', coderunner:'Code Runner', agents:'Agents',
      services:'Services', nodes:'Nodes', jobs:'Jobs', sessions:'Sessions', settings:'Settings',
      soul:'Soul', policies:'Policies', extensions:'Extensions',
      automation:'Automation', channels:'Channels', projects:'Projects',
      dashboard:'Dashboard', analytics:'Analytics', quartermaster:'Quartermaster' };
    list.innerHTML = recent.map(p => \`<button class="nav-item compact" onclick="showPage('\${p}');closeMobileSidebar()">\${titles[p] || p}</button>\`).join('');
  } catch {}
}

// ── Navigation ──────────────────────────────────────────────
const PAGES = ['dashboard','chat','editor','vcs','coderunner','memory','skills','lens','agents','services','nodes','jobs','projects','automation','channels','sessions','settings','soul','policies','extensions','analytics','pluginpanels','quartermaster'];

function loadDashboard() {
  var c = document.getElementById('dashboard-content');
  if (!c) return;
  if (window.__db) { window.__db(); return; }
  window.__db = initDashboard;
  ${DASHBOARD_JS}
  window.toggleEdit = toggleEdit;
  window.showPicker = showPicker;
  window.addWidget = addWidget;
  window.removeWidget = removeWidget;
}
function showPage(name) {
  currentPage = name;
  try {
    localStorage.setItem('cortex_page', name);
    if (location.hash !== '#' + name) history.pushState(null, '', '#' + name);
  } catch {}
  trackRecentPage(name);
  PAGES.forEach(p => {
    document.getElementById('page-' + p).style.display = 'none';
    document.getElementById('page-' + p).classList.remove('page-fade-in');
    const nav = document.getElementById('nav-' + p);
    if (nav) nav.classList.toggle('active', p === name);
  });
  const page = document.getElementById('page-' + name);
  page.style.display = 'flex';
  // Use requestAnimationFrame for reliable animation trigger
  requestAnimationFrame(() => {
    page.classList.add('page-fade-in');
  });
  // Show hamburger only on non-chat pages
  const ham = document.getElementById('hamburger');
  if (ham) ham.style.display = name === 'chat' && window.innerWidth > 768 ? 'none' : window.innerWidth <= 768 ? 'flex' : name !== 'chat' ? 'flex' : 'none';

  const loaders = {
    lens: loadLens, memory: loadMemoryStats, jobs: loadJobs,
    skills: loadSkills, policies: loadPolicies, analytics: loadAnalytics,
    sessions: () => { loadSessionAgentFilter(); loadSessionsList(); }, settings: loadSettings,
    extensions: loadPlugins, soul: loadSoulFile, editor: () => { editorLoadWorkspaces(); editorRefreshTree(); },
    pluginpanels: () => { loadPluginPanelsTabs(); },
    nodes: loadNodes,
    quartermaster: loadQuartermaster,
    dashboard: loadDashboard,
    projects: loadProjects,
    automation: loadHooksPage,
    channels: loadChannels,
    vcs: gitRefresh,
  };
  if (loaders[name]) loaders[name]();
}

// ── Skeleton loading utilities ──────────────
function showSkeleton(container, count = 3, type = 'card') {
  if (typeof container === 'string') container = document.getElementById(container);
  if (!container) return;
  if (type === 'card') {
    container.innerHTML = Array.from({length: count}, () => '<div class="skeleton skeleton-card"></div>').join('');
  } else if (type === 'lines') {
    container.innerHTML = Array.from({length: count}, () => '<div class="skeleton skeleton-line"></div>').join('');
  } else if (type === 'table') {
    container.innerHTML = '<div class="skeleton" style="height:200px;border-radius:8px;"></div>';
  }
}

// ── Sessions sidebar ────────────────────────────────────────
async function loadSessionsSidebar() {
  const el = document.getElementById('sessions-sidebar');
  if (!el) return;
  const sessions = await fetch(BASE + '/api/sessions?limit=15').then(r => r.json()).catch(() => []);
  el.innerHTML = '';
  for (const s of sessions) {
    const btn = document.createElement('button');
    btn.className = 'sess-item' + (s.id === sessionId ? ' active' : '');
    const ts = new Date(s.started_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    btn.innerHTML = \`
      <div style="font-size:12px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">\${s.id.slice(-12)}</div>
      <div style="font-size:11px;color:var(--text3);">\${s.turn_count} turns · \${ts}</div>
    \`;
    btn.title = s.id;
    el.appendChild(btn);
  }
}

// ── Daemon status ───────────────────────────────────────────
async function loadDaemonStatus() {
  try {
    const st = await fetch(BASE + '/api/status').then(r => r.json());
    const el = document.getElementById('daemon-status');
    const daemons = [
      { key: 'validator', label: 'Validator' },
      { key: 'executor', label: 'Executor' },
      { key: 'scheduler', label: 'Scheduler' },
    ];
    el.innerHTML = daemons.map(d => {
      const up = st.daemons?.[d.key];
      return \`<div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;">
        <span style="color:var(--text3);">\${d.label}</span>
        <span style="color:\${up ? '#4ade80' : '#f87171'};">\${up ? '● on' : '○ off'}</span>
      </div>\`;
    }).join('');
    document.getElementById('model-label').textContent = \`\${st.provider} / \${st.model}\`;
  } catch { /* server not ready yet */ }
}

// ── Lens ────────────────────────────────────────────────────
const EVT_COLORS = {
  session_start:'#818cf8', session_end:'#6b7280',
  llm_call:'#34d399', tool_call:'#fbbf24', tool_approved:'#4ade80', tool_rejected:'#f87171', tool_error:'#f87171',
  policy_check:'#fb923c', intent_approved:'#4ade80', intent_rejected:'#f87171',
  memory_write:'#a78bfa', memory_read:'#6366f1', memory_consolidation:'#8b5cf6',
  error:'#f87171', warning:'#fbbf24', meta_assessment:'#38bdf8',
};

let lensAutoRefreshTimer = null;

async function loadLens() {
  const filter = document.getElementById('lens-filter')?.value ?? '';
  const level = document.getElementById('lens-level')?.value ?? '';
  const lines = document.getElementById('lens-lines')?.value ?? '100';
  const params = new URLSearchParams({ limit: lines });
  if (level) params.set('level', level);
  if (filter) params.set('type', filter);
  const url = BASE + '/api/lens/recent?' + params.toString();
  const events = await fetch(url).then(r => r.json()).catch(() => []);

  const el = document.getElementById('lens-log');
  if (!events.length) {
    el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;">' +
      '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>' +
      '<p style="color:var(--text3);font-size:13px;">No events yet.</p>' +
      '<p style="color:var(--text3);font-size:11px;margin-top:4px;">Activity will appear here as Cortex processes requests.</p></div>';
    return;
  }

  el.innerHTML = events.map(ev => {
    const color = EVT_COLORS[ev.event_type] ?? 'var(--text3)';
    const ts = new Date(ev.started_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const rel = timeAgo(ev.started_at);
    const dur = ev.duration_ms ? \`<span style="color:var(--text3);">\${ev.duration_ms}ms</span>\` : '';
    const cost = ev.cost_usd > 0 ? \`<span style="color:#4ade80;">$\${Number(ev.cost_usd).toFixed(5)}</span>\` : '';
    const err = ev.error ? \` <span style="color:#f87171;font-size:11px;">⚠ \${esc(ev.error.slice(0, 80))}</span>\` : '';
    return \`<div class="lens-row" title="\${new Date(ev.started_at).toLocaleString()}">
      <span style="color:var(--text3);font-family:'JetBrains Mono',monospace;min-width:72px;" title="\${ts}">\${rel}</span>
      <span style="color:\${color};min-width:150px;font-size:11px;font-weight:500;">\${ev.event_type}</span>
      <span style="color:var(--text2);min-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">\${esc(ev.actor)}</span>
      <span style="color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">\${esc(ev.summary ?? ev.action ?? '')}\${err}</span>
      <span style="display:flex;gap:8px;align-items:center;">\${dur}\${cost}</span>
    </div>\`;
  }).join('');
}

function toggleLensAutoRefresh() {
  const on = document.getElementById('lens-autorefresh').checked;
  if (on) { lensAutoRefreshTimer = setInterval(loadLens, 5000); }
  else { clearInterval(lensAutoRefreshTimer); lensAutoRefreshTimer = null; }
}

// ── Memory ──────────────────────────────────────────────────
const ENTITY_COLORS = { concept:'#a78bfa', code:'#38bdf8', domain:'#34d399' };

function decayColor(score) {
  if (score >= 0.7) return '#4ade80';
  if (score >= 0.4) return '#fbbf24';
  if (score >= 0.1) return '#fb923c';
  return '#f87171';
}

function switchMemoryTab(name) {
  document.querySelectorAll('.mem-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('memtab-'+name).classList.add('active');
  ['search','graph','reflections','health','persistent'].forEach(p => {
    const el = document.getElementById('mem-pane-'+p);
    if (el) el.style.display = p === name ? 'flex' : 'none';
  });
  if (name === 'graph') searchGraphEntities();
  if (name === 'reflections') loadReflections();
  if (name === 'health') loadMemoryHealth();
  if (name === 'persistent') loadMemoryMd();
}

async function loadMemoryStats() {
  try {
    const s = await fetch(BASE + '/api/memory/stats').then(r => r.json());
    const el = document.getElementById('mem-stats');
    if (!el) return;
    el.innerHTML = [
      { label:'Episodic', val: s.episodic, color:'#fbbf24', desc:'Session traces' },
      { label:'Semantic', val: s.semantic, color:'#818cf8', desc:'Facts & knowledge' },
      { label:'Reflection', val: s.reflection, color:'#34d399', desc:'Meta-patterns' },
      { label:'Procedural', val: s.procedural, color:'#fb923c', desc:'Learned skills' },
    ].map(s => \`<div class="stat" style="cursor:pointer;" onclick="document.getElementById('mem-query').value='';searchMemory()">
      <div class="stat-num" style="color:\${s.color};">\${s.val}</div>
      <div class="stat-label">\${s.label}</div>
      <div style="font-size:9px;color:var(--text3);">\${s.desc}</div>
    </div>\`).join('');
  } catch { /* ignore */ }
}

async function searchMemory() {
  const q = document.getElementById('mem-query').value.trim();
  if (!q) return;
  switchMemoryTab('search');
  const el = document.getElementById('mem-results');
  el.innerHTML = '<p style="color:var(--text3);font-size:13px;">Searching…</p>';
  const hits = await fetch(\`\${BASE}/api/memory/search?q=\${encodeURIComponent(q)}\`).then(r => r.json()).catch(() => []);
  if (!hits.length) { el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;padding:40px 20px;text-align:center;"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:10px;opacity:0.4;"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg><p style="color:var(--text3);font-size:13px;">No results found for "' + esc(q) + '"</p></div>'; return; }

  el.innerHTML = '';
  for (const h of hits) {
    const typeColor = h.type === 'episodic' ? '#fbbf24' : '#818cf8';
    const typeLabel = h.type === 'episodic' ? 'Episodic' : 'Semantic';
    const decay = h.decayScore ?? 1;
    const dColor = decayColor(decay);
    const entities = h.entities ?? [];
    const tags = h.tags ?? [];
    const topics = h.topics ?? [];

    const d = document.createElement('div');
    d.className = 'card-sm';
    d.style.cssText = 'cursor:pointer;';
    d.onclick = () => { d.querySelector('.mem-detail').style.display = d.querySelector('.mem-detail').style.display === 'none' ? 'block' : 'none'; };

    d.innerHTML = \`
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
        <span class="badge" style="background:rgba(255,255,255,0.06);color:\${typeColor};">\${typeLabel}</span>
        <span style="font-size:11px;color:var(--text3);">\${timeAgo(h.created_at)}</span>
        \${h.category ? \`<span style="font-size:10px;color:var(--text3);">· \${esc(h.category)}</span>\` : ''}
        \${h.accessCount ? \`<span style="font-size:10px;color:var(--text3);">· \${h.accessCount} accesses</span>\` : ''}
        <span style="margin-left:auto;font-size:11px;color:\${dColor};">decay \${(decay*100).toFixed(0)}%</span>
      </div>
      <div style="height:3px;background:var(--border);border-radius:2px;margin-bottom:6px;overflow:hidden;">
        <div style="height:100%;width:\${decay*100}%;background:\${dColor};border-radius:2px;transition:width 0.3s;"></div>
      </div>
      <p style="font-size:13px;color:var(--text2);line-height:1.5;">\${esc(String(h.text ?? '').slice(0, 300))}</p>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">
        \${entities.map(e => \`<span class="entity-chip" style="background:rgba(167,139,250,0.12);color:#a78bfa;" onclick="event.stopPropagation();document.getElementById('graph-query').value='\${esc(e)}';switchMemoryTab('graph');searchGraphEntities()">\${esc(e)}</span>\`).join('')}
        \${tags.map(t => \`<span class="entity-chip" style="background:rgba(99,102,241,0.1);color:#818cf8;">\${esc(t)}</span>\`).join('')}
        \${topics.map(t => \`<span class="entity-chip" style="background:rgba(251,191,36,0.1);color:#fbbf24;">\${esc(t)}</span>\`).join('')}
      </div>
      <div class="mem-detail" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
        <div style="display:flex;gap:16px;flex-wrap:wrap;">
          <div>
            <div style="font-size:10px;color:var(--text3);">ID</div>
            <div style="font-size:11px;color:var(--text2);font-family:monospace;">\${esc(h.id)}</div>
          </div>
          <div>
            <div style="font-size:10px;color:var(--text3);">Score</div>
            <div style="font-size:11px;color:var(--text2);">\${Number(h.score ?? 0).toFixed(4)}</div>
          </div>
          <div>
            <div style="font-size:10px;color:var(--text3);">Decay</div>
            <div style="font-size:11px;color:\${dColor};">\${(decay*100).toFixed(1)}%</div>
          </div>
          \${h.accessCount !== undefined ? \`<div><div style="font-size:10px;color:var(--text3);">Accesses</div><div style="font-size:11px;color:var(--text2);">\${h.accessCount}</div></div>\` : ''}
        </div>
      </div>
    \`;
    el.appendChild(d);
  }
}

document.getElementById('mem-query').addEventListener('keydown', e => { if (e.key === 'Enter') searchMemory(); });

// ── Graph ────────────────────────────────────────────────────
async function searchGraphEntities() {
  const q = document.getElementById('graph-query').value.trim();
  let url = BASE + '/api/memory/graph/entities';
  if (q) url += '?q=' + encodeURIComponent(q);

  const entities = await fetch(url).then(r => r.json()).catch(() => []);
  const el = document.getElementById('graph-results');
  const bc = document.getElementById('graph-breadcrumb');

  if (!entities.length) {
    el.innerHTML = '<p style="color:var(--text3);font-size:12px;padding:20px 0;text-align:center;">No entities found.</p>';
    bc.innerHTML = '';
    return;
  }

  bc.innerHTML = '<span style="color:var(--text2);">Entities</span>' + (q ? ' · <span style="color:var(--text3);">matching "' + esc(q) + '"</span>' : '');

  el.innerHTML = entities.map(e => {
    const color = ENTITY_COLORS[e.type] ?? '#9090a8';
    return \`<div class="card-sm" style="cursor:pointer;" onclick="loadGraphForEntity('\${esc(e.name)}')">
      <div style="display:flex;align-items:center;gap:8px;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="badge" style="background:rgba(255,255,255,0.06);color:\${color};">\${esc(e.type)}</span>
          <span style="font-size:13px;font-weight:500;color:var(--text);">\${esc(e.name)}</span>
        </div>
      </div>
      \${e.description ? \`<p style="font-size:11px;color:var(--text3);margin-top:4px;">\${esc(e.description)}</p>\` : ''}
    </div>\`;
  }).join('');
}

async function loadGraphForEntity(name) {
  const hits = await fetch(\`\${BASE}/api/memory/graph?entity=\${encodeURIComponent(name)}&depth=1\`).then(r => r.json()).catch(() => []);
  const el = document.getElementById('graph-results');
  const bc = document.getElementById('graph-breadcrumb');

  bc.innerHTML = \`<span style="color:var(--text3);cursor:pointer;" onclick="searchGraphEntities()">Entities</span> <span style="color:var(--text3);">/</span> <span style="color:var(--text2);">\${esc(name)}</span>\`;

  if (!hits.length) {
    el.innerHTML = '<p style="color:var(--text3);font-size:12px;padding:20px 0;text-align:center;">No connections found for "' + esc(name) + '".</p>';
    return;
  }

  const relations = {};
  const REL_COLORS = { uses:'#38bdf8', replaces:'#f87171', extends:'#a78bfa', is_part_of:'#34d399', is_instance_of:'#fb923c', related_to:'#9090a8', contradicts:'#f87171', supports:'#4ade80', causes:'#fbbf24', requires:'#f97316', configures:'#818cf8' };

  for (const h of hits) {
    const dir = h.direction === 'outbound' ? '→' : '←';
    const key = h.relation;
    if (!relations[key]) relations[key] = { name: h.relation, direction: dir, peers: [] };
    relations[key].peers.push(h);
  }

  el.innerHTML = Object.entries(relations).map(([rel, group]) => {
    const color = REL_COLORS[rel] ?? '#9090a8';
    return \`<div style="margin-bottom:10px;">
      <div style="font-size:11px;font-weight:600;color:\${color};margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">\${group.direction} \${group.name}</div>
      \${group.peers.map(h => {
        const peerColor = ENTITY_COLORS[h.peer.type] ?? '#9090a8';
        return \`<div class="card-sm" style="cursor:pointer;margin-bottom:6px;" onclick="document.getElementById('graph-query').value='\${esc(h.peer.name)}';loadGraphForEntity('\${esc(h.peer.name)}')">
          <div style="display:flex;align-items:center;gap:8px;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="badge" style="background:rgba(255,255,255,0.06);color:\${peerColor};">\${esc(h.peer.type)}</span>
              <span style="font-size:13px;font-weight:500;color:var(--text);">\${esc(h.peer.name)}</span>
            </div>
            <span style="font-size:10px;color:var(--text3);">str \${(h.strength*100).toFixed(0)}%</span>
          </div>
          \${h.peer.description ? \`<p style="font-size:11px;color:var(--text3);margin-top:4px;">\${esc(h.peer.description)}</p>\` : ''}
          <div style="height:2px;background:var(--border);border-radius:1px;margin-top:6px;overflow:hidden;">
            <div style="height:100%;width:\${h.strength*100}%;background:\${color};border-radius:1px;"></div>
          </div>
        </div>\`;
      }).join('')}
    </div>\`;
  }).join('');
}

// ── Reflections ─────────────────────────────────────────────
async function loadReflections() {
  const refs = await fetch(BASE + '/api/memory/reflections').then(r => r.json()).catch(() => []);
  const el = document.getElementById('reflections-list');
  if (!refs.length) { el.innerHTML = '<p style="color:var(--text3);font-size:12px;padding:20px 0;text-align:center;">No reflection patterns yet. Patterns emerge from agent self-assessment and consolidation cycles.</p>'; return; }

  const CAT_COLORS = { general:'#818cf8', meta:'#34d399', technical:'#fbbf24', behavioral:'#fb923c' };

  el.innerHTML = refs.map(r => {
    const color = CAT_COLORS[r.category] ?? '#818cf8';
    const pct = (r.confidence * 100).toFixed(0);
    return \`<div class="card-sm">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span class="badge" style="background:rgba(255,255,255,0.06);color:\${color};">\${esc(r.category)}</span>
        <span style="font-size:13px;color:var(--text);">\${esc(r.pattern)}</span>
        <span style="margin-left:auto;font-size:11px;color:var(--text3);">\${timeAgo(r.created_at)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
        <div style="flex:1;height:3px;background:var(--border);border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:\${pct}%;background:\${color};border-radius:2px;"></div>
        </div>
        <span style="font-size:10px;color:\${color};min-width:36px;text-align:right;">\${pct}%</span>
      </div>
    </div>\`;
  }).join('');
}

// ── Health ───────────────────────────────────────────────────
async function loadMemoryHealth() {
  const h = await fetch(BASE + '/api/memory/health').then(r => r.json()).catch(() => null);
  const el = document.getElementById('health-content');
  if (!h) { el.innerHTML = '<p style="color:var(--text3);font-size:12px;">Failed to load health data.</p>'; return; }

  function healthCard(label, data, color) {
    const activePct = data.total ? ((data.active/data.total)*100).toFixed(0) : 0;
    const stalePct = data.total ? ((data.stale/data.total)*100).toFixed(0) : 0;
    return \`<div class="card">
      <h3 style="font-size:14px;font-weight:600;color:\${color};margin-bottom:10px;">\${label}</h3>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;">
        <div><div style="font-size:10px;color:var(--text3);">Total</div><div style="font-size:18px;font-weight:600;color:var(--text);">\${data.total}</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Active</div><div style="font-size:18px;font-weight:600;color:#4ade80;">\${data.active} <span style="font-size:10px;">\${activePct}%</span></div></div>
        <div><div style="font-size:10px;color:var(--text3);">Stale</div><div style="font-size:18px;font-weight:600;color:#f87171;">\${data.stale} <span style="font-size:10px;">\${stalePct}%</span></div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        <div><div style="font-size:10px;color:var(--text3);">Avg Decay</div><div style="font-size:13px;color:\${decayColor(data.avgDecay)};">\${(data.avgDecay*100).toFixed(0)}%</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Avg Importance</div><div style="font-size:13px;color:var(--text2);">\${(data.avgImportance*100).toFixed(0)}%</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Avg Accesses</div><div style="font-size:13px;color:var(--text2);">\${data.avgAccess.toFixed(1)}</div></div>
      </div>
      <div style="margin-top:8px;">
        <div style="font-size:10px;color:var(--text3);margin-bottom:3px;">Decay Distribution</div>
        <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden;display:flex;">
          <div style="height:100%;width:\${activePct}%;background:#4ade80;"></div>
          <div style="height:100%;width:\${Math.max(0,100-activePct-stalePct)}%;background:#fbbf24;"></div>
          <div style="height:100%;width:\${stalePct}%;background:#f87171;"></div>
        </div>
      </div>
    </div>\`;
  }

  el.innerHTML = \`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;">
      \${healthCard('Episodic Memory', h.episodic, '#fbbf24')}
      \${healthCard('Semantic Memory', h.semantic, '#818cf8')}
    </div>
    <div class="card">
      <h3 style="font-size:14px;font-weight:600;color:#a78bfa;margin-bottom:10px;">Knowledge Graph</h3>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        <div><div style="font-size:10px;color:var(--text3);">Entities</div><div style="font-size:18px;font-weight:600;color:var(--text);">\${h.graph.entities}</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Relations</div><div style="font-size:18px;font-weight:600;color:var(--text);">\${h.graph.relations}</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Avg Strength</div><div style="font-size:18px;font-weight:600;color:var(--text2);">\${(h.graph.avgStrength*100).toFixed(0)}%</div></div>
      </div>
    </div>
    <div class="card">
      <h3 style="font-size:14px;font-weight:600;color:#34d399;margin-bottom:10px;">Reflections</h3>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        <div><div style="font-size:10px;color:var(--text3);">Total Patterns</div><div style="font-size:18px;font-weight:600;color:var(--text);">\${h.reflection.total}</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Meta-Patterns</div><div style="font-size:18px;font-weight:600;color:var(--text);">\${h.reflection.metaPatterns}</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Avg Confidence</div><div style="font-size:18px;font-weight:600;color:var(--text2);">\${(h.reflection.avgConfidence*100).toFixed(0)}%</div></div>
      </div>
    </div>
  \`;
}

// ── Jobs ────────────────────────────────────────────────────
const JOB_COLORS = { pending:'#fbbf24', running:'#38bdf8', completed:'#4ade80', failed:'#f87171', cancelled:'#6b7280' };
async function loadJobs() {
  const el = document.getElementById('jobs-list');
  showSkeleton(el, 3, 'card');
  const jobs = await fetch(BASE + '/api/jobs').then(r => r.json()).catch(() => []);
  if (!jobs.length) { el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p style="color:var(--text3);font-size:13px;">No jobs scheduled.</p><p style="color:var(--text3);font-size:11px;margin-top:4px;">Create a job from the Cron page or via the CLI.</p></div>'; return; }

  el.innerHTML = '';
  for (const j of jobs) {
    const c = JOB_COLORS[j.status] ?? '#6b7280';
    const d = document.createElement('div');
    d.className = 'card-sm';
    d.style.display = 'flex';
    d.style.alignItems = 'center';
    d.style.justifyContent = 'space-between';
    d.innerHTML = \`
      <div>
        <span style="font-size:13px;font-weight:500;color:var(--text);">\${esc(j.name)}</span>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;font-family:'JetBrains Mono',monospace;">\${esc(j.schedule ?? j.kind ?? '')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:11px;color:var(--text3);">\${j.attempts}/\${j.max_attempts} attempts</span>
        <span class="badge" style="background:rgba(255,255,255,0.06);color:\${c};">⬤ \${j.status}</span>
      </div>
    \`;
    el.appendChild(d);
  }
}

// ── Projects ────────────────────────────────────────────────
async function loadProjects() {
  const el = document.getElementById('projects-list');
  showSkeleton(el, 3, 'card');
  const projects = await fetch(BASE + '/api/projects').then(r => r.json()).catch(() => []);
  document.getElementById('projects-total').textContent = projects.length;
  renderProjects(projects);
}

function renderProjects(projects) {
  const el = document.getElementById('projects-list');
  if (!projects.length) {
    el.innerHTML = \`<div style="text-align:center;color:var(--text3);padding:60px 20px;font-size:13px;">
      No projects yet. Create one to organize work by workspace.
    </div>\`;
    return;
  }
  el.innerHTML = '';
  for (const p of projects) {
    const created = p.created ? new Date(p.created).toLocaleDateString() : '—';
    const d = document.createElement('div');
    d.style.cssText = 'background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px 16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;';
    d.innerHTML = \`
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:13px;">\${escHtml(p.name)}</div>
        \${p.description ? \`<div style="font-size:12px;color:var(--text3);margin-top:2px;">\${escHtml(p.description)}</div>\` : ''}
        <div style="display:flex;gap:14px;margin-top:6px;font-size:11px;color:var(--text3);">
          <span>Path: <code style="font-size:10px;">\${escHtml(p.path ?? '—')}</code></span>
          \${p.agentId ? \`<span>Agent: <strong>\${escHtml(p.agentId)}</strong></span>\` : ''}
          <span>Created: \${created}</span>
        </div>
      </div>
      <button class="btn btn-ghost" style="color:#f87171;font-size:12px;" onclick="deleteProject(\${JSON.stringify(p.name)})">Delete</button>
    \`;
    el.appendChild(d);
  }
}

function openProjectForm() {
  document.getElementById('project-form-panel').style.display = 'block';
  document.getElementById('project-form-error').style.display = 'none';
  document.getElementById('proj-name').focus();
}

function closeProjectForm() {
  document.getElementById('project-form-panel').style.display = 'none';
  document.getElementById('proj-name').value = '';
  document.getElementById('proj-desc').value = '';
  document.getElementById('proj-agent').value = '';
}

async function saveProject() {
  const name = document.getElementById('proj-name').value.trim();
  const description = document.getElementById('proj-desc').value.trim();
  const agentId = document.getElementById('proj-agent').value.trim() || 'default';
  const errEl = document.getElementById('project-form-error');
  if (!name) { errEl.textContent = 'Name is required.'; errEl.style.display = 'block'; return; }
  const res = await fetch(BASE + '/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: description || undefined, agentId }),
  });
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || 'Failed to create project.'; errEl.style.display = 'block'; return; }
  closeProjectForm();
  loadProjects();
}

async function deleteProject(name) {
  if (!confirm(\`Delete project "\${name}"? This cannot be undone.\`)) return;
  const res = await fetch(BASE + '/api/projects/' + encodeURIComponent(name), { method: 'DELETE' });
  if (!res.ok) { const d = await res.json(); showToast(d.error || 'Failed to delete project', 'error'); return; }
  loadProjects();
}

// ── Hooks ────────────────────────────────────────────────────
async function loadHooksPage() {
  document.getElementById('hooks-tbody').innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:40px;">Loading…</td></tr>';
  const hooks = await fetch(BASE + '/api/hooks').then(r => r.json()).catch(() => []);
  document.getElementById('hooks-count-badge').textContent = hooks.length + ' hook' + (hooks.length !== 1 ? 's' : '');
  renderHooks(hooks);
}

function renderHooks(hooks) {
  const tbody = document.getElementById('hooks-tbody');
  if (!hooks.length) {
    tbody.innerHTML = \`<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:40px;">
      No hooks registered. Click "Init Built-in Hooks" to load the default hooks.
    </td></tr>\`;
    return;
  }
  tbody.innerHTML = hooks.map(h => \`
    <tr style="border-bottom:1px solid var(--border);">
      <td style="padding:8px 10px;font-weight:500;">\${escHtml(h.name)}</td>
      <td style="padding:8px 10px;font-size:12px;color:var(--text3);">\${(h.stages||[]).join(', ')}</td>
      <td style="padding:8px 10px;">\${h.priority ?? '—'}</td>
      <td style="padding:8px 10px;">\${h.async ? '<span style="color:#4ade80;">yes</span>' : 'no'}</td>
      <td style="padding:8px 10px;font-size:12px;">\${escHtml(h.source ?? '—')}</td>
      <td style="padding:8px 10px;font-size:12px;color:var(--text3);">\${escHtml(h.pluginName ?? '—')}</td>
      <td style="padding:8px 10px;">
        \${h.disableable
          ? \`<button class="btn btn-ghost" style="font-size:11px;color:#f87171;" onclick="disableHook(\${JSON.stringify(h.name)})">Disable</button>\`
          : '<span style="color:var(--text3);font-size:12px;">🔒 locked</span>'}
      </td>
    </tr>
  \`).join('');
}

async function initBuiltinHooks() {
  const res = await fetch(BASE + '/api/hooks/init', { method: 'POST' });
  const data = await res.json();
  if (!res.ok) { showToast(data.error || 'Failed to init hooks', 'error'); return; }
  showToast(\`Initialized \${data.added} hook(s). Total: \${data.total}.\`, 'success');
  loadHooksPage();
}

async function disableHook(name) {
  if (!confirm(\`Disable hook "\${name}" for this session?\`)) return;
  const res = await fetch(BASE + '/api/hooks/' + encodeURIComponent(name) + '/disable', { method: 'POST' });
  if (!res.ok) { const d = await res.json(); showToast(d.error || 'Failed to disable hook', 'error'); return; }
  loadHooksPage();
}

// ── Triggers ──────────────────────────────────────────────
async function loadTriggers() {
  const el = document.getElementById('triggers-list');
  showSkeleton(el, 3, 'card');
  const triggers = await fetch(BASE + '/api/triggers').then(r => r.json()).catch(() => []);
  document.getElementById('triggers-total').textContent = triggers.length;
  document.getElementById('triggers-enabled').textContent = triggers.filter(t => t.enabled).length;
  document.getElementById('triggers-webhooks').textContent = triggers.filter(t => t.source === 'webhook').length;
  document.getElementById('triggers-watchers').textContent = triggers.filter(t => t.source === 'watcher').length;
  renderTriggers(triggers);
}

function renderTriggers(triggers) {
  const el = document.getElementById('triggers-list');
  if (!triggers.length) {
    el.innerHTML = \`<div style="text-align:center;color:var(--text3);padding:60px 20px;font-size:13px;">
      No triggers registered. Click "+ Add Trigger" to create one.
    </div>\`;
    return;
  }
  el.innerHTML = '';
  for (const t of triggers) {
    const statusColor = t.enabled ? '#22c55e' : '#fbbf24';
    const statusLabel = t.enabled ? 'enabled' : 'disabled';
    const webhookUrl = t.source === 'webhook' ? \`\${location.origin}/api/webhooks/\${encodeURIComponent(t.name)}\` : null;
    const d = document.createElement('div');
    d.style.cssText = 'background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px 16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;';
    d.innerHTML = \`
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-weight:600;font-size:13px;">\${escHtml(t.name)}</span>
          <span style="font-size:11px;background:rgba(255,255,255,0.06);border:1px solid var(--border);padding:1px 7px;border-radius:10px;">\${escHtml(t.source)}</span>
          <span style="font-size:11px;color:\${statusColor};">⬤ \${statusLabel}</span>
        </div>
        \${webhookUrl ? \`<div style="margin-top:5px;font-size:11px;color:var(--text3);">
          URL: <code style="font-size:10px;cursor:pointer;text-decoration:underline;" onclick="navigator.clipboard.writeText(\${JSON.stringify(webhookUrl)});showToast('URL copied','success')">\${escHtml(webhookUrl)}</code>
        </div>\` : ''}
        <div style="margin-top:5px;font-size:11px;color:var(--text3);">
          Agent: <strong>\${escHtml(t.action?.agent || 'default')}</strong>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        \${t.enabled
          ? \`<button class="btn btn-ghost" style="font-size:11px;" onclick="disableTrigger(\${escHtml(JSON.stringify(t.name))})">Disable</button>\`
          : \`<button class="btn btn-ghost" style="font-size:11px;color:#22c55e;" onclick="enableTrigger(\${escHtml(JSON.stringify(t.name))})">Enable</button>\`}
        <button class="btn btn-ghost" style="font-size:11px;color:#f87171;" onclick="removeTrigger(\${escHtml(JSON.stringify(t.name))})">Remove</button>
      </div>
    \`;
    el.appendChild(d);
  }
}

function openTriggerForm() {
  document.getElementById('trigger-form-panel').style.display = 'block';
  document.getElementById('trigger-form-error').style.display = 'none';
  triggerFormSourceChanged();
  document.getElementById('trig-name').focus();
}

function closeTriggerForm() {
  document.getElementById('trigger-form-panel').style.display = 'none';
}

function triggerFormSourceChanged() {
  const src = document.getElementById('trig-source').value;
  const wh = document.getElementById('trig-webhook-fields');
  const wa = document.getElementById('trig-watcher-fields');
  const gh = document.getElementById('trig-githook-fields');
  if (wh) { [...wh.children].forEach(el => el.style.display = src === 'webhook' ? 'flex' : 'none'); }
  if (wa) wa.style.display = src === 'watcher' ? 'block' : 'none';
  if (gh) gh.style.display = src === 'git_hook' ? 'block' : 'none';
}

async function saveTrigger() {
  const name = document.getElementById('trig-name').value.trim();
  const source = document.getElementById('trig-source').value;
  const agent = document.getElementById('trig-agent').value.trim() || 'default';
  const promptTemplate = document.getElementById('trig-prompt').value.trim() || 'Handle event: {{event}}';
  const enabled = document.getElementById('trig-enabled').checked;
  const errEl = document.getElementById('trigger-form-error');
  if (!name) { errEl.textContent = 'Name is required.'; errEl.style.display = 'block'; return; }

  const config = {
    name, source, enabled,
    action: { type: 'agent_turn', agent, promptTemplate, timeoutSeconds: 60 },
  };

  if (source === 'webhook') {
    const provider = document.getElementById('trig-webhook-provider').value;
    const secretEnv = document.getElementById('trig-webhook-secret-env').value.trim();
    config.webhook = { path: '/api/webhooks/' + encodeURIComponent(name), providers: [provider], events: ['*'], ...(secretEnv ? { secretEnv } : {}) };
  } else if (source === 'watcher') {
    const pathsRaw = document.getElementById('trig-watcher-paths').value.trim();
    const debounceMs = parseInt(document.getElementById('trig-watcher-debounce').value, 10) || 500;
    config.watcher = { paths: pathsRaw.split(',').map(s => s.trim()).filter(Boolean), debounceMs, recursive: true, events: ['create','modify','delete'] };
  } else if (source === 'git_hook') {
    const repoPath = document.getElementById('trig-githook-repo').value.trim();
    config.gitHook = { repoPath, hooks: ['pre-commit', 'post-commit'] };
  }

  const res = await fetch(BASE + '/api/triggers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || 'Failed to create trigger.'; errEl.style.display = 'block'; return; }
  closeTriggerForm();
  loadTriggers();
}

async function removeTrigger(name) {
  if (!confirm(\`Remove trigger "\${name}"?\`)) return;
  const res = await fetch(BASE + '/api/triggers/' + encodeURIComponent(name), { method: 'DELETE' });
  if (!res.ok) { const d = await res.json(); showToast(d.error || 'Failed to remove trigger', 'error'); return; }
  loadTriggers();
}

async function enableTrigger(name) {
  const res = await fetch(BASE + '/api/triggers/' + encodeURIComponent(name) + '/enable', { method: 'POST' });
  if (!res.ok) { const d = await res.json(); showToast(d.error || 'Failed to enable trigger', 'error'); return; }
  loadTriggers();
}

async function disableTrigger(name) {
  const res = await fetch(BASE + '/api/triggers/' + encodeURIComponent(name) + '/disable', { method: 'POST' });
  if (!res.ok) { const d = await res.json(); showToast(d.error || 'Failed to disable trigger', 'error'); return; }
  loadTriggers();
}

// ── Channels ──────────────────────────────────────────────
async function loadChannels() {
  const el = document.getElementById('channels-list');
  showSkeleton(el, 3, 'card');
  const channels = await fetch(BASE + '/api/channels').then(r => r.json()).catch(() => []);
  document.getElementById('channels-total').textContent = channels.length;
  document.getElementById('channels-active').textContent = channels.filter(c => c.enabled).length;
  document.getElementById('channels-inactive').textContent = channels.filter(c => !c.enabled).length;
  renderChannels(channels);
}

function renderChannels(channels) {
  const el = document.getElementById('channels-list');
  if (!channels.length) {
    el.innerHTML = \`<div style="text-align:center;color:var(--text3);padding:60px 20px;font-size:13px;">
      No channels registered. Install a channel plugin (e.g. Discord) to get started.
    </div>\`;
    return;
  }
  el.innerHTML = '';
  for (const c of channels) {
    const statusColor = c.enabled ? '#22c55e' : '#fbbf24';
    const statusLabel = c.enabled ? 'active' : 'inactive';
    const d = document.createElement('div');
    d.style.cssText = 'background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;';
    d.innerHTML = \`
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-weight:600;font-size:13px;">\${escHtml(c.id)}</span>
          <span style="font-size:11px;background:rgba(255,255,255,0.06);border:1px solid var(--border);padding:1px 7px;border-radius:10px;">\${escHtml(c.protocol)}</span>
          <span style="font-size:11px;padding:1px 7px;border-radius:10px;background:rgba(255,255,255,0.04);color:\${statusColor};">⬤ \${statusLabel}</span>
        </div>
        <div style="margin-top:4px;font-size:11px;color:var(--text3);">Agent: <strong>\${escHtml(c.agentId)}</strong></div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        \${c.enabled
          ? \`<button class="btn btn-ghost" style="font-size:11px;color:#f87171;" onclick="stopChannel(\${escHtml(JSON.stringify(c.id))})">Stop</button>\`
          : \`<button class="btn btn-ghost" style="font-size:11px;color:#22c55e;" onclick="startChannel(\${escHtml(JSON.stringify(c.id))})">Start</button>\`}
      </div>
    \`;
    el.appendChild(d);
  }
}

async function startChannel(id) {
  const res = await fetch(BASE + '/api/channels/' + encodeURIComponent(id) + '/start', { method: 'POST' });
  if (!res.ok) { const d = await res.json(); showToast(d.error || 'Failed to start channel', 'error'); return; }
  loadChannels();
}

async function stopChannel(id) {
  const res = await fetch(BASE + '/api/channels/' + encodeURIComponent(id) + '/stop', { method: 'POST' });
  if (!res.ok) { const d = await res.json(); showToast(d.error || 'Failed to stop channel', 'error'); return; }
  loadChannels();
}

// ── Skills ──────────────────────────────────────────────────
let skillFilter = 'all';
let skillTagFilter = null;
let allSkills = [];
let skillView = 'card';
let skillSearchQuery = '';
let skillSortField = 'name';
let selectedSkills = new Set();
let editingSkills = new Set();

function setSkillFilter(filter) {
  skillFilter = filter;
  document.querySelectorAll('.skill-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === filter));
  loadSkills();
}

function setSkillTagFilter(tag) {
  skillTagFilter = skillTagFilter === tag ? null : tag;
  document.querySelectorAll('.skill-tag-btn').forEach(t => t.classList.toggle('active', t.dataset.tag === skillTagFilter));
  renderSkillsList();
}

function setSkillView(view) {
  skillView = view;
  document.getElementById('view-btn-card').classList.toggle('active', view === 'card');
  document.getElementById('view-btn-list').classList.toggle('active', view === 'list');
  renderSkillsList();
}

function skillSearch(query) {
  skillSearchQuery = query.trim().toLowerCase();
  renderSkillsList();
}

function skillSort() {
  skillSortField = document.getElementById('skill-sort').value;
  renderSkillsList();
}

function toggleSkillSelect(name) {
  if (selectedSkills.has(name)) {
    selectedSkills.delete(name);
  } else {
    selectedSkills.add(name);
  }
  updateSkillBulkBar();
  renderSkillsList();
}

function skillSelectAll() {
  const filtered = getFilteredAndSortedSkills();
  if (selectedSkills.size === filtered.length) {
    selectedSkills.clear();
  } else {
    filtered.forEach(s => selectedSkills.add(s.name));
  }
  updateSkillBulkBar();
  renderSkillsList();
}

function skillSelectNone() {
  selectedSkills.clear();
  updateSkillBulkBar();
  renderSkillsList();
}

async function skillBulkDelete() {
  if (selectedSkills.size === 0) return;
  const names = Array.from(selectedSkills).join(', ');
  const ok = await confirmAction('Bulk Delete', 'Delete ' + selectedSkills.size + ' skill(s): ' + names + '?', 'Delete All');
  if (!ok) return;
  let deleted = 0;
  for (const name of selectedSkills) {
    try {
      const r = await fetch(BASE + '/api/skills?name=' + encodeURIComponent(name), { method: 'DELETE' });
      if (r.ok) deleted++;
    } catch(e) { /* continue */ }
  }
  selectedSkills.clear();
  updateSkillBulkBar();
  toast('Deleted ' + deleted + ' skill(s)', deleted > 0 ? 'success' : 'error');
  loadSkills();
}

function updateSkillBulkBar() {
  const bar = document.getElementById('skill-bulk-bar');
  const count = document.getElementById('skill-bulk-count');
  if (selectedSkills.size > 0) {
    bar.classList.add('visible');
    count.textContent = selectedSkills.size + ' selected';
  } else {
    bar.classList.remove('visible');
  }
}

async function duplicateSkill(name) {
  try {
    const r = await fetch(BASE + '/api/skills/detail?name=' + encodeURIComponent(name));
    if (!r.ok) { alert('Failed to load skill'); return; }
    const s = await r.json();
    const newName = name + '-copy';
    const body = {
      name: newName,
      description: s.description,
      triggerPattern: s.trigger_pattern,
      content: s.content,
      steps: (() => { try { return JSON.parse(s.steps || '[]'); } catch(e) { return []; } })(),
    };
    let metadata;
    try { metadata = s.metadata && typeof s.metadata === 'string' ? JSON.parse(s.metadata) : (s.metadata || null); } catch(e) { metadata = null; }
    if (metadata) body.metadata = metadata;
    const r2 = await fetch(BASE + '/api/skills', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    });
    if (r2.ok) {
      toast('Duplicated as "' + newName + '"', 'success');
      loadSkills();
    } else {
      const d = await r2.json().catch(() => ({}));
      alert('Duplicate failed: ' + (d.error || 'Unknown error'));
    }
  } catch(e) { alert('Failed: ' + e.message); }
}

function enterInlineEdit(name) {
  editingSkills.add(name);
  renderSkillsList();
}

function cancelInlineEdit(name) {
  editingSkills.delete(name);
  renderSkillsList();
}

async function saveInlineEdit(name, card) {
  const descInput = card.querySelector('[data-iedit="desc"]');
  const trigInput = card.querySelector('[data-iedit="trigger"]');
  const contentArea = card.querySelector('[data-iedit="content"]');
  const tagsInput = card.querySelector('[data-iedit="tags"]');
  const diffInput = card.querySelector('[data-iedit="difficulty"]');
  
  // Find original skill data
  const skill = allSkills.find(s => s.name === name);
  let metadata = {};
  try { metadata = skill.metadata && typeof skill.metadata === 'string' ? JSON.parse(skill.metadata) : (skill.metadata || {}); } catch(e) {}

  const body = {
    name: name,
    description: descInput ? descInput.value.trim() || undefined : undefined,
    triggerPattern: trigInput ? trigInput.value.trim() || undefined : undefined,
    content: contentArea ? contentArea.value || undefined : undefined,
  };

  if (tagsInput || diffInput) {
    const tags = tagsInput ? tagsInput.value.split(',').map(t => t.trim()).filter(t => t) : metadata.tags || [];
    const diff = diffInput ? diffInput.value.trim() : metadata.difficulty || '';
    body.metadata = {
      tags: tags,
      difficulty: diff || undefined,
      examples: metadata.examples || [],
      prerequisites: metadata.prerequisites || [],
    };
  }

  const res = await fetch(BASE + '/api/skills', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (res.ok) {
    editingSkills.delete(name);
    toast('Skill updated', 'success');
    loadSkills();
  } else {
    const data = await res.json().catch(() => ({}));
    alert('Save failed: ' + (data.error || 'Unknown error'));
  }
}

function getFilteredAndSortedSkills() {
  let filtered = allSkills.filter(s => {
    if (skillTagFilter) {
      let metadata = {};
      try { metadata = s.metadata && typeof s.metadata === 'string' ? JSON.parse(s.metadata) : (s.metadata ?? {}); } catch(e) {}
      const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
      if (!tags.includes(skillTagFilter)) return false;
    }
    if (skillSearchQuery) {
      const searchIn = [
        s.name,
        s.description || '',
        s.trigger_pattern || '',
        s.content || '',
      ].join(' ').toLowerCase();
      if (!searchIn.includes(skillSearchQuery)) return false;
    }
    return true;
  });

  // Sort
  switch (skillSortField) {
    case 'rate':
      filtered.sort((a, b) => (b.success_rate ?? 0) - (a.success_rate ?? 0));
      break;
    case 'uses':
      filtered.sort((a, b) => (b.invocation_count ?? 0) - (a.invocation_count ?? 0));
      break;
    case 'date':
      filtered.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      break;
    default:
      filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  return filtered;
}

function renderSkillCard(s) {
  const rate = Math.round((s.success_rate ?? 0) * 100);
  const rateColor = rate >= 80 ? '#4ade80' : rate >= 50 ? '#fbbf24' : '#f87171';
  const isHuman = s.origin === 'human';
  const isEditing = editingSkills.has(s.name);
  const isSelected = selectedSkills.has(s.name);
  const originBadge = isHuman
    ? '<span style="font-size:10px;background:rgba(16,185,129,0.15);color:#10b981;padding:1px 6px;border-radius:3px;">✍️ human</span>'
    : '<span style="font-size:10px;background:rgba(99,102,241,0.15);color:var(--accent2);padding:1px 6px;border-radius:3px;">🧠 learned</span>';

  let steps = [];
  try { steps = JSON.parse(s.steps || '[]'); } catch(e) {}
  let metadata = {};
  try { metadata = s.metadata && typeof s.metadata === 'string' ? JSON.parse(s.metadata) : (s.metadata ?? {}); } catch(e) {}
  const tags = (Array.isArray(metadata.tags) ? metadata.tags : []);
  const difficulty = typeof metadata.difficulty === 'string' ? metadata.difficulty : '';
  const examplesLen = Array.isArray(metadata.examples) ? metadata.examples.length : 0;
  const contentPreview = s.content ? s.content.slice(0, 120) : '';
  const descPreview = (s.description ?? '').slice(0, 100);

  if (isEditing) {
    // ── Inline Edit Mode ──
    return '<div class="card" style="border-color:var(--accent);background:rgba(6,182,212,0.04);">' +
      '<div style="display:flex;flex-direction:column;gap:10px;">' +
        // Name (read-only for inline edits - use designer for rename)
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="font-size:13px;font-weight:600;font-family:JetBrains Mono,monospace;">' + esc(s.name) + '</span>' +
          originBadge +
          '<span style="font-size:10px;color:var(--accent2);margin-left:auto;">Editing...</span>' +
        '</div>' +
        // Description
        '<div>' +
          '<label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px;">Description</label>' +
          '<input class="skill-inline-input" data-iedit="desc" value="' + escAttr(s.description || '') + '" placeholder="What this skill does" />' +
        '</div>' +
        // Trigger
        '<div>' +
          '<label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px;">Trigger Pattern</label>' +
          '<input class="skill-inline-input" data-iedit="trigger" value="' + escAttr(s.trigger_pattern || '') + '" placeholder="Phrase that triggers this skill" />' +
        '</div>' +
        // Content
        '<div>' +
          '<label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px;">Content / Instructions (Markdown)</label>' +
          '<textarea class="skill-inline-textarea" data-iedit="content" style="min-height:100px;">' + esc(s.content || '') + '</textarea>' +
        '</div>' +
        // Tags + Difficulty
        '<div style="display:flex;gap:8px;">' +
          '<div style="flex:1;">' +
            '<label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px;">Tags (comma-separated)</label>' +
            '<input class="skill-inline-input small" data-iedit="tags" value="' + escAttr(tags.join(', ')) + '" placeholder="design, frontend" />' +
          '</div>' +
          '<div style="flex:1;">' +
            '<label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px;">Difficulty</label>' +
            '<input class="skill-inline-input small" data-iedit="difficulty" value="' + escAttr(difficulty) + '" placeholder="intermediate" />' +
          '</div>' +
        '</div>' +
        // Action buttons
        '<div style="display:flex;gap:6px;align-items:center;border-top:1px solid var(--border);padding-top:10px;">' +
          '<button class="btn btn-primary" onclick="saveInlineEdit(\\'' + esc(s.name) + '\\', this.parentElement.parentElement.parentElement)" style="font-size:11px;">💾 Save</button>' +
          '<button class="btn btn-ghost" onclick="cancelInlineEdit(\\'' + esc(s.name) + '\\')" style="font-size:11px;">Cancel</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ── Normal Card View ──
  const descTrunc = (s.description ?? '').slice(0, 80);
  const needsExpand = (s.description ?? '').length > 80 || steps.length > 0 || s.content || tags.length > 0 || examplesLen > 0;

  let html = '<div class="card' + (isSelected ? ' selected' : '') + '" style="cursor:pointer;position:relative;transition:all 0.2s ease;">' +
    // Checkbox (top-left)
    '<div style="position:absolute;top:10px;left:10px;z-index:2;" onclick="event.stopPropagation();">' +
      '<input type="checkbox" class="skill-check" id="sk-check-' + escAttr(s.name) + '" ' + (isSelected ? 'checked' : '') + ' onchange="toggleSkillSelect(\\'' + esc(s.name) + '\\')" />' +
      '<label class="skill-check-label" for="sk-check-' + escAttr(s.name) + '"></label>' +
    '</div>' +
    // Main content with left padding for checkbox
    '<div onclick="toggleSkillDetail(this.parentElement)" style="padding-left:24px;">' +
      // Header row
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:4px;">' +
        '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">' +
          '<span style="font-size:15px;font-weight:600;color:var(--text);font-family:JetBrains Mono,monospace;">' + esc(s.name) + '</span>' +
          originBadge +
          (difficulty ? '<span style="font-size:9px;padding:2px 6px;border-radius:3px;background:rgba(168,85,247,0.15);color:#a855f7;">' + esc(difficulty) + '</span>' : '') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:10px;" onclick="event.stopPropagation();">' +
          '<div style="text-align:right;">' +
            '<div style="font-size:14px;font-weight:600;color:' + rateColor + ';">' + rate + '%</div>' +
            '<div style="font-size:10px;color:var(--text3);">v' + (s.version ?? 1) + ' · ' + (s.invocation_count ?? 0) + ' uses</div>' +
          '</div>' +
          (isHuman ? '<button class="btn btn-ghost" style="font-size:11px;padding:4px 6px;" title="Duplicate" onclick="duplicateSkill(\\'' + esc(s.name) + '\\')">⧉</button>' : '') +
          (isHuman ? '<button class="btn btn-ghost" style="font-size:11px;padding:4px 6px;" title="Quick edit" onclick="enterInlineEdit(\\'' + esc(s.name) + '\\')">✏️</button>' : '') +
          (isHuman ? '<button class="btn btn-ghost" style="font-size:11px;padding:4px 6px;" title="Open designer" onclick="openSkillDesigner(\\'' + esc(s.name) + '\\')">⚙️</button>' : '') +
          '<button class="btn btn-ghost" style="font-size:11px;padding:4px 6px;margin-left:2px;" onclick="deleteSkill(\\'' + esc(s.name) + '\\')">✕</button>' +
        '</div>' +
      '</div>' +
      // Description + content preview
      '<p style="font-size:12px;color:var(--text2);margin:0 0 6px 0;line-height:1.4;">' + esc(descTrunc) + ((s.description ?? '').length > 80 ? '…' : '') + '</p>' +
      // Content snippet
      (contentPreview && !descPreview ? '<div style="font-size:10px;color:var(--text3);margin-bottom:6px;font-family:JetBrains Mono,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(contentPreview) + (s.content && s.content.length > 120 ? '…' : '') + '</div>' : '') +
      // Tags
      (tags.length > 0 ? '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">' +
        tags.slice(0, 5).map(tag => '<span style="font-size:9px;padding:2px 6px;border-radius:3px;background:rgba(59,130,246,0.1);color:var(--accent2);">' + esc(tag) + '</span>').join('') +
        (tags.length > 5 ? '<span style="font-size:9px;padding:2px 6px;border-radius:3px;color:var(--text3);">+' + (tags.length - 5) + '</span>' : '') +
      '</div>' : '') +
      // Steps badges or trigger
      (steps.length > 0
        ? '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px;">' +
            steps.slice(0, 4).map(function(step, i) {
              return '<span class="badge" style="background:rgba(99,102,241,0.15);color:var(--accent2);font-size:10px;padding:2px 6px;border-radius:3px;">' + (i+1) + '. ' + esc(String(step.action ?? step.description ?? '').slice(0, 28)) + '</span>';
            }).join('') +
            (steps.length > 4 ? '<span class="badge" style="background:rgba(99,102,241,0.08);color:var(--text3);font-size:10px;padding:2px 6px;border-radius:3px;">+' + (steps.length - 4) + ' steps</span>' : '') +
          '</div>'
        : '') +
      (s.trigger_pattern && !steps.length ? '<div style="font-size:10px;color:var(--text3);margin-bottom:6px;">Trigger: <span style="color:var(--accent2);font-family:JetBrains Mono,monospace;">' + esc(s.trigger_pattern.slice(0, 60)) + '</span></div>' : '') +
      // Expandable indicator
      (needsExpand ? '<div style="display:flex;align-items:center;gap:4px;color:var(--text3);font-size:11px;padding-top:4px;border-top:1px solid var(--border);">' +
        '<span class="skill-expand-chevron" style="display:inline-block;width:12px;height:12px;transition:transform 0.2s;">▶</span>' +
        '<span>View details</span>' +
      '</div>' : '') +
      // Expandable detail section
      (needsExpand ? '<div class="skill-detail" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">' +
        (s.source_session ? '<div style="font-size:10px;color:var(--text3);margin-bottom:6px;">Source: <span style="color:var(--text2);font-family:JetBrains Mono,monospace;">' + esc(s.source_session.slice(-12)) + '</span></div>' : '') +
        '<div style="font-size:10px;color:var(--text3);margin-bottom:6px;">Created: <span style="color:var(--text2);">' + new Date(s.created_at).toLocaleString() + '</span></div>' +
        (Array.isArray(metadata.prerequisites) && metadata.prerequisites.length > 0 ? '<div style="font-size:10px;color:var(--text3);margin-bottom:4px;">Prerequisites: <span style="color:var(--text2);">' + esc(metadata.prerequisites.join(', ')) + '</span></div>' : '') +
        (Array.isArray(metadata.examples) && metadata.examples.length > 0 ? '<div style="font-size:10px;color:var(--text3);margin-bottom:4px;font-weight:500;">Examples:</div>' +
          metadata.examples.slice(0, 3).map(function(ex) {
            return '<div style="font-size:10px;color:var(--text2);padding:2px 0;margin-left:12px;">• ' + esc(ex.slice(0, 80)) + '</div>';
          }).join('') : '') +
        (isHuman ? '<button class="btn btn-ghost" style="font-size:10px;padding:4px 8px;margin-bottom:6px;" onclick="event.stopPropagation();openSkillDesigner(\\'' + esc(s.name) + '\\')">⚙️ Open Designer</button>' : '') +
        (s.content ? '<div style="margin-top:6px;font-size:10px;color:var(--text2);white-space:pre-wrap;max-height:150px;overflow-y:auto;background:var(--bg2);padding:8px;border-radius:4px;border:1px solid var(--border);">' + esc(s.content.slice(0, 1500)) + '</div>' : '') +
        (steps.length > 0 ? '<div style="margin-top:6px;"><div style="font-size:10px;color:var(--text3);margin-bottom:4px;font-weight:500;">All steps:</div>' +
          steps.map(function(step, i) {
            return '<div style="font-size:10px;color:var(--text2);padding:3px 0;line-height:1.4;">' + (i+1) + '. ' + esc(String(step.action ?? step.description ?? '').slice(0, 100)) + (step.tool ? ' <span style="color:var(--accent2);font-size:9px;">[' + esc(step.tool) + ']</span>' : '') + '</div>';
          }).join('') + '</div>' : '') +
      '</div>' : '') +
    '</div>' +
  '</div>';

  return html;
}

function renderSkillListItem(s) {
  const rate = Math.round((s.success_rate ?? 0) * 100);
  const rateColor = rate >= 80 ? '#4ade80' : rate >= 50 ? '#fbbf24' : '#f87171';
  const isHuman = s.origin === 'human';
  const isSelected = selectedSkills.has(s.name);
  const isEditing = editingSkills.has(s.name);
  const originBadge = isHuman
    ? '<span style="font-size:9px;background:rgba(16,185,129,0.15);color:#10b981;padding:1px 4px;border-radius:2px;">✍️</span>'
    : '<span style="font-size:9px;background:rgba(99,102,241,0.15);color:var(--accent2);padding:1px 4px;border-radius:2px;">🧠</span>';

  let metadata = {};
  try { metadata = s.metadata && typeof s.metadata === 'string' ? JSON.parse(s.metadata) : (s.metadata ?? {}); } catch(e) {}
  const tags = (Array.isArray(metadata.tags) ? metadata.tags : []);

  let html = '<div class="skill-list-item' + (isSelected ? ' selected' : '') + '" onclick="toggleSkillSelect(\\'' + esc(s.name) + '\\')">' +
    '<label class="skill-check-label" onclick="event.stopPropagation();">' +
      '<input type="checkbox" class="skill-check" ' + (isSelected ? 'checked' : '') + ' onchange="toggleSkillSelect(\\'' + esc(s.name) + '\\')" />' +
    '</label>' +
    '<div style="flex:1;min-width:0;">' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
        '<span style="font-size:13px;font-weight:600;font-family:JetBrains Mono,monospace;">' + esc(s.name) + '</span>' +
        originBadge +
        '<span style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc((s.description || '').slice(0, 60)) + '</span>' +
      '</div>' +
      (tags.length > 0 ? '<div style="display:flex;gap:3px;margin-top:3px;flex-wrap:wrap;">' + tags.slice(0, 3).map(t => '<span style="font-size:8px;padding:1px 4px;border-radius:2px;background:rgba(59,130,246,0.1);color:var(--accent2);">' + esc(t) + '</span>').join('') + '</div>' : '') +
    '</div>' +
    '<div style="text-align:right;font-size:12px;font-weight:600;color:' + rateColor + ';min-width:36px;">' + rate + '%</div>' +
    '<div style="font-size:10px;color:var(--text3);min-width:50px;text-align:right;">v' + (s.version ?? 1) + ' · ' + (s.invocation_count ?? 0) + '</div>' +
    '<div style="display:flex;gap:2px;" onclick="event.stopPropagation();">' +
      (isHuman ? '<button class="btn btn-ghost" style="font-size:10px;padding:2px 5px;" title="Edit" onclick="enterInlineEdit(\\'' + esc(s.name) + '\\')">✏️</button>' : '') +
      (isHuman ? '<button class="btn btn-ghost" style="font-size:10px;padding:2px 5px;" title="Open designer" onclick="openSkillDesigner(\\'' + esc(s.name) + '\\')">⚙️</button>' : '') +
      '<button class="btn btn-ghost" style="font-size:10px;padding:2px 5px;" title="Delete" onclick="deleteSkill(\\'' + esc(s.name) + '\\')">✕</button>' +
    '</div>' +
  '</div>';
  return html;
}

async function loadSkills() {
  const url = skillFilter === 'all' ? (BASE + '/api/skills') : (BASE + '/api/skills?origin=' + skillFilter);
  const [skills, stats] = await Promise.all([
    fetch(url).then(r => r.json()).catch(() => []),
    fetch(BASE + '/api/skills/stats').then(r => r.json()).catch(() => ({ total: 0, human: 0, llm: 0, avgSuccessRate: 0 })),
  ]);
  allSkills = skills;

  // Stats bar
  const statsEl = document.getElementById('skills-stats');
  const avgPct = Math.round((stats.avgSuccessRate ?? 0) * 100);
  statsEl.innerHTML = '<span>Total: <b>' + stats.total + '</b></span>' +
    '<span>✍️ Human: <b>' + stats.human + '</b></span>' +
    '<span>🧠 Learned: <b>' + stats.llm + '</b></span>' +
    (stats.total > 0 ? '<span>Avg success: <b>' + avgPct + '%</b></span>' : '');

  // Collect all unique tags for filter
  const allTags = new Set();
  for (const s of skills) {
    let metadata = {};
    try { metadata = s.metadata && typeof s.metadata === 'string' ? JSON.parse(s.metadata) : (s.metadata ?? {}); } catch(e) {}
    const tags = (Array.isArray(metadata.tags) ? metadata.tags : []);
    tags.forEach(t => allTags.add(t));
  }

  // Render tag filters
  const tagsContainer = document.getElementById('skills-tag-filters') || (() => {
    const div = document.createElement('div');
    div.id = 'skills-tag-filters';
    div.style.display = 'flex';
    div.style.flexWrap = 'wrap';
    div.style.gap = '6px';
    div.style.marginTop = '8px';
    const tabsEl = document.getElementById('skills-tabs');
    tabsEl.parentElement.insertBefore(div, tabsEl.nextSibling);
    return div;
  })();
  
  tagsContainer.innerHTML = Array.from(allTags).sort().map(tag => 
    '<button class="skill-tag-btn' + (skillTagFilter === tag ? ' active' : '') + '" ' +
    'data-tag="' + esc(tag) + '" ' +
    'onclick="setSkillTagFilter(\\'' + esc(tag) + '\\')" ' +
    'style="font-size:10px;padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:' + (skillTagFilter === tag ? 'var(--accent2)' : 'transparent') + ';color:' + (skillTagFilter === tag ? 'var(--bg)' : 'var(--text3)') + ';cursor:pointer;transition:all 0.2s;">' + esc(tag) + '</button>'
  ).join('');

  updateSkillBulkBar();
  renderSkillsList();
}

function renderSkillsList() {
  const el = document.getElementById('skills-list');
  const filtered = getFilteredAndSortedSkills();

  if (!allSkills.length) {
    el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;">' +
      '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' +
      '<p style="color:var(--text3);font-size:13px;">No skills yet.</p>' +
      '<p style="color:var(--text3);font-size:11px;margin-top:4px;">Skills come from two sources: <b>human-authored</b> (.cortex/skills/*/SKILL.md files) and <b>learned</b> (extracted automatically from agent sessions).</p>' +
      '<p style="color:var(--text3);font-size:11px;margin-top:2px;">Use the "Load .cortex/skills" button above to import human-authored skills, or run sessions to generate learned skills.</p>' +
      '</div>';
    return;
  }

  if (!filtered.length) {
    el.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--text3);font-size:13px;">No skills match your current filters.</div>';
    return;
  }

  el.innerHTML = '';
  for (const s of filtered) {
    const d = document.createElement('div');
    if (skillView === 'list') {
      d.innerHTML = renderSkillListItem(s);
    } else {
      d.innerHTML = renderSkillCard(s);
    }
    el.appendChild(d);
  }

  // Add select-all row in list view
  if (skillView === 'list') {
    const selectAllDiv = document.createElement('div');
    selectAllDiv.className = 'skill-list-item';
    selectAllDiv.style.background = 'transparent';
    selectAllDiv.style.borderColor = 'transparent';
    selectAllDiv.style.cursor = 'pointer';
    selectAllDiv.innerHTML = '<label class="skill-check-label">' +
      '<input type="checkbox" class="skill-check" ' + (selectedSkills.size === filtered.length && filtered.length > 0 ? 'checked' : '') + ' onchange="skillSelectAll()" />' +
      '</label>' +
      '<span style="font-size:10px;color:var(--text3);">' + (selectedSkills.size === filtered.length && filtered.length > 0 ? 'Deselect all' : 'Select all') + ' (' + filtered.length + ')</span>';
    el.insertBefore(selectAllDiv, el.firstChild);
  }
}

async function loadHumanSkills() {
  try {
    const r = await fetch(BASE + '/api/skills/load-human', { method: 'POST' }).then(r => r.json());
    toast('Loaded ' + (r.loaded ?? 0) + ' skill(s) from .cortex/skills/', 'success');
    loadSkills();
  } catch(e) { alert('Failed: ' + e.message); }
}

function showSkillModal(editName) {
  document.getElementById('sk-status').textContent = '';
  document.getElementById('sk-edit-name').value = '';
  if (editName) {
    document.getElementById('skill-modal-title').textContent = 'Edit Skill';
    document.getElementById('skill-submit-btn').textContent = 'Save Changes';
    document.getElementById('sk-edit-name').value = editName;
    fetch(BASE + '/api/skills/detail?name=' + encodeURIComponent(editName))
      .then(r => r.json()).then(s => {
        document.getElementById('sk-name').value = s.name || '';
        document.getElementById('sk-desc').value = s.description || '';
        document.getElementById('sk-trigger').value = s.trigger_pattern || '';
        document.getElementById('sk-content').value = s.content || '';
        document.getElementById('skill-modal').style.display = 'flex';
      }).catch(e => alert('Failed to load skill: ' + e.message));
  } else {
    document.getElementById('skill-modal-title').textContent = 'Create Skill';
    document.getElementById('skill-submit-btn').textContent = 'Create Skill';
    document.getElementById('sk-name').value = '';
    document.getElementById('sk-desc').value = '';
    document.getElementById('sk-trigger').value = '';
    document.getElementById('sk-content').value = '';
    document.getElementById('skill-modal').style.display = 'flex';
  }
}

function hideSkillModal() {
  document.getElementById('skill-modal').style.display = 'none';
}

async function submitSkillForm() {
  const name = document.getElementById('sk-name').value.trim();
  if (!name) { document.getElementById('sk-status').textContent = 'Name is required.'; return; }
  const editName = document.getElementById('sk-edit-name').value;
  const body = {
    name,
    description: document.getElementById('sk-desc').value.trim() || undefined,
    triggerPattern: document.getElementById('sk-trigger').value.trim() || undefined,
    content: document.getElementById('sk-content').value || undefined,
  };
  const res = await fetch(BASE + '/api/skills', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (res.ok) {
    hideSkillModal();
    toast(editName ? 'Skill updated' : 'Skill created', 'success');
    loadSkills();
  } else {
    const data = await res.json().catch(() => ({}));
    document.getElementById('sk-status').textContent = data.error || 'Save failed.';
  }
}

async function deleteSkill(name) {
  const ok = await confirmAction('Delete Skill', 'Delete skill "' + name + '"?', 'Delete');
  if (!ok) return;
  fetch(BASE + '/api/skills?name=' + encodeURIComponent(name), { method: 'DELETE' })
    .then(r => r.json()).then(() => loadSkills()).catch(e => alert('Failed: ' + e.message));
}

function toggleSkillDetail(card) {
  const detailEl = card.querySelector('.skill-detail');
  const chevron = card.querySelector('.skill-expand-chevron');
  if (detailEl) {
    const isHidden = detailEl.style.display === 'none';
    detailEl.style.display = isHidden ? 'block' : 'none';
    if (chevron) {
      chevron.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
    }
    card.style.background = isHidden ? 'var(--bg2)' : 'var(--bg3)';
  }
}

// ── Policies ────────────────────────────────────────────────
async function loadPolicies() {
  const policies = await fetch(BASE + '/api/policies').then(r => r.json()).catch(() => []);
  const el = document.getElementById('policies-list');
  if (!policies.length) { el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><p style="color:var(--text3);font-size:13px;">No security policies configured.</p><p style="color:var(--text3);font-size:11px;margin-top:4px;">Default deny rules are always active. Use the CLI to add custom policies.</p></div>'; return; }

  el.innerHTML = '';
  for (const p of policies) {
    const isAllow = p.effect === 'allow';
    const d = document.createElement('div');
    d.className = 'card-sm';
    d.style.display = 'flex';
    d.style.alignItems = 'center';
    d.style.gap = '12px';
    d.innerHTML = \`
      <span class="badge" style="min-width:52px;justify-content:center;background:\${isAllow ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'};color:\${isAllow ? '#4ade80' : '#f87171'};">\${p.effect}</span>
      <span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text2);min-width:80px;justify-content:center;">\${p.kind}</span>
      <code style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent2);flex:1;">\${esc(p.pattern)}</code>
      <span style="font-size:11px;color:var(--text3);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">\${esc(p.reason ?? '')}</span>
      <span class="badge" style="background:rgba(255,255,255,0.04);color:var(--text3);">p\${p.priority}</span>
    \`;
    el.appendChild(d);
  }
}

// ── Utils ───────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escAttr(s) { return esc(s); }

// ── Status page ──────────────────────────────────────────────
async function loadStatus() {
  const el = document.getElementById('status-content');
  if (!el) return;
  // Update timestamp
  const tsEl = document.getElementById('status-timestamp');
  if (tsEl) {
    const now = new Date();
    tsEl.textContent = now.toLocaleString('en-US', { 
      weekday: 'short', month: 'short', day: 'numeric', 
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false 
    }).toUpperCase();
  }
  // Version will be set after fetch
  // Skeleton
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">' +
    Array(4).fill('<div class="skeleton skeleton-card"></div>').join('') + '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
    Array(2).fill('<div class="skeleton" style="height:200px;border-radius:10px;"></div>').join('') + '</div>';
  try {
    const st = await fetch(BASE + '/api/system').then(r => r.json());
    if (!el || st.error) return;

    // Update version in header
    const verEl = document.getElementById('status-version');
    if (verEl && st.version) verEl.textContent = 'v' + st.version;

    const fmt = (b) => b >= 1e9 ? (b/1e9).toFixed(1)+'GB' : b >= 1e6 ? (b/1e6).toFixed(0)+'MB' : b+'B';
    const pct = (u,t) => t > 0 ? Math.round(u/t*100) : 0;
    const mem = st.memory || { total: 0, used: 0, free: 0 };
    const disk = st.disk || { total: 0, used: 0, free: 0 };
    const memPct = pct(mem.used, mem.total);
    const diskPct = pct(disk.used, disk.total);
    const upH = Math.floor((st.uptime||0)/3600), upM = Math.floor(((st.uptime||0)%3600)/60);

    const daemonIcon = (name) => {
      const svgs = {
        validator: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        executor: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
        scheduler: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      };
      return svgs[name] || '';
    };
    const daemons = [
      {key:'validator',label:'Validator'},
      {key:'executor',label:'Executor'},
      {key:'scheduler',label:'Scheduler'},
    ];

    el.innerHTML = \`
      <!-- KPI Cards -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px;">
        <!-- Active Sessions -->
        <div class="card" style="padding:16px;position:relative;overflow:hidden;">
          <div style="position:absolute;top:12px;right:12px;font-size:24px;opacity:0.15;">⚡</div>
          <div style="font-size:10px;font-weight:600;color:var(--text3);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">ACTIVE SESSIONS</div>
          <div style="display:flex;align-items:baseline;gap:6px;">
            <div style="font-size:32px;font-weight:700;color:var(--accent2);font-family:JetBrains Mono,monospace;line-height:1;">\${st.activeSessions}</div>
            <div style="font-size:11px;color:#10b981;">+12% vs yesterday</div>
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--text3);font-family:JetBrains Mono,monospace;">across all agents</div>
        </div>
        
        <!-- Uptime -->
        <div class="card" style="padding:16px;position:relative;overflow:hidden;">
          <div style="position:absolute;top:12px;right:12px;font-size:24px;opacity:0.15;">⏱</div>
          <div style="font-size:10px;font-weight:600;color:var(--text3);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">SERVER UPTIME</div>
          <div style="display:flex;align-items:baseline;gap:6px;">
            <div style="font-size:32px;font-weight:700;color:#22d3ee;font-family:JetBrains Mono,monospace;line-height:1;">\${upH}h \${upM}m</div>
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--text3);font-family:JetBrains Mono,monospace;">99.8% reliability</div>
        </div>

        <!-- LLM Status -->
        <div class="card" style="padding:16px;position:relative;overflow:hidden;">
          <div style="position:absolute;top:12px;right:12px;font-size:24px;opacity:0.15;">🧠</div>
          <div style="font-size:10px;font-weight:600;color:var(--text3);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">LLM PROVIDER</div>
          <div style="display:flex;align-items:baseline;gap:6px;">
            <div style="font-size:16px;font-weight:700;color:#fbbf24;font-family:JetBrains Mono,monospace;line-height:1;">\${st.provider}</div>
            <div style="font-size:11px;color:#10b981;">● ONLINE</div>
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--text3);font-family:JetBrains Mono,monospace;">\${st.model}</div>
        </div>

        <!-- Version -->
        <div class="card" style="padding:16px;position:relative;overflow:hidden;">
          <div style="position:absolute;top:12px;right:12px;font-size:24px;opacity:0.15;">⬡</div>
          <div style="font-size:10px;font-weight:600;color:var(--text3);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">CORTEX BUILD</div>
          <div style="display:flex;align-items:baseline;gap:6px;">
            <div style="font-size:28px;font-weight:700;color:#4ade80;font-family:JetBrains Mono,monospace;line-height:1;">v\${st.version}</div>
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--text3);font-family:JetBrains Mono,monospace;">latest stable</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
        <!-- Daemons -->
        <div class="card" style="padding:18px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <div style="font-size:12px;font-weight:600;color:var(--text);letter-spacing:0.05em;text-transform:uppercase;">Process Daemons</div>
            <div style="font-size:10px;color:var(--text3);font-family:JetBrains Mono,monospace;">\${daemons.filter(d => st.daemons[d.key]).length}/\${daemons.length} ONLINE</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;">
          \${daemons.map(d => {
            const up = st.daemons[d.key];
            return \`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;">
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:8px;height:8px;border-radius:50%;background:\${up?'#10b981':'#ef4444'};box-shadow:0 0 8px \${up?'rgba(16,185,129,0.4)':'rgba(239,68,68,0.4)'}"></div>
                <span style="font-size:12px;font-weight:500;font-family:JetBrains Mono,monospace;color:var(--text);">\${d.label.toUpperCase()}</span>
              </div>
              <span style="font-size:10px;font-weight:600;letter-spacing:0.05em;color:\${up?'#10b981':'#ef4444'};">
                \${up ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>\`;
          }).join('')}
          </div>
          \${daemons.some(d => !st.daemons[d.key])
            ? '<div style="margin-top:12px;padding:10px 12px;background:rgba(245,158,11,0.1);border-left:3px solid #f59e0b;border-radius:4px;font-size:11px;color:#fbbf24;font-family:JetBrains Mono,monospace;">⚠ WARNING: Some daemons offline</div>'
            : '<div style="margin-top:12px;padding:10px 12px;background:rgba(16,185,129,0.1);border-left:3px solid #10b981;border-radius:4px;font-size:11px;color:#10b981;font-family:JetBrains Mono,monospace;">✓ ALL SYSTEMS OPERATIONAL</div>'}
        </div>

        <!-- Resources -->
        <div class="card" style="padding:18px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <div style="font-size:12px;font-weight:600;color:var(--text);letter-spacing:0.05em;text-transform:uppercase;">System Resources</div>
          </div>
          \${mem.total > 0 ? \`
          <div style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
              <span style="font-size:11px;font-weight:600;color:var(--text2);font-family:JetBrains Mono,monospace;">MEMORY</span>
              <span style="font-size:11px;color:var(--text3);font-family:JetBrains Mono,monospace;">\${fmt(mem.used)} / \${fmt(mem.total)} (\${memPct}%)</span>
            </div>
            <div style="height:8px;background:var(--bg2);border-radius:4px;overflow:hidden;border:1px solid var(--border);">
              <div style="height:100%;width:\${memPct}%;background:\${memPct>85?'#ef4444':memPct>60?'#f59e0b':'#06b6d4'};transition:width 0.5s;box-shadow:0 0 8px \${memPct>85?'rgba(239,68,68,0.3)':memPct>60?'rgba(245,158,11,0.3)':'rgba(6,182,212,0.3)'};"></div>
            </div>
          </div>
          <div style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
              <span style="font-size:11px;font-weight:600;color:var(--text2);font-family:JetBrains Mono,monospace;">DISK (HOME)</span>
              <span style="font-size:11px;color:var(--text3);font-family:JetBrains Mono,monospace;">\${fmt(disk.used)} / \${fmt(disk.total)} (\${diskPct}%)</span>
            </div>
            <div style="height:8px;background:var(--bg2);border-radius:4px;overflow:hidden;border:1px solid var(--border);">
              <div style="height:100%;width:\${diskPct}%;background:\${diskPct>85?'#ef4444':diskPct>60?'#f59e0b':'#06b6d4'};transition:width 0.5s;box-shadow:0 0 8px \${diskPct>85?'rgba(239,68,68,0.3)':diskPct>60?'rgba(245,158,11,0.3)':'rgba(6,182,212,0.3)'};"></div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div style="padding:10px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;">
              <div style="font-size:10px;color:var(--text3);margin-bottom:4px;font-family:JetBrains Mono,monospace;">CPU CORES</div>
              <div style="font-size:18px;font-weight:700;color:var(--accent2);font-family:JetBrains Mono,monospace;">\${st.cpuCores || 'N/A'}</div>
            </div>
            <div style="padding:10px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;">
              <div style="font-size:10px;color:var(--text3);margin-bottom:4px;font-family:JetBrains Mono,monospace;">PLATFORM</div>
              <div style="font-size:14px;font-weight:600;color:var(--accent2);font-family:JetBrains Mono,monospace;">\${st.platform || 'LINUX'}</div>
            </div>
          </div>
          \` : '<div style="padding:12px;background:rgba(239,68,68,0.1);border-left:3px solid #ef4444;border-radius:4px;font-size:11px;color:#f87171;font-family:JetBrains Mono,monospace;">⚠ Resource info unavailable</div>'}
        </div>
      </div>

      <!-- Activity Alerts / Recent Sessions -->
      <div class="card" style="padding:18px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <div style="font-size:12px;font-weight:600;color:var(--text);letter-spacing:0.05em;text-transform:uppercase;">System Activity</div>
          <div style="font-size:10px;color:var(--text3);font-family:JetBrains Mono,monospace;">LAST 24H</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          \${st.recentSessions && st.recentSessions.length > 0 ? st.recentSessions.slice(0,5).map(s => \`
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;cursor:pointer;transition:border-color 0.15s;" onclick="openSession('\${s.id}')">
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:6px;height:6px;border-radius:50%;background:\${s.status==='active'?'#10b981':'var(--text3)'}"></div>
                <div>
                  <div style="font-size:11px;font-family:JetBrains Mono,monospace;color:var(--accent2);">\${s.id.slice(-12).toUpperCase()}</div>
                  <div style="font-size:10px;color:var(--text3);margin-top:2px;">\${s.turn_count} turns · \${s.agent || 'default'}</div>
                </div>
              </div>
              <div style="font-size:10px;color:var(--text3);font-family:JetBrains Mono,monospace;">\${new Date(s.started_at).toLocaleTimeString('en-US', {hour:'2-digit',minute:'2-digit',hour12:false})}</div>
            </div>
          \`).join('') : '<div style="padding:20px;text-align:center;color:var(--text3);font-size:11px;font-family:JetBrains Mono,monospace;">No recent activity</div>'}
        </div>
    \`;
  } catch(e) {
    const el = document.getElementById('status-content');
    if (el) el.innerHTML = \`<p style="color:var(--text3);">Loading system info… (\${e.message})</p>\`;
  }
}

// ── Analytics ────────────────────────────────────────────────
let analyticsChart = null;

async function loadAnalytics(days) {
  days = days ?? Number(document.getElementById('analytics-days')?.value ?? 30);
  const data = await fetch(\`\${BASE}/api/analytics?days=\${days}\`).then(r => r.json()).catch(() => null);
  if (!data) return;

  const { daily, models, totals, perAgent } = data;

  // Summary cards
  document.getElementById('an-sessions').textContent = totals?.sessions ?? 0;
  document.getElementById('an-tokens-in').textContent = fmtNum(totals?.total_tokens_in ?? 0);
  document.getElementById('an-tokens-out').textContent = fmtNum(totals?.total_tokens_out ?? 0);
  document.getElementById('an-cost').textContent = '$' + Number(totals?.total_cost ?? 0).toFixed(4);

  // Chart
  const ctx = document.getElementById('tokens-chart');
  if (ctx && daily.length > 0) {
    if (analyticsChart) analyticsChart.destroy();
    analyticsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: daily.map(d => d.date),
        datasets: [
          { label: 'Tokens In', data: daily.map(d => d.tokens_in), backgroundColor: 'rgba(6,182,212,0.6)', stack: 'tokens' },
          { label: 'Tokens Out', data: daily.map(d => d.tokens_out), backgroundColor: 'rgba(34,197,94,0.5)', stack: 'tokens' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#9ca3af', font: { size: 11 } } } },
        scales: {
          x: { stacked: true, ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { stacked: true, ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        },
      },
    });
  } else if (ctx) {
    ctx.parentElement.innerHTML = '<p style="color:var(--text3);font-size:13px;text-align:center;padding:40px 0;">No data for this period yet — start some chat sessions.</p>';
  }

  // Model table
  const mt = document.getElementById('model-table-body');
  if (mt) {
    mt.innerHTML = models.length === 0
      ? '<tr><td colspan="5" style="color:var(--text3);padding:12px 0;font-size:12px;">No LLM calls recorded yet.</td></tr>'
      : models.map(m => \`<tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px 0;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent2);">\${esc(m.model)}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${m.calls}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${fmtNum(m.tokens_in)}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${fmtNum(m.tokens_out)}</td>
          <td style="padding:8px 0;font-size:12px;color:#4ade80;">$\${Number(m.cost_usd).toFixed(5)}</td>
        </tr>\`).join('');
  }

  // Agent usage table
  const at = document.getElementById('agent-table-body');
  if (at) {
    at.innerHTML = !perAgent?.length
      ? '<tr><td colspan="6" style="color:var(--text3);padding:12px 0;font-size:12px;">No agent usage recorded yet.</td></tr>'
      : perAgent.map(a => \`<tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px 0;font-size:12px;color:var(--accent2);font-weight:500;">\${esc(a.agent_id)}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${a.sessions}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${a.llm_calls}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${fmtNum(a.tokens_in)}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${fmtNum(a.tokens_out)}</td>
          <td style="padding:8px 0;font-size:12px;color:#4ade80;">$\${Number(a.cost_usd).toFixed(5)}</td>
        </tr>\`).join('');
  }
}

function fmtNum(n) { return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n); }

// ── Sessions deep-dive ───────────────────────────────────────
let allSessions = [];

async function loadSessionsList() {
  const el = document.getElementById('sessions-table');
  showSkeleton(el, 6, 'card');
  const agentFilter = document.getElementById('sess-agent-filter')?.value ?? '';
  const url = BASE + '/api/sessions?limit=50' + (agentFilter ? '&agentId=' + encodeURIComponent(agentFilter) : '');
  allSessions = await fetch(url).then(r => r.json()).catch(() => []);
  renderSessionsList(allSessions);
}

async function loadSessionAgentFilter() {
  try {
    const agents = await fetch(BASE + '/api/agents').then(r => r.json());
    const sel = document.getElementById('sess-agent-filter');
    if (!sel) return;
    sel.innerHTML = '<option value="">All agents</option>' +
      agents.map(a => '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>').join('');
  } catch {}
}

function channelLabel(ch) {
  if (!ch || ch === 'cli') return '';
  if (ch.startsWith('subagent:')) return ch.replace('subagent:', '');
  if (ch === 'subagent') return 'sub';
  if (ch === 'web') return 'web';
  if (ch === 'discord') return 'discord';
  if (ch === 'service') return 'service';
  return ch;
}

function channelColor(ch) {
  if (ch?.startsWith('subagent')) return 'rgba(245,158,11,0.1)';
  if (ch === 'web') return 'rgba(59,130,246,0.1)';
  if (ch === 'discord') return 'rgba(139,92,246,0.1)';
  return 'rgba(255,255,255,0.06)';
}

function channelTextColor(ch) {
  if (ch?.startsWith('subagent')) return '#fbbf24';
  if (ch === 'web') return '#60a5fa';
  if (ch === 'discord') return '#a78bfa';
  return 'var(--text3)';
}

function renderSessionsList(sessions) {
  const el = document.getElementById('sessions-table');
  if (!el) return;
  if (!sessions.length) { el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p style="color:var(--text3);font-size:13px;">No sessions found.</p><p style="color:var(--text3);font-size:11px;margin-top:4px;">Start a chat session to see it here.</p></div>'; return; }
  el.innerHTML = sessions.map(s => {
    const ch = channelLabel(s.channel);
    const chBg = channelColor(s.channel);
    const chTc = channelTextColor(s.channel);
    const hasParent = !!s.parent_session_id;
    return \`
    <div class="card-sm" style="display:flex;align-items:center;gap:12px;cursor:pointer;margin-bottom:6px;" onclick="openSession('\${s.id}')">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-size:12px;font-family:'JetBrains Mono',monospace;color:var(--accent2);">\${s.id.slice(-20)}</span>
          \${s.agent_id && s.agent_id !== 'default' ? '<span class="badge" style="background:rgba(99,102,241,0.1);color:var(--accent2);font-size:10px;">' + esc(s.agent_id) + '</span>' : ''}
          \${ch ? '<span class="badge" style="background:' + chBg + ';color:' + chTc + ';font-size:10px;">' + esc(ch) + '</span>' : ''}
          \${hasParent ? '<span class="badge" style="background:rgba(245,158,11,0.08);color:#fbbf24;font-size:10px;">⤷ child</span>' : ''}
          <span class="badge" style="background:\${s.status==='active'?'rgba(34,197,94,0.1)':'rgba(255,255,255,0.05)'};color:\${s.status==='active'?'#4ade80':'var(--text3)'};">\${s.status}</span>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;">\${s.turn_count} turns · \${new Date(s.started_at).toLocaleString()}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn" style="padding:4px 10px;font-size:11px;background:rgba(99,102,241,0.1);color:var(--accent2);" onclick="event.stopPropagation();continueSession('\${s.id}')">▶ Continue</button>
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px;" onclick="event.stopPropagation();exportSession('\${s.id}')">⬇ Export</button>
        <button class="btn" style="padding:4px 10px;font-size:11px;background:rgba(239,68,68,0.1);color:#f87171;" onclick="event.stopPropagation();deleteSession('\${s.id}')">✕</button>
      </div>
    </div>
  \`}).join('')
}

async function searchSessions() {
  const q = document.getElementById('sess-search').value.trim();
  if (!q) { renderSessionsList(allSessions); return; }
  const results = await fetch(\`\${BASE}/api/sessions/search?q=\${encodeURIComponent(q)}\`).then(r => r.json()).catch(() => []);
  renderSessionsList(results);
}

async function openSession(id) {
  showPage('sessions');
  document.getElementById('sessions-list-view').style.display = 'none';
  document.getElementById('sessions-detail-view').style.display = 'flex';

  const [session, msgs, events, children] = await Promise.all([
    fetch(\`\${BASE}/api/sessions/\${encodeURIComponent(id)}\`).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(\`\${BASE}/api/sessions/\${encodeURIComponent(id)}/messages\`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(\`\${BASE}/api/sessions/\${id}/events\`).then(r => r.json()).catch(() => []),
    fetch(\`\${BASE}/api/sessions/\${encodeURIComponent(id)}/children\`).then(r => r.ok ? r.json() : []).catch(() => []),
  ]);
  const el = document.getElementById('session-detail-log');
  const title = document.getElementById('session-detail-title');
  const meta = document.getElementById('session-detail-meta');
  const ctn = document.getElementById('session-detail-children');
  title.textContent = id;

  // Show parent link if this session has a parent
  if (session && session.parent_session_id) {
    meta.innerHTML = \`<span style="color:var(--text3);">← parent:</span> <a href="#" style="color:var(--accent2);font-family:'JetBrains Mono',monospace;font-size:11px;text-decoration:none;" onclick="event.preventDefault();openSession('\${session.parent_session_id}')">\${session.parent_session_id.slice(-20)}</a>\`;
  } else {
    meta.innerHTML = '';
  }

  // Show child sessions if any
  if (children.length > 0) {
    const ch = channelLabel(session?.channel);
    ctn.innerHTML = '<span style="color:var(--text3);">sub-agents:</span> ' + children.map(c => \`
      <a href="#" style="color:#fbbf24;font-family:'JetBrains Mono',monospace;font-size:11px;text-decoration:none;padding:2px 6px;border-radius:4px;background:rgba(245,158,11,0.08);" onclick="event.preventDefault();openSession('\${c.id}')">
        \${c.channel?.startsWith('subagent:') ? c.channel.replace('subagent:','') : 'sub'}
      </a>\`).join(' ');
  } else if (session && !session.channel?.startsWith('subagent')) {
    ctn.innerHTML = '<span style="color:var(--text3);font-size:10px;">(no sub-agents)</span>';
  } else {
    ctn.innerHTML = '';
  }

  if (msgs.length > 0) {
    el.innerHTML = msgs.map(m => {
      if (m.role === 'user') {
        return \`<div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
          <div class="bubble-user" style="font-size:13px;">\${esc(m.content)}</div></div>\`;
      }
      if (m.role === 'assistant') {
        return \`<div style="display:flex;justify-content:flex-start;margin-bottom:10px;">
          <div class="bubble-agent md" style="font-size:13px;">\${md(m.content)}</div></div>\`;
      }
      return '';
    }).join('');
  } else if (events.length > 0) {
    el.innerHTML = events.map(ev => {
      const isUser = ev.event_type === 'user_message';
      const isAgent = ev.event_type === 'agent_response';
      const isTool = ev.event_type === 'tool_call' || ev.event_type === 'tool_approved';
      if (isUser) return \`<div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
        <div class="bubble-user" style="font-size:13px;">\${esc(ev.summary ?? ev.action ?? '')}</div></div>\`;
      if (isAgent) return \`<div style="display:flex;justify-content:flex-start;margin-bottom:10px;">
        <div class="bubble-agent md" style="font-size:13px;">\${md(ev.summary ?? ev.action ?? '')}</div></div>\`;
      if (isTool) return \`<div style="display:flex;justify-content:flex-start;margin-bottom:6px;">
        <div class="bubble-tool">⚙ \${esc(ev.action)} \${ev.duration_ms ? '· '+ev.duration_ms+'ms' : ''}</div></div>\`;
      return \`<div style="font-size:11px;color:var(--text3);padding:2px 0;font-family:'JetBrains Mono',monospace;">
        [\${ev.event_type}] \${esc(ev.summary ?? ev.action ?? '')}\${ev.duration_ms?' · '+ev.duration_ms+'ms':''}</div>\`;
    }).join('');
  } else {
    el.innerHTML = '<p style="color:var(--text3);font-size:13px;">No messages or events for this session.</p>';
  }
}

function backToSessions() {
  document.getElementById('sessions-list-view').style.display = 'flex';
  document.getElementById('sessions-detail-view').style.display = 'none';
}

async function continueSession(id) {
  const resumeRes = await fetch(\`\${BASE}/api/sessions/\${encodeURIComponent(id)}/resume\`, { method: 'POST' });
  if (!resumeRes.ok) { toast('Failed to resume session', 'error'); return; }
  sessionId = id;
  saveSession();
  showPage('chat');
  await loadSessionMessages(id);
  document.getElementById('chat-session-id').textContent = id.slice(-12);
}

async function exportSession(id) {
  const events = await fetch(\`\${BASE}/api/sessions/\${id}/events\`).then(r => r.json()).catch(() => []);
  const blob = new Blob([JSON.stringify({ session_id: id, events }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = \`cortex-session-\${id}.json\`; a.click();
  toast('Session exported', 'success');
}

async function deleteSession(id) {
  const ok = await confirmAction('Delete Session', \`Delete session \${id.slice(-12)}? This removes all its Lens events.\`, 'Delete');
  if (!ok) return;
  const res = await fetch(\`\${BASE}/api/sessions/\${id}\`, { method: 'DELETE' });
  if (res.ok) toast('Session deleted', 'success');
  loadSessionsList();
}

// ── Settings ─────────────────────────────────────────────────

const PROVIDER_META = {
  openai:      { label: 'OpenAI',           defaultModel: 'gpt-4o',                                          needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  anthropic:   { label: 'Anthropic',        defaultModel: 'claude-sonnet-4-5',                               needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  google:      { label: 'Google Gemini',    defaultModel: 'gemini-2.0-flash',                                needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  mistral:     { label: 'Mistral',          defaultModel: 'mistral-large-latest',                            needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  groq:        { label: 'Groq',             defaultModel: 'llama-3.3-70b-versatile',                         needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  deepseek:    { label: 'DeepSeek',         defaultModel: 'deepseek-chat',                                   needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  openrouter:  { label: 'OpenRouter',       defaultModel: 'openai/gpt-4o',                                   needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  xai:         { label: 'xAI (Grok)',       defaultModel: 'grok-2-latest',                                   needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  together:    { label: 'Together AI',      defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',         needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  bedrock:     { label: 'AWS Bedrock',      defaultModel: 'anthropic.claude-3-5-sonnet-20240620-v1:0',       needsBaseUrl: true,  needsSecret: true,  defaultBaseUrl: 'us-east-1' },
  cohere:      { label: 'Cohere',           defaultModel: 'command-r-plus',                                  needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  kilo:        { label: 'Kilo (AI Gateway)',defaultModel: 'kilo/sonnet',                                     needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  ollama:      { label: 'Ollama',           defaultModel: 'llama3.2',                                        needsBaseUrl: true,  needsSecret: false, defaultBaseUrl: 'http://localhost:11434' },
  cerebras:    { label: 'Cerebras',         defaultModel: 'llama-3.3-70b',                                   needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  fireworks:   { label: 'Fireworks AI',     defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct', needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  perplexity:  { label: 'Perplexity',       defaultModel: 'sonar-pro',                                       needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  nvidia:      { label: 'NVIDIA NIM',       defaultModel: 'meta/llama-3.3-70b-instruct',                     needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  moonshot:    { label: 'Moonshot (Kimi)',  defaultModel: 'kimi-k2-0711-preview',                            needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  novita:      { label: 'Novita AI',        defaultModel: 'meta-llama/llama-3.3-70b-instruct',               needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  lmstudio:    { label: 'LM Studio',        defaultModel: 'local-model',                                     needsBaseUrl: true,  needsSecret: false, defaultBaseUrl: 'http://localhost:1234' },
  litellm:     { label: 'LiteLLM',          defaultModel: 'gpt-4o',                                          needsBaseUrl: true,  needsSecret: false, defaultBaseUrl: 'http://localhost:4000' },
  huggingface: { label: 'Hugging Face',     defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',               needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  alibaba:     { label: 'Alibaba (Qwen)',   defaultModel: 'qwen-plus',                                       needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  venice:      { label: 'Venice AI',        defaultModel: 'llama-3.3-70b',                                   needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
};

const PROVIDER_KINDS = Object.keys(PROVIDER_META);

function providerLabel(kind) {
  return PROVIDER_META[kind]?.label ?? kind;
}

// Provider-specific extra settings fields.
// Each entry is an array of field descriptors rendered dynamically in the modal.
// type: 'select' | 'number' | 'text' | 'checkbox'
const PROVIDER_EXTRA_FIELDS = {
  anthropic: [
    { key: 'reasoningEffort', label: 'Extended Thinking', type: 'select',
      options: [['','Disabled'],['low','Low (1k tokens)'],['medium','Medium (4k tokens)'],['high','High (16k tokens)']],
      hint: 'Enables Claude extended thinking — billed as additional output tokens' },
  ],
  google: [
    { key: 'reasoningEffort', label: 'Thinking Budget', type: 'select',
      options: [['','Disabled'],['low','Low (1k tokens)'],['medium','Medium (4k tokens)'],['high','High (16k tokens)']],
      hint: 'Flash/Pro Thinking models only — sets thinkingBudget token count' },
  ],
  openai: [
    { key: 'reasoningEffort', label: 'Reasoning Effort', type: 'select',
      options: [['','Default'],['low','Low'],['medium','Medium'],['high','High']],
      hint: 'o-series models only (o1, o3, o4-mini). Ignored by GPT-4 / GPT-4o.' },
  ],
  openrouter: [
    { key: 'httpReferer', label: 'HTTP-Referer', type: 'text', placeholder: 'https://yoursite.com',
      hint: 'Shown in OpenRouter dashboard and passed to downstream providers' },
    { key: 'xTitle', label: 'X-Title', type: 'text', placeholder: 'My App',
      hint: 'App display name shown in the OpenRouter usage dashboard' },
  ],
  perplexity: [
    { key: 'searchRecencyFilter', label: 'Search Recency Filter', type: 'select',
      options: [['','None'],['month','Past month'],['week','Past week'],['day','Past day'],['hour','Past hour']],
      hint: 'Filter web search results by recency (Sonar models only)' },
    { key: 'returnCitations', label: 'Return Citations', type: 'checkbox',
      hint: 'Include source URLs as citations in the response' },
    { key: 'returnImages', label: 'Return Images', type: 'checkbox',
      hint: 'Include image results in the response (Sonar Pro only)' },
  ],
  together: [
    { key: 'repetitionPenalty', label: 'Repetition Penalty', type: 'number',
      min: 1.0, max: 2.0, step: 0.05, placeholder: '1.0',
      hint: 'Penalises repeated tokens. 1.0 = no penalty, 2.0 = max' },
  ],
  fireworks: [
    { key: 'repetitionPenalty', label: 'Repetition Penalty', type: 'number',
      min: 1.0, max: 2.0, step: 0.05, placeholder: '1.0',
      hint: 'Penalises repeated tokens. 1.0 = no penalty, 2.0 = max' },
  ],
  novita: [
    { key: 'repetitionPenalty', label: 'Repetition Penalty', type: 'number',
      min: 1.0, max: 2.0, step: 0.05, placeholder: '1.0',
      hint: 'Penalises repeated tokens. 1.0 = no penalty, 2.0 = max' },
  ],
  ollama: [
    { key: 'numCtx', label: 'Context Window (num_ctx)', type: 'number',
      min: 512, max: 131072, step: 512, placeholder: '4096',
      hint: 'Override the model context length. Larger values use more VRAM.' },
    { key: 'numThread', label: 'CPU Threads (num_thread)', type: 'number',
      min: 1, max: 128, step: 1, placeholder: 'auto',
      hint: 'Number of CPU threads for inference. Leave blank for auto.' },
    { key: 'keepAlive', label: 'Keep Alive', type: 'text', placeholder: '5m',
      hint: 'How long to keep the model loaded: e.g. 5m, 1h, -1 (forever), 0 (unload immediately)' },
  ],
  lmstudio: [
    { key: 'numCtx', label: 'Context Window (num_ctx)', type: 'number',
      min: 512, max: 131072, step: 512, placeholder: '4096',
      hint: 'Override the model context length in LM Studio.' },
    { key: 'keepAlive', label: 'Keep Alive', type: 'text', placeholder: '5m',
      hint: 'How long to keep the model loaded: e.g. 5m, 1h, -1 (forever)' },
  ],
  litellm: [
    { key: 'dropParams', label: 'Drop Unsupported Params', type: 'checkbox',
      hint: 'LiteLLM will silently ignore parameters not supported by the target model instead of erroring' },
  ],
  venice: [
    { key: 'includeVeniceSystemPrompt', label: 'Include Venice System Prompt', type: 'checkbox',
      hint: 'Prepend the Venice character/uncensored system prompt to every request' },
  ],
};

let settingsActiveTab = 'general';

async function loadSettings() {
  const config = await fetch(BASE + '/api/config').then(r => r.json()).catch(() => null);
  if (!config) return;

  const configured = PROVIDER_KINDS.filter(k => config.providers?.[k]?.apiKey || config.providers?.[k]?.model);
  const unconfigured = PROVIDER_KINDS.filter(k => !configured.includes(k));
  const el = document.getElementById('settings-content');
  if (!el) return;

  el.innerHTML = \`
    <!-- Settings Navigation Tabs -->
    <div style="display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:20px;padding-bottom:0;">
      <button class="mem-tab \${settingsActiveTab === 'general' ? 'active' : ''}" onclick="switchSettingsTab('general')" id="settings-tab-general">General</button>
      <button class="mem-tab \${settingsActiveTab === 'providers' ? 'active' : ''}" onclick="switchSettingsTab('providers')" id="settings-tab-providers">AI &amp; Models</button>
      <button class="mem-tab \${settingsActiveTab === 'tools' ? 'active' : ''}" onclick="switchSettingsTab('tools')" id="settings-tab-tools">Tools &amp; Extensions</button>
      <button class="mem-tab \${settingsActiveTab === 'system' ? 'active' : ''}" onclick="switchSettingsTab('system')" id="settings-tab-system">System</button>
    </div>

    <!-- General Tab -->
    <div id="settings-pane-general" style="display:\${settingsActiveTab === 'general' ? 'block' : 'none'};">
      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:14px;">Agent Behavior</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Agent Name</label>
            <input class="inp" id="cfg-name" value="\${esc(config.agent?.name ?? 'Cortex')}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Display name for the default agent</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Default Provider</label>
            <select class="inp" id="cfg-provider">
              \${configured.length ? configured.map(k => \`<option value="\${k}" \${config.defaultProvider===k?'selected':''}>\${providerLabel(k)}</option>\`).join('') : '<option>Configure providers first</option>'}
            </select>
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Primary LLM provider to use</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Max Turns per Session</label>
            <input class="inp" id="cfg-maxturns" type="number" min="1" max="200" value="\${config.agent?.maxTurns ?? 50}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Maximum agent-user interaction turns (1-200)</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Stream Output</label>
            <div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
              <input type="checkbox" id="cfg-stream" \${config.agent?.streamOutput?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
              <span style="font-size:12px;color:var(--text2);">Enable streaming responses</span>
            </div>
            <p style="font-size:10px;color:var(--text3);margin-top:4px;">Show responses as they're generated</p>
          </div>
        </div>
        <div style="margin-top:14px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveGeneralSettings()">Save General Settings</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">User Profile &amp; Personalization</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Help Cortex understand your background and preferences for more relevant assistance</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Role / Title</label>
            <input class="inp" id="cfg-profile-role" placeholder="e.g. Software Engineer, Product Manager" value="\${esc(config.userProfile?.role ?? '')}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Your professional role or title</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Experience Level</label>
            <select class="inp" id="cfg-profile-experience">
              <option value="">Not specified</option>
              <option value="beginner" \${config.userProfile?.experienceLevel==='beginner'?'selected':''}>Beginner</option>
              <option value="intermediate" \${config.userProfile?.experienceLevel==='intermediate'?'selected':''}>Intermediate</option>
              <option value="advanced" \${config.userProfile?.experienceLevel==='advanced'?'selected':''}>Advanced</option>
              <option value="expert" \${config.userProfile?.experienceLevel==='expert'?'selected':''}>Expert</option>
            </select>
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Your overall experience level</p>
          </div>
        </div>
        <div style="margin-top:14px;">
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Primary Use Case</label>
          <input class="inp" id="cfg-profile-usecase" placeholder="e.g. Full-stack development, Data analysis" value="\${esc(config.userProfile?.primaryUseCase ?? '')}" />
          <p style="font-size:10px;color:var(--text3);margin-top:2px;">Main task or domain you'll use Cortex for</p>
        </div>
        <div style="margin-top:14px;">
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Preferred Workflow</label>
          <select class="inp" id="cfg-profile-workflow">
            <option value="">Not specified</option>
            <option value="cli" \${config.userProfile?.preferredWorkflow==='cli'?'selected':''}>CLI-focused</option>
            <option value="web" \${config.userProfile?.preferredWorkflow==='web'?'selected':''}>Web UI-focused</option>
            <option value="hybrid" \${config.userProfile?.preferredWorkflow==='hybrid'?'selected':''}>Hybrid (CLI + Web)</option>
            <option value="api" \${config.userProfile?.preferredWorkflow==='api'?'selected':''}>API/Integration</option>
          </select>
          <p style="font-size:10px;color:var(--text3);margin-top:2px;">How you prefer to interact with Cortex</p>
        </div>
        <div style="margin-top:14px;">
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Domains &amp; Technologies (comma-separated)</label>
          <input class="inp" id="cfg-profile-domains" placeholder="e.g. TypeScript, React, AWS, Machine Learning" value="\${(config.userProfile?.domains ?? []).join(', ')}" />
          <p style="font-size:10px;color:var(--text3);margin-top:2px;">Technologies and domains you work with</p>
        </div>
        <div style="margin-top:14px;">
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Additional Context (optional)</label>
          <textarea class="inp" id="cfg-profile-context" placeholder="Any other context that would help Cortex assist you better..." style="resize:vertical;min-height:80px;font-size:12px;">\${esc(config.userProfile?.additionalContext ?? '')}</textarea>
          <p style="font-size:10px;color:var(--text3);margin-top:2px;">Free-form notes about your work, preferences, or needs</p>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveProfileSettings()">Save User Profile</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">UI &amp; Appearance</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Customize the visual appearance and animations of the web interface</p>
        <div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="checkbox" id="cfg-ui-enabled" \${config.ui?.enabled !== false ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--accent);" />
            <label style="font-size:13px;color:var(--text);font-weight:500;">Enable UI animations and effects</label>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Background Effect</label>
            <select class="inp" id="cfg-ui-background">
              <option value="none" \${config.ui?.backgroundEffect==='none'?'selected':''}>None</option>
              <option value="matrix" \${config.ui?.backgroundEffect==='matrix'?'selected':''}>Matrix</option>
              <option value="particles" \${config.ui?.backgroundEffect==='particles'?'selected':''}>Particles</option>
              <option value="neural" \${config.ui?.backgroundEffect==='neural'?'selected':''}>Neural Network</option>
            </select>
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Animated background effect (may impact performance)</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Color Scheme</label>
            <select class="inp" id="cfg-ui-colors">
              <option value="vibrant" \${config.ui?.colorScheme==='vibrant'?'selected':''}>Vibrant</option>
              <option value="subtle" \${config.ui?.colorScheme==='subtle'?'selected':''}>Subtle</option>
              <option value="monochrome" \${config.ui?.colorScheme==='monochrome'?'selected':''}>Monochrome</option>
            </select>
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Color palette for UI elements</p>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveUISettings()">Save UI Settings</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Web Authentication</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Configure password protection for the web interface</p>
        <div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="checkbox" id="cfg-auth-require" \${config.webAuth?.requireAuth !== false ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--accent);" />
            <label style="font-size:13px;color:var(--text);font-weight:500;">Require authentication for web UI</label>
          </div>
          <p style="font-size:10px;color:var(--text3);margin-top:4px;margin-left:28px;">When enabled, users must log in with password to access the web interface</p>
        </div>
        <div style="margin-top:16px;">
          <div id="cfg-auth-pw-label" style="font-size:12px;font-weight:500;margin-bottom:8px;">Set Password</div>
          <div id="cfg-auth-oldpass-row" style="display:none;">
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Current Password</label>
            <input class="inp" id="cfg-auth-oldpass" type="password" placeholder="Enter current password" />
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">New Password</label>
              <input class="inp" id="cfg-auth-newpass" type="password" placeholder="Enter new password" />
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Confirm New Password</label>
              <input class="inp" id="cfg-auth-confirmpass" type="password" placeholder="Confirm new password" />
            </div>
          </div>
          <p style="font-size:10px;color:var(--text3);margin-top:4px;">Leave blank to keep current password unchanged</p>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveSecuritySettings()">Save Security Settings</button>
        </div>
      </div>
    </div>

    <!-- AI & Models Tab -->
    <div id="settings-pane-providers" style="display:\${settingsActiveTab === 'providers' ? 'block' : 'none'};">
      <div class="card" style="margin-bottom:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <div>
            <div style="font-size:13px;font-weight:600;">Configured Providers</div>
            <p style="font-size:11px;color:var(--text3);margin-top:2px;">LLM providers with API keys and models configured</p>
          </div>
          <button class="btn btn-primary" onclick="showAddModelModal()" style="font-size:12px;">+ Add Provider</button>
        </div>

        \${configured.length === 0 ? '<div style="padding:40px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6m8-7h-6m-6 0H2"/></svg><p style="font-size:12px;color:var(--text3);">No providers configured yet.</p><p style="font-size:11px;color:var(--text3);margin-top:4px;">Click "+ Add Provider" to configure your first LLM provider.</p></div>' : ''}
        \${configured.map(k => {
          const p = config.providers[k];
          const meta = PROVIDER_META[k];
          return \`<div class="card-sm" style="margin-bottom:10px;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                  <span style="font-size:13px;font-weight:500;">\${meta.label}</span>
                  <span class="badge" style="background:rgba(34,197,94,0.1);color:#4ade80;">● configured</span>
                  \${config.defaultProvider === k ? '<span class="badge" style="background:rgba(99,102,241,0.15);color:var(--accent2);">default</span>' : ''}
                </div>
                <div style="display:flex;gap:16px;font-size:12px;color:var(--text2);flex-wrap:wrap;">
                  <span>Model: <span style="color:var(--text);font-family:'JetBrains Mono',monospace;">\${esc(p.model || '—')}</span></span>
                  \${p.temperature != null ? \`<span>Temp: <span style="color:var(--text);">\${p.temperature}</span></span>\` : ''}
                  \${p.maxTokens != null ? \`<span>Max tokens: <span style="color:var(--text);">\${p.maxTokens}</span></span>\` : ''}
                  \${p.topP != null ? \`<span>Top P: <span style="color:var(--text);">\${p.topP}</span></span>\` : ''}
                  \${p.reasoningEffort ? \`<span>Reasoning: <span style="color:var(--text);">\${p.reasoningEffort}</span></span>\` : ''}
                  \${p.repetitionPenalty != null ? \`<span>Rep penalty: <span style="color:var(--text);">\${p.repetitionPenalty}</span></span>\` : ''}
                  \${p.searchRecencyFilter ? \`<span>Recency: <span style="color:var(--text);">\${p.searchRecencyFilter}</span></span>\` : ''}
                  \${p.numCtx != null ? \`<span>ctx: <span style="color:var(--text);">\${p.numCtx}</span></span>\` : ''}
                  \${p.keepAlive ? \`<span>keep-alive: <span style="color:var(--text);">\${p.keepAlive}</span></span>\` : ''}
                  \${p.returnCitations ? \`<span style="color:#4ade80;">citations</span>\` : ''}
                  \${p.dropParams ? \`<span style="color:var(--text3);">drop-params</span>\` : ''}
                  \${p.includeVeniceSystemPrompt ? \`<span style="color:var(--text3);">venice-prompt</span>\` : ''}
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0;">
                <button class="btn btn-ghost" style="font-size:11px;padding:4px 10px;" onclick="showEditModelModal('\${k}')">Edit</button>
                <button class="btn btn-ghost" style="font-size:11px;padding:4px 10px;" onclick="removeProvider('\${k}')">Remove</button>
              </div>
            </div>
          </div>\`;
        }).join('')}

        <div style="margin-top:12px;">
          <details style="font-size:12px;">
            <summary style="cursor:pointer;color:var(--text3);padding:6px 0;font-weight:500;">Available providers (\${unconfigured.length})</summary>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px;">
              \${unconfigured.map(k => \`<button class="btn btn-ghost" style="font-size:11px;padding:8px;text-align:left;justify-content:flex-start;" onclick="showAddModelModal('\${k}')">
                + \${PROVIDER_META[k].label}
              </button>\`).join('')}
            </div>
          </details>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Model Router (RouteLLM)</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Intelligently route queries to strong or weak models based on complexity. Cascade mode tries models in order; Threshold mode uses a scorer to decide.</p>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">
          <input type="checkbox" id="cfg-router" \${config.router?.enabled?'checked':''} style="width:18px;height:18px;accent-color:var(--accent);" />
          <label style="font-size:13px;color:var(--text);font-weight:500;">Enable Model Router</label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Routing Strategy</label>
            <select class="inp" id="cfg-strategy">
              <option value="cascade" \${config.router?.strategy==='cascade'?'selected':''}>Cascade (try models in order)</option>
              <option value="threshold" \${config.router?.strategy==='threshold'?'selected':''}>Threshold (score-based routing)</option>
            </select>
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">How to route queries to models</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Confidence Threshold (0–1)</label>
            <input class="inp" id="cfg-confidence" type="number" step="0.05" min="0" max="1" value="\${config.router?.confidenceThreshold ?? 0.7}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Threshold for routing to strong model (higher = more selective)</p>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveRouterSettings()">Save Router Settings</button>
        </div>
      </div>
    </div>

    <!-- Tools & Extensions Tab -->
    <div id="settings-pane-tools" style="display:\${settingsActiveTab === 'tools' ? 'block' : 'none'};">
      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:14px;">Voice &amp; TTS Configuration</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Enable Voice</label>
            <div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
              <input type="checkbox" id="cfg-voice-enabled" \${config.voice?.enabled?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
              <span style="font-size:12px;color:var(--text2);">Enable speech-to-text &amp; text-to-speech</span>
            </div>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">STT Provider</label>
            <select class="inp" id="cfg-stt-provider">
              <option value="openai" \${config.voice?.sttProvider==='openai'?'selected':''}>OpenAI Whisper</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">TTS Provider</label>
            <select class="inp" id="cfg-tts-provider">
              <option value="openai" \${config.voice?.ttsProvider==='openai'?'selected':''}>OpenAI TTS</option>
              <option value="elevenlabs" \${config.voice?.ttsProvider==='elevenlabs'?'selected':''}>ElevenLabs</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Default Voice</label>
            <select class="inp" id="cfg-default-voice">
              <option value="alloy" \${config.voice?.defaultVoice==='alloy'?'selected':''}>Alloy</option>
              <option value="echo" \${config.voice?.defaultVoice==='echo'?'selected':''}>Echo</option>
              <option value="fable" \${config.voice?.defaultVoice==='fable'?'selected':''}>Fable</option>
              <option value="onyx" \${config.voice?.defaultVoice==='onyx'?'selected':''}>Onyx</option>
              <option value="nova" \${config.voice?.defaultVoice==='nova'?'selected':''}>Nova</option>
              <option value="shimmer" \${config.voice?.defaultVoice==='shimmer'?'selected':''}>Shimmer</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">ElevenLabs API Key</label>
            <input class="inp" id="cfg-elevenlabs-key" type="password" value="\${config.voice?.elevenLabsApiKey || ''}" placeholder="sk_..." />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Language</label>
            <select class="inp" id="cfg-voice-language">
              <option value="auto" \${config.voice?.language==='auto'?'selected':''}>Auto-detect</option>
              <option value="en" \${(!config.voice?.language || config.voice?.language==='en')?'selected':''}>English</option>
              <option value="fr" \${config.voice?.language==='fr'?'selected':''}>French</option>
              <option value="es" \${config.voice?.language==='es'?'selected':''}>Spanish</option>
              <option value="de" \${config.voice?.language==='de'?'selected':''}>German</option>
              <option value="ja" \${config.voice?.language==='ja'?'selected':''}>Japanese</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Auto TTS</label>
            <div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
              <input type="checkbox" id="cfg-auto-tts" \${config.voice?.autoTTS?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
              <span style="font-size:12px;color:var(--text2);">Auto-speak all text responses</span>
            </div>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveVoiceSettings()">Save Voice Settings</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:14px;">Tool API Keys &amp; Configuration</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:14px;">Configure API keys for web search, web scraping, and other external tools</p>

        <div id="tool-configs-list" style="margin-top:16px;">
          <p style="font-size:12px;color:var(--text3);">Loading tool configurations...</p>
        </div>

        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
          <div style="font-size:12px;font-weight:600;margin-bottom:10px;">Add / Update Tool Configuration</div>
          <div style="display:grid;grid-template-columns:1fr;gap:12px;">
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Tool</label>
              <select class="inp" id="tool-name-select" onchange="updateToolFields()">
                <option value="">-- Select Tool --</option>
                <option value="brave_search_api_key">Brave Search API Key</option>
                <option value="tavily_api_key">Tavily Search API Key</option>
                <option value="firecrawl_api_key">Firecrawl API Key</option>
                <option value="firecrawl_url">Firecrawl Self-Hosted URL</option>
                <option value="serpapi_api_key">SerpAPI API Key</option>
              </select>
              <p style="font-size:10px;color:var(--text3);margin-top:2px;">Choose which tool to configure</p>
            </div>
            <div id="tool-value-container">
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Value</label>
              <input class="inp" id="tool-value-input" type="text" placeholder="Enter API key or URL" />
              <p style="font-size:10px;color:var(--text3);margin-top:2px;" id="tool-value-hint">API key or configuration value</p>
            </div>
          </div>
          <div style="margin-top:14px;display:flex;gap:8px;">
            <button class="btn btn-primary" onclick="saveToolConfig()">Save Tool Configuration</button>
            <button class="btn btn-ghost" onclick="clearToolForm()">Clear</button>
          </div>
        </div>
      </div>

      <div class="card" style="background:var(--bg2);border:1px solid var(--border);margin-bottom:14px;">
        <div style="font-size:12px;font-weight:500;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          About Tool Configuration
        </div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:8px;">Tool API keys are stored securely in the encrypted vault (AES-256-GCM). They're never exposed in logs or API responses.</p>
        <p style="font-size:11px;color:var(--text3);margin-bottom:8px;"><strong>Priority:</strong> The system checks the vault first, then falls back to environment variables if not found.</p>
        <div style="margin-top:12px;font-size:11px;">
          <p style="color:var(--text2);font-weight:500;margin-bottom:6px;">Supported Tools:</p>
          <ul style="margin:0;padding-left:20px;color:var(--text3);">
            <li><strong>Brave Search</strong> — Premium web search API (web_search_enhanced)</li>
            <li><strong>Tavily Search</strong> — AI-optimized search API (web_search_enhanced)</li>
            <li><strong>Firecrawl</strong> — Web scraping and crawling service</li>
            <li><strong>SerpAPI</strong> — Google Search API wrapper</li>
          </ul>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px;">Computer Use (GUI Automation)</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Enable AI agents to interact with graphical user interfaces through screenshots, mouse control, and keyboard input</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Enable Computer Use</label>
            <div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
              <input type="checkbox" id="cu-enabled" \${config.computerUse?.enabled?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
              <span style="font-size:12px;color:var(--text2);">Allow agents to control desktop</span>
            </div>
            <p style="font-size:10px;color:var(--text3);margin-top:4px;">Enables screenshot, mouse, and keyboard tools</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Require Approval</label>
            <div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
              <input type="checkbox" id="cu-approval" \${config.computerUse?.requireApproval !== false?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
              <span style="font-size:12px;color:var(--text2);">Require user approval for each action</span>
            </div>
            <p style="font-size:10px;color:var(--text3);margin-top:4px;">Recommended for security</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Display Width (px)</label>
            <input class="inp" id="cu-width" type="number" min="640" max="3840" value="\${config.computerUse?.displayWidth ?? 1024}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Virtual display width (640-3840)</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Display Height (px)</label>
            <input class="inp" id="cu-height" type="number" min="480" max="2160" value="\${config.computerUse?.displayHeight ?? 768}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Virtual display height (480-2160)</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Runtime</label>
            <select class="inp" id="cu-runtime">
              <option value="native" \${(config.computerUse?.runtime ?? 'native') === 'native' ? 'selected' : ''}>Native (Xvfb)</option>
              <option value="docker" \${config.computerUse?.runtime === 'docker' ? 'selected' : ''}>Docker Container</option>
            </select>
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Execution environment</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Docker Image</label>
            <input class="inp" id="cu-docker-image" type="text" value="\${config.computerUse?.dockerImage ?? 'cortex/computer-use:latest'}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Docker image for containerized execution</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Screenshot Format</label>
            <select class="inp" id="cu-screenshot-format">
              <option value="png" \${(config.computerUse?.screenshotFormat ?? 'png') === 'png' ? 'selected' : ''}>PNG (Lossless)</option>
              <option value="jpeg" \${config.computerUse?.screenshotFormat === 'jpeg' ? 'selected' : ''}>JPEG (Compressed)</option>
            </select>
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Screenshot image format</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">JPEG Quality</label>
            <input class="inp" id="cu-quality" type="number" min="1" max="100" value="\${config.computerUse?.screenshotQuality ?? 85}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Quality for JPEG screenshots (1-100)</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Action Timeout (ms)</label>
            <input class="inp" id="cu-timeout" type="number" min="1000" max="30000" value="\${config.computerUse?.actionTimeoutMs ?? 5000}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Max time for each action (1000-30000)</p>
          </div>
        </div>
        <div style="margin-top:14px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveComputerUseSettings()">Save Computer Use Settings</button>
        </div>
      </div>
    </div>

    <!-- System Tab -->
    <div id="settings-pane-system" style="display:\${settingsActiveTab === 'system' ? 'block' : 'none'};">
      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Automatic Updates</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Configure how Cortex checks for and installs updates from GitHub releases</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Update Channel</label>
            <select class="inp" id="cfg-update-channel">
              <option value="stable" \${config.update?.channel==='stable'?'selected':''}>Stable (recommended)</option>
              <option value="pre-release" \${config.update?.channel==='pre-release'?'selected':''}>Pre-release (beta features)</option>
            </select>
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Which release channel to follow</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Check Interval (hours)</label>
            <input class="inp" id="cfg-update-interval" type="number" min="1" max="168" value="\${config.update?.checkIntervalHours ?? 24}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">How often to check for updates (1-168 hours)</p>
          </div>
        </div>
        <div style="margin-top:16px;">
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">
            GitHub Token (optional, for rate limits)
            <a href="https://github.com/settings/tokens/new?scopes=public_repo&description=CortexPrism+Updates" target="_blank" rel="noopener noreferrer" style="margin-left:6px;font-size:10px;color:var(--accent);text-decoration:none;">&#x2197; Generate token</a>
          </label>
          <input class="inp" id="cfg-update-token" type="password" placeholder="ghp_..." value="\${config.update?.githubToken ?? ''}" />
          <p style="font-size:10px;color:var(--text3);margin-top:2px;">Classic PAT with <code style="color:var(--text2);">public_repo</code> scope — avoids GitHub API rate limits</p>
        </div>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="checkbox" id="cfg-update-startup" \${config.update?.checkOnStartup?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
            <label style="font-size:12px;color:var(--text2);">Check for updates on startup</label>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="checkbox" id="cfg-update-auto" \${config.update?.autoUpdate?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
            <label style="font-size:12px;color:var(--text2);">Automatically install updates (requires restart)</label>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveUpdateSettings()">Save Update Settings</button>
          <button class="btn btn-ghost" onclick="checkUpdatesNow()">Check Now</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Plugin Updates</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Configure how Cortex checks for and installs plugin updates</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Check Interval (hours)</label>
            <input class="inp" id="cfg-plugin-update-interval" type="number" min="1" max="168" value="\${config.pluginUpdate?.checkIntervalHours ?? 24}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">How often to check for plugin updates</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">
              GitHub Token (optional)
              <a href="https://github.com/settings/tokens/new?scopes=public_repo&description=CortexPrism+Plugin+Updates" target="_blank" rel="noopener noreferrer" style="margin-left:6px;font-size:10px;color:var(--accent);text-decoration:none;">&#x2197; Generate token</a>
            </label>
            <input class="inp" id="cfg-plugin-update-token" type="password" placeholder="ghp_..." value="\${config.pluginUpdate?.githubToken ?? ''}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Classic PAT with <code style="color:var(--text2);">public_repo</code> scope — for GitHub Releases API calls</p>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="checkbox" id="cfg-plugin-update-startup" \${config.pluginUpdate?.checkOnStartup?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
            <label style="font-size:12px;color:var(--text2);">Check for plugin updates on startup</label>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="checkbox" id="cfg-plugin-update-auto" \${config.pluginUpdate?.autoUpdate?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
            <label style="font-size:12px;color:var(--text2);">Automatically apply plugin updates</label>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveUpdateSettings()">Save Plugin Settings</button>
          <button class="btn btn-ghost" onclick="checkPluginUpdatesNow()">Check Now</button>
          <button class="btn btn-ghost" onclick="updateAllPluginsNow()">Update All</button>
        </div>
        <div id="plugin-update-results" style="margin-top:12px;"></div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Log Level &amp; File</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Structured logging to <code style="color:var(--text2);">~/.cortex/data/logs/cortex.log</code>. Override at runtime with <code style="color:var(--text2);">CORTEX_LOG_LEVEL</code>.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Log Level</label>
            <select class="inp" id="cfg-log-level">
              <option value="trace" \${config.logging?.level==='trace'?'selected':''}>trace — maximum verbosity</option>
              <option value="debug" \${config.logging?.level==='debug'?'selected':''}>debug — internal state</option>
              <option value="info" \${config.logging?.level==='info'?'selected':''}>info — operational events</option>
              <option value="warn" \${config.logging?.level==='warn'?'selected':''}>warn — recoverable issues</option>
              <option value="error" \${(!config.logging?.level||config.logging?.level==='error')?'selected':''}>error — failures only (default)</option>
              <option value="silent" \${config.logging?.level==='silent'?'selected':''}>silent — no output</option>
            </select>
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Applies to stdout and file transports</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">File Logging</label>
            <div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
              <input type="checkbox" id="cfg-log-file-enabled" \${config.logging?.fileEnabled!==false?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
              <span style="font-size:12px;color:var(--text2);">Write logs to file (JSON-lines)</span>
            </div>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Max File Size (MB)</label>
            <input class="inp" id="cfg-log-maxbytes" type="number" min="1" max="500" value="\${Math.round((config.logging?.fileMaxBytes??10485760)/1048576)}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Rotate log file when it exceeds this size</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Max Rotated Files</label>
            <input class="inp" id="cfg-log-maxfiles" type="number" min="1" max="20" value="\${config.logging?.fileMaxFiles??5}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Number of rotated backup files to keep</p>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveLoggingSettings()">Save Logging Settings</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">OpenTelemetry (OTLP)</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Push traces, logs, and metrics to any OTLP-compatible collector (Grafana Tempo, Jaeger, Honeycomb, etc.)</p>
        <div style="display:grid;grid-template-columns:1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">OTLP Endpoint</label>
            <input class="inp" id="cfg-otlp-endpoint" placeholder="http://localhost:4318" value="\${esc(config.logging?.otlp?.endpoint??'')}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Base URL of your OTLP collector (no trailing slash)</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Authorization Header (optional)</label>
            <input class="inp" id="cfg-otlp-auth" type="password" placeholder="Bearer &lt;token&gt;" value="\${esc(config.logging?.otlp?.headers?.Authorization??'')}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Sent as the <code style="color:var(--text2);">Authorization</code> header on every OTLP request</p>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveLoggingSettings()">Save OTLP Settings</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Grafana Cloud</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Send traces and logs directly to Grafana Cloud via OTLP. Overrides the generic OTLP endpoint when set.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Grafana OTLP Endpoint</label>
            <input class="inp" id="cfg-grafana-endpoint" placeholder="https://otlp-gateway-prod-us-east-0.grafana.net/otlp" value="\${esc(config.logging?.grafana?.otlpEndpoint??'')}" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Access Policy Token</label>
            <input class="inp" id="cfg-grafana-token" type="password" placeholder="glc_..." value="\${esc(config.logging?.grafana?.authToken??'')}" />
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveLoggingSettings()">Save Grafana Settings</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Langfuse (LLM Observability)</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Capture per-turn traces, tool spans, and LLM generations in <a href="https://langfuse.com" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">Langfuse</a>. Leave keys blank to disable.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Public Key</label>
            <input class="inp" id="cfg-langfuse-pk" placeholder="pk-lf-..." value="\${esc(config.logging?.langfuse?.publicKey??'')}" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Secret Key</label>
            <input class="inp" id="cfg-langfuse-sk" type="password" placeholder="sk-lf-..." value="\${esc(config.logging?.langfuse?.secretKey??'')}" />
          </div>
          <div style="grid-column:span 2;">
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Base URL (leave blank for Langfuse Cloud)</label>
            <input class="inp" id="cfg-langfuse-url" placeholder="https://cloud.langfuse.com" value="\${esc(config.logging?.langfuse?.baseUrl??'')}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Set to your self-hosted instance URL if not using Langfuse Cloud</p>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveLoggingSettings()">Save Langfuse Settings</button>
        </div>
      </div>
    </div>
  \`;
  refreshSecuritySection();
  if (settingsActiveTab === 'tools') loadToolConfigs();
}

function switchSettingsTab(tabName) {
  settingsActiveTab = tabName;
  const tabs = ['general', 'providers', 'tools', 'system'];
  tabs.forEach(t => {
    const tabBtn = document.getElementById('settings-tab-' + t);
    const pane = document.getElementById('settings-pane-' + t);
    if (tabBtn) tabBtn.classList.toggle('active', t === tabName);
    if (pane) pane.style.display = t === tabName ? 'block' : 'none';
  });
  if (tabName === 'general') refreshSecuritySection();
  if (tabName === 'tools') loadToolConfigs();
}

async function saveGeneralSettings() {
  const current = await (await fetch(BASE + '/api/config')).json();
  const body = {
    defaultProvider: document.getElementById('cfg-provider')?.value,
    agent: {
      name: document.getElementById('cfg-name')?.value,
      maxTurns: Number(document.getElementById('cfg-maxturns')?.value),
      streamOutput: document.getElementById('cfg-stream')?.checked,
    },
  };
  const res = await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) { 
    toast('General settings saved', 'success'); 
    loadDaemonStatus();
  } else { 
    toast('Failed to save settings', 'error'); 
  }
}

async function saveRouterSettings() {
  const current = await (await fetch(BASE + '/api/config')).json();
  const body = {
    router: {
      enabled: document.getElementById('cfg-router')?.checked,
      strategy: document.getElementById('cfg-strategy')?.value ?? 'cascade',
      confidenceThreshold: Number(document.getElementById('cfg-confidence')?.value),
      cascade: current.router?.cascade ?? [],
      threshold: current.router?.threshold ?? undefined,
    },
  };
  const res = await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) { toast('Router settings saved', 'success'); } else { toast('Failed to save settings', 'error'); }
}

async function saveUpdateSettings() {
  const body = {
    update: {
      channel: document.getElementById('cfg-update-channel')?.value ?? 'stable',
      checkOnStartup: document.getElementById('cfg-update-startup')?.checked ?? true,
      autoUpdate: document.getElementById('cfg-update-auto')?.checked ?? false,
      checkIntervalHours: Number(document.getElementById('cfg-update-interval')?.value) || 24,
      githubToken: document.getElementById('cfg-update-token')?.value?.trim() || null,
      gpgKeyPath: null,
    },
    pluginUpdate: {
      checkOnStartup: document.getElementById('cfg-plugin-update-startup')?.checked ?? true,
      autoUpdate: document.getElementById('cfg-plugin-update-auto')?.checked ?? false,
      checkIntervalHours: Number(document.getElementById('cfg-plugin-update-interval')?.value) || 24,
      githubToken: document.getElementById('cfg-plugin-update-token')?.value?.trim() || null,
    },
  };
  const res = await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) { toast('Update settings saved', 'success'); } else { toast('Failed to save settings', 'error'); }
}

async function checkPluginUpdatesNow() {
  const el = document.getElementById('plugin-update-results');
  if (el) el.innerHTML = '<span style="font-size:11px;color:var(--text3);">Checking...</span>';
  try {
    const res = await fetch(BASE + '/api/plugins/check-updates');
    const results = await res.json();
    if (!el) return;
    if (!results.length) {
      el.innerHTML = '<span style="font-size:11px;color:var(--text3);">No plugins installed.</span>';
      return;
    }
    const available = results.filter(r => r.updateAvailable);
    const rows = results.map(r => {
      const icon = r.updateAvailable ? '<span style="color:var(--green);">▲</span>' : '<span style="color:var(--text3);">●</span>';
      const ver = r.updateAvailable
        ? \`\${r.currentVersion} → <strong style="color:var(--green);">\${r.latestVersion}</strong>\`
        : \`<span style="color:var(--text3);">\${r.currentVersion}</span>\`;
      const err = r.error ? \`<span style="color:var(--red);font-size:10px;"> \${r.error}</span>\` : '';
      return \`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);">\${icon} <span style="font-size:12px;font-weight:500;">\${r.pluginName}</span> <span style="font-size:11px;">\${ver}</span>\${err}</div>\`;
    }).join('');
    const summary = available.length
      ? \`<div style="font-size:11px;color:var(--green);margin-bottom:6px;">\${available.length} update(s) available</div>\`
      : \`<div style="font-size:11px;color:var(--text3);margin-bottom:6px;">All plugins up to date</div>\`;
    el.innerHTML = summary + rows;
  } catch (e) {
    if (el) el.innerHTML = \`<span style="font-size:11px;color:var(--red);">Check failed: \${e.message}</span>\`;
  }
}

async function updateAllPluginsNow() {
  const el = document.getElementById('plugin-update-results');
  if (el) el.innerHTML = '<span style="font-size:11px;color:var(--text3);">Updating...</span>';
  try {
    const res = await fetch(BASE + '/api/plugins/update-all', { method: 'POST' });
    const data = await res.json();
    if (!el) return;
    if (data.updated === 0) {
      el.innerHTML = '<span style="font-size:11px;color:var(--text3);">All plugins already up to date.</span>';
      return;
    }
    const rows = data.results.map(r => {
      if (r.error) {
        return \`<div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:12px;"><span style="color:var(--red);">✗</span> <strong>\${r.name}</strong>: <span style="color:var(--red);">\${r.error}</span></div>\`;
      }
      return \`<div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:12px;"><span style="color:var(--green);">✓</span> <strong>\${r.name}</strong>: \${r.previousVersion} → <strong style="color:var(--green);">\${r.newVersion}</strong></div>\`;
    }).join('');
    el.innerHTML = \`<div style="font-size:11px;color:var(--green);margin-bottom:6px;">\${data.updated} plugin(s) updated</div>\` + rows;
    toast(\`Updated \${data.updated} plugin(s)\`, 'success');
  } catch (e) {
    if (el) el.innerHTML = \`<span style="font-size:11px;color:var(--red);">Update failed: \${e.message}</span>\`;
  }
}

async function saveProfileSettings() {
  const domains = document.getElementById('cfg-profile-domains')?.value?.trim();
  const body = {
    userProfile: {
      role: document.getElementById('cfg-profile-role')?.value?.trim() || undefined,
      primaryUseCase: document.getElementById('cfg-profile-usecase')?.value?.trim() || undefined,
      experienceLevel: document.getElementById('cfg-profile-experience')?.value || undefined,
      preferredWorkflow: document.getElementById('cfg-profile-workflow')?.value || undefined,
      domains: domains ? domains.split(',').map(d => d.trim()).filter(Boolean) : [],
      additionalContext: document.getElementById('cfg-profile-context')?.value?.trim() || undefined,
      completed: true,
      timestamp: new Date().toISOString(),
    },
  };
  const res = await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) { toast('User profile saved', 'success'); } else { toast('Failed to save profile', 'error'); }
}

async function saveUISettings() {
  const body = {
    ui: {
      enabled: document.getElementById('cfg-ui-enabled')?.checked ?? true,
      backgroundEffect: document.getElementById('cfg-ui-background')?.value ?? 'neural',
      colorScheme: document.getElementById('cfg-ui-colors')?.value ?? 'vibrant',
    },
  };
  const res = await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) { 
    toast('UI settings saved — refresh page to see changes', 'success'); 
  } else { 
    toast('Failed to save UI settings', 'error'); 
  }
}

async function saveSecuritySettings() {
  const body = {
    webAuth: {
      requireAuth: document.getElementById('cfg-auth-require')?.checked ?? true,
    },
  };
  
  const oldPass = document.getElementById('cfg-auth-oldpass')?.value;
  const newPass = document.getElementById('cfg-auth-newpass')?.value;
  const confirmPass = document.getElementById('cfg-auth-confirmpass')?.value;
  
  if (newPass && newPass !== confirmPass) {
    toast('Passwords do not match', 'error');
    return;
  }
  
  const res = await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (!res.ok) { 
    toast('Failed to save security settings', 'error'); 
    return;
  }
  
  // Change/set password if provided
  if (newPass && newPass.length >= 8) {
    let authStatus = { hasPassword: false };
    try { authStatus = await fetch(BASE + '/api/auth/status').then(r => r.json()); } catch { /* ignore */ }
    if (authStatus.hasPassword && !oldPass) {
      toast('Current password is required to change password', 'error');
      return;
    }
    const passRes = await fetch(BASE + '/api/auth/change-password', { 
      method: 'POST', 
      headers: {'Content-Type':'application/json'}, 
      body: JSON.stringify({ oldPassword: oldPass || '', newPassword: newPass }) 
    });
    if (passRes.ok) {
      toast('Security settings and password updated', 'success');
      document.getElementById('cfg-auth-oldpass').value = '';
      document.getElementById('cfg-auth-newpass').value = '';
      document.getElementById('cfg-auth-confirmpass').value = '';
      refreshSecuritySection();
    } else {
      const data = await passRes.json();
      toast(data.error || 'Password change failed', 'error');
    }
  } else if (newPass) {
    toast('Password must be at least 8 characters', 'error');
  } else {
    toast('Security settings saved', 'success');
  }
}

async function refreshSecuritySection() {
  let authStatus = { hasPassword: false };
  try { authStatus = await fetch(BASE + '/api/auth/status').then(r => r.json()); } catch { /* ignore */ }
  const label = document.getElementById('cfg-auth-pw-label');
  const oldPassRow = document.getElementById('cfg-auth-oldpass-row');
  if (label) label.textContent = authStatus.hasPassword ? 'Change Password' : 'Set Password';
  if (oldPassRow) oldPassRow.style.display = authStatus.hasPassword ? 'block' : 'none';
}

async function saveLoggingSettings() {
  const otlpEndpoint = document.getElementById('cfg-otlp-endpoint')?.value?.trim();
  const otlpAuth = document.getElementById('cfg-otlp-auth')?.value?.trim();
  const grafanaEndpoint = document.getElementById('cfg-grafana-endpoint')?.value?.trim();
  const grafanaToken = document.getElementById('cfg-grafana-token')?.value?.trim();
  const langfusePk = document.getElementById('cfg-langfuse-pk')?.value?.trim();
  const langfuseSk = document.getElementById('cfg-langfuse-sk')?.value?.trim();
  const langfuseUrl = document.getElementById('cfg-langfuse-url')?.value?.trim();

  const logging = {
    level: document.getElementById('cfg-log-level')?.value ?? 'error',
    fileEnabled: document.getElementById('cfg-log-file-enabled')?.checked ?? true,
    fileMaxBytes: (Number(document.getElementById('cfg-log-maxbytes')?.value) || 10) * 1048576,
    fileMaxFiles: Number(document.getElementById('cfg-log-maxfiles')?.value) || 5,
    otlp: otlpEndpoint ? { endpoint: otlpEndpoint, headers: otlpAuth ? { Authorization: otlpAuth } : undefined } : undefined,
    grafana: grafanaEndpoint && grafanaToken ? { otlpEndpoint: grafanaEndpoint, authToken: grafanaToken } : undefined,
    langfuse: langfusePk && langfuseSk ? { publicKey: langfusePk, secretKey: langfuseSk, baseUrl: langfuseUrl || undefined } : undefined,
  };

  const res = await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ logging }) });
  if (res.ok) {
    toast('Logging settings saved — restart server for full effect', 'success');
  } else {
    toast('Failed to save logging settings', 'error');
  }
}

async function saveVoiceSettings() {
  const elevenLabsKey = document.getElementById('cfg-elevenlabs-key')?.value || '';
  const voiceCfg = {
    enabled: document.getElementById('cfg-voice-enabled')?.checked ?? false,
    sttProvider: document.getElementById('cfg-stt-provider')?.value ?? 'openai',
    ttsProvider: document.getElementById('cfg-tts-provider')?.value ?? 'openai',
    sttModel: 'whisper-1',
    ttsModel: 'tts-1',
    defaultVoice: document.getElementById('cfg-default-voice')?.value ?? 'alloy',
    autoTTS: document.getElementById('cfg-auto-tts')?.checked ?? false,
    language: document.getElementById('cfg-voice-language')?.value ?? 'en',
  };
  if (elevenLabsKey) voiceCfg.elevenLabsApiKey = elevenLabsKey;
  const body = { voice: voiceCfg };
  const res = await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) {
    toast('Voice settings saved', 'success');
    checkVoiceEnabled();
  } else {
    toast('Failed to save voice settings', 'error');
  }
}

async function saveComputerUseSettings() {
  const body = {
    computerUse: {
      enabled: document.getElementById('cu-enabled')?.checked ?? false,
      displayWidth: Number(document.getElementById('cu-width')?.value ?? 1024),
      displayHeight: Number(document.getElementById('cu-height')?.value ?? 768),
      runtime: document.getElementById('cu-runtime')?.value ?? 'native',
      dockerImage: document.getElementById('cu-docker-image')?.value || undefined,
      screenshotFormat: document.getElementById('cu-screenshot-format')?.value ?? 'png',
      screenshotQuality: Number(document.getElementById('cu-quality')?.value ?? 85),
      actionTimeoutMs: Number(document.getElementById('cu-timeout')?.value ?? 5000),
      requireApproval: document.getElementById('cu-approval')?.checked ?? true,
    },
  };
  const res = await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) {
    toast('Computer Use settings saved', 'success');
  } else {
    toast('Failed to save Computer Use settings', 'error');
  }
}

async function loadToolConfigs() {
  const listEl = document.getElementById('tool-configs-list');
  if (!listEl) return;
  try {
    const res = await fetch(BASE + '/api/tools/config');
    if (!res.ok) { listEl.innerHTML = '<p style="font-size:12px;color:var(--error);">Failed to load tool configurations</p>'; return; }
    const configs = await res.json();
    const tools = [
      { key: 'brave_search_api_key', label: 'Brave Search API', desc: 'Premium web search' },
      { key: 'tavily_api_key', label: 'Tavily Search API', desc: 'AI-optimized search' },
      { key: 'firecrawl_api_key', label: 'Firecrawl API Key', desc: 'Web scraping service' },
      { key: 'firecrawl_url', label: 'Firecrawl URL', desc: 'Self-hosted endpoint' },
      { key: 'serpapi_api_key', label: 'SerpAPI', desc: 'Google Search wrapper' },
    ];
    const configured = tools.filter(t => configs[t.key]?.configured);
    const unconfigured = tools.filter(t => !configs[t.key]?.configured);
    let html = '';
    if (configured.length > 0) {
      html += '<div style="margin-bottom:16px;"><div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:8px;">Configured Tools</div>';
      configured.forEach(tool => {
        const cfg = configs[tool.key];
        html += \`<div class="card-sm" style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;"><div style="flex:1;min-width:0;"><div style="font-size:12px;font-weight:500;margin-bottom:2px;">\${tool.label}</div><div style="font-size:11px;color:var(--text3);">\${tool.desc} • <code style="color:var(--text2);">\${cfg.masked || '••••••'}</code></div></div><div style="display:flex;gap:6px;"><button class="btn btn-ghost" style="font-size:11px;padding:4px 10px;" onclick="editToolConfig('\${tool.key}')">Edit</button><button class="btn btn-ghost" style="font-size:11px;padding:4px 10px;color:var(--error);" onclick="deleteToolConfig('\${tool.key}')">Remove</button></div></div>\`;
      });
      html += '</div>';
    }
    if (unconfigured.length > 0) {
      html += '<div style="font-size:12px;font-weight:500;color:var(--text3);margin-bottom:8px;">Available Tools (' + unconfigured.length + ')</div><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">';
      unconfigured.forEach(tool => html += \`<div class="card-sm" style="padding:10px;"><div style="font-size:11px;font-weight:500;margin-bottom:2px;">\${tool.label}</div><div style="font-size:10px;color:var(--text3);">\${tool.desc}</div></div>\`);
      html += '</div>';
    }
    if (configured.length === 0 && unconfigured.length === 0) html = '<p style="font-size:12px;color:var(--text3);">No tools available</p>';
    listEl.innerHTML = html;
  } catch (err) {
    listEl.innerHTML = \`<p style="font-size:12px;color:var(--error);">Error: \${err.message}</p>\`;
  }
}

function updateToolFields() {
  const select = document.getElementById('tool-name-select');
  const input = document.getElementById('tool-value-input');
  const hint = document.getElementById('tool-value-hint');
  if (!select || !input || !hint) return;
  const tool = select.value;
  if (tool.endsWith('_url')) { input.placeholder = 'https://api.example.com'; input.type = 'url'; hint.textContent = 'Self-hosted service URL'; }
  else { input.placeholder = 'Enter API key'; input.type = 'password'; hint.textContent = 'API key (stored securely in vault)'; }
}

function editToolConfig(toolKey) {
  const select = document.getElementById('tool-name-select');
  if (select) { select.value = toolKey; updateToolFields(); document.getElementById('tool-value-input')?.focus(); document.getElementById('tool-value-input').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}

async function deleteToolConfig(toolKey) {
  if (!confirm('Remove this tool configuration?')) return;
  try {
    const res = await fetch(BASE + '/api/tools/config/' + toolKey, { method: 'DELETE' });
    if (res.ok) { toast('Tool configuration removed', 'success'); loadToolConfigs(); clearToolForm(); }
    else toast('Failed to remove tool configuration', 'error');
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

async function saveToolConfig() {
  const toolSelect = document.getElementById('tool-name-select');
  const valueInput = document.getElementById('tool-value-input');
  if (!toolSelect || !valueInput) return;
  const tool = toolSelect.value;
  const value = valueInput.value.trim();
  if (!tool) { toast('Please select a tool', 'error'); return; }
  if (!value) { toast('Please enter a value', 'error'); return; }
  try {
    const res = await fetch(BASE + '/api/tools/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool, value, service: 'tool' }) });
    if (res.ok) { toast('Tool configuration saved', 'success'); loadToolConfigs(); clearToolForm(); }
    else { const err = await res.text(); toast('Failed to save: ' + err, 'error'); }
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

function clearToolForm() {
  const select = document.getElementById('tool-name-select');
  const input = document.getElementById('tool-value-input');
  if (select) select.value = '';
  if (input) input.value = '';
  updateToolFields();
}

async function checkUpdatesNow() {
  toast('Checking for updates...', 'info');
  try {
    const res = await fetch(BASE + '/api/updates/check', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      if (data.updateAvailable) {
        toast(\`Update available: \${data.latestVersion}\`, 'success');
      } else {
        toast('You are running the latest version', 'success');
      }
    } else {
      toast('Update checking not yet implemented in this build', 'info');
    }
  } catch (e) {
    toast('Update checking not yet implemented in this build', 'info');
  }
}

async function removeProvider(kind) {
  const body = { kind, model: '' };
  await fetch(BASE + '/api/config/provider', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  toast(providerLabel(kind) + ' removed', 'info');
  loadSettings();
}

let _fetchingModels = false;

async function showAddModelModal(prefillKind) {
  const modal = document.getElementById('model-modal');
  if (modal) modal.remove();

  const div = document.createElement('div');
  div.id = 'model-modal';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;display:flex;align-items:center;justify-content:center;';
  div.innerHTML = \`
    <div class="card" style="width:520px;max-height:90vh;overflow-y:auto;">
      <div style="font-size:14px;font-weight:600;margin-bottom:14px;">Add Model</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Provider</label>
          <select class="inp" id="modal-kind" onchange="onModalKindChange()">
            \${PROVIDER_KINDS.map(k => \`<option value="\${k}" \${k===prefillKind?'selected':''}>\${PROVIDER_META[k].label}</option>\`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">API Key</label>
          <input class="inp" id="modal-apikey" type="password" placeholder="Enter API key…" autocomplete="off" style="font-family:'JetBrains Mono',monospace;font-size:12px;" />
        </div>
        <div id="modal-baseurl-wrap" style="display:none;">
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Base URL / Region</label>
          <input class="inp" id="modal-baseurl" placeholder="" style="font-size:12px;" />
        </div>
        <div id="modal-secret-wrap" style="display:none;">
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Secret Access Key</label>
          <input class="inp" id="modal-secret" type="password" placeholder="Enter secret key…" autocomplete="off" style="font-size:12px;" />
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-ghost" id="modal-fetch-btn" onclick="fetchModelsForModal()">Fetch Models</button>
          <span id="modal-fetch-status" style="font-size:11px;color:var(--text3);"></span>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Model</label>
          <select class="inp" id="modal-model"><option value="">— Select a model —</option></select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Temperature</label>
            <input class="inp" id="modal-temp" type="number" step="0.1" min="0" max="2" value="0.7" style="font-size:12px;" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Max Tokens</label>
            <input class="inp" id="modal-maxtokens" type="number" min="1" max="999999" placeholder="4096" style="font-size:12px;" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Top P</label>
            <input class="inp" id="modal-topp" type="number" step="0.05" min="0" max="1" placeholder="1.0" style="font-size:12px;" />
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" onclick="saveModelFromModal()">Save Model</button>
        <button class="btn btn-ghost" onclick="closeModelModal()">Cancel</button>
        <span id="modal-save-status" style="font-size:12px;align-self:center;margin-left:4px;"></span>
      </div>
    </div>
  \`;
  document.body.appendChild(div);
  onModalKindChange();
}

function closeModelModal() {
  const modal = document.getElementById('model-modal');
  if (modal) modal.remove();
}

async function showEditModelModal(kind) {
  const config = await fetch(BASE + '/api/config').then(r => r.json()).catch(() => null);
  if (!config) return;
  const p = config.providers?.[kind];
  const meta = PROVIDER_META[kind];
  if (!meta) return;

  const modal = document.getElementById('model-modal');
  if (modal) modal.remove();

  const div = document.createElement('div');
  div.id = 'model-modal';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;display:flex;align-items:center;justify-content:center;';
  div.innerHTML = \`
    <div class="card" style="width:520px;max-height:90vh;overflow-y:auto;">
      <div style="font-size:14px;font-weight:600;margin-bottom:14px;">Edit \${esc(meta.label)}</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Provider</label>
          <input class="inp" value="\${esc(meta.label)}" disabled style="font-size:12px;" />
          <input type="hidden" id="modal-kind" value="\${kind}" />
        </div>
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">API Key \${p?.apiKey ? '<span style="color:#4ade80;">✓ set</span>' : ''}</label>
          <input class="inp" id="modal-apikey" type="password" placeholder="Enter new key to update…" autocomplete="off" style="font-family:'JetBrains Mono',monospace;font-size:12px;" />
        </div>
        \${meta.needsBaseUrl ? \`<div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Base URL / Region</label>
          <input class="inp" id="modal-baseurl" value="\${esc(p?.baseUrl ?? '')}" style="font-size:12px;" /></div>\` : ''}
        \${meta.needsSecret ? \`<div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Secret Access Key \${p?.secretKey ? '<span style="color:#4ade80;">✓ set</span>' : ''}</label>
          <input class="inp" id="modal-secret" type="password" placeholder="Enter new secret key to update…" autocomplete="off" style="font-size:12px;" /></div>\` : ''}
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-ghost" id="modal-fetch-btn" onclick="fetchModelsForModal()">Fetch Models</button>
          <span id="modal-fetch-status" style="font-size:11px;color:var(--text3);"></span>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Model</label>
          <select class="inp" id="modal-model"><option value="">\${esc(p?.model || '— Select a model —')}</option></select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Temperature</label>
            <input class="inp" id="modal-temp" type="number" step="0.1" min="0" max="2" value="\${p?.temperature ?? 0.7}" style="font-size:12px;" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Max Tokens</label>
            <input class="inp" id="modal-maxtokens" type="number" min="1" max="999999" placeholder="4096" value="\${p?.maxTokens ?? ''}" style="font-size:12px;" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Top P</label>
            <input class="inp" id="modal-topp" type="number" step="0.05" min="0" max="1" placeholder="1.0" value="\${p?.topP ?? ''}" style="font-size:12px;" />
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" onclick="saveModelFromModal()">Save Changes</button>
        <button class="btn btn-ghost" onclick="closeModelModal()">Cancel</button>
        <span id="modal-save-status" style="font-size:12px;align-self:center;margin-left:4px;"></span>
      </div>
    </div>
  \`;
  document.body.appendChild(div);
  onModalKindChange(p || {});
}

async function onModalKindChange(existingValues) {
  const kind = document.getElementById('modal-kind')?.value;
  if (!kind) return;
  const meta = PROVIDER_META[kind];
  const baseUrlWrap = document.getElementById('modal-baseurl-wrap');
  const secretWrap = document.getElementById('modal-secret-wrap');
  const baseUrlInput = document.getElementById('modal-baseurl');
  if (baseUrlWrap) baseUrlWrap.style.display = meta.needsBaseUrl ? 'block' : 'none';
  if (secretWrap) secretWrap.style.display = meta.needsSecret ? 'block' : 'none';
  if (baseUrlInput && meta.defaultBaseUrl) baseUrlInput.placeholder = meta.defaultBaseUrl;

  // Inject / refresh provider-specific settings section
  const existing = existingValues || {};
  const extraFields = PROVIDER_EXTRA_FIELDS[kind] || [];
  let extraWrap = document.getElementById('modal-extra-wrap');
  if (extraFields.length === 0) {
    if (extraWrap) extraWrap.remove();
    return;
  }
  if (!extraWrap) {
    extraWrap = document.createElement('div');
    extraWrap.id = 'modal-extra-wrap';
    const saveRow = document.querySelector('#model-modal .btn-primary')?.closest('div[style*="margin-top:16px"]');
    if (saveRow) saveRow.parentNode.insertBefore(extraWrap, saveRow);
    else document.querySelector('#model-modal .card > div:last-child')?.before(extraWrap);
  }

  const rows = extraFields.map(f => {
    const val = existing[f.key];
    let input = '';
    if (f.type === 'select') {
      const opts = f.options.map(([v, lbl]) =>
        \`<option value="\${esc(v)}" \${val == v ? 'selected' : ''}>\${esc(lbl)}</option>\`
      ).join('');
      input = \`<select class="inp" id="modal-extra-\${f.key}" style="font-size:12px;">\${opts}</select>\`;
    } else if (f.type === 'checkbox') {
      input = \`<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="modal-extra-\${f.key}" \${val ? 'checked' : ''} style="width:15px;height:15px;accent-color:var(--accent);" />
        <span style="font-size:12px;color:var(--text2);">\${esc(f.label)}</span>
      </label>\`;
    } else {
      const numAttrs = f.type === 'number'
        ? \`type="number" min="\${f.min ?? ''}" max="\${f.max ?? ''}" step="\${f.step ?? 'any'}"\`
        : 'type="text"';
      input = \`<input class="inp" id="modal-extra-\${f.key}" \${numAttrs} placeholder="\${esc(f.placeholder ?? '')}" value="\${esc(val ?? '')}" style="font-size:12px;" />\`;
    }
    const labelRow = f.type === 'checkbox' ? '' :
      \`<label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">\${esc(f.label)}</label>\`;
    return \`<div>\${labelRow}\${input}
      \${f.hint ? \`<p style="font-size:10px;color:var(--text3);margin-top:2px;">\${esc(f.hint)}</p>\` : ''}
    </div>\`;
  }).join('');

  extraWrap.innerHTML = \`
    <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px;">
      <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">
        \${esc(meta.label)} Settings
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">
        \${rows}
      </div>
    </div>
  \`;
}

async function fetchModelsForModal() {
  if (_fetchingModels) return;
  const kind = document.getElementById('modal-kind')?.value;
  const apiKey = document.getElementById('modal-apikey')?.value;
  const baseUrl = document.getElementById('modal-baseurl')?.value;
  if (!kind) return;

  if (!apiKey && kind !== 'ollama') {
    document.getElementById('modal-fetch-status').textContent = 'API key required';
    return;
  }

  _fetchingModels = true;
  const btn = document.getElementById('modal-fetch-btn');
  const status = document.getElementById('modal-fetch-status');
  if (btn) btn.textContent = 'Fetching…';
  if (status) status.textContent = '';

  try {
    const params = new URLSearchParams();
    if (apiKey) params.set('apiKey', apiKey);
    if (baseUrl) params.set('baseUrl', baseUrl);
    const res = await fetch(BASE + '/api/providers/' + kind + '/models?' + params.toString());
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Failed to fetch models');
    }
    const models = await res.json();
    const select = document.getElementById('modal-model');
    if (!select) return;
    select.innerHTML = '<option value="">— Select a model —</option>'
      + models.map(m => '<option value="' + esc(m.id) + '"'
        + (m.name ? ' data-name="' + esc(m.name) + '"' : '')
        + '>' + esc(m.name || m.id) + '</option>').join('');
    if (status) status.textContent = models.length + ' models loaded';
  } catch (err) {
    if (status) status.textContent = 'Error: ' + err.message;
  } finally {
    _fetchingModels = false;
    if (btn) btn.textContent = 'Fetch Models';
  }
}

async function saveModelFromModal() {
  const kind = document.getElementById('modal-kind')?.value;
  const model = document.getElementById('modal-model')?.value;
  const apiKey = document.getElementById('modal-apikey')?.value;
  const baseUrl = document.getElementById('modal-baseurl')?.value;
  const secret = document.getElementById('modal-secret')?.value;
  const temp = document.getElementById('modal-temp')?.value;
  const maxTokens = document.getElementById('modal-maxtokens')?.value;
  const topP = document.getElementById('modal-topp')?.value;
  const status = document.getElementById('modal-save-status');

  if (!kind || !model) {
    if (status) status.textContent = 'Please select a model';
    return;
  }

  const body = { kind, model };
  if (apiKey) body.apiKey = apiKey;
  if (baseUrl) body.baseUrl = baseUrl;
  if (secret) body.secretKey = secret;
  if (temp) body.temperature = parseFloat(temp);
  if (maxTokens) body.maxTokens = parseInt(maxTokens, 10);
  if (topP) body.topP = parseFloat(topP);

  // Collect provider-specific extra fields
  const extraFields = PROVIDER_EXTRA_FIELDS[kind] || [];
  for (const f of extraFields) {
    const el = document.getElementById('modal-extra-' + f.key);
    if (!el) continue;
    if (f.type === 'checkbox') {
      body[f.key] = el.checked;
    } else if (f.type === 'number') {
      const v = parseFloat(el.value);
      if (!isNaN(v)) body[f.key] = v;
    } else {
      if (el.value !== '') body[f.key] = el.value;
    }
  }

  try {
    const res = await fetch(BASE + '/api/config/provider', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast(providerLabel(kind) + ' saved', 'success');
      closeModelModal();
      loadSettings();
    } else {
      if (status) status.textContent = 'Failed to save';
    }
  } catch {
    if (status) status.textContent = 'Network error';
  }
}

// ── Agents ───────────────────────────────────────────────────
async function loadAgents() {
  const el = document.getElementById('agents-content');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><div class="skeleton" style="width:200px;height:20px;margin-bottom:10px;"></div><div class="skeleton" style="width:300px;height:14px;"></div></div>';
  try {
    const [agents, currentRes, sessions, workspaces] = await Promise.all([
      fetch(BASE + '/api/agents').then(r => r.json()).catch(() => []),
      fetch(BASE + '/api/agents/current').then(r => r.json()).catch(() => null),
      fetch(BASE + '/api/sessions?limit=100').then(r => r.json()).catch(() => []),
      fetch(BASE + '/api/workspace/agents').then(r => r.json()).catch(() => []),
    ]);
    const currentAgentId = currentRes?.id || 'default';
    const wsMap = {};
    for (const w of workspaces) wsMap[w.agentId] = w.workspaceDir;
    const sessCount = {};
    for (const s of sessions) {
      const aid = s.agent_id || 'default';
      sessCount[aid] = (sessCount[aid] || 0) + 1;
    }
    if (!agents.length) {
      el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><p style="color:var(--text3);font-size:13px;">No custom agents yet.</p><p style="color:var(--text3);font-size:11px;margin-top:4px;">Click "+ New Agent" to create one.</p></div>';
      return;
    }
    el.innerHTML = agents.map(function(a) {
      var ac = [];
      var cardBorder = a.id === currentAgentId ? 'border-color:rgba(99,102,241,0.3);' : '';
      ac.push('<div class="card" style="' + cardBorder + '"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;"><div style="flex:1;min-width:0;">');
      ac.push('<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">');
      ac.push('<span style="font-size:14px;font-weight:600;">' + esc(a.name) + '</span>');
      ac.push('<span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text2);font-size:10px;">' + esc(a.id) + '</span>');
      if (a.id === currentAgentId) ac.push('<span class="badge" style="background:rgba(99,102,241,0.15);color:var(--accent2);">● active</span>');
      ac.push('</div>');
      if (a.description) ac.push('<p style="font-size:12px;color:var(--text2);margin-bottom:6px;">' + esc(a.description) + '</p>');
      ac.push('<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">');
      if (a.provider) ac.push('<span style="color:var(--text3);font-size:11px;">' + esc(a.provider) + '/' + esc(a.model || '?') + '</span>');
      if (a.temperature != null) ac.push('<span style="color:var(--text3);font-size:11px;">temp ' + a.temperature + '</span>');
      var toolCount = a.tools ? a.tools.length : 0;
      ac.push(toolCount > 0 ? '<span style="color:var(--text3);font-size:11px;">' + toolCount + ' tool(s)</span>' : '<span style="color:var(--text3);font-size:11px;">all tools</span>');
      if (a.soul) ac.push('<span class="badge" style="background:rgba(99,102,241,0.08);color:var(--accent2);font-size:10px;">custom soul</span>');
      var sc = sessCount[a.id] || 0;
      ac.push('<span class="badge" style="background:rgba(34,197,94,0.08);color:#4ade80;font-size:10px;">' + sc + ' session(s)</span>');
      if (a.tags && a.tags.length) {
        for (var ti = 0; ti < a.tags.length; ti++) {
          ac.push('<span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text3);font-size:10px;">' + esc(a.tags[ti]) + '</span>');
        }
      }
      ac.push('</div>');
      if (a.systemPrompt) ac.push('<div style="margin-top:6px;font-size:11px;color:var(--text3);font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(a.systemPrompt) + '</div>');
      var wsDir = wsMap[a.id] || '';
      if (wsDir) ac.push('<div style="margin-top:4px;font-size:10px;color:var(--text3);font-family:JetBrains Mono,monospace;">' + esc(wsDir) + '</div>');
      ac.push('</div><div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;">');
      if (a.id !== currentAgentId) ac.push('<button class="btn btn-primary" style="font-size:12px;padding:4px 12px;" onclick="selectAgent(\\'' + a.id + '\\')">Activate</button>');
      ac.push('<button class="btn btn-ghost" style="font-size:12px;padding:4px 10px;" onclick="editAgent(\\'' + a.id + '\\')">Edit</button>');
      ac.push('<button class="btn btn-ghost" style="font-size:12px;padding:4px 10px;" onclick="showPage(\\'sessions\\');var f=document.getElementById(\\'sess-agent-filter\\');if(f){f.value=\\'' + a.id + '\\';loadSessionsList();}">Sessions</button>');
      if (a.id !== 'default') ac.push('<button class="btn" style="font-size:12px;padding:4px 10px;background:rgba(239,68,68,0.1);color:#f87171;" onclick="deleteAgent(\\'' + a.id + '\\')">✕</button>');
      ac.push('</div></div></div>');
      return ac.join('');
    }).join('');
  } catch (e) {
    el.innerHTML = \`<p style="color:var(--text3);font-size:13px;">Error loading agents: \${e.message}</p>\`;
  }
}

async function selectAgent(id) {
  const res = await fetch(BASE + '/api/agents/' + encodeURIComponent(id) + '/select', { method: 'POST' });
  if (res.ok) { toast('Agent activated', 'success'); loadAgents(); }
  else { toast('Failed to activate agent', 'error'); }
}

async function deleteAgent(id) {
  const ok = await confirmAction('Delete Agent', \`Delete agent "\${id}"? This cannot be undone.\`, 'Delete');
  if (!ok) return;
  const res = await fetch(BASE + '/api/agents/' + encodeURIComponent(id), { method: 'DELETE' });
  if (res.ok) { toast('Agent deleted', 'success'); loadAgents(); }
  else {
    const data = await res.json();
    toast(data.error || 'Failed to delete agent', 'error');
  }
}

async function loadAgentModalProviders(selectedProvider) {
  const sel = document.getElementById('ag-provider');
  if (!sel) return;
  sel.innerHTML = '<option value="">Default (use global)</option>';
  try {
    const providers = await fetch(BASE + '/api/providers/configured').then(r => r.json()).catch(() => []);
    for (const p of providers) {
      const meta = PROVIDER_META[p.kind];
      const label = meta ? meta.label : p.kind;
      const opt = document.createElement('option');
      opt.value = p.kind;
      opt.textContent = label;
      if (p.kind === selectedProvider) opt.selected = true;
      sel.appendChild(opt);
    }
    if (providers.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '— No providers configured —';
      opt.disabled = true;
      sel.appendChild(opt);
    }
  } catch {}
  if (selectedProvider) await onAgentProviderChange(selectedProvider);
}

async function onAgentProviderChange(preselectedModel) {
  const kind = document.getElementById('ag-provider')?.value;
  const modelSelect = document.getElementById('ag-model');
  const modelText = document.getElementById('ag-model-text');
  const modelStatus = document.getElementById('ag-model-status');
  if (!modelSelect || !modelText) return;

  if (!kind) {
    modelSelect.style.display = 'none';
    modelText.style.display = '';
    modelText.value = typeof preselectedModel === 'string' ? preselectedModel : '';
    if (modelStatus) modelStatus.textContent = '';
    return;
  }

  if (modelStatus) modelStatus.textContent = 'loading…';
  modelText.style.display = 'none';
  modelSelect.style.display = '';

  try {
    const res = await fetch(BASE + '/api/providers/' + kind + '/models');
    if (res.ok) {
      const models = await res.json();
      const currentVal = typeof preselectedModel === 'string' ? preselectedModel : modelText.value;
      modelSelect.innerHTML = '<option value="">Default for provider</option>'
        + models.map(m => {
            const id = m.id || m;
            const label = m.name ? m.name + ' (' + id + ')' : id;
            return '<option value="' + esc(id) + '"' + (id === currentVal ? ' selected' : '') + '>' + esc(label) + '</option>';
          }).join('');
      if (currentVal && !modelSelect.value) {
        const opt = document.createElement('option');
        opt.value = currentVal;
        opt.textContent = currentVal;
        opt.selected = true;
        modelSelect.appendChild(opt);
      }
      if (modelStatus) modelStatus.textContent = models.length + ' models';
    } else {
      modelSelect.style.display = 'none';
      modelText.style.display = '';
      if (modelStatus) modelStatus.textContent = 'could not load models';
    }
  } catch {
    modelSelect.style.display = 'none';
    modelText.style.display = '';
    if (modelStatus) modelStatus.textContent = 'could not load models';
  }
}

function showNewAgentForm() {
  document.getElementById('agent-modal-title').textContent = 'Create Agent';
  document.getElementById('agent-submit-btn').textContent = 'Create Agent';
  document.getElementById('ag-edit-id').value = '';
  ['ag-name','ag-desc','ag-sysprompt','ag-tools','ag-tags','ag-soul'].forEach(id => document.getElementById(id).value = '');
  const modelSel = document.getElementById('ag-model');
  const modelText = document.getElementById('ag-model-text');
  if (modelSel) { modelSel.innerHTML = '<option value="">Default for provider</option>'; modelSel.style.display = 'none'; }
  if (modelText) { modelText.value = ''; modelText.style.display = ''; }
  document.getElementById('ag-temp').value = '';
  document.getElementById('ag-status').textContent = '';
  document.getElementById('new-agent-modal').style.display = 'flex';
  loadAgentModalProviders('');
}

async function editAgent(id) {
  const res = await fetch(BASE + '/api/agents/' + encodeURIComponent(id));
  if (!res.ok) { toast('Failed to load agent', 'error'); return; }
  const a = await res.json();
  document.getElementById('agent-modal-title').textContent = 'Edit Agent: ' + a.name;
  document.getElementById('agent-submit-btn').textContent = 'Save Changes';
  document.getElementById('ag-edit-id').value = a.id;
  document.getElementById('ag-name').value = a.name || '';
  document.getElementById('ag-desc').value = a.description || '';
  document.getElementById('ag-temp').value = a.temperature != null ? a.temperature : '';
  document.getElementById('ag-sysprompt').value = a.systemPrompt || '';
  document.getElementById('ag-tools').value = (a.tools || []).join(', ');
  document.getElementById('ag-tags').value = (a.tags || []).join(', ');
  document.getElementById('ag-soul').value = a.soul || '';
  document.getElementById('ag-status').textContent = '';
  document.getElementById('new-agent-modal').style.display = 'flex';
  await loadAgentModalProviders(a.provider || '');
  if (a.model) await onAgentProviderChange(a.model);
}

function hideAgentModal() {
  document.getElementById('new-agent-modal').style.display = 'none';
}

async function submitAgentForm() {
  const name = document.getElementById('ag-name').value.trim();
  if (!name) { document.getElementById('ag-status').textContent = 'Name is required.'; return; }
  const editId = document.getElementById('ag-edit-id').value;
  const tools = document.getElementById('ag-tools').value.trim();
  const tags = document.getElementById('ag-tags').value.trim();
  const temp = document.getElementById('ag-temp').value.trim();
  const body = {
    name,
    description: document.getElementById('ag-desc').value.trim() || undefined,
    provider: document.getElementById('ag-provider').value || undefined,
    model: (document.getElementById('ag-model').style.display !== 'none'
      ? document.getElementById('ag-model').value
      : document.getElementById('ag-model-text').value.trim()) || undefined,
    temperature: temp ? Number(temp) : undefined,
    systemPrompt: document.getElementById('ag-sysprompt').value.trim() || undefined,
    tools: tools ? tools.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    tags: tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    soul: document.getElementById('ag-soul').value.trim() || undefined,
  };

  try {
    let res;
    if (editId) {
      res = await fetch(BASE + '/api/agents/' + encodeURIComponent(editId), {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body),
      });
    } else {
      res = await fetch(BASE + '/api/agents', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body),
      });
    }
    if (res.ok) {
      hideAgentModal();
      toast(editId ? 'Agent updated' : 'Agent created', 'success');
      loadAgents();
    } else {
      const data = await res.json();
      document.getElementById('ag-status').textContent = data.error || 'Save failed.';
    }
  } catch (e) {
    document.getElementById('ag-status').textContent = e.message;
  }
}

// ── Services ─────────────────────────────────────────────────
async function loadServices() {
  const el = document.getElementById('services-content');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><div class="skeleton" style="width:200px;height:20px;margin-bottom:10px;"></div><div class="skeleton" style="width:300px;height:14px;"></div></div>';
  try {
    const data = await fetch(BASE + '/api/services').then(r => r.json());
    const services = data.services || [];
    const runtime = data.runtime || [];
    const rtMap = new Map(runtime.map(r => [r.id, r]));

    if (!services.length) {
      el.innerHTML = [
        '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;">',
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><path d="M6 6h.01M6 18h.01"/></svg>',
        '<p style="color:var(--text3);font-size:13px;">No micro-services yet.</p>',
        '<p style="color:var(--text3);font-size:11px;margin-top:4px;">Use "cortex service create" from the CLI to register one.</p>',
        '</div>',
      ].join('');
      return;
    }

    el.innerHTML = services.map(s => {
      const rt = rtMap.get(s.id);
      const isRunning = rt && rt.running;
      const statusColor = isRunning ? '#4ade80' : s.status === 'failed' ? '#f87171' : 'var(--text3)';
      const statusDot = isRunning ? '●' : '○';
      const uptimeHtml = rt && rt.uptime
        ? '<span style="font-size:11px;color:var(--text3);">' + rt.uptime + 's up</span>'
        : '';
      return [
        '<div class="card">',
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">',
        '<div style="flex:1;min-width:0;">',
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">',
        '<span style="color:' + statusColor + ';">' + statusDot + '</span>',
        '<span style="font-size:14px;font-weight:600;">' + esc(s.name) + '</span>',
        '<span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text2);font-size:10px;">' + esc(s.id) + '</span>',
        '<span class="badge" style="background:rgba(255,255,255,0.06);color:' + statusColor + ';">' + s.status + '</span>',
        '</div>',
        s.description ? '<p style="font-size:12px;color:var(--text2);margin-bottom:4px;">' + esc(s.description) + '</p>' : '',
        '<div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--text3);">',
        '<span>Agent: ' + esc(s.agentId) + '</span>',
        s.port > 0 ? '<span>Port: ' + s.port + '</span>' : '',
        s.model ? '<span>Model: ' + esc(s.model) + '</span>' : '',
        s.tools ? '<span>Tools: ' + esc(s.tools) + '</span>' : '',
        s.autoStart ? '<span>Auto-start</span>' : '',
        uptimeHtml,
        '</div>',
        '</div>',
        '<div style="display:flex;gap:6px;flex-shrink:0;">',
        isRunning
          ? '<button class="btn btn-ghost" style="font-size:12px;padding:4px 12px;" onclick="serviceAction(\\'' + s.id + '\\',\\'stop\\')">Stop</button>'
          : '<button class="btn btn-primary" style="font-size:12px;padding:4px 12px;" onclick="serviceAction(\\'' + s.id + '\\',\\'start\\')">Start</button>',
        '<button class="btn" style="font-size:12px;padding:4px 12px;background:rgba(239,68,68,0.1);color:#f87171;" onclick="serviceAction(\\'' + s.id + '\\',\\'delete\\')">Delete</button>',
        '</div>',
        '</div>',
        '</div>',
      ].join('');
    }).join('\\n');
  } catch (e) {
    el.innerHTML = '<p style="color:var(--text3);font-size:13px;">Error: ' + e.message + '</p>';
  }
}

async function serviceAction(id, action) {
  if (action === 'delete') {
    const ok = await confirmAction('Delete Service', 'Delete this service? This cannot be undone.', 'Delete');
    if (!ok) return;
    const res = await fetch(BASE + '/api/services/' + encodeURIComponent(id), { method: 'DELETE' });
    if (res.ok) {
      toast('Service deleted', 'success');
      loadServices();
    } else {
      toast('Failed to delete service', 'error');
    }
    return;
  }
  const res = await fetch(BASE + '/api/services/' + encodeURIComponent(id) + '/' + action, { method: 'POST' });
  if (res.ok) {
    toast('Service ' + action + 'ed', 'success');
    loadServices();
  } else {
    toast('Failed to ' + action + ' service', 'error');
  }
}

// ── Plugins ──────────────────────────────────────────────────
async function loadPlugins() {
  const plugins = await fetch(BASE + '/api/plugins').then(r => r.json()).catch(() => []);
  const el = document.getElementById('plugins-list');
  if (!el) return;
  if (!plugins.length) { el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg><p style="color:var(--text3);font-size:13px;">No plugins installed.</p><p style="color:var(--text3);font-size:11px;margin-top:4px;">Click "+ Install Plugin" to add an ESM, MCP, or WASM plugin.</p></div>'; return; }
  el.innerHTML = plugins.map(p => {
    const caps = JSON.parse(p.declared_permissions || '[]');
    return \`<div class="card" style="display:flex;align-items:flex-start;gap:14px;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="font-size:13px;font-weight:600;">\${esc(p.name)}</span>
          <span class="badge" style="background:rgba(99,102,241,0.12);color:var(--accent2);">\${esc(p.type)}</span>
          <span class="badge" style="background:rgba(99,102,241,0.12);color:var(--accent2);">v\${esc(p.version)}</span>
          <span class="badge" style="background:\${p.enabled?'rgba(34,197,94,0.1)':'rgba(255,255,255,0.05)'};color:\${p.enabled?'#4ade80':'var(--text3)'};">\${p.enabled?'enabled':'disabled'}</span>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:6px;">\${esc(p.description ?? '')}</div>
        <div style="font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">\${esc(p.entry)}</div>
        \${caps.length ? \`<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">\${caps.map(c => \`<span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text3);">\${esc(c)}</span>\`).join('')}</div>\` : ''}
        \${p.author ? \`<div style="font-size:11px;color:var(--text3);margin-top:4px;">by \${esc(p.author)}\${p.source?' · <a href="'+esc(p.source)+'" target="_blank" style="color:var(--accent2);">homepage</a>':''}</div>\` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        \${p.enabled
          ? \`<button class="btn btn-ghost" style="font-size:12px;" onclick="togglePlugin('\${p.name}', false)">Disable</button>\`
          : \`<button class="btn btn-ghost" style="font-size:12px;" onclick="togglePlugin('\${p.name}', true)">Enable</button>\`}
        <button class="btn" style="font-size:12px;background:rgba(239,68,68,0.1);color:#f87171;" onclick="deletePlugin('\${p.name}')">Remove</button>
      </div>
    </div>\`;
  }).join('');
}

function showInstallModal() {
  document.getElementById('plugin-modal').style.display = 'flex';
}
function hideInstallModal() {
  document.getElementById('plugin-modal').style.display = 'none';
}
async function submitInstallPlugin() {
  const name = document.getElementById('pm-name').value.trim();
  const entry = document.getElementById('pm-entry').value.trim();
  if (!name || !entry) { document.getElementById('pm-status').textContent = 'Name and Entry Point required.'; return; }
  const body = {
    id: '', name, version: document.getElementById('pm-version').value || '1.0.0',
    description: document.getElementById('pm-desc').value,
    kind: document.getElementById('pm-kind').value,
    entryPoint: entry, capabilities: [],
    author: document.getElementById('pm-author').value || undefined,
  };
  const res = await fetch(BASE + '/api/plugins/install', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) { hideInstallModal(); toast('Plugin installed', 'success'); loadPlugins(); }
  else { document.getElementById('pm-status').textContent = 'Install failed.'; }
}
async function togglePlugin(name, enable) {
  await fetch(\`\${BASE}/api/plugins/\${name}/\${enable?'enable':'disable'}\`, { method: 'POST' });
  loadPlugins();
  loadPluginPanels();
}
async function deletePlugin(name) {
  const ok = await confirmAction('Remove Plugin', 'Remove this plugin?', 'Remove');
  if (!ok) return;
  const res = await fetch(\`\${BASE}/api/plugins/\${name}\`, { method: 'DELETE' });
  if (res.ok) toast('Plugin removed', 'success');
  loadPlugins();
  loadPluginPanels();
}

// ── Plugin Panels (dynamic) ─────────────────────────────────

let pluginPanels = [];
let activePluginPanel = null;

async function loadPluginPanels() {
  try {
    const res = await fetch(BASE + '/api/plugins/panels');
    pluginPanels = await res.json();
  } catch { pluginPanels = []; }
  loadPluginPanelsNav();
  loadPluginPanelsTabs();
}

function loadPluginPanelsNav() {
  const nav = document.getElementById('plugin-panels-nav');
  if (!nav) return;
  nav.innerHTML = pluginPanels.map(p => {
    const id = 'nav-pp-' + p.pluginId + '-' + p.panelId;
    return \`<button class="nav-item" onclick="showPage('pluginpanels');selectPluginPanel('\${p.pluginId}','\${p.panelId}')" id="\${id}">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></span> \${p.title}
    </button>\`;
  }).join('');
}

function loadPluginPanelsTabs() {
  const tabs = document.getElementById('plugin-panels-tabs');
  if (!tabs) return;
  tabs.innerHTML = pluginPanels.map(p =>
    \`<button id="ppt-\${p.pluginId}-\${p.panelId}" class="btn" style="flex:0;border-radius:0;padding:10px 16px;font-size:13px;background:transparent;color:var(--text2);border-bottom:2px solid transparent;"
      onclick="selectPluginPanel('\${p.pluginId}','\${p.panelId}')">\${p.title}</button>\`
  ).join('');
}

function selectPluginPanel(pluginId, panelId) {
  activePluginPanel = { pluginId, panelId };

  // Update tab styling
  document.querySelectorAll('[id^="ppt-"]').forEach(b => {
    b.style.background = 'transparent';
    b.style.color = 'var(--text2)';
    b.style.borderBottomColor = 'transparent';
  });
  const tab = document.getElementById('ppt-' + pluginId + '-' + panelId);
  if (tab) {
    tab.style.background = 'rgba(99,102,241,0.1)';
    tab.style.color = 'var(--accent2)';
    tab.style.borderBottomColor = 'var(--accent)';
  }

  // Update nav highlighting
  document.querySelectorAll('[id^="nav-pp-"]').forEach(b => b.classList.remove('active'));
  const navItem = document.getElementById('nav-pp-' + pluginId + '-' + panelId);
  if (navItem) navItem.classList.add('active');

  renderPluginPanel(pluginId, panelId);
}

function renderPluginPanel(pluginId, panelId) {
  const content = document.getElementById('plugin-panels-content');
  if (!content) return;
  content.innerHTML = \`<iframe id="plugin-iframe"
    src="/api/plugins/\${encodeURIComponent(pluginId)}/panel"
    style="width:100%;height:100%;border:none;"
    sandbox="allow-scripts"
  ></iframe>\`;
}

// Handle postMessage from plugin iframes
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'cortex-notification') {
    var n = e.data.notification;
    if (n && n.msg) toast(n.msg, n.type || 'info');
  }
});

// ── Marketplace ────────────────────────────────────────────────
let marketplaceTab = 'plugins';
let marketplaceSearchTimeout = null;

function marketplaceDelayedSearch() {
  if (marketplaceSearchTimeout) clearTimeout(marketplaceSearchTimeout);
  marketplaceSearchTimeout = setTimeout(loadMarketplace, 300);
}

function switchMarketplaceTab(tab) {
  marketplaceTab = tab;
  const pluginsBtn = document.getElementById('mp-tab-plugins');
  const agentsBtn = document.getElementById('mp-tab-agents');
  if (tab === 'plugins') {
    pluginsBtn.style.background = 'rgba(99,102,241,0.1)';
    pluginsBtn.style.color = 'var(--accent2)';
    pluginsBtn.style.borderBottomColor = 'var(--accent)';
    agentsBtn.style.background = 'transparent';
    agentsBtn.style.color = 'var(--text2)';
    agentsBtn.style.borderBottomColor = 'transparent';
  } else {
    agentsBtn.style.background = 'rgba(99,102,241,0.1)';
    agentsBtn.style.color = 'var(--accent2)';
    agentsBtn.style.borderBottomColor = 'var(--accent)';
    pluginsBtn.style.background = 'transparent';
    pluginsBtn.style.color = 'var(--text2)';
    pluginsBtn.style.borderBottomColor = 'transparent';
  }
  loadMarketplace();
}

async function loadMarketplaceCategories() {
  try {
    const cats = await fetch(BASE + '/api/marketplace/categories').then(r => r.json()).catch(() => []);
    const sel = document.getElementById('mp-category');
    if (!sel) return;
    sel.innerHTML = '<option value="">All categories</option>' +
      cats.map(c => '<option value="' + esc(c.slug) + '">' + esc(c.name) + ' (' + (c.pluginCount + c.agentCount) + ')</option>').join('');
  } catch {}
}

async function loadMarketplace() {
  const el = document.getElementById('mp-content');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:60px 20px;"><p style="color:var(--text3);font-size:13px;">Loading…</p></div>';

  await loadMarketplaceCategories();

  const search = document.getElementById('mp-search')?.value?.trim() || '';
  const kind = document.getElementById('mp-kind')?.value || '';
  const category = document.getElementById('mp-category')?.value || '';

  try {
    const [stats, installedPlugins, installedAgents] = await Promise.all([
      fetch(BASE + '/api/marketplace/stats').then(r => r.json()).catch(() => null),
      fetch(BASE + '/api/plugins').then(r => r.json()).catch(() => []),
      fetch(BASE + '/api/agents').then(r => r.json()).catch(() => []),
    ]);
    const statsEl = document.getElementById('mp-stats');
    if (statsEl && stats) {
      statsEl.textContent = stats.totalPlugins + ' plugins · ' + stats.totalAgents + ' agents · ' + (stats.totalDownloads >= 1000 ? Math.round(stats.totalDownloads/1000) + 'K' : stats.totalDownloads) + ' downloads';
    }
    const installedPluginNames = new Set((installedPlugins || []).map((i) => i.name));
    const installedPluginMap = new Map((installedPlugins || []).map((i) => [i.name, i]));
    const installedAgentNames = new Set((installedAgents || []).map((a) => a.name));

    function pluginCard(p) {
      const isInstalled = installedPluginNames.has(p.name);
      const local = installedPluginMap.get(p.name);
      const hue = [...p.name].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
      return \`<div class="card card-mp" style="display:flex;align-items:flex-start;gap:14px;cursor:default;">
        <div style="flex-shrink:0;width:44px;height:44px;border-radius:10px;background:hsl(\${hue},55%,18%);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:hsl(\${hue},60%,72%);text-transform:uppercase;">\${esc(p.name[0] || '?')}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
            <span style="font-size:13px;font-weight:600;">\${esc(p.name)}</span>
            <span class="badge" style="background:rgba(99,102,241,0.1);color:var(--accent2);">\${esc(p.kind)}</span>
            <span class="badge" style="background:rgba(59,130,246,0.1);color:#60a5fa;">v\${esc(p.version)}</span>
            \${p.rating ? '<span style="font-size:11px;color:#fbbf24;">' + '★'.repeat(Math.round(p.rating)) + '</span>' : ''}
            \${isInstalled ? '<span class="badge" style="background:' + (local?.enabled ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)') + ';color:' + (local?.enabled ? '#4ade80' : 'var(--text3)') + ';">' + (local?.enabled ? 'installed' : 'disabled') + '</span>' : ''}
          </div>
          <p style="font-size:12px;color:var(--text2);margin-bottom:4px;line-height:1.5;">\${esc(p.description || '')}</p>
          <div style="font-size:11px;color:var(--text3);display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="font-family:'JetBrains Mono',monospace;">\${esc(p.slug)}</span>
            <span>·</span>
            <span>\${p.downloads} \${p.downloads === 1 ? 'download' : 'downloads'}</span>
            \${p.author ? '<span>· by ' + esc(p.author) + '</span>' : ''}
            \${p.category ? '<span>· ' + esc(p.category) + '</span>' : ''}
            \${p.license ? '<span>· ' + esc(p.license) + '</span>' : ''}
          </div>
        </div>
        <div style="flex-shrink:0;">
          \${isInstalled
            ? '<span class="btn btn-ghost" style="font-size:12px;padding:5px 14px;opacity:0.6;cursor:default;">Installed</span>'
            : '<button class="btn btn-primary" style="font-size:12px;padding:5px 14px;white-space:nowrap;" onclick="installMarketplacePlugin(\\'' + esc(p.slug) + '\\', \\'' + esc(p.kind) + '\\')">Install</button>'}
        </div>
      </div>\`;
    }

    function agentCard(a) {
      const isInstalled = installedAgentNames.has(a.name);
      const hue = [...a.name].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
      return \`<div class="card card-mp" style="display:flex;align-items:flex-start;gap:14px;cursor:default;">
        <div style="flex-shrink:0;width:44px;height:44px;border-radius:10px;background:hsl(\${hue},55%,18%);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:hsl(\${hue},60%,72%);text-transform:uppercase;">\${esc(a.name[0] || '?')}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
            <span style="font-size:13px;font-weight:600;">\${esc(a.name)}</span>
            \${a.provider ? '<span class="badge" style="background:rgba(99,102,241,0.1);color:var(--accent2);">' + esc(a.provider) + '</span>' : ''}
            <span class="badge" style="background:rgba(59,130,246,0.1);color:#60a5fa;">v\${esc(a.version)}</span>
            \${a.rating ? '<span style="font-size:11px;color:#fbbf24;">' + '★'.repeat(Math.round(a.rating)) + '</span>' : ''}
            \${isInstalled ? '<span class="badge" style="background:rgba(34,197,94,0.1);color:#4ade80;">installed</span>' : ''}
          </div>
          <p style="font-size:12px;color:var(--text2);margin-bottom:4px;line-height:1.5;">\${esc(a.description || '')}</p>
          <div style="font-size:11px;color:var(--text3);display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="font-family:'JetBrains Mono',monospace;">\${esc(a.slug)}</span>
            <span>·</span>
            <span>\${a.downloads} \${a.downloads === 1 ? 'download' : 'downloads'}</span>
            \${a.model ? '<span>· ' + esc(a.model) + '</span>' : ''}
            \${a.author ? '<span>· by ' + esc(a.author) + '</span>' : ''}
            \${a.tags?.length ? '<span>· [' + a.tags.map(t => esc(t)).join(', ') + ']</span>' : ''}
          </div>
        </div>
        <div style="flex-shrink:0;">
          \${isInstalled
            ? '<span class="btn btn-ghost" style="font-size:12px;padding:5px 14px;opacity:0.6;cursor:default;">Installed</span>'
            : '<button class="btn btn-primary" style="font-size:12px;padding:5px 14px;white-space:nowrap;" onclick="importMarketplaceAgent(\\'' + esc(a.slug) + '\\')">Import</button>'}
        </div>
      </div>\`;
    }

    if (marketplaceTab === 'plugins') {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (kind) params.set('kind', kind);
      if (category) params.set('category', category);
      params.set('limit', '50');
      const data = await fetch(BASE + '/api/marketplace/plugins?' + params.toString()).then(r => r.json()).catch(() => null);
      if (!data || !data.plugins?.length) {
        el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg><p style="color:var(--text3);font-size:13px;">No plugins found' + (search ? ' for "' + esc(search) + '"' : '') + '.</p></div>';
        return;
      }
      el.innerHTML = data.plugins.map(pluginCard).join('');
    } else {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      params.set('limit', '50');
      const data = await fetch(BASE + '/api/marketplace/agents?' + params.toString()).then(r => r.json()).catch(() => null);
      if (!data || !data.agents?.length) {
        el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><p style="color:var(--text3);font-size:13px;">No agents found' + (search ? ' for "' + esc(search) + '"' : '') + '.</p></div>';
        return;
      }
      el.innerHTML = data.agents.map(agentCard).join('');
    }
  } catch (e) {
    el.innerHTML = '<div style="text-align:center;padding:40px 20px;"><p style="color:#f87171;font-size:13px;">Failed to load marketplace: ' + esc(e.message) + '</p><p style="font-size:12px;color:var(--text3);margin-top:6px;">Make sure the Cortex server can reach https://cortexprism.io</p></div>';
  }
}

async function installMarketplacePlugin(slug, kind) {
  try {
    const res = await fetch(BASE + '/api/marketplace/plugins/' + encodeURIComponent(slug) + '/install', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Install failed' }));
      toast(err.error || 'Install failed', 'error');
      return;
    }
    toast('Plugin "' + slug + '" installed successfully', 'success');
    loadMarketplace();
  } catch (e) {
    toast('Install error: ' + e.message, 'error');
  }
}

async function importMarketplaceAgent(slug) {
  try {
    const res = await fetch(BASE + '/api/marketplace/agents/' + encodeURIComponent(slug) + '/import', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Import failed' }));
      toast(err.error || 'Import failed', 'error');
      return;
    }
    const data = await res.json();
    toast('Agent "' + data.name + '" imported successfully', 'success');
    loadMarketplace();
  } catch (e) {
    toast('Import error: ' + e.message, 'error');
  }
}

// ── Soul (legacy stub — real implementations in Soul/Profile UI section below) ──

// ── Cron ──────────────────────────────────────────────────────
async function loadCronJobs() {
  const jobs = await fetch(BASE + '/api/jobs').then(r => r.json()).catch(() => []);
  const el = document.getElementById('cron-list');
  if (!el) return;
  if (!jobs.length) { el.innerHTML = '<p style="color:var(--text3);font-size:13px;">No jobs yet. Click "+ New Job" to schedule one.</p>'; return; }
  const statusColor = { pending:'#fbbf24', running:'#38bdf8', completed:'#4ade80', failed:'#f87171', cancelled:'var(--text3)' };
  el.innerHTML = jobs.map(j => \`
    <div class="card" style="display:flex;align-items:flex-start;gap:12px;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="font-size:13px;font-weight:600;">\${esc(j.name)}</span>
          <span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text2);">\${esc(j.kind)}</span>
          <span class="badge" style="background:rgba(0,0,0,0.2);color:\${statusColor[j.status]??'var(--text3)'};">\${j.status}</span>
        </div>
        <div style="font-size:12px;color:var(--text3);font-family:'JetBrains Mono',monospace;margin-bottom:4px;">\${esc(j.command)}\${j.schedule?' · '+esc(j.schedule):''}</div>
        <div style="font-size:11px;color:var(--text3);">
          Attempts: \${j.attempts}/\${j.max_attempts}
          \${j.last_run_at?' · Last: '+new Date(j.last_run_at).toLocaleString():''}
          \${j.next_run_at?' · Next: '+new Date(j.next_run_at).toLocaleString():''}
        </div>
        \${j.last_error ? \`<div style="font-size:11px;color:#f87171;margin-top:3px;">\${esc(j.last_error)}</div>\` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="btn btn-ghost" style="font-size:12px;" onclick="triggerJob('\${j.id}')">▶ Trigger</button>
        <button class="btn btn-ghost" style="font-size:12px;" onclick="cancelJobUI('\${j.id}')">■ Cancel</button>
        <button class="btn" style="font-size:12px;background:rgba(239,68,68,0.1);color:#f87171;" onclick="deleteJobUI('\${j.id}')">✕</button>
      </div>
    </div>
  \`).join('');
}
function showCronModal() { document.getElementById('cron-modal').style.display = 'flex'; }
function hideCronModal() { document.getElementById('cron-modal').style.display = 'none'; }
function toggleCronFields() {
  const kind = document.getElementById('cj-kind').value;
  document.getElementById('cj-schedule-row').style.display = kind === 'once' ? 'none' : 'block';
}
async function submitCronJob() {
  const name = document.getElementById('cj-name').value.trim();
  const command = document.getElementById('cj-command').value.trim();
  if (!name || !command) { document.getElementById('cj-status').textContent = 'Name and Command required.'; return; }
  const body = {
    name, command,
    kind: document.getElementById('cj-kind').value,
    schedule: document.getElementById('cj-schedule').value || undefined,
    maxAttempts: Number(document.getElementById('cj-max').value) || 3,
  };
  const res = await fetch(BASE + '/api/jobs', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) { hideCronModal(); toast('Job created', 'success'); loadCronJobs(); }
  else { document.getElementById('cj-status').textContent = 'Create failed.'; }
}
async function triggerJob(id) {
  const res = await fetch(\`\${BASE}/api/jobs/\${id}/trigger\`, { method: 'POST' });
  if (res.ok) toast('Job triggered', 'success');
  loadCronJobs();
}
async function cancelJobUI(id) {
  const res = await fetch(\`\${BASE}/api/jobs/\${id}/cancel\`, { method: 'POST' });
  if (res.ok) toast('Job cancelled', 'warning');
  loadCronJobs();
}
async function deleteJobUI(id) {
  const ok = await confirmAction('Delete Job', 'Delete this job?', 'Delete');
  if (!ok) return;
  const res = await fetch(\`\${BASE}/api/jobs/\${id}\`, { method: 'DELETE' });
  if (res.ok) toast('Job deleted', 'success');
  loadCronJobs();
}

// ── Command palette ──────────────────────────
const CMD_PAGES = [
  { id:'dashboard', label:'Dashboard', icon:'📊', desc:'System overview, daemon status, and widgets' },
  { id:'chat', label:'Chat', icon:'💬', desc:'Start a chat session' },
  { id:'editor', label:'Editor', icon:'✏', desc:'Web file editor (CodeMirror)' },
  { id:'memory', label:'Memory', icon:'📚', desc:'Browse episodic, semantic, and graph memory' },
  { id:'skills', label:'Skills', icon:'⚡', desc:'Procedural memory — learned skill patterns' },
  { id:'lens', label:'Activity', icon:'🔭', desc:'Filterable audit log with cost tracking and auto-refresh' },
  { id:'agents', label:'Agents', icon:'👥', desc:'Manage agent identities and selection' },
  { id:'services', label:'Services', icon:'⚙', desc:'Micro-service lifecycle management' },
  { id:'jobs', label:'Jobs', icon:'⏱', desc:'Scheduled cron, interval, and one-shot jobs' },
  { id:'sessions', label:'Sessions', icon:'📁', desc:'Browse, search, export sessions' },
  { id:'settings', label:'Settings', icon:'⚙', desc:'Configure providers, API keys, router' },
  { id:'soul', label:'Soul', icon:'❤', desc:'Agent identity (SOUL.md, USER.md, MEMORY.md)' },
  { id:'policies', label:'Policies', icon:'🛡', desc:'Security policy rules' },
  { id:'extensions', label:'Extensions', icon:'🧩', desc:'Installed plugins and marketplace discovery' },
  { id:'analytics', label:'Analytics', icon:'📈', desc:'Token usage, cost, session statistics' },
];

let cmdPaletteCache = { agents: [], sessions: [] };

async function filterCmdPalette(query) {
  const el = document.getElementById('cmd-results');
  const q = query.toLowerCase().trim();

  // Static pages
  const pages = q ? CMD_PAGES.filter(p => p.label.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)) : CMD_PAGES;
  let html = pages.map((p, i) =>
    '<button class="cmd-item' + (i === 0 ? ' active' : '') + '" onclick="navigateCmd(\\'' + p.id + '\\')" onmouseenter="highlightCmd(this)">' +
    '<span class="cmd-icon">' + p.icon + '</span>' +
    '<span class="cmd-label"><strong>' + p.label + '</strong><br><span style="font-size:11px;color:var(--text3);">' + p.desc + '</span></span>' +
    '</button>'
  ).join('');

  // Dynamic agent/session results when query is typed
  if (q) {
    try {
      const [agents, sessions] = await Promise.all([
        fetch(BASE + '/api/agents').then(r => r.json()).catch(() => []),
        fetch(BASE + '/api/sessions?limit=20').then(r => r.json()).catch(() => []),
      ]);
      cmdPaletteCache = { agents, sessions };

      const matchingAgents = agents.filter(a =>
        (a.name || '').toLowerCase().includes(q) || (a.id || '').toLowerCase().includes(q)
      );
      const matchingSessions = sessions.filter(s =>
        (s.id || '').toLowerCase().includes(q)
      );

      if (matchingAgents.length) {
        html += '<div style="padding:6px 16px;font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;border-top:1px solid var(--border);">Agents</div>';
        html += matchingAgents.slice(0, 5).map(function(a) {
          return '<button class="cmd-item" onclick="closeCmdPalette({target:document.getElementById(\\'cmd-palette\\')});showPage(\\'agents\\');" onmouseenter="highlightCmd(this)">' +
            '<span class="cmd-icon">👤</span>' +
            '<span class="cmd-label"><strong>' + esc(a.name || a.id) + '</strong><br><span style="font-size:11px;color:var(--text3);">' + esc(a.id) + '</span></span>' +
            '</button>';
        }).join('');
      }
      if (matchingSessions.length) {
        html += '<div style="padding:6px 16px;font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;border-top:1px solid var(--border);">Sessions</div>';
        html += matchingSessions.slice(0, 5).map(function(s) {
          return '<button class="cmd-item" onclick="closeCmdPalette({target:document.getElementById(\\'cmd-palette\\')});openSession(\\'' + s.id + '\\');" onmouseenter="highlightCmd(this)">' +
            '<span class="cmd-icon">💬</span>' +
            '<span class="cmd-label"><strong>' + esc(s.id.slice(-20)) + '</strong><br><span style="font-size:11px;color:var(--text3);">' + (s.agent_id || 'default') + ' · ' + s.turn_count + ' turns</span></span>' +
            '</button>';
        }).join('');
      }
    } catch {}
  }

  if (!html) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px;">No results found.</div>';
    return;
  }
  el.innerHTML = html;
}

function navigateCmd(pageId) {
  closeCmdPalette({ target: document.getElementById('cmd-palette') });
  showPage(pageId);
}

function highlightCmd(el) {
  document.querySelectorAll('.cmd-item').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
}

function openCmdPalette() {
  const palette = document.getElementById('cmd-palette');
  palette.classList.add('open');
  const input = document.getElementById('cmd-input');
  input.value = '';
  input.focus();
  filterCmdPalette('');
}

function closeCmdPalette(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('cmd-palette').classList.remove('open');
}

// ── Sidebar section collapse ────────────
function toggleSidebarSection(event) {
  const section = event.currentTarget;
  section.classList.toggle('collapsed');
  const expanded = !section.classList.contains('collapsed');
  section.setAttribute('aria-expanded', String(expanded));
  // Hide/show all following nav-items until next section
  let next = section.nextElementSibling;
  while (next && !next.classList.contains('nav-section') && !next.id) {
    if (next.classList.contains('nav-item')) {
      next.style.display = expanded ? '' : 'none';
    }
    next = next.nextElementSibling;
  }
}

// ── Sidebar search ──────────────────────────
function filterNav(query) {
  const items = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.nav-section');
  const q = query.toLowerCase().trim();
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    item.classList.toggle('nav-hidden', q && !text.includes(q));
  });
  sections.forEach(sec => {
    let next = sec.nextElementSibling;
    let hasVisible = false;
    while (next && !next.classList.contains('nav-section')) {
      if (next.classList.contains('nav-item') && !next.classList.contains('nav-hidden')) {
        hasVisible = true; break;
      }
      next = next.nextElementSibling;
    }
    sec.classList.toggle('nav-hidden', q && !hasVisible && !sec.textContent.toLowerCase().includes(q));
  });
}

// ── Keyboard shortcuts ──────────────────────
document.addEventListener('keydown', (e) => {
  // Esc: close modals and panels
  if (e.key === 'Escape') {
    const palette = document.getElementById('cmd-palette');
    if (palette.classList.contains('open')) {
      closeCmdPalette({ target: palette });
      return;
    }
    if (document.getElementById('confirm-overlay').classList.contains('open')) {
      closeConfirmDialog({ target: document.getElementById('confirm-overlay') });
      return;
    }
    if (document.getElementById('skill-designer').style.display !== 'none') {
      closeSkillDesigner();
      return;
    }
    if (document.getElementById('new-agent-modal').style.display === 'flex') {
      hideAgentModal();
      return;
    }
    if (document.getElementById('cron-modal').style.display === 'flex') {
      hideCronModal();
      return;
    }
    if (document.getElementById('plugin-modal').style.display === 'flex') {
      hideInstallModal();
      return;
    }
  }
  // Ctrl+K / Cmd+K: command palette
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    const palette = document.getElementById('cmd-palette');
    palette.classList.contains('open') ? closeCmdPalette({ target: palette }) : openCmdPalette();
  }
  // Ctrl+S / Cmd+S: save in editor
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    if (currentPage === 'editor' && editorInstance) { e.preventDefault(); editorSave(); }
    if (document.getElementById('skill-designer').style.display !== 'none') { e.preventDefault(); skillDesignerSave(); }
    if (currentPage === 'soul') { e.preventDefault(); soulSaveActive(); }
  }
  // / focus chat input (when not in an input)
  if (e.key === '/' && document.activeElement === document.body) {
    e.preventDefault();
    showPage('chat');
    document.getElementById('chat-input').focus();
  }
  // Ctrl+B: toggle sidebar
  if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
    e.preventDefault();
    toggleSidebar();
  }
  // Enter in command palette
  if (e.key === 'Enter') {
    const active = document.querySelector('.cmd-item.active');
    if (active) active.click();
  }
  // Arrow navigation in command palette
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const palette = document.getElementById('cmd-palette');
    if (!palette.classList.contains('open')) return;
    e.preventDefault();
    const items = document.querySelectorAll('.cmd-item');
    const active = document.querySelector('.cmd-item.active');
    let idx = Array.from(items).indexOf(active);
    if (e.key === 'ArrowDown') idx = Math.min(idx + 1, items.length - 1);
    else idx = Math.max(idx - 1, 0);
    items.forEach(i => i.classList.remove('active'));
    items[idx]?.classList.add('active');
    items[idx]?.scrollIntoView({ block: 'nearest' });
  }
});

// ── Focus trapping for modals ──────────────
function trapFocus(container, onClose) {
  const focusable = container.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  function handler(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  container.addEventListener('keydown', handler);
  // Return cleanup function
  return () => container.removeEventListener('keydown', handler);
}

// Apply focus trapping to agent modal
let _agentModalCleanup = null;
const _origShowAgentForm = showNewAgentForm;
showNewAgentForm = function(editId) {
  _origShowAgentForm(editId);
  setTimeout(() => {
    const modal = document.getElementById('new-agent-modal');
    if (_agentModalCleanup) _agentModalCleanup();
    _agentModalCleanup = trapFocus(modal.querySelector('.card'));
    document.getElementById('ag-name')?.focus();
  }, 100);
};
const _origHideAgentModal = hideAgentModal;
hideAgentModal = function() {
  if (_agentModalCleanup) { _agentModalCleanup(); _agentModalCleanup = null; }
  _origHideAgentModal();
};
let editorInstance = null;
let editorFileTree = [];
let editorOpenFiles = [];
let editorCurrentFile = null;
let editorWorkspace = 'global';
let editorContentDirty = false;

async function editorLoadWorkspaces() {
  try {
    const res = await fetch(BASE + '/api/workspace/agents');
    if (res.ok) {
      const agents = await res.json();
      const sel = document.getElementById('editor-workspace-select');
      const currentVal = sel.value;
      sel.innerHTML = '<option value="global">Global</option>' +
        agents.map(a => '<option value="' + esc(a.agentId) + '">' + esc(a.agentName) + ' (agent)</option>').join('');
      sel.value = currentVal;
    }
  } catch {}
}

async function editorRefreshTree() {
  const tree = document.getElementById('editor-tree');
  tree.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px;">Loading…</div>';
  try {
    const agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
    const url = agentId
      ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files'
      : BASE + '/api/workspace/files';
    const res = await fetch(url);
    if (!res.ok) { tree.innerHTML = '<div style="padding:12px;color:#f87171;font-size:12px;">Failed to load files</div>'; return; }
    const entries = await res.json();
    editorFileTree = Array.isArray(entries) ? entries : [];
    renderEditorTree();
  } catch (e) {
    tree.innerHTML = '<div style="padding:12px;color:#f87171;font-size:12px;">Error: ' + e.message + '</div>';
  }
}

function renderEditorTree() {
  const tree = document.getElementById('editor-tree');
  if (!editorFileTree.length) {
    tree.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;">Empty workspace</div>';
    return;
  }
  tree.innerHTML = editorFileTree.map(name => {
    const isDir = name.endsWith('/');
    const active = editorCurrentFile === name;
    const icon = isDir
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    const nameClean = name.replace(/\\/$/, '');
    return '<button class="editor-tree-item' + (active ? ' active' : '') + '" onclick="editorOpenFile(\\'' + esc(nameClean) + '\\')" title="' + esc(nameClean) + '">' +
      '<span class="icon">' + icon + '</span>' +
      '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(nameClean) + '</span>' +
      '</button>';
  }).join('');
}

async function editorSwitchWorkspace(value) {
  if (editorInstance && editorContentDirty) {
    const ok = await confirmAction('Unsaved Changes', 'Unsaved changes will be lost. Switch workspace?', 'Switch');
    if (!ok) {
      document.getElementById('editor-workspace-select').value = editorWorkspace;
      return;
    }
  }
  editorWorkspace = value;
  editorCloseAllTabs();
  editorRefreshTree();
}

async function editorOpenFile(fileName) {
  if (editorInstance && editorContentDirty) {
    const ok = await confirmAction('Unsaved Changes', 'Save changes to ' + editorCurrentFile + '?', 'Save');
    if (ok) {
      await editorSave();
    }
  }
  const agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  const url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files/' + encodeURIComponent(fileName)
    : BASE + '/api/workspace/files/' + encodeURIComponent(fileName);
  try {
    const res = await fetch(url);
    if (!res.ok) { toast('Failed to open file', 'error'); return; }
    const data = await res.json();
    const content = data.content || '';
    editorCurrentFile = fileName;
    editorContentDirty = false;
    editorAddTab(fileName);
    editorShowEditor(fileName, content);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

function editorAddTab(fileName) {
  if (!editorOpenFiles.includes(fileName)) {
    editorOpenFiles.push(fileName);
  }
  renderEditorTabs();
}

function fileIcon(f) {
  const ext = f.split('.').pop();
  const icons = { js:'⬡', ts:'⬡', jsx:'⬡', tsx:'⬡', py:'◇', rb:'◇', rs:'◇', go:'◇',
    md:'≡', yaml:'≡', yml:'≡', toml:'≡', json:'≡', css:'◐', html:'◇', svg:'◇',
    sql:'◈', sh:'▷', bash:'▷', zsh:'▷', txt:'≡' };
  return '<span class="editor-tab-icon">' + (icons[ext] || '▢') + '</span>';
}

function renderEditorTabs() {
  const bar = document.getElementById('editor-tabs');
  bar.innerHTML = editorOpenFiles.map(f =>
    '<span class="editor-tab' + (f === editorCurrentFile ? ' active' : '') + '" onclick="editorSwitchTab(\\'' + esc(f) + '\\')">' +
    fileIcon(f) +
    esc(f) +
    (editorContentDirty && f === editorCurrentFile ? '<span class="editor-tab-modified"></span>' : '') +
    (editorOpenFiles.length > 1 ? '<span class="editor-tab-close" onclick="event.stopPropagation();editorCloseTab(\\'' + esc(f) + '\\')">✕</span>' : '') +
    '</span>'
  ).join('');
  renderEditorTree();
}

function editorSwitchTab(fileName) {
  if (editorInstance && editorContentDirty) {
    // Auto-save on tab switch
    editorSave();
  }
  editorCurrentFile = fileName;
  renderEditorTabs();
  // Re-read content from server
  editorOpenFile(fileName);
}

function editorCloseTab(fileName) {
  const idx = editorOpenFiles.indexOf(fileName);
  if (idx > -1) editorOpenFiles.splice(idx, 1);
  if (editorCurrentFile === fileName) {
    editorCurrentFile = editorOpenFiles.length > 0 ? editorOpenFiles[editorOpenFiles.length - 1] : null;
    if (editorCurrentFile) {
      editorOpenFile(editorCurrentFile);
    } else {
      editorDestroyEditor();
    }
  }
  renderEditorTabs();
}

function editorCloseAllTabs() {
  editorOpenFiles = [];
  editorCurrentFile = null;
  editorDestroyEditor();
}

function editorDestroyEditor() {
  if (editorInstance) {
    try { editorInstance.toTextArea(); } catch {}
    editorInstance = null;
  }
  const container = document.getElementById('editor-container');
  container.innerHTML = '<div style="text-align:center;color:var(--text3);">' +
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.3;margin-bottom:12px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
    '<p style="font-size:14px;font-weight:500;">File Editor</p>' +
    '<p style="font-size:12px;margin-top:4px;">Select a file from the tree to start editing</p></div>';
  document.getElementById('editor-statusbar').style.display = 'none';
}

function editorShowEditor(fileName, content) {
  if (editorInstance) {
    try { editorInstance.toTextArea(); } catch {}
    editorInstance = null;
  }

  const container = document.getElementById('editor-container');
  container.innerHTML = '<textarea id="editor-textarea" style="width:100%;height:100%;border:none;background:var(--bg3);color:var(--text);font-family:JetBrains Mono,monospace;font-size:13px;resize:none;outline:none;padding:16px;">' + esc(content) + '</textarea>';
  container.style.cssText = 'flex:1;overflow:hidden;display:flex;';

  const mode = editorDetectMode(fileName);
  editorInstance = CodeMirror.fromTextArea(document.getElementById('editor-textarea'), {
    lineNumbers: true,
    mode: mode,
    theme: 'default',
    indentUnit: 2,
    tabSize: 2,
    lineWrapping: false,
    extraKeys: {
      'Ctrl-S': function() { editorSave(); },
      'Cmd-S': function() { editorSave(); },
    },
  });

  editorInstance.on('change', function() {
    editorContentDirty = true;
    document.getElementById('editor-modified').textContent = '● unsaved';
  });

  const statusbar = document.getElementById('editor-statusbar');
  statusbar.style.display = 'flex';
  document.getElementById('editor-file-info').textContent = fileName + ' (' + content.length + ' bytes)';
  document.getElementById('editor-modified').textContent = '';
  editorLoadGitStatus();
}

function editorDetectMode(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const modes = {
    js: 'javascript', ts: 'javascript', jsx: 'javascript', tsx: 'javascript',
    py: 'python', rb: 'python', rs: 'rust',
    html: 'htmlmixed', htm: 'htmlmixed',
    css: 'css', scss: 'css', less: 'css',
    md: 'markdown', markdown: 'markdown',
    json: 'javascript', yaml: 'yaml', yml: 'yaml',
    sql: 'sql', xml: 'xml', svg: 'xml',
  };
  return modes[ext] || 'javascript';
}

async function editorSave() {
  if (!editorCurrentFile || !editorInstance) return;
  const content = editorInstance.getValue();
  const agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  const url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files/' + encodeURIComponent(editorCurrentFile)
    : BASE + '/api/workspace/files/' + encodeURIComponent(editorCurrentFile);
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      editorContentDirty = false;
      document.getElementById('editor-modified').textContent = '';
      toast('File saved', 'success');
      document.getElementById('editor-file-info').textContent = editorCurrentFile + ' (' + content.length + ' bytes)';
    } else {
      toast('Failed to save file', 'error');
    }
  } catch (e) {
    toast('Error saving: ' + e.message, 'error');
  }
}

async function editorDeleteFile() {
  if (!editorCurrentFile) return;
  const ok = await confirmAction('Delete File', 'Delete ' + editorCurrentFile + '?', 'Delete');
  if (!ok) return;
  const agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  const url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files/' + encodeURIComponent(editorCurrentFile)
    : BASE + '/api/workspace/files/' + encodeURIComponent(editorCurrentFile);
  try {
    const res = await fetch(url, { method: 'DELETE' });
    if (res.ok) {
      toast('File deleted', 'success');
      editorCloseTab(editorCurrentFile);
      editorRefreshTree();
    } else {
      toast('Failed to delete file', 'error');
    }
  } catch (e) {
    toast('Delete error: ' + e.message, 'error');
  }
}

async function editorUndo() {
  const agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  const url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/undo'
    : BASE + '/api/workspace/undo';
  try {
    const res = await fetch(url, { method: 'POST' });
    if (res.ok) {
      toast('Undo applied', 'success');
      if (editorCurrentFile) editorOpenFile(editorCurrentFile);
    } else {
      toast('Nothing to undo', 'warning');
    }
  } catch (e) {
    toast('Undo error: ' + e.message, 'error');
  }
}

async function editorRedo() {
  const agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  const url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/redo'
    : BASE + '/api/workspace/redo';
  try {
    const res = await fetch(url, { method: 'POST' });
    if (res.ok) {
      toast('Redo applied', 'success');
      if (editorCurrentFile) editorOpenFile(editorCurrentFile);
    } else {
      toast('Nothing to redo', 'warning');
    }
  } catch (e) {
    toast('Redo error: ' + e.message, 'error');
  }
}

async function editorLoadGitStatus() {
  const el = document.getElementById('editor-git-status');
  if (editorWorkspace === 'global') { el.textContent = ''; return; }
  try {
    const res = await fetch(BASE + '/api/workspace/agents/' + encodeURIComponent(editorWorkspace) + '/git/log');
    if (res.ok) {
      const data = await res.json();
      el.textContent = data.log ? data.log.slice(0, 80) : '';
    }
  } catch {}
}

async function editorNewFile() {
  const name = prompt('File name:');
  if (!name) return;
  const content = '';
  const agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  const url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files/' + encodeURIComponent(name)
    : BASE + '/api/workspace/files/' + encodeURIComponent(name);
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      toast('File created', 'success');
      editorRefreshTree();
      editorOpenFile(name);
    } else {
      toast('Failed to create file', 'error');
    }
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function editorNewFolder() {
  const name = prompt('Folder name:');
  if (!name) return;
  const agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  const url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files/' + encodeURIComponent(name)
    : BASE + '/api/workspace/files/' + encodeURIComponent(name);
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '' }),
    });
    if (res.ok) {
      toast('Folder created (placeholder)', 'success');
      editorRefreshTree();
    } else {
      toast('Failed to create folder', 'error');
    }
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

// ── Git Page ──────────────────────────────────────────────────
let gitAgentId = '';

async function gitRefresh() {
  const agentId = gitAgentId || undefined;
  const params = agentId ? '?agentId=' + encodeURIComponent(agentId) : '';
  try {
    const statusRes = await fetch(BASE + '/api/workspace/git/status' + params);
    const status = await statusRes.json();
    document.getElementById('git-branch').textContent = status.branch || '—';
    document.getElementById('git-status-text').textContent = status.clean ? '✓ Clean' : (status.staged.length + status.unstaged.length + status.untracked.length) + ' changes';
    document.getElementById('git-ahead-behind').textContent = (status.ahead || status.behind) ? (status.ahead + ' ahead, ' + status.behind + ' behind') : '';

    const changesEl = document.getElementById('git-changes-list');
    changesEl.innerHTML = '';
    if (status.clean) {
      changesEl.innerHTML = '<div style="color:var(--green);padding:20px 0;text-align:center;">Working tree clean</div>';
    } else {
      for (const f of status.staged) changesEl.innerHTML += '<div style="padding:3px 0;display:flex;gap:8px;"><span style="color:var(--green);font-family:monospace;">M</span><span>' + f.slice(2).trim() + '</span></div>';
      for (const f of status.unstaged) changesEl.innerHTML += '<div style="padding:3px 0;display:flex;gap:8px;"><span style="color:#f87171;font-family:monospace;">M</span><span>' + f.slice(2).trim() + '</span></div>';
      for (const f of status.untracked) changesEl.innerHTML += '<div style="padding:3px 0;display:flex;gap:8px;"><span style="color:var(--text3);font-family:monospace;">?</span><span>' + f + '</span></div>';
    }

    const logRes = await fetch(BASE + '/api/workspace/git/log' + params);
    const log = await logRes.json();
    const logEl = document.getElementById('git-log-list');
    logEl.innerHTML = '';
    if (!log.length) {
      logEl.innerHTML = '<div style="color:var(--text3);padding:20px 0;text-align:center;">No commits yet</div>';
    } else {
      for (const e of log) {
        logEl.innerHTML += '<div style="padding:5px 0;border-bottom:1px solid var(--border);">' +
          '<div style="display:flex;gap:8px;"><span style="font-family:monospace;color:var(--text3);">' + e.hash.slice(0, 8) + '</span><span>' + e.message + '</span></div>' +
          '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + e.author + ' · ' + e.date.slice(0, 10) + '</div>' +
          '</div>';
      }
    }
  } catch (e) {
    document.getElementById('git-changes-list').innerHTML = '<div style="color:#f87171;">Error: ' + e.message + '</div>';
  }
}

async function gitStageAll() {
  const agentId = gitAgentId || undefined;
  const params = agentId ? '?agentId=' + encodeURIComponent(agentId) : '';
  await fetch(BASE + '/api/workspace/git/commit' + params, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'stage all', agentId }),
  });
  gitRefresh();
}

function gitShowCommitInput() {
  document.getElementById('git-commit-area').style.display = 'flex';
  document.getElementById('git-commit-message').focus();
}

async function gitDoCommit() {
  const msg = document.getElementById('git-commit-message').value.trim();
  if (!msg) return toast('Enter a commit message', 'error');
  const agentId = gitAgentId || undefined;
  try {
    const res = await fetch(BASE + '/api/workspace/git/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, agentId }),
    });
    const data = await res.json();
    if (data.ok) {
      toast('Committed: ' + msg, 'success');
      document.getElementById('git-commit-area').style.display = 'none';
      document.getElementById('git-commit-message').value = '';
      gitRefresh();
    } else {
      toast(data.output || 'Nothing to commit', 'warning');
    }
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function gitPush() {
  const agentId = gitAgentId || undefined;
  try {
    const res = await fetch(BASE + '/api/workspace/git/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    const data = await res.json();
    toast(data.ok ? 'Push successful' : 'Push failed: ' + (data.output || ''), data.ok ? 'success' : 'error');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function gitPull() {
  const agentId = gitAgentId || undefined;
  try {
    const res = await fetch(BASE + '/api/workspace/git/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    const data = await res.json();
    toast(data.ok ? 'Pull successful' : 'Pull failed: ' + (data.output || ''), data.ok ? 'success' : 'error');
    gitRefresh();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function gitLoadAgentSelector() {
  const res = await fetch(BASE + '/api/agents');
  const agents = await res.json();
  const sel = document.getElementById('git-agent-select');
  sel.innerHTML = '<option value="">Current directory</option>';
  for (const a of agents) {
    sel.innerHTML += '<option value="' + a.id + '">' + a.name + ' (' + a.id.slice(0, 8) + ')</option>';
  }
  sel.onchange = () => {
    const val = sel.value;
    gitAgentId = val;
    gitRefresh();
  };
}

// ── Version Control (VCS) tab-switching ──────────────────────
let vcsActiveTab = 'local';
function vcsRefresh() {
  if (vcsActiveTab === 'local') gitRefresh(); else ghRefresh();
}
function vcsShowTab(tab) {
  vcsActiveTab = tab;
  ['local','remote'].forEach(t => {
    const btn = document.getElementById('vcs-tab-' + t);
    const pane = document.getElementById('vcs-pane-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
    if (pane) pane.style.display = t === tab ? 'flex' : 'none';
  });
  vcsRefresh();
}

// ── Automation tab-switching ──────────────────────────────────
let autoActiveTab = 'hooks';
function autoRefresh() {
  if (autoActiveTab === 'hooks') { initBuiltinHooks(); loadHooksPage(); } else loadTriggers();
}
function autoShowTab(tab) {
  autoActiveTab = tab;
  ['hooks','triggers'].forEach(t => {
    const btn = document.getElementById('auto-tab-' + t);
    const pane = document.getElementById('auto-pane-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
    if (pane) pane.style.display = t === tab ? (t === 'hooks' ? 'block' : 'flex') : 'none';
  });
  document.getElementById('auto-add-trigger-btn').style.display = tab === 'triggers' ? '' : 'none';
  if (tab === 'triggers') loadTriggers(); else loadHooksPage();
}

// ── Extensions tab-switching ──────────────────────────────────
let extActiveTab = 'installed';
function extRefresh() {
  if (extActiveTab === 'installed') loadPlugins(); else loadMarketplace();
}
function extShowTab(tab) {
  extActiveTab = tab;
  ['installed','discover'].forEach(t => {
    const btn = document.getElementById('ext-tab-' + t);
    const pane = document.getElementById('ext-pane-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
    if (pane) pane.style.display = t === tab ? 'flex' : 'none';
  });
  extRefresh();
}

// ── GitHub Page ──────────────────────────────────────────────
let ghRepo = '';

async function ghRefresh() {
  const tokenEl = document.getElementById('gh-token-status');
  try {
    const tokenRes = await fetch(BASE + '/api/github/token');
    const tokenData = await tokenRes.json();
    tokenEl.textContent = tokenData.configured ? '✓ Token configured' : '✗ No token';
    tokenEl.style.color = tokenData.configured ? 'var(--green)' : '#f87171';
  } catch { /* ignore */ }
  if (ghRepo) ghLoadRepo();
}

async function ghLoadRepo() {
  const repo = document.getElementById('gh-repo-input').value.trim();
  if (!repo) return toast('Enter a repo (owner/name)', 'error');
  ghRepo = repo;
  document.getElementById('gh-tab-pulls').style.display = 'inline-flex';
  document.getElementById('gh-tab-issues').style.display = 'inline-flex';
  document.getElementById('gh-tab-info').style.display = 'inline-flex';
  ghShowTab('pulls');
}

async function ghShowTab(tab) {
  ['pulls', 'issues', 'info'].forEach(t => {
    const el = document.getElementById('gh-tab-' + t);
    if (el) el.classList.toggle('active', t === tab);
  });
  const contentEl = document.getElementById('gh-content');
  contentEl.innerHTML = '<div class="skeleton" style="height:200px;border-radius:8px;"></div>';
  try {
    if (tab === 'pulls') {
      const res = await fetch(BASE + '/api/github/repos/' + ghRepo + '/pulls?state=open');
      const prs = await res.json();
      contentEl.innerHTML = '<div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:10px;">Open Pull Requests</div>';
      if (prs.length === 0) {
        contentEl.innerHTML += '<div style="color:var(--text3);padding:20px 0;text-align:center;">No open pull requests.</div>';
      } else {
        for (const pr of prs) {
          contentEl.innerHTML += '<div class="card-sm" style="margin-bottom:8px;cursor:pointer;" onclick="window.open(\\'' + pr.html_url + '\\',\\'_blank\\')">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span><strong>#' + pr.number + '</strong> ' + pr.title + '</span>' +
            '<span style="font-size:11px;color:var(--text3);">@' + pr.user.login + '</span>' +
            '</div>' +
            '<div style="font-size:11px;color:var(--text3);margin-top:4px;">' + pr.head.ref + ' → ' + pr.base.ref + '</div>' +
            '</div>';
        }
      }
    } else if (tab === 'issues') {
      const res = await fetch(BASE + '/api/github/repos/' + ghRepo + '/issues?state=open');
      const issues = await res.json();
      contentEl.innerHTML = '<div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:10px;">Open Issues</div>';
      if (issues.length === 0) {
        contentEl.innerHTML += '<div style="color:var(--text3);padding:20px 0;text-align:center;">No open issues.</div>';
      } else {
        for (const issue of issues) {
          const labels = issue.labels.map(l => '<span class="badge" style="background:rgba(99,102,241,0.12);color:var(--accent2);font-size:10px;">' + l.name + '</span>').join(' ');
          contentEl.innerHTML += '<div class="card-sm" style="margin-bottom:8px;cursor:pointer;" onclick="window.open(\\'' + issue.html_url + '\\',\\'_blank\\')">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span><strong>#' + issue.number + '</strong> ' + issue.title + '</span>' +
            '<span style="font-size:11px;color:var(--text3);">@' + issue.user.login + '</span>' +
            '</div>' +
            '<div style="margin-top:4px;">' + labels + '</div>' +
            '</div>';
        }
      }
    } else if (tab === 'info') {
      const res = await fetch(BASE + '/api/github/repos/' + ghRepo);
      const repo = await res.json();
      contentEl.innerHTML =
        '<div class="card" style="max-width:600px;">' +
        '<h2 style="font-size:15px;font-weight:600;margin-bottom:8px;">' + repo.full_name + '</h2>' +
        '<p style="font-size:13px;color:var(--text2);margin-bottom:12px;">' + (repo.description || 'No description') + '</p>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;">' +
        '<div><span style="color:var(--text3);">Default branch:</span> ' + repo.default_branch + '</div>' +
        '<div><span style="color:var(--text3);">Private:</span> ' + repo.private + '</div>' +
        '<div><span style="color:var(--text3);">Stars:</span> ' + repo.stargazers_count + '</div>' +
        '<div><span style="color:var(--text3);">Issues:</span> ' + repo.open_issues_count + '</div>' +
        '<div><span style="color:var(--text3);">Forks:</span> ' + repo.forks_count + '</div>' +
        '</div>' +
        '<div style="margin-top:12px;"><a href="' + repo.html_url + '" target="_blank" style="color:var(--accent2);font-size:13px;">View on GitHub →</a></div>' +
        '</div>';
    }
  } catch (e) {
    contentEl.innerHTML = '<div style="color:#f87171;">Error: ' + e.message + '</div>';
  }
}

// ── Code Runner Page ─────────────────────────────────────────
async function codeRunnerRun() {
  const code = document.getElementById('coderunner-input').value.trim();
  const lang = document.getElementById('coderunner-lang').value;
  if (!code) return toast('Enter some code to run', 'error');

  const statusEl = document.getElementById('coderunner-status');
  const outputEl = document.getElementById('coderunner-output');
  statusEl.textContent = 'Running…';
  outputEl.textContent = '';
  statusEl.style.color = 'var(--text3)';

  try {
    const res = await fetch(BASE + '/api/code/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, language: lang }),
    });
    const result = await res.json();
    if (result.success) {
      outputEl.textContent = result.output || '(no output)';
      statusEl.textContent = '✓ Done (' + result.durationMs + 'ms)';
      statusEl.style.color = 'var(--green)';
    } else {
      outputEl.textContent = result.error || result.output || 'Error';
      statusEl.textContent = '✗ Failed (' + result.durationMs + 'ms)';
      statusEl.style.color = '#f87171';
    }
  } catch (e) {
    outputEl.textContent = e.message;
    statusEl.textContent = '✗ Error';
    statusEl.style.color = '#f87171';
  }
}

function codeRunnerClear() {
  document.getElementById('coderunner-input').value = '';
  document.getElementById('coderunner-output').textContent = '';
  document.getElementById('coderunner-status').textContent = '';
}

// ── Nodes ─────────────────────────────────────────────────
let nodesAutoRefreshTimer = null;

async function loadNodes() {
  const el = document.getElementById('nodes-list');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;color:var(--text3);padding:60px 20px;"><div class="skeleton" style="width:200px;height:20px;margin:0 auto 10px;"></div></div>';

  try {
    const tier = document.getElementById('nodes-filter-tier')?.value ?? '';
    const status = document.getElementById('nodes-filter-status')?.value ?? '';
    const group = document.getElementById('nodes-filter-group')?.value ?? '';
    const params = new URLSearchParams();
    if (tier) params.set('tier', tier);
    if (status) params.set('status', status);
    if (group) params.set('group', group);

    const nodes = await fetch(BASE + '/api/nodes?' + params).then(r => r.json()).catch(() => []);
    const groupsData = await fetch(BASE + '/api/nodes/groups').then(r => r.json()).catch(() => []);

    // Update summary cards
    document.getElementById('nodes-total').textContent = nodes.length;
    document.getElementById('nodes-connected').textContent = nodes.filter(n => n.status === 'connected').length;
    document.getElementById('nodes-disconnected').textContent = nodes.filter(n => n.status === 'disconnected').length;
    document.getElementById('nodes-groups').textContent = groupsData.length;

    // Update group filter dropdown
    const groupSelect = document.getElementById('nodes-filter-group');
    if (groupSelect) {
      const curVal = groupSelect.value;
      groupSelect.innerHTML = '<option value="">All groups</option>';
      groupsData.forEach(g => {
        groupSelect.innerHTML += '<option value="' + g + '"' + (g === curVal ? ' selected' : '') + '>' + g + '</option>';
      });
    }

    if (!nodes.length) {
      el.innerHTML = [
        '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;">',
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
        '<p style="color:var(--text3);font-size:13px;">No nodes found.</p>',
        '<p style="color:var(--text3);font-size:12px;margin-top:4px;">Use <code style="color:var(--text2);">cortex node register</code> to add a node.</p>',
        '</div>'
      ].join('');
      return;
    }

    let html = '';
    for (const n of nodes) {
      const statusColor = n.status === 'connected' ? '#22c55e' : n.status === 'error' ? '#ef4444' : n.status === 'connecting' ? '#fbbf24' : '#9090a8';
      const tierColor = n.tier === 'root' ? '#ef4444' : n.tier === 'sudo' ? '#fbbf24' : '#818cf8';
      const tierLabel = n.tier === 'root' ? '⚡ Root' : n.tier === 'sudo' ? '🔧 Sudo' : '🔒 Unpriv';
      const lastHb = n.last_heartbeat ? new Date(n.last_heartbeat).toLocaleString() : 'never';
      const registered = n.registered_at ? new Date(n.registered_at).toLocaleDateString() : '?';

      html += [
        '<div class="card" style="padding:16px;">',
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">',
        '<div>',
        '<span style="font-weight:600;font-size:14px;">' + esc(n.name) + '</span>',
        '<span style="font-size:11px;color:var(--text3);margin-left:8px;font-family:JetBrains Mono,monospace;">' + esc(n.id) + '</span>',
        '</div>',
        '<div style="display:flex;gap:8px;align-items:center;">',
        '<span class="badge" style="background:' + tierColor + '20;color:' + tierColor + ';border:1px solid ' + tierColor + '40;">' + tierLabel + '</span>',
        '<span class="badge" style="background:' + statusColor + '20;color:' + statusColor + ';border:1px solid ' + statusColor + '40;">' + statusEmoji(n.status) + ' ' + n.status + '</span>',
        '</div></div>',
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;font-size:12px;color:var(--text2);">',
        '<div><span style="color:var(--text3);">Endpoint</span><br>' + esc(n.endpoint) + '</div>',
        '<div><span style="color:var(--text3);">Group</span><br>' + (n.group_name ? esc(n.group_name) : '—') + '</div>',
        '<div><span style="color:var(--text3);">Last Heartbeat</span><br>' + lastHb + '</div>',
        '<div><span style="color:var(--text3);">Registered</span><br>' + registered + '</div>',
        '<div><span style="color:var(--text3);">Version</span><br>' + (n.version || '—') + '</div>',
        '<div><span style="color:var(--text3);">Last Directive</span><br><code style="font-size:10px;">' + (n.last_processed_directive_id ? n.last_processed_directive_id.slice(-16) : '—') + '</code></div>',
        '<div><span style="color:var(--text3);">Capabilities</span><br>' + (n.capabilities && n.capabilities.length ? n.capabilities.join(', ') : '—') + '</div>',
        '<div style="display:flex;gap:6px;align-items:flex-end;">',
        '<button class="btn btn-ghost" onclick="loadNodeMetrics(\\'' + n.id + '\\')" style="padding:3px 10px;font-size:11px;">Metrics</button>',
        '<button class="btn btn-ghost" onclick="loadNodeDirectives(\\'' + n.id + '\\')" style="padding:3px 10px;font-size:11px;">Directives</button>',
        '</div></div>',
        '<div id="node-extra-' + n.id + '" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);"></div>',
        '</div>'
      ].join('');
    }
    el.innerHTML = html;

    // Auto-refresh every 10s while on the nodes page
    if (nodesAutoRefreshTimer) clearInterval(nodesAutoRefreshTimer);
    nodesAutoRefreshTimer = setInterval(() => {
      if (currentPage === 'nodes') loadNodes();
      else {
        clearInterval(nodesAutoRefreshTimer);
        nodesAutoRefreshTimer = null;
      }
    }, 10_000);

    document.getElementById('nodes-auto-refresh').textContent = 'Auto: 10s';
    document.getElementById('nodes-auto-refresh').style.color = '#22c55e';
  } catch (e) {
    el.innerHTML = '<div style="color:#f87171;text-align:center;padding:20px;">Failed to load nodes: ' + esc(e.message) + '</div>';
  }
}

async function loadNodeMetrics(nodeId) {
  const el = document.getElementById('node-extra-' + nodeId);
  if (!el) return;
  if (el.style.display === 'block') {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = 'block';
  el.innerHTML = '<div style="padding:8px 0;color:var(--text3);">Loading metrics…</div>';
  try {
    const events = await fetch(BASE + '/api/nodes/' + nodeId + '/metrics?limit=20').then(r => r.json()).catch(() => []);
    if (!events.length) {
      el.innerHTML = '<div style="padding:8px 0;color:var(--text3);">No heartbeat metrics recorded yet.</div>';
      return;
    }
    let html = '<div style="font-size:11px;color:var(--text3);margin-bottom:8px;">Recent Heartbeat Metrics (last ' + events.length + ')</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
    html += '<tr style="border-bottom:1px solid var(--border);"><th style="padding:4px 6px;text-align:left;color:var(--text3);">Time</th><th style="padding:4px 6px;text-align:right;color:var(--text3);">CPU%</th><th style="padding:4px 6px;text-align:right;color:var(--text3);">Mem MB</th><th style="padding:4px 6px;text-align:right;color:var(--text3);">Disk Free MB</th><th style="padding:4px 6px;text-align:right;color:var(--text3);">Active Dir</th><th style="padding:4px 6px;text-align:right;color:var(--text3);">Uptime</th></tr>';
    for (const ev of events) {
      const p = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : (ev.payload || {});
      html += '<tr style="border-bottom:1px solid var(--border);">';
      html += '<td style="padding:4px 6px;color:var(--text2);">' + new Date(ev.started_at).toLocaleTimeString() + '</td>';
      html += '<td style="padding:4px 6px;text-align:right;color:' + (p.cpuPercent > 80 ? '#f87171' : 'var(--text2)') + ';">' + (p.cpuPercent ?? '—') + '</td>';
      html += '<td style="padding:4px 6px;text-align:right;color:var(--text2);">' + (p.memoryMb ?? '—') + '</td>';
      html += '<td style="padding:4px 6px;text-align:right;color:var(--text2);">' + (p.diskFreeMb ?? '—') + '</td>';
      html += '<td style="padding:4px 6px;text-align:right;color:var(--text2);">' + (p.activeDirectives ?? '—') + '</td>';
      html += '<td style="padding:4px 6px;text-align:right;color:var(--text2);">' + (p.uptimeSeconds ? formatUptime(p.uptimeSeconds) : '—') + '</td>';
      html += '</tr>';
    }
    html += '</table>';
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div style="color:#f87171;">Failed to load: ' + esc(e.message) + '</div>';
  }
}

async function loadNodeDirectives(nodeId) {
  const el = document.getElementById('node-extra-' + nodeId);
  if (!el) return;
  if (el.style.display === 'block') {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = 'block';
  el.innerHTML = '<div style="padding:8px 0;color:var(--text3);">Loading directives…</div>';
  try {
    const events = await fetch(BASE + '/api/nodes/' + nodeId + '/directives?limit=20').then(r => r.json()).catch(() => []);
    if (!events.length) {
      el.innerHTML = '<div style="padding:8px 0;color:var(--text3);">No directives recorded yet.</div>';
      return;
    }
    let html = '<div style="font-size:11px;color:var(--text3);margin-bottom:8px;">Recent Directives (last ' + events.length + ')</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
    html += '<tr style="border-bottom:1px solid var(--border);"><th style="padding:4px 6px;text-align:left;color:var(--text3);">Time</th><th style="padding:4px 6px;text-align:left;color:var(--text3);">Action</th><th style="padding:4px 6px;text-align:left;color:var(--text3);">Summary</th><th style="padding:4px 6px;text-align:right;color:var(--text3);">Duration</th></tr>';
    for (const ev of events) {
      html += '<tr style="border-bottom:1px solid var(--border);">';
      html += '<td style="padding:4px 6px;color:var(--text2);">' + new Date(ev.started_at).toLocaleTimeString() + '</td>';
      html += '<td style="padding:4px 6px;color:var(--text2);">' + esc(ev.action || '') + '</td>';
      html += '<td style="padding:4px 6px;color:var(--text2);">' + esc(ev.summary || '').slice(0, 80) + '</td>';
      html += '<td style="padding:4px 6px;text-align:right;color:var(--text2);">' + (ev.duration_ms ? ev.duration_ms + 'ms' : '—') + '</td>';
      html += '</tr>';
    }
    html += '</table>';
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div style="color:#f87171;">Failed to load: ' + esc(e.message) + '</div>';
  }
}

function statusEmoji(status) {
  const m = { connected: '●', connecting: '◌', disconnected: '○', error: '✕', deregistered: '⊘' };
  return m[status] || '?';
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return d + 'd ' + h + 'h';
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

// ── Agent panel (right sidebar) ────────────────────────
let agentPanelOpen = false;
let agentPanelInterval = null;

function toggleAgentPanel() {
  agentPanelOpen = !agentPanelOpen;
  const panel = document.getElementById('agent-panel');
  const btn = document.getElementById('agent-panel-toggle');
  if (agentPanelOpen) {
    panel.classList.add('open');
    btn.classList.add('active');
    loadAgentPanel();
    agentPanelInterval = setInterval(loadAgentPanel, 10_000);
  } else {
    panel.classList.remove('open');
    btn.classList.remove('active');
    if (agentPanelInterval) { clearInterval(agentPanelInterval); agentPanelInterval = null; }
  }
}

function agentChannelLabel(channel) {
  if (!channel) return 'chat';
  if (channel.startsWith('subagent:')) return channel.slice(9);
  if (channel === 'web') return 'Chat';
  if (channel === 'cli') return 'CLI';
  return channel;
}

function agentStatusClass(status) {
  if (status === 'active') return 'active';
  if (status === 'closed') return 'closed';
  if (status === 'error') return 'error';
  return 'idle';
}

function formatTokens(n) {
  if (n == null) return '';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function renderAgentItem(session, depth) {
  const isChild = depth > 0;
  const type = agentChannelLabel(session.channel);
  const status = session.status === 'active' ? 'active' : session.status === 'closed' ? 'closed' : session.status === 'archived' ? 'closed' : 'idle';
  const shortId = session.id.slice(-12);
  const ctx = session.context_size != null ? formatTokens(session.context_size) : (session.turn_count > 0 ? session.turn_count + ' turns' : 'new');
  const time = session.last_turn_at ? timeAgo(session.last_turn_at) : timeAgo(session.started_at);

  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-bottom:2px;';

  const item = document.createElement('div');
  item.className = 'agent-item' + (isChild ? ' agent-item-child' : '') + (session.id === sessionId ? ' active' : '');
  item.title = session.id;

  const dot = document.createElement('span');
  dot.className = 'agent-status ' + agentStatusClass(status);

  const nameEl = document.createElement('span');
  nameEl.className = 'agent-item-name';
  nameEl.textContent = session.name || shortId;

  const badge = document.createElement('span');
  badge.className = 'agent-type-badge ' + type;
  badge.textContent = type;

  const meta = document.createElement('span');
  meta.className = 'agent-item-meta';
  meta.textContent = ctx;

  const timeEl = document.createElement('span');
  timeEl.className = 'agent-item-meta';
  timeEl.style.cssText = 'margin-left:auto;';
  timeEl.textContent = time;

  const actions = document.createElement('span');
  actions.className = 'agent-item-actions';

  if (status === 'active') {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'agent-item-action danger';
    closeBtn.innerHTML = '⏹';
    closeBtn.title = 'Close session';
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeSessionPanel(session.id); });
    actions.appendChild(closeBtn);
  } else if (status === 'closed') {
    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'agent-item-action';
    resumeBtn.innerHTML = '▶';
    resumeBtn.title = 'Resume session';
    resumeBtn.addEventListener('click', (e) => { e.stopPropagation(); switchToSession(session.id); });
    actions.appendChild(resumeBtn);
  }
  if (status !== 'closed') {
    const archiveBtn = document.createElement('button');
    archiveBtn.className = 'agent-item-action';
    archiveBtn.innerHTML = '📦';
    archiveBtn.title = 'Archive session';
    archiveBtn.addEventListener('click', (e) => { e.stopPropagation(); archiveSessionPanel(session.id); });
    actions.appendChild(archiveBtn);
  }
  const delBtn = document.createElement('button');
  delBtn.className = 'agent-item-action danger';
  delBtn.innerHTML = '✕';
  delBtn.title = 'Delete session';
  delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteSessionPanel(session.id); });
  if (session.id === sessionId) { delBtn.style.opacity = '0.3'; delBtn.title = 'Cannot delete active session'; delBtn.style.pointerEvents = 'none'; }
  actions.appendChild(delBtn);

  item.appendChild(dot);
  item.appendChild(nameEl);
  item.appendChild(badge);
  item.appendChild(meta);
  item.appendChild(timeEl);
  item.appendChild(actions);

  wrap.appendChild(item);

  item.addEventListener('click', () => {
    if (sessionId !== session.id) switchToSession(session.id);
  });

  return wrap;
}

async function switchToSession(id) {
  const resumeRes = await fetch(BASE + '/api/sessions/' + encodeURIComponent(id) + '/resume', { method: 'POST' });
  if (!resumeRes.ok) { toast('Failed to switch session', 'error'); loadAgentPanel(); return; }
  sessionId = id;
  saveSession();
  document.getElementById('chat-session-id').textContent = id.slice(-12);
  await loadSessionMessages(id);
  document.getElementById('agent-panel-toggle')?.classList.remove('active');
  loadAgentPanel();
}

async function loadSessionMessages(id) {
  const res = await fetch(BASE + '/api/sessions/' + encodeURIComponent(id) + '/messages');
  if (!res.ok) return;
  const msgs = await res.json();
  chatLog.innerHTML = '';
  for (const m of msgs) {
    if (m.role === 'user') {
      appendBubble('user', m.content, m.id);
    } else if (m.role === 'assistant') {
      const b = appendBubble('agent', m.content, m.id);
      b.innerHTML = md(m.content);
      if (m.token_count) appendMeta(0, m.token_count, 0, 0);
    }
  }
  scrollChat();
}

async function deleteMessage(messageId) {
  if (!sessionId) return;
  const res = await fetch(
    BASE + '/api/sessions/' + encodeURIComponent(sessionId) + '/messages/' + messageId,
    { method: 'DELETE' }
  );
  if (res.ok) {
    toast('Message deleted', 'success');
  } else {
    toast('Failed to delete message', 'error');
  }
}

async function closeSessionPanel(id) {
  const res = await fetch(BASE + '/api/sessions/' + encodeURIComponent(id) + '/close', { method: 'POST' });
  if (res.ok) {
    if (sessionId === id) { sessionId = null; document.getElementById('chat-session-id').textContent = ''; saveSession(); }
    toast('Session closed', 'success');
  }
  loadAgentPanel();
}

async function archiveSessionPanel(id) {
  const res = await fetch(BASE + '/api/sessions/' + encodeURIComponent(id) + '/archive', { method: 'POST' });
  if (res.ok) toast('Session archived', 'info');
  loadAgentPanel();
}

async function deleteSessionPanel(id) {
  const ok = await confirmAction('Delete Session', 'Delete session ' + id.slice(-12) + '?', 'Delete');
  if (!ok) return;
  const res = await fetch(BASE + '/api/sessions/' + encodeURIComponent(id), { method: 'DELETE' });
  if (res.ok) {
    if (sessionId === id) { sessionId = null; document.getElementById('chat-session-id').textContent = ''; saveSession(); }
    toast('Session deleted', 'success');
  }
  loadAgentPanel();
}

async function loadAgentPanel() {
  if (!agentPanelOpen) return;
  const body = document.getElementById('agent-panel-body');
  const countEl = document.getElementById('agent-panel-count');

  try {
    const tree = await fetch(BASE + '/api/sessions/tree?limit=30').then(r => r.json()).catch(() => []);
    body.innerHTML = '';

    if (!tree.length) {
      body.innerHTML = '<div class="agent-empty">No active sessions</div>';
      countEl.textContent = '0 sessions';
      return;
    }

    let totalParents = 0;
    let totalChildren = 0;

    for (const parent of tree) {
      totalParents++;
      body.appendChild(renderAgentItem(parent, 0));

      if (parent.children && parent.children.length > 0) {
        const sectionWrap = document.createElement('div');
        sectionWrap.className = 'agent-section';

        const header = document.createElement('div');
        header.className = 'agent-section-header';
        header.innerHTML = '<span class="agent-item-toggle" id="toggle-' + parent.id + '">▶</span>Sub-agents (' + parent.children.length + ')';
        header.addEventListener('click', () => {
          const childrenEl = document.getElementById('children-' + parent.id);
          const toggleEl = document.getElementById('toggle-' + parent.id);
          if (childrenEl) {
            const isHidden = childrenEl.style.display === 'none';
            childrenEl.style.display = isHidden ? 'block' : 'none';
            if (toggleEl) toggleEl.classList.toggle('expanded', isHidden);
          }
        });
        sectionWrap.appendChild(header);

        const childrenContainer = document.createElement('div');
        childrenContainer.id = 'children-' + parent.id;
        childrenContainer.style.display = 'block';
        for (const child of parent.children) {
          totalChildren++;
          childrenContainer.appendChild(renderAgentItem(child, 1));
        }
        sectionWrap.appendChild(childrenContainer);
        body.appendChild(sectionWrap);
      }
    }

    countEl.textContent = totalParents + ' session' + (totalParents !== 1 ? 's' : '') +
      (totalChildren > 0 ? ' · ' + totalChildren + ' sub-agent' + (totalChildren !== 1 ? 's' : '') : '');
  } catch (e) {
    body.innerHTML = '<div class="agent-empty" style="color:#f87171;">Failed to load</div>';
  }
}

// ── Boot ────────────────────────────────────────────────────
connect();
loadSessionsSidebar();
loadDaemonStatus();
checkVoiceEnabled();
restoreSession();
loadAgentSelector();
loadModelSelector();
gitLoadAgentSelector();
ghRefresh();
loadPluginPanels();
loadAgentPanel();
// ── Skill Designer ───────────────────────────────────────────
let sdEditName = '';
let sdSteps = [];
let sdDirty = false;
let sdMetadata = { tags: [], difficulty: '', examples: [], prerequisites: [] };

function openSkillDesigner(editName) {
  sdEditName = editName || '';
  sdSteps = [];
  sdDirty = false;
  document.getElementById('sd-title').textContent = editName ? 'Edit: ' + editName : 'New Skill';
  document.getElementById('sd-save-btn').textContent = editName ? '💾 Update' : '💾 Create';
  document.getElementById('sd-status').textContent = '';
  document.getElementById('sd-dirty').style.display = 'none';

   if (editName) {
     fetch(BASE + '/api/skills/detail?name=' + encodeURIComponent(editName))
       .then(r => r.json()).then(s => {
         document.getElementById('sd-name').value = s.name || '';
         document.getElementById('sd-desc').value = s.description || '';
         document.getElementById('sd-trigger').value = s.trigger_pattern || '';
         document.getElementById('sd-editor').value = s.content || '';
         try { sdSteps = JSON.parse(s.steps || '[]'); } catch(e) { sdSteps = []; }
         
         // Load metadata
         try {
           sdMetadata = s.metadata && typeof s.metadata === 'string' ? JSON.parse(s.metadata) : (s.metadata || {});
         } catch(e) {
           sdMetadata = {};
         }
         sdMetadata.tags = sdMetadata.tags || [];
         sdMetadata.difficulty = sdMetadata.difficulty || '';
         sdMetadata.examples = sdMetadata.examples || [];
         sdMetadata.prerequisites = sdMetadata.prerequisites || [];
         
         // Update UI
         document.getElementById('sd-name').value = s.name || '';
         document.getElementById('sd-desc').value = s.description || '';
         document.getElementById('sd-trigger').value = s.trigger_pattern || '';
         document.getElementById('sd-editor').value = s.content || '';
         sdUpdateMetadataUI();
         sdRenderSteps();
         sdUpdatePreview();
         sdUpdateFrontmatter();
         sdDirty = false;
         document.getElementById('sd-dirty').style.display = 'none';
       }).catch(e => alert('Failed to load skill: ' + e.message));
   } else {
     document.getElementById('sd-name').value = '';
     document.getElementById('sd-desc').value = '';
     document.getElementById('sd-trigger').value = '';
     document.getElementById('sd-editor').value = '';
     sdMetadata = { tags: [], difficulty: '', examples: [], prerequisites: [] };
     sdUpdateMetadataUI();
     sdSteps = [];
     sdRenderSteps();
     sdUpdatePreview();
     sdUpdateFrontmatter();
   }

  document.getElementById('skill-designer').style.display = 'flex';
  sdSwitchTab('content');
  setTimeout(() => document.getElementById('sd-editor').focus(), 100);
}

async function closeSkillDesigner() {
  if (sdDirty) {
    const ok = await confirmAction('Unsaved Changes', 'You have unsaved changes. Discard?', 'Discard');
    if (!ok) return;
  }
  document.getElementById('skill-designer').style.display = 'none';
  loadSkills();
}

function sdMarkDirty() {
  sdDirty = true;
  document.getElementById('sd-dirty').style.display = 'inline';
}

function sdSwitchTab(tab) {
  document.querySelectorAll('.sd-tab').forEach(t => t.classList.toggle('active', t.dataset.sdTab === tab));
  ['content','meta','steps'].forEach(t => {
    const el = document.getElementById('sd-tab-' + t);
    if (el) el.style.display = t === tab ? (t === 'steps' ? 'flex' : 'block') : 'none';
  });
}

// ── Metadata ──
function sdUpdateMetadataUI() {
  document.getElementById('sd-meta-tags').value = sdMetadata.tags?.join(', ') || '';
  document.getElementById('sd-meta-difficulty').value = sdMetadata.difficulty || '';
  document.getElementById('sd-meta-examples').value = (sdMetadata.examples || []).join('\\n') || '';
  document.getElementById('sd-meta-prerequisites').value = (sdMetadata.prerequisites || []).join(', ') || '';
  sdUpdateMetadataPreview();
}

function sdUpdateMetadataFromUI() {
  sdMetadata.tags = document.getElementById('sd-meta-tags').value
    .split(',').map(t => t.trim()).filter(t => t);
  sdMetadata.difficulty = document.getElementById('sd-meta-difficulty').value;
  sdMetadata.examples = document.getElementById('sd-meta-examples').value
    .split('\\n').map(e => e.trim()).filter(e => e);
  sdMetadata.prerequisites = document.getElementById('sd-meta-prerequisites').value
    .split(',').map(p => p.trim()).filter(p => p);
  sdMarkDirty();
  sdUpdateMetadataPreview();
}

function sdUpdateMetadataPreview() {
  const preview = document.getElementById('sd-meta-preview');
  const lines = [];
  if (sdMetadata.difficulty) lines.push('difficulty: ' + sdMetadata.difficulty);
  if (sdMetadata.tags?.length) lines.push('tags: ' + sdMetadata.tags.join(', '));
  if (sdMetadata.examples?.length) lines.push('examples: ' + (sdMetadata.examples.length) + ' example(s)');
  if (sdMetadata.prerequisites?.length) lines.push('prerequisites: ' + (sdMetadata.prerequisites.length) + ' prerequisite(s)');
  preview.textContent = lines.length ? lines.join('\\n') : '(no metadata set)';
}

// ── Resize handle ──
let sdResizing = false;
function sdStartResize(e) {
  sdResizing = true;
  e.preventDefault();
}
document.addEventListener('mousemove', function(e) {
  if (!sdResizing) return;
  const designer = document.getElementById('skill-designer');
  if (!designer || designer.style.display === 'none') return;
  const rect = designer.getBoundingClientRect();
  const pct = ((e.clientX - rect.left) / rect.width) * 100;
  if (pct < 25 || pct > 80) return;
  const leftPanel = designer.children[1].children[0];
  leftPanel.style.width = pct + '%';
  document.getElementById('sd-resize-handle').style.left = pct + '%';
});
document.addEventListener('mouseup', function() { sdResizing = false; });

// ── Steps ──
function sdAddStep(stepData) {
  const step = stepData || { step: sdSteps.length + 1, action: '', tool: '', params: {} };
  if (!step.step) step.step = sdSteps.length + 1;
  sdSteps.push(step);
  sdRenderSteps();
  sdMarkDirty();
}

function sdRemoveStep(idx) {
  sdSteps.splice(idx, 1);
  sdSteps.forEach((s, i) => s.step = i + 1);
  sdRenderSteps();
  sdMarkDirty();
}

function sdMoveStep(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= sdSteps.length) return;
  [sdSteps[idx], sdSteps[newIdx]] = [sdSteps[newIdx], sdSteps[idx]];
  sdSteps.forEach((s, i) => s.step = i + 1);
  sdRenderSteps();
  sdMarkDirty();
}

function sdRenderSteps() {
  const el = document.getElementById('sd-steps-list');
  if (!sdSteps.length) {
    el.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text3);font-size:12px;">No steps defined.<br><span style="font-size:10px;">Steps help structure the skill as an ordered sequence of actions.</span></div>';
    return;
  }
  el.innerHTML = sdSteps.map((s, i) => '<div class="sd-step">' +
    '<span class="sd-step-drag" title="Drag to reorder">⠿</span>' +
    '<div style="flex:1;display:flex;flex-direction:column;gap:4px;">' +
      '<div style="display:flex;gap:6px;align-items:center;">' +
        '<span style="font-size:11px;font-weight:600;color:var(--accent2);min-width:20px;">' + (i+1) + '.</span>' +
        '<input class="inp" style="flex:1;font-size:11px;padding:4px 8px;" value="' + esc(s.action || '') + '" onchange="sdSteps[' + i + '].action=this.value;sdMarkDirty();" placeholder="Step action description" />' +
      '</div>' +
      '<div style="display:flex;gap:6px;padding-left:26px;">' +
        '<input class="inp" style="width:40%;font-size:10px;padding:2px 6px;" value="' + esc(s.tool || '') + '" onchange="sdSteps[' + i + '].tool=this.value;sdMarkDirty();" placeholder="Tool (optional)" />' +
        '<input class="inp" style="width:60%;font-size:10px;padding:2px 6px;" value="' + esc(s.params ? JSON.stringify(s.params) : '') + '" onchange="try{sdSteps[' + i + '].params=JSON.parse(this.value);sdMarkDirty();}catch(e){}" placeholder="Params JSON (optional)" />' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;gap:2px;">' +
      (i > 0 ? '<button class="btn btn-ghost" style="font-size:10px;padding:1px 4px;" onclick="sdMoveStep(' + i + ',-1)">▲</button>' : '<span style="width:20px;"></span>') +
      (i < sdSteps.length - 1 ? '<button class="btn btn-ghost" style="font-size:10px;padding:1px 4px;" onclick="sdMoveStep(' + i + ',1)">▼</button>' : '<span style="width:20px;"></span>') +
      '<button class="btn btn-ghost" style="font-size:10px;padding:1px 4px;color:#f87171;" onclick="sdRemoveStep(' + i + ')">✕</button>' +
    '</div>' +
  '</div>').join('');
}

function sdCollectSteps() {
  return sdSteps.map((s, i) => ({
    step: i + 1,
    action: s.action || '',
    description: s.action || '',
    tool: s.tool || undefined,
    params: s.params || undefined,
  }));
}

// ── Preview ──
function sdUpdatePreview() {
  const text = document.getElementById('sd-editor').value;
  const preview = document.getElementById('sd-preview');
  preview.className = 'sd-preview';
  preview.innerHTML = sdRenderMarkdown(text);
}

function sdRenderMarkdown(text) {
  var out = '';
  var i = 0;
  var lines = text.split('\\n');
  var inCodeBlock = false;
  var codeBuf = [];
  var inParagraph = false;

  function flushPara() {
    if (inParagraph) { out += '</p>'; inParagraph = false; }
  }

  while (i < lines.length) {
    var line = lines[i];

    if (inCodeBlock) {
      if (/^\\x60\\x60\\x60/.test(line)) {
        out += '<pre><code>' + codeBuf.join('\\n').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</code></pre>';
        codeBuf = [];
        inCodeBlock = false;
      } else {
        codeBuf.push(line);
      }
      i++;
      continue;
    }

    if (/^\\x60\\x60\\x60/.test(line)) {
      flushPara();
      inCodeBlock = true;
      codeBuf = [];
      i++;
      continue;
    }

    var trimmed = line.trim();

    if (!trimmed) {
      flushPara();
      i++;
      continue;
    }

    if (/^#{1,4} /.test(trimmed)) {
      flushPara();
      var m = trimmed.match(/^(#{1,4}) (.+)/);
      var level = m[1].length;
      var htext = m[2];
      htext = htext.replace(/\\x60([^\\x60]+)\\x60/g, '<code>$1</code>');
      htext = htext.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
      htext = htext.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
      htext = htext.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank">$1</a>');
      out += '<h' + level + '>' + htext + '</h' + level + '>';
      i++;
      continue;
    }

    if (/^---$/.test(trimmed)) {
      flushPara();
      out += '<hr>';
      i++;
      continue;
    }

    if (/^&gt; /.test(line)) {
      flushPara();
      out += '<blockquote>' + esc(trimmed.replace(/^&gt; /, '')) + '</blockquote>';
      i++;
      continue;
    }

    if (/^- /.test(trimmed)) {
      flushPara();
      out += '<ul>';
      while (i < lines.length && /^- /.test((lines[i] || '').trim())) {
        var li = lines[i].trim().replace(/^- /, '');
        li = li.replace(/\\x60([^\\x60]+)\\x60/g, '<code>$1</code>');
        li = li.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
        li = li.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
        li = li.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank">$1</a>');
        out += '<li>' + li + '</li>';
        i++;
      }
      out += '</ul>';
      continue;
    }

    if (/^\\d+\\. /.test(trimmed)) {
      flushPara();
      out += '<ol>';
      while (i < lines.length && /^\\d+\\. /.test((lines[i] || '').trim())) {
        var li2 = lines[i].trim().replace(/^\\d+\\. /, '');
        li2 = li2.replace(/\\x60([^\\x60]+)\\x60/g, '<code>$1</code>');
        li2 = li2.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
        li2 = li2.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
        li2 = li2.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank">$1</a>');
        out += '<li>' + li2 + '</li>';
        i++;
      }
      out += '</ol>';
      continue;
    }

    var ptext = esc(line);
    ptext = ptext.replace(/\\x60([^\\x60]+)\\x60/g, '<code>$1</code>');
    ptext = ptext.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
    ptext = ptext.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
    ptext = ptext.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank">$1</a>');

    if (!inParagraph) { out += '<p>'; inParagraph = true; }
    else { out += ' '; }
    out += ptext;
    i++;
  }

  flushPara();
  return out;
}

// ── Frontmatter ──
function sdUpdateFrontmatter() {
  const name = document.getElementById('sd-name').value.trim();
  const desc = document.getElementById('sd-desc').value.trim();
  const trigger = document.getElementById('sd-trigger').value.trim();
  let fm = '---\\nname: ' + (name || 'my-skill') + '\\ndescription: ';
  fm += desc ? (desc.length > 80 ? '>-\\n  ' + desc : desc) : '...';
  if (trigger) fm += '\\ntrigger_pattern: ' + trigger;
  fm += '\\n---';
  document.getElementById('sd-frontmatter-preview').textContent = fm;
}

// ── Save / Export ──
async function skillDesignerSave() {
  const name = document.getElementById('sd-name').value.trim();
  if (!name) {
    document.getElementById('sd-status').textContent = 'Name is required.';
    return;
  }
  document.getElementById('sd-status').textContent = 'Saving...';
  
  // Collect metadata from UI
  sdUpdateMetadataFromUI();
  
  const body = {
    name: name,
    description: document.getElementById('sd-desc').value.trim() || undefined,
    triggerPattern: document.getElementById('sd-trigger').value.trim() || undefined,
    content: document.getElementById('sd-editor').value || undefined,
    steps: sdCollectSteps(),
    metadata: sdMetadata && (sdMetadata.tags?.length || sdMetadata.difficulty || sdMetadata.examples?.length || sdMetadata.prerequisites?.length) ? sdMetadata : undefined,
  };
  const res = await fetch(BASE + '/api/skills', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (res.ok) {
    sdEditName = name;
    sdDirty = false;
    document.getElementById('sd-dirty').style.display = 'none';
    document.getElementById('sd-title').textContent = 'Edit: ' + name;
    document.getElementById('sd-save-btn').textContent = '💾 Update';
    document.getElementById('sd-status').textContent = 'Saved ✓';
    setTimeout(() => document.getElementById('sd-status').textContent = '', 2000);
  } else {
    const data = await res.json().catch(() => ({}));
    document.getElementById('sd-status').textContent = data.error || 'Save failed.';
  }
}

async function skillDesignerExport() {
  const name = document.getElementById('sd-name').value.trim();
  if (!name) {
    document.getElementById('sd-status').textContent = 'Name is required for export.';
    return;
  }
  const content = document.getElementById('sd-editor').value;
  document.getElementById('sd-status').textContent = 'Exporting...';
  const body = { name, description: document.getElementById('sd-desc').value.trim(), triggerPattern: document.getElementById('sd-trigger').value.trim(), content };
  const res = await fetch(BASE + '/api/skills/export', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (res.ok) {
    const data = await res.json();
    document.getElementById('sd-status').textContent = 'Exported to ' + data.path;
    setTimeout(() => document.getElementById('sd-status').textContent = '', 3000);
  } else {
    const data = await res.json().catch(() => ({}));
    document.getElementById('sd-status').textContent = data.error || 'Export failed.';
  }
}

// Live preview on typing
let sdPreviewTimer;
const sdEditorEl = document.getElementById('sd-editor');
if (sdEditorEl) {
  sdEditorEl.addEventListener('input', function() {
    sdMarkDirty();
    clearTimeout(sdPreviewTimer);
    sdPreviewTimer = setTimeout(sdUpdatePreview, 200);
  });
}

// Ctrl+S
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    const designer = document.getElementById('skill-designer');
    if (designer && designer.style.display === 'flex') {
      e.preventDefault();
      skillDesignerSave();
    }
  }
  if (e.key === 'Escape') {
    const designer = document.getElementById('skill-designer');
    if (designer && designer.style.display === 'flex') {
      closeSkillDesigner();
    }
  }
});

// Metadata live update
['sd-name','sd-desc','sd-trigger'].forEach(function(id) {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', function() {
      sdMarkDirty();
      sdUpdateFrontmatter();
    });
  }
});

setInterval(loadDaemonStatus, 15_000);
setInterval(loadSessionsSidebar, 30_000);
setInterval(loadAgentSelector, 30_000);
setInterval(editorRefreshTree, 30_000);
// ── Quartermaster Monitoring ─────────────────────────────────────────────────
let qmAccuracyChart = null;

function switchQmSection(name) {
  ['tools','models'].forEach(s => {
    const btn = document.getElementById('qmsec-' + s);
    const sec = document.getElementById('qm-section-' + s);
    const isActive = s === name;
    if (btn) {
      btn.style.borderBottomColor = isActive ? 'var(--accent)' : 'transparent';
      btn.style.color = isActive ? 'var(--accent)' : 'var(--text2)';
    }
    if (sec) sec.style.display = isActive ? 'flex' : 'none';
  });
  // hide settings pane when switching sections
  const sp = document.getElementById('qm-pane-settings');
  if (sp) sp.style.display = 'none';

  const label = document.getElementById('qm-auto-refresh-label');
  if (name === 'models') {
    loadModelQm();
    if (label) label.style.display = '';
  } else {
    loadQmOverview();
    if (label) label.style.display = 'none';
  }
}

function switchQmTab(name) {
  document.querySelectorAll('.qm-tab').forEach(t => {
    t.classList.toggle('active', false);
    t.style.borderBottomColor = 'transparent';
    t.style.color = 'var(--text2)';
  });
  const tabBtn = document.getElementById('qmtab-' + name);
  if (tabBtn) {
    tabBtn.classList.add('active');
    tabBtn.style.borderBottomColor = 'var(--accent)';
    tabBtn.style.color = 'var(--accent)';
  }
  ['overview','patterns','decisions'].forEach(p => {
    const el = document.getElementById('qm-pane-' + p);
    if (el) el.style.display = p === name ? 'flex' : 'none';
  });
  // hide settings pane when switching tool tabs
  const sp = document.getElementById('qm-pane-settings');
  if (sp) sp.style.display = 'none';
  if (name === 'overview') loadQmOverview();
  if (name === 'patterns') loadQmPatterns();
  if (name === 'decisions') loadQmDecisions();
}

function qmOpenSettings() {
  // Hide both sections, show settings pane
  ['tools','models'].forEach(s => {
    const sec = document.getElementById('qm-section-' + s);
    if (sec) sec.style.display = 'none';
    const btn = document.getElementById('qmsec-' + s);
    if (btn) { btn.style.borderBottomColor = 'transparent'; btn.style.color = 'var(--text2)'; }
  });
  const sp = document.getElementById('qm-pane-settings');
  if (sp) sp.style.display = 'flex';
  loadQmSettings();
}

async function loadQuartermaster() {
  const data = await fetch(BASE + '/api/qm/health').then(r => r.json()).catch(() => null);
  if (data) {
    window._qmData = data;
    // Determine which section is currently visible and load accordingly
    const modelsVisible = document.getElementById('qm-section-models')?.style.display !== 'none';
    if (modelsVisible) loadModelQm(); else loadQmOverview();
  } else {
    document.getElementById('qm-summary-cards').innerHTML =
      '<div style="grid-column:1/-1;padding:20px;color:var(--text3);font-size:13px;text-align:center;">No quartermaster data available. The QM activates after 50 tool calls have been observed in a session.</div>';
  }
}

function loadQmOverview() {
  const data = window._qmData;
  if (!data) return;
  const s = data.summary || {};
  const weights = data.weights || [];
  const toolStats = data.toolStats || [];
  const trend = data.accuracyTrend || [];

  const cards = document.getElementById('qm-summary-cards');
  cards.innerHTML = \`
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Mode</div>
      <div style="font-size:22px;font-weight:700;color:\${s.mode === 'active' ? '#4ade80' : '#fbbf24'};margin-top:4px;">\${s.mode?.toUpperCase() ?? '—'}</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Observations</div>
      <div style="font-size:22px;font-weight:700;color:var(--text);margin-top:4px;">\${s.totalObservations ?? 0}</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Predictions</div>
      <div style="font-size:22px;font-weight:700;color:var(--text);margin-top:4px;">\${s.totalPredictions ?? 0}</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Correct</div>
      <div style="font-size:22px;font-weight:700;color:var(--text);margin-top:4px;">\${s.totalCorrect ?? 0}</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Overall Accuracy</div>
      <div style="font-size:22px;font-weight:700;color:\${(s.accuracy || 0) >= 0.7 ? '#4ade80' : (s.accuracy || 0) >= 0.5 ? '#fbbf24' : '#f87171'};margin-top:4px;">\${((s.accuracy || 0) * 100).toFixed(1)}%</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Recent Accuracy</div>
      <div style="font-size:22px;font-weight:700;color:\${(s.rollingAccuracy || 0) >= 0.7 ? '#4ade80' : (s.rollingAccuracy || 0) >= 0.5 ? '#fbbf24' : '#f87171'};margin-top:4px;">\${((s.rollingAccuracy || 0) * 100).toFixed(1)}%</div>
    </div>
  \`;

  if (trend.length > 0) {
    const ctx = document.getElementById('qm-accuracy-chart');
    if (ctx) {
      if (qmAccuracyChart) qmAccuracyChart.destroy();
      qmAccuracyChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: trend.map(d => d.timestamp.slice(5,16).replace('T',' ')),
          datasets: [
            { label: 'Bucket Accuracy', data: trend.map(d => d.accuracy), borderColor: '#818cf8', backgroundColor: 'rgba(129,140,248,0.1)', tension: 0.3, pointRadius: 2, fill: false },
            { label: 'Rolling Avg', data: trend.map(d => d.rollingAvg), borderColor: '#34d399', borderDash: [4,2], tension: 0.3, pointRadius: 0, fill: false },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#9090a8', font: { size: 10 }, usePointStyle: true } } },
          scales: {
            x: { ticks: { color: '#55556a', font: { size: 9 }, maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { min: 0, max: 1, ticks: { color: '#55556a', font: { size: 9 }, callback: v => (v*100).toFixed(0)+'%' }, grid: { color: 'rgba(255,255,255,0.04)' } },
          },
        },
      });
    }
  }

  const wEl = document.getElementById('qm-weights-content');
  if (weights.length > 0) {
    wEl.innerHTML = weights.map(w => {
      const barH = Math.max(4, Math.round(w.weight * 80));
      return \`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <div style="width:90px;font-size:11px;color:var(--text2);text-align:right;">\${w.signalName}</div>
        <div style="flex:1;height:14px;background:var(--bg3);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:\${(w.weight*100).toFixed(0)}%;background:linear-gradient(90deg,#818cf8,#c084fc);border-radius:3px;transition:width 0.5s;"></div>
        </div>
        <div style="font-size:11px;color:var(--text);font-weight:600;width:34px;">\${(w.weight*100).toFixed(0)}%</div>
      </div>\`;
    }).join('');
  } else {
    wEl.innerHTML = '<p style="color:var(--text3);font-size:12px;">No weights data.</p>';
  }

  const tsEl = document.getElementById('qm-tool-stats-content');
  if (toolStats.length > 0) {
    tsEl.innerHTML = \`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">
      \${toolStats.slice(0,10).map(s => {
        const rate = s.totalCalls > 0 ? (s.successfulCalls / s.totalCalls * 100).toFixed(0) : '0';
        const barW = s.totalCalls > 0 ? Math.min(100, Math.round(s.successfulCalls / s.totalCalls * 100)) : 0;
        return \`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:var(--bg3);border-radius:4px;">
          <div>
            <div style="font-size:12px;font-weight:500;color:var(--text);">\${s.toolName}</div>
            <div style="font-size:10px;color:var(--text3);">\${s.totalCalls} calls · \${s.avgDurationMs.toFixed(0)}ms avg</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:13px;font-weight:600;color:\${Number(rate) >= 80 ? '#4ade80' : Number(rate) >= 50 ? '#fbbf24' : '#f87171'};">\${rate}%</div>
            <div style="width:60px;height:4px;background:var(--border);border-radius:2px;margin-top:3px;">
              <div style="height:100%;width:\${barW}%;background:\${Number(rate) >= 80 ? '#4ade80' : Number(rate) >= 50 ? '#fbbf24' : '#f87171'};border-radius:2px;"></div>
            </div>
          </div>
        </div>\`;
      }).join('')}
    </div>\`;
  } else {
    tsEl.innerHTML = '<p style="color:var(--text3);font-size:12px;">No tool statistics collected yet.</p>';
  }
}

async function loadQmPatterns() {
  const el = document.getElementById('qm-patterns-content');
  el.innerHTML = '<p style="color:var(--text3);font-size:12px;">Loading…</p>';
  const patterns = await fetch(BASE + '/api/qm/patterns?limit=50').then(r => r.json()).catch(() => null);
  if (!patterns) { el.innerHTML = '<p style="color:var(--text3);font-size:12px;">Failed to load.</p>'; return; }
  if (patterns.length === 0) {
    el.innerHTML = '<p style="color:var(--text3);font-size:12px;">No patterns recorded yet. Patterns emerge after tool call sequences are observed and evaluated via reflection.</p>';
    return;
  }
  el.innerHTML = \`<div style="display:flex;flex-direction:column;gap:8px;">
    <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;">Learned Tool Sequence Patterns (\${patterns.length})</div>
    \${patterns.map(p => {
      const successRate = p.hitCount > 0 ? (p.successCount / p.hitCount * 100).toFixed(0) : '0';
      const color = Number(successRate) >= 70 ? '#4ade80' : Number(successRate) >= 40 ? '#fbbf24' : '#f87171';
      const seq = Array.isArray(p.toolSequence) ? p.toolSequence.join(' → ') : p.toolSequence;
      return \`<div class="card" style="padding:10px 14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;color:var(--text);font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">\${seq}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:3px;">\${p.hitCount} hits · \${p.successCount} successes · conf: \${((p.avgConfidence||0)*100).toFixed(0)}%</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:15px;font-weight:700;color:\${color};">\${successRate}%</div>
            <div style="font-size:9px;color:var(--text3);">success</div>
          </div>
        </div>
        <div style="height:3px;background:var(--bg3);border-radius:2px;margin-top:6px;">
          <div style="height:100%;width:\${successRate}%;background:\${color};border-radius:2px;transition:width 0.4s;"></div>
        </div>
      </div>\`;
    }).join('')}
  </div>\`;
}

async function loadQmDecisions() {
  const el = document.getElementById('qm-decisions-content');
  el.innerHTML = '<p style="color:var(--text3);font-size:12px;">Loading…</p>';
  const decisions = await fetch(BASE + '/api/qm/recent?limit=50').then(r => r.json()).catch(() => []);
  if (!decisions || decisions.length === 0) {
    el.innerHTML = '<p style="color:var(--text3);font-size:12px;">No decisions recorded yet. The QM makes predictions once it has observed enough tool calls in a session (threshold: 50).</p>';
    return;
  }
  const modeColors = { automate: '#fbbf24', suggest: '#818cf8', defer: '#55556a' };
  const total = decisions.length;
  const correct = decisions.filter(d => d.wasCorrect === 1).length;
  const pending = decisions.filter(d => d.wasCorrect === null).length;
  const accPct = (total - pending) > 0 ? (correct / (total - pending) * 100).toFixed(1) : '—';
  el.innerHTML = \`<div style="display:flex;flex-direction:column;gap:6px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <div style="font-size:13px;font-weight:600;color:var(--text);">Recent Decisions (\${total})</div>
      <div style="font-size:11px;color:var(--text3);">Accuracy: <b style="color:\${accPct !== '—' && Number(accPct) >= 60 ? '#4ade80' : '#fbbf24'};">\${accPct}%</b> · \${pending} pending eval</div>
    </div>
    \${decisions.map(d => {
      const correctLabel = d.wasCorrect === null ? '⏳' : d.wasCorrect === 1 ? '✓' : '✗';
      const correctColor = d.wasCorrect === null ? '#55556a' : d.wasCorrect === 1 ? '#4ade80' : '#f87171';
      const confPct = ((d.confidence || 0) * 100).toFixed(0);
      const signals = Array.isArray(d.signalsUsed) ? d.signalsUsed.slice(0,3).map(s => s.name + ':' + ((s.contributed||0)*100).toFixed(0) + '%').join(', ') : '';
      return \`<div class="card" style="padding:8px 12px;display:flex;align-items:center;gap:10px;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:\${modeColors[d.mode] || '#55556a'};flex-shrink:0;" title="\${d.mode}"></span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            \${d.mode === 'defer' ? '<span style="color:var(--text3);">Deferred (no prediction)</span>' : \`Predicted <b>\${d.predictedTool || '?'}</b>\${d.actualTool ? \` → actual: <b>\${d.actualTool}</b>\` : ''}\`}
          </div>
          <div style="font-size:10px;color:var(--text3);">\${d.confidence ? confPct + '% conf' : ''}\${signals ? ' · ' + signals : ''}\${d.sessionId ? ' · ' + d.sessionId.slice(-10) : ''}</div>
        </div>
        <span style="font-size:14px;font-weight:700;color:\${correctColor};flex-shrink:0;" title="\${d.wasCorrect === null ? 'Pending evaluation' : d.wasCorrect === 1 ? 'Correct' : 'Incorrect'}">\${correctLabel}</span>
      </div>\`;
    }).join('')}
  </div>\`;
}

async function loadQmSettings() {
  const [cfg, config] = await Promise.all([
    fetch(BASE + '/api/qm/config').then(r => r.json()).catch(() => ({})),
    fetch(BASE + '/api/config').then(r => r.json()).catch(() => null),
  ]);
  const el = id => document.getElementById(id);

  // Populate provider dropdown with configured providers only
  const provSel = el('qm-cfg-provider');
  if (provSel && config?.providers) {
    const configured = Object.keys(config.providers).filter(k => config.providers[k]?.model || config.providers[k]?.apiKey);
    provSel.innerHTML = '<option value="">— any configured provider —</option>'
      + configured.map(k => '<option value="' + k + '">' + providerLabel(k) + '</option>').join('');
  }

  if (el('qm-cfg-enabled')) el('qm-cfg-enabled').checked = !!cfg.enabled;
  if (provSel) provSel.value = cfg.quartermasterProvider || '';
  if (el('qm-cfg-model')) el('qm-cfg-model').value = cfg.quartermasterModel || '';
  if (el('qm-cfg-mode')) el('qm-cfg-mode').value = cfg.mode || 'balanced';
  if (el('qm-cfg-threshold')) el('qm-cfg-threshold').value = cfg.observeThreshold ?? 50;
  const status = el('qm-cfg-status');
  if (status) status.textContent = '';

  // Pre-load models if a provider is already selected
  if (cfg.quartermasterProvider) qmFetchModels(true);
}

let _qmFetchingModels = false;
async function qmFetchModels(silent = false) {
  if (_qmFetchingModels) return;
  const provSel = document.getElementById('qm-cfg-provider');
  const kind = provSel?.value;
  if (!kind) return;
  const statusEl = document.getElementById('qm-model-fetch-status');
  const btn = document.getElementById('qm-fetch-models-btn');
  _qmFetchingModels = true;
  if (!silent) { if (btn) btn.textContent = '…'; if (statusEl) statusEl.textContent = 'Loading…'; }
  try {
    const res = await fetch(BASE + '/api/providers/' + kind + '/models');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const models = await res.json();
    const dl = document.getElementById('qm-cfg-model-list');
    if (dl) dl.innerHTML = models.map(m => '<option value="' + (m.id || m) + '">' + (m.name || m.id || m) + '</option>').join('');
    if (statusEl) statusEl.textContent = models.length + ' models available';
  } catch(e) {
    if (statusEl && !silent) statusEl.textContent = 'Could not fetch models — type manually';
  } finally {
    _qmFetchingModels = false;
    if (btn) btn.textContent = '↻';
  }
}

function qmCfgDirty() {
  const status = document.getElementById('qm-cfg-status');
  if (status) status.textContent = '● unsaved changes';
}

async function saveQmConfig() {
  const btn = document.getElementById('qm-cfg-save');
  const status = document.getElementById('qm-cfg-status');
  btn.disabled = true;
  if (status) status.textContent = 'Saving…';
  try {
    const body = {
      enabled: document.getElementById('qm-cfg-enabled').checked,
      quartermasterProvider: document.getElementById('qm-cfg-provider').value || undefined,
      quartermasterModel: document.getElementById('qm-cfg-model').value.trim() || undefined,
      mode: document.getElementById('qm-cfg-mode').value,
      observeThreshold: Number(document.getElementById('qm-cfg-threshold').value) || 50,
    };
    const res = await fetch(BASE + '/api/qm/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());
    if (res.success) {
      if (status) { status.textContent = '✓ Saved'; status.style.color = '#4ade80'; }
      setTimeout(() => { if (status) { status.textContent = ''; status.style.color = 'var(--text3)'; } }, 2500);
    } else {
      if (status) { status.textContent = 'Error saving'; status.style.color = '#f87171'; }
    }
  } catch(e) {
    if (status) { status.textContent = 'Error: ' + e.message; status.style.color = '#f87171'; }
  } finally {
    btn.disabled = false;
  }
}

async function qmResetAll() {
  if (!confirm('Reset ALL Quartermaster data? This will erase all learned patterns, decisions, tool stats and signal weights. This cannot be undone.')) return;
  try {
    await fetch(BASE + '/api/qm/reset', { method: 'POST' });
    loadQuartermaster();
    const status = document.getElementById('qm-cfg-status');
    if (status) { status.textContent = '✓ Reset complete'; status.style.color = '#4ade80'; }
    setTimeout(() => { if (status) { status.textContent = ''; status.style.color = 'var(--text3)'; } }, 2500);
  } catch(e) {
    alert('Reset failed: ' + e.message);
  }
}
// ── End Quartermaster ────────────────────────────────────────────────────────

// ── Model Quartermaster UI ──────────────────────────────────────────────────
let mqmChart = null;
let mqmAutoRefresh = null;
let mqmData = null;

async function loadModelQm() {
  document.getElementById('mqm-summary-cards').innerHTML =
    '<div style="grid-column:1/-1;padding:20px;color:var(--text3);font-size:13px;text-align:center;">Loading…</div>';
  const data = await fetch(BASE + '/api/mqm/summary').then(r => r.json()).catch(() => null);
  if (data) {
    mqmData = data;
    loadMqmOverview();
  } else {
    document.getElementById('mqm-summary-cards').innerHTML =
      '<div style="grid-column:1/-1;padding:20px;color:var(--text3);font-size:13px;text-align:center;">No model quartermaster data available. MQM activates after 50 LLM calls have been observed in a session.</div>';
  }
  startMqmAutoRefresh();
}

function startMqmAutoRefresh() {
  if (mqmAutoRefresh) clearInterval(mqmAutoRefresh);
  mqmAutoRefresh = setInterval(() => {
    const sec = document.getElementById('qm-section-models');
    if (currentPage === 'quartermaster' && sec && sec.style.display !== 'none') loadModelQm();
  }, 5000);
}

async function loadMqmOverview() {
  const data = mqmData;
  if (!data) return;
  const s = data.summary || {};
  const weights = data.weights || {};
  const stats = data.stats || [];
  const accuracyTrend = data.accuracyTrend || [];

  const cards = document.getElementById('mqm-summary-cards');
  const accPct = ((s.accuracy || 0) * 100).toFixed(1);
  const accColor = (s.accuracy || 0) >= 0.7 ? '#4ade80' : (s.accuracy || 0) >= 0.5 ? '#fbbf24' : '#f87171';
  cards.innerHTML = \`
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Mode</div>
      <div style="font-size:22px;font-weight:700;color:\${s.mode === 'active' ? '#4ade80' : '#fbbf24'};margin-top:4px;">\${(s.mode || 'observe').toUpperCase()}</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Observations</div>
      <div style="font-size:22px;font-weight:700;color:var(--text);margin-top:4px;">\${s.totalObservations ?? 0}</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Predictions</div>
      <div style="font-size:22px;font-weight:700;color:var(--text);margin-top:4px;">\${s.totalPredictions ?? 0}</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Accuracy</div>
      <div style="font-size:22px;font-weight:700;color:\${accColor};margin-top:4px;">\${accPct}%</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Avg Cost</div>
      <div style="font-size:22px;font-weight:700;color:var(--text);margin-top:4px;">\$\${(s.avgCostUsd || 0).toFixed(4)}</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Avg Quality</div>
      <div style="font-size:22px;font-weight:700;color:\${(s.avgQuality || 0) >= 0.7 ? '#4ade80' : (s.avgQuality || 0) >= 0.5 ? '#fbbf24' : '#f87171'};margin-top:4px;">\${((s.avgQuality || 0) * 100).toFixed(0)}%</div>
    </div>
  \`;

  const wEl = document.getElementById('mqm-weights-content');
  const entries = Object.entries(weights || {});
  if (entries.length > 0) {
    wEl.innerHTML = entries.map(([name, weight]) => \`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <div style="width:90px;font-size:11px;color:var(--text2);text-align:right;">\${name}</div>
        <div style="flex:1;height:14px;background:var(--bg3);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:\${(Number(weight)*100).toFixed(0)}%;background:linear-gradient(90deg,#818cf8,#c084fc);border-radius:3px;"></div>
        </div>
        <div style="font-size:11px;color:var(--text);font-weight:600;width:34px;">\${(Number(weight)*100).toFixed(0)}%</div>
      </div>
    \`).join('');
  } else {
    wEl.innerHTML = '<p style="color:var(--text3);font-size:12px;">No weights data.</p>';
  }

  const tmEl = document.getElementById('mqm-topmodels-content');
  const topModels = s.topModels || [];
  if (topModels.length > 0) {
    tmEl.innerHTML = topModels.slice(0, 5).map(m => \`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:var(--bg3);border-radius:4px;margin-bottom:6px;">
        <div>
          <div style="font-size:12px;font-weight:500;color:var(--text);">\${m.provider}/\${m.model}</div>
          <div style="font-size:10px;color:var(--text3);">\${m.usageCount} uses</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:13px;font-weight:600;color:\${m.avgQuality >= 0.7 ? '#4ade80' : m.avgQuality >= 0.5 ? '#fbbf24' : '#f87171'};">\${(m.avgQuality * 100).toFixed(0)}%</div>
          <div style="font-size:10px;color:var(--text3);">quality</div>
        </div>
      </div>
    \`).join('');
  } else {
    tmEl.innerHTML = '<p style="color:var(--text3);font-size:12px;">No model usage data yet.</p>';
  }

  const dEl = document.getElementById('mqm-decisions-content');
  const decisions = await fetch(BASE + '/api/mqm/decisions?limit=8').then(r => r.json()).catch(() => []);
  if (decisions && decisions.length > 0) {
    const modeColors = { enforce: '#4ade80', suggest: '#818cf8', defer: '#55556a' };
    dEl.innerHTML = \`<div style="display:flex;flex-direction:column;gap:6px;">
      \${decisions.map(d => {
        const correctLabel = d.wasCorrect === null ? '⏳' : (d.wasCorrect || 0) >= 0.7 ? '✓' : '✗';
        const correctColor = d.wasCorrect === null ? '#55556a' : (d.wasCorrect || 0) >= 0.7 ? '#4ade80' : '#f87171';
        const confPct = ((d.confidence || 0) * 100).toFixed(0);
        return \`<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:\${modeColors[d.mode] || '#55556a'};flex-shrink:0;" title="\${d.mode}"></span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              \${d.mode === 'defer' ? 'Deferred (no prediction)' : \`Predicted <b>\${d.predictedProvider || '?'}/\${d.predictedModel || '?'}</b>\`}
              \${d.actualModel ? \` → actual: <b>\${d.actualProvider || '?'}/\${d.actualModel}</b>\` : ''}
            </div>
            <div style="font-size:10px;color:var(--text3);">\${confPct}% confidence · est.cost \$\${(d.estimatedCost || 0).toFixed(4)}</div>
          </div>
          <span style="font-size:14px;font-weight:700;color:\${correctColor};flex-shrink:0;">\${correctLabel}</span>
        </div>\`;
      }).join('')}
    </div>\`;
  } else {
    dEl.innerHTML = '<p style="color:var(--text3);font-size:12px;">No decisions recorded yet.</p>';
  }

  window._mqmStats = stats;
  window._mqmTrend = accuracyTrend;
}

async function loadMqmModels() {
  const el = document.getElementById('mqm-models-content');
  el.innerHTML = '<p style="color:var(--text3);font-size:12px;">Loading…</p>';
  const stats = await fetch(BASE + '/api/mqm/stats').then(r => r.json()).catch(() => []);
  window._mqmStats = stats;
  renderMqmModels(stats, 'all');
}

function filterMqmModels(cat) {
  document.querySelectorAll('.mqm-cat-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('mqm-cat-' + cat)?.classList.add('active');
  const stats = window._mqmStats || [];
  renderMqmModels(stats, cat);
}

function renderMqmModels(stats, cat) {
  const el = document.getElementById('mqm-models-content');
  const filtered = cat === 'all' ? stats : stats.filter(s => s.taskCategory === cat);
  if (filtered.length === 0) {
    el.innerHTML = '<p style="color:var(--text3);font-size:12px;padding:20px;">No data for this category yet.</p>';
    return;
  }
  const byModel = {};
  for (const s of filtered) {
    const key = s.provider + '/' + s.model;
    if (!byModel[key]) byModel[key] = { ...s, key, categories: {} };
    byModel[key].categories[s.taskCategory] = s;
  }
  el.innerHTML = \`<div style="display:flex;flex-direction:column;gap:8px;">
    \${Object.values(byModel).map(m => {
      const rate = m.totalCalls > 0 ? (m.successfulCalls / m.totalCalls * 100).toFixed(0) : '0';
      const barW = Math.min(100, Math.round(Number(rate)));
      return \`<div class="card" style="padding:10px 14px;display:flex;align-items:center;gap:12px;">
        <div style="font-size:12px;font-weight:500;color:var(--text);min-width:160px;">\${m.key}</div>
        <div style="font-size:10px;color:var(--text3);min-width:40px;">\${m.totalCalls} calls</div>
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="font-size:10px;color:var(--text3);min-width:40px;">succ: \${rate}%</div>
            <div style="flex:1;height:5px;background:var(--bg3);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:\${barW}%;background:\${Number(rate) >= 80 ? '#4ade80' : Number(rate) >= 50 ? '#fbbf24' : '#f87171'};border-radius:3px;"></div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:3px;">
            <div style="font-size:10px;color:var(--text3);min-width:40px;">qual: \${(m.avgQuality * 100).toFixed(0)}%</div>
            <div style="flex:1;height:5px;background:var(--bg3);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:\${(m.avgQuality * 100).toFixed(0)}%;background:linear-gradient(90deg,#818cf8,#c084fc);border-radius:3px;"></div>
            </div>
          </div>
        </div>
        <div style="font-size:10px;color:var(--text3);min-width:80px;text-align:right;">\$\${m.avgCost.toFixed(5)} avg</div>
      </div>\`;
    }).join('')}
  </div>\`;
}

async function loadMqmAccuracy() {
  const trend = await fetch(BASE + '/api/mqm/accuracy?hours=24').then(r => r.json()).catch(() => []);
  const ctx = document.getElementById('mqm-accuracy-chart');
  if (!ctx || trend.length === 0) return;
  if (mqmChart) mqmChart.destroy();
  mqmChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trend.map(d => d.timestamp.slice(5,16).replace('T',' ')),
      datasets: [{
        label: 'Accuracy', data: trend.map(d => d.accuracy),
        borderColor: '#818cf8', backgroundColor: 'rgba(129,140,248,0.1)',
        tension: 0.3, pointRadius: 2, fill: true,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#9090a8', font: { size: 10 }, usePointStyle: true } } },
      scales: {
        x: { ticks: { color: '#55556a', font: { size: 9 }, maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { min: 0, max: 1, ticks: { color: '#55556a', font: { size: 9 }, callback: v => (v*100).toFixed(0)+'%' }, grid: { color: 'rgba(255,255,255,0.04)' } },
      },
    },
  });

  const catEl = document.getElementById('mqm-category-accuracy');
  const stats = window._mqmStats || [];
  if (stats.length === 0) {
    catEl.innerHTML = '<p style="color:var(--text3);font-size:12px;">No category data available.</p>';
    return;
  }
  const byCat = {};
  for (const s of stats) {
    if (!byCat[s.taskCategory]) byCat[s.taskCategory] = { total: 0, successes: 0, quality: 0 };
    byCat[s.taskCategory].total += s.totalCalls;
    byCat[s.taskCategory].successes += s.successfulCalls;
    byCat[s.taskCategory].quality += s.avgQuality;
  }
  catEl.innerHTML = \`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;">
    \${Object.entries(byCat).map(([cat, data]) => {
      const acc = data.total > 0 ? (data.successes / data.total * 100).toFixed(0) : '0';
      const barW = data.total > 0 ? Math.min(100, Math.round(data.successes / data.total * 100)) : 0;
      return \`<div style="padding:10px;background:var(--bg3);border-radius:6px;">
        <div style="font-size:12px;font-weight:600;color:var(--text);text-transform:capitalize;">\${cat}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">\${data.total} calls</div>
        <div style="height:6px;background:var(--border);border-radius:3px;margin-top:6px;">
          <div style="height:100%;width:\${barW}%;background:\${Number(acc) >= 80 ? '#4ade80' : Number(acc) >= 50 ? '#fbbf24' : '#f87171'};border-radius:3px;"></div>
        </div>
        <div style="font-size:10px;color:\${Number(acc) >= 80 ? '#4ade80' : Number(acc) >= 50 ? '#fbbf24' : '#f87171'};margin-top:3px;">\${acc}% success</div>
      </div>\`;
    }).join('')}
  </div>\`;
}

function switchMqmTab(name) {
  document.querySelectorAll('.mqm-tab').forEach(t => {
    t.classList.remove('active');
    t.style.borderBottomColor = 'transparent';
    t.style.color = 'var(--text2)';
  });
  const tabBtn = document.getElementById('mqmtab-' + name);
  if (tabBtn) { tabBtn.classList.add('active'); tabBtn.style.borderBottomColor = 'var(--accent)'; tabBtn.style.color = 'var(--accent)'; }
  ['overview','models','accuracy'].forEach(p => {
    const el = document.getElementById('mqm-pane-' + p);
    if (el) el.style.display = p === name ? 'flex' : 'none';
  });
  if (name === 'models') loadMqmModels();
  if (name === 'accuracy') loadMqmAccuracy();
}
// ── Soul / Profile UI ──────────────────────────────────────────────────────

var _soulActiveTab = 'profile';
var _soulRawMode = false;

async function loadSoulFile() {
  console.log('[loadSoulFile] Starting...');
  try {
    const userRes = await fetch(BASE + '/api/soul/user').then(r => r.json()).catch(e => {
      console.error('[loadSoulFile] Fetch error:', e);
      return { content: '' };
    });
    const userMd = userRes.content || '';
    console.log('[loadSoulFile] Loaded content length:', userMd.length);
    console.log('[loadSoulFile] Content preview:', userMd.substring(0, 100));
    const rawEl = document.getElementById('soul-raw-profile-text');
    if (rawEl) {
      rawEl.value = userMd;
      console.log('[loadSoulFile] Set raw textarea value');
    } else {
      console.error('[loadSoulFile] Could not find soul-raw-profile-text element');
    }
    _soulParseUserMd(userMd);
    console.log('[loadSoulFile] Completed parsing');
  } catch (e) {
    console.error('[loadSoulFile] Error:', e);
  }
}

async function loadMemoryMd() {
  const res = await fetch(BASE + '/api/soul/memory').then(r => r.json()).catch(() => ({ content: '' }));
  document.getElementById('soul-raw-memory-text').value = res.content || '';
}

async function saveMemoryMd() {
  const md = document.getElementById('soul-raw-memory-text').value;
  const statusEl = document.getElementById('mem-persist-status');
  statusEl.textContent = 'Saving…';
  await fetch(BASE + '/api/soul/memory', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: md }) });
  statusEl.textContent = '✓ Saved';
  setTimeout(() => { statusEl.textContent = ''; }, 2000);
}


/**
 * Parse USER.md markdown into form fields.
 * Expected format:
 *   # User Profile
 *   **Name:** (name)
 *   **Role:** (role)
 *   ## Goals & Objectives
 *   - (goals)
 *   ## Current Projects
 *   - (projects)
 *   ## Technical Environment
 *   - OS: (os)
 *   - Editor/IDE: (editor)
 *   - Languages: (langs)
 *   - Tools: (tools)
 *   ## Communication
 *   - Preferred style: (style)
 *   ## Working Context
 *   (context)
 */
function _soulParseUserMd(md) {
  console.log('[_soulParseUserMd] Parsing markdown, length:', md.length);
  const get = (heading) => {
    const re = new RegExp('##\\\\s+' + heading + '[\\\\s\\\\S]*?\\\\n([\\\\s\\\\S]*?)(?=\\\\n##\\\\s|$)', 'i');
    const m = md.match(re);
    const result = m ? m[1].replace(/^[-*]\\s*/gm, '').trim() : '';
    console.log('[_soulParseUserMd] get("' + heading + '"):', result.substring(0, 50));
    return result;
  };
  const line = (label) => {
    const re = new RegExp('\\\\*\\\\*' + label + ':\\\\*\\\\*\\\\s*(.+)', 'i');
    const m = md.match(re);
    if (!m) {
      console.log('[_soulParseUserMd] line("' + label + '"): (no match)');
      return '';
    }
    let result = m[1].trim();
    // Only remove parentheses if the entire value is wrapped (placeholder text)
    if (result.match(/^\\([^)]+\\)$/)) {
      result = '';
    }
    console.log('[_soulParseUserMd] line("' + label + '"):', result);
    return result;
  };
  
  const name = line('Name');
  const role = line('Role');
  const goals = get('Goals & Objectives') || get('Goals');
  const projects = get('Current Projects');
  const os = line('OS') || _soulGetBullet(md, 'OS');
  const editor = line('Editor/IDE') || _soulGetBullet(md, 'Editor');
  const langs = line('Languages') || _soulGetBullet(md, 'Languages');
  const tools = line('Tools') || _soulGetBullet(md, 'Tools');
  const style = line('Preferred style') || _soulGetBullet(md, 'style');
  const context = get('Working Context');
  
  console.log('[_soulParseUserMd] Extracted values:', { name, role, goals: goals.substring(0, 30), projects: projects.substring(0, 30) });
  
  document.getElementById('prof-name').value    = name;
  document.getElementById('prof-role').value    = role;
  document.getElementById('prof-goals').value   = goals;
  document.getElementById('prof-projects').value = projects;
  document.getElementById('prof-os').value      = os;
  document.getElementById('prof-editor').value  = editor;
  document.getElementById('prof-langs').value   = langs;
  document.getElementById('prof-tools').value   = tools;
  document.getElementById('prof-style').value   = style;
  document.getElementById('prof-context').value = context;
  
  console.log('[_soulParseUserMd] Form fields populated');
}

function _soulGetBullet(md, key) {
  const re = new RegExp('-\\\\s+' + key + ':\\\\s*(.+)', 'i');
  const m = md.match(re);
  return m ? m[1].trim() : '';
}

/**
 * Build USER.md markdown from form fields.
 * Generates the exact format expected by _soulParseUserMd.
 */
function _soulBuildUserMd() {
  const v = (id) => document.getElementById(id).value.trim();
  const lines = (text) => text.split('\\\\n').filter(l => l.trim()).map(l => '- ' + l.trim()).join('\\\\n') || '- (not set)';
  return '# User Profile\\\\n\\\\n' +
    '**Name:** ' + (v('prof-name') || '(your name)') + '\\\\n' +
    '**Role:** ' + (v('prof-role') || '(your role or profession)') + '\\\\n\\\\n' +
    '## Goals & Objectives\\\\n' + (lines(v('prof-goals')) || '- (what are you working toward?)') + '\\\\n\\\\n' +
    '## Current Projects\\\\n' + (lines(v('prof-projects')) || '- (active projects you want help with)') + '\\\\n\\\\n' +
    '## Technical Environment\\\\n' +
    '- OS: ' + (v('prof-os') || '(your operating system)') + '\\\\n' +
    '- Editor/IDE: ' + (v('prof-editor') || '(your editor)') + '\\\\n' +
    '- Languages: ' + (v('prof-langs') || '(programming languages you use)') + '\\\\n' +
    '- Tools: ' + (v('prof-tools') || '(other tools in your stack)') + '\\\\n\\\\n' +
    '## Communication\\\\n' +
    '- Preferred style: ' + (v('prof-style') || 'direct and concise') + '\\\\n\\\\n' +
    '## Working Context\\\\n' + (v('prof-context') || '(describe your project, environment, or ongoing work here)') + '\\\\n';
}


function soulToggleRaw() {
  _soulRawMode = !_soulRawMode;
  const btn = document.getElementById('soul-raw-toggle');
  btn.textContent = _soulRawMode ? '🗂 Form' : '⌨ Raw';
  const rawDiv = document.getElementById('soul-raw-profile');
  const formDiv = document.getElementById('soul-profile-form');
  if (_soulRawMode) {
    // Show raw view - don't overwrite the loaded content
    // The raw textarea is already populated by loadSoulFile()
    rawDiv.style.display  = 'block';
    // hide all form fields except the raw div
    Array.from(formDiv.children).forEach(el => { if (el.id !== 'soul-raw-profile') el.style.display = 'none'; });
  } else {
    // sync raw → form (re-parse to capture any manual edits)
    _soulParseUserMd(document.getElementById('soul-raw-profile-text').value);
    rawDiv.style.display = 'none';
    Array.from(formDiv.children).forEach(el => el.style.display = '');
  }
}

async function soulSaveActive() {
  const btn = document.getElementById('soul-save-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const md = _soulRawMode
      ? document.getElementById('soul-raw-profile-text').value
      : _soulBuildUserMd();
    await fetch(BASE + '/api/soul/user', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: md }) });
    btn.textContent = '✓ Saved';
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Save'; }, 1800);
  } catch(e) {
    btn.textContent = 'Error'; btn.disabled = false;
    console.error(e);
  }
}

function soulPickStyle(el) {
  document.querySelectorAll('.prof-style-btn').forEach(b => { b.style.background = 'var(--bg3)'; b.style.color = 'var(--text2)'; b.style.borderColor = 'var(--border)'; });
  el.style.background = 'var(--accent)'; el.style.color = '#fff'; el.style.borderColor = 'var(--accent)';
  document.getElementById('prof-style').value = el.dataset.val;
}

async function agSoulTemplate(el) {
  const tmpl = el.dataset.val;
  try {
    const templates = await fetch(BASE + '/api/soul/templates').then(r => r.json()).catch(() => []);
    const found = templates.find(t => t.id === tmpl);
    if (found) {
      document.getElementById('ag-soul').value = found.content;
      document.querySelectorAll('.ag-tmpl-btn').forEach(b => { b.style.background = 'var(--bg3)'; b.style.color = 'var(--text2)'; });
      el.style.background = 'var(--accent)'; el.style.color = '#fff';
    }
  } catch(e) { console.error('agSoulTemplate', e); }
}

async function appendMemoryNote() {
  const inp = document.getElementById('memory-note');
  const note = inp.value.trim();
  if (!note) return;
  await fetch(BASE + '/api/soul/memory/append', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) });
  inp.value = '';
  // Reload memory textarea
  const res = await fetch(BASE + '/api/soul/memory').then(r => r.json()).catch(() => ({ content: '' }));
  document.getElementById('soul-raw-memory-text').value = res.content || '';
}

function soulAskLlm(type) {
  const prompts = {
    profile: "Please fill out my user profile based on what you know about me from our conversations. Update each section of USER.md with what you've learned.",
  };
  const msg = prompts[type] || '';
  showPage('chat');
  setTimeout(() => {
    const inp = document.getElementById('chat-input');
    if (inp) { inp.value = msg; inp.focus(); }
  }, 300);
}

// ── End Soul / Profile UI ───────────────────────────────────────────────────

// ── End Model Quartermaster UI ──────────────────────────────────────────────

// Handle browser back/forward
window.addEventListener('hashchange', () => {
  const page = location.hash.replace('#', '');
  if (page && PAGES.includes(page)) showPage(page);
});

// Restore page from hash, then localStorage, then default
(function restorePage() {
  const hash = location.hash.replace('#', '');
  if (hash && PAGES.includes(hash)) { showPage(hash); }
  else {
    const saved = (() => { try { return localStorage.getItem('cortex_page') || 'dashboard'; } catch { return 'dashboard'; } })();
    showPage(saved);
  }
  renderRecentPages();
})();
</script>

</body>
</html>`;
