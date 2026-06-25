'use strict';
/* Skills Manager — Blue Crisp SaaS 대시보드.
   데이터는 전부 서버(/api/scan · /api/workflows · /api/manage)에서. 읽기 전용 — 아무것도 안 바꿈. */

const app = document.getElementById('app');

/* ---------- 데이터 ---------- */
const cache = {};
async function getJSON(path){
  if (cache[path]) return cache[path];
  const r = await fetch(path);
  if (!r.ok) throw new Error('불러오지 못했어요 (' + path + ').');
  const j = await r.json();
  if (j && j.error) throw new Error(j.error);
  cache[path] = j; return j;
}
const getScan = () => getJSON('/api/scan');
const getWorkflows = () => getJSON('/api/workflows');
const getManage = () => getJSON('/api/manage');

/* ---------- 출처 = 색 ---------- */
const SRC_VAR = {
  'gstack':'var(--src-gstack)', '.agents':'var(--src-agents)', 'agent-skills':'var(--src-agentskills)',
  'superpowers':'var(--src-superpowers)', 'codex':'var(--src-codex)', 'user':'var(--src-user)', 'harness':'var(--src-harness)',
};
const srcVar = (s) => SRC_VAR[s] || 'var(--src-codex)';
const srcOf = (id) => String(id).split(':')[0];

/* ---------- helpers ---------- */
function el(html){ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstElementChild; }
function esc(s){ return String(s).replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
const srcChip = (s) => `<span class="srcchip"><i style="background:${srcVar(s)}"></i>${esc(s)}</span>`;
const setBusy = () => { app.innerHTML='<p class="loading">불러오는 중…</p>'; };
const showErr = (e) => { app.innerHTML=`<p class="err">${esc(e.message||e)}</p>`; };

function bySource(scan){ const m={}; for(const s of (scan.skills||[])) m[s.source]=(m[s.source]||0)+1; return Object.entries(m).sort((a,b)=>b[1]-a[1]); }
function coverage(scan){ const cov={}; for(const g of (scan.groups||[])){ if(g.duplicateLevel!=='high') continue; for(const s of (g.sources||[])) cov[s]=(cov[s]||0)+1; } return cov; }
function recommend(group,cov){
  const skills=group.skills||[]; if(!skills.length) return null;
  if(group.duplicateLevel!=='high'||skills.length===1) return {pick:skills[0],why:'이 작업은 겹침 없이 한 곳뿐이라, 그대로 쓰면 돼요.'};
  const mine=skills.find((id)=>srcOf(id)==='user'); if(mine) return {pick:mine,why:'직접 만드신 스킬(user)이라 먼저 추천해요.'};
  const sorted=skills.slice().sort((a,b)=>(cov[srcOf(b)]||0)-(cov[srcOf(a)]||0)); const pick=sorted[0];
  return {pick,why:`'${srcOf(pick)}'는 다른 작업도 가장 많이 커버하는 출처라, 도구를 하나로 모으기 좋아요.`};
}
function statusOf(g){ if(g.duplicateLevel!=='high') return {c:'low',t:'낮음'}; const n=(g.skills||[]).length; return n>=4?{c:'hi',t:'높음'}:{c:'mid',t:'보통'}; }

/* ---------- 아이콘 ---------- */
const IC = {
  cube:'<svg viewBox="0 0 24 24" fill="none"><path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 7l8 4 8-4M12 11v10" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  overlap:'<svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="12" r="6" stroke="currentColor" stroke-width="1.7"/><circle cx="15" cy="12" r="6" stroke="currentColor" stroke-width="1.7"/></svg>',
  layers:'<svg viewBox="0 0 24 24" fill="none"><path d="m12 4 8 4-8 4-8-4 8-4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m4 12 8 4 8-4M4 16l8 4 8-4" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  puzzle:'<svg viewBox="0 0 24 24" fill="none"><path d="M10 4a2 2 0 0 1 4 0v1h3a1 1 0 0 1 1 1v3h1a2 2 0 0 1 0 4h-1v3a1 1 0 0 1-1 1h-3v-1a2 2 0 0 0-4 0v1H6a1 1 0 0 1-1-1v-3H4a2 2 0 0 1 0-4h1V6a1 1 0 0 1 1-1h4V4Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  flow:'<svg viewBox="0 0 24 24" fill="none"><circle cx="6" cy="6" r="2.2" stroke="currentColor" stroke-width="1.7"/><circle cx="18" cy="12" r="2.2" stroke="currentColor" stroke-width="1.7"/><circle cx="6" cy="18" r="2.2" stroke="currentColor" stroke-width="1.7"/><path d="M8.2 6H14a3 3 0 0 1 3 3v.6M8.2 18H14a3 3 0 0 0 3-3v-.6" stroke="currentColor" stroke-width="1.6"/></svg>',
  shield:'<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6l7-3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrow:'<svg viewBox="0 0 16 16" fill="none"><path d="M3 8h9M8 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warn:'<svg viewBox="0 0 24 24" fill="none"><path d="M12 8v5m0 3h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/* ---------- 도넛(SVG, 의존성 0) ---------- */
function donut(dist,total){
  const R=46, C=2*Math.PI*R; let acc=0;
  const segs=dist.map(([s,n])=>{
    const frac=total?n/total:0, len=frac*C, off=-acc*C; acc+=frac;
    return `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${srcVar(s)}" stroke-width="18" stroke-dasharray="${len.toFixed(2)} ${(C-len).toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"></circle>`;
  }).join('');
  const legend=dist.map(([s,n])=>`<div class="dl-row"><span class="sw" style="background:${srcVar(s)}"></span><span class="nm">${esc(s)}</span><span class="ct">${n}</span><span class="pc">${total?Math.round(n/total*100):0}%</span></div>`).join('');
  return `<div class="donut-wrap">
    <div class="donut"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${R}" fill="none" stroke="var(--line)" stroke-width="18"></circle>${segs}</svg>
      <div class="ctr"><span class="n num">${total}</span><span class="l">총 스킬</span></div></div>
    <div class="donut-legend">${legend}</div></div>`;
}

/* ============================================================ 대시보드 ============================================================ */
async function renderDashboard(){
  setBusy();
  let scan, wf;
  try{ [scan,wf]=await Promise.all([getScan(), getWorkflows().catch(()=>({workflows:[]}))]); }
  catch(e){ return showErr(e); }

  const total=(scan.counts&&scan.counts.total)||(scan.skills||[]).length;
  const groups=scan.groups||[]; const high=groups.filter((g)=>g.duplicateLevel==='high');
  const dist=bySource(scan); const sources=dist.length;
  const plugins=(scan.plugins||[]).length; const cov=coverage(scan);
  const wfList=wf.workflows||[];

  const stats=[
    {tile:'t-blue',ic:IC.cube,label:'총 스킬',n:total,sub:`${sources}개 출처에서 모음`},
    {tile:'t-violet',ic:IC.overlap,label:'겹치는 일',n:high.length,u:'묶음',sub:'주의가 필요한 중복'},
    {tile:'t-green',ic:IC.layers,label:'출처',n:sources,sub:'스킬을 가져온 곳'},
    {tile:'t-amber',ic:IC.puzzle,label:'플러그인',n:plugins,sub:'설치된 플러그인 수'},
  ].map((s)=>`<div class="stat-card"><span class="tile ${s.tile}">${s.ic}</span>
    <span class="s-label">${s.label}</span>
    <span class="s-num num">${s.n}${s.u?`<span class="u">${s.u}</span>`:'개'}</span>
    <span class="s-sub">${esc(s.sub)}</span></div>`).join('');

  // 중복 요약 (상위 6)
  const ranked=groups.slice().sort((a,b)=>b.skills.length-a.skills.length);
  const maxN=Math.max(1,...ranked.map((g)=>g.skills.length));
  const ovRows=ranked.slice(0,6).map((g,i)=>{ const n=g.skills.length, st=statusOf(g);
    return `<div class="ov-row"><span class="rk">${String(i+1).padStart(2,'0')}</span>
      <span class="nm">${esc(g.label||g.capability)}</span>
      <span class="bar"><i style="width:${Math.round(n/maxN*100)}%"></i></span>
      <span class="ct">${n}</span><span class="badge ${st.c}">${st.t}</span></div>`;}).join('');

  // 추천 흐름 (대표 워크플로우)
  const flowWf=wfList.find((w)=>w.name==='release-check')||wfList.find((w)=>(w.steps||[]).length>=3)||wfList[0];
  const pickForStep=(r)=>{ if(!r) return null; if(r.kind==='none') return {id:'기본 Claude로',src:null};
    if(r.kind==='pinned') return {id:(r.skills||[])[0]||'',src:srcOf((r.skills||[])[0]||'')};
    const sk=(r.skills||[]); if(!sk.length) return null;
    if(sk.length===1) return {id:sk[0],src:srcOf(sk[0])};
    const sorted=sk.slice().sort((a,b)=>(cov[srcOf(b)]||0)-(cov[srcOf(a)]||0)); return {id:sorted[0],src:srcOf(sorted[0])}; };
  const flowHTML=flowWf?(flowWf.steps||[]).slice(0,4).map((s,i)=>{ const p=pickForStep(s.resolved); const lbl=(s.resolved&&s.resolved.label)||s.capability;
    return `<div class="fstep"><span class="fn">${i+1}</span><span class="ft"><span class="a">${esc(lbl)}</span><span class="b">${esc(s.note||'')}</span></span>
      <span class="pick">${p&&p.src?`<i style="background:${srcVar(p.src)}"></i>`:''}${p?esc(p.id):''}</span></div>`;}).join(''):'<p class="b">흐름이 없어요.</p>';

  // 워크플로우 카드 (상위 4)
  const wfCards=wfList.slice(0,4).map((w)=>{ const mine=w.source==='user'; const steps=w.steps||[];
    const srcs=[...new Set(steps.flatMap((s)=>(s.resolved&&s.resolved.sources)||[]))].slice(0,5);
    const dots=srcs.map((s)=>`<i style="background:${srcVar(s)}"></i>`).join('');
    return `<a class="wf-card" href="#/workflows"><div class="wf-top"><span class="wf-ico">${IC.flow}</span><span class="wl">${esc(w.label||w.name)}</span></div>
      <span class="wtag${mine?' mine':''}">${mine?'내 것':'내장'}</span>
      <div class="wmeta"><span>${steps.length}단계</span><span class="dots">${dots}</span></div></a>`;}).join('');

  app.innerHTML='';
  app.append(el(`<section>
    <div class="page-head">
      <div><h1>스킬 현황 <em>한눈에</em></h1>
        <p class="ph-sub">지금 이 PC의 스킬 ${total}개 · 겹침 ${high.length}묶음 · 출처 ${sources}곳을 살펴봤어요.</p></div>
      <a class="btn primary" href="#/recommend">추천 받기 ${IC.arrow}</a>
    </div>

    <div class="stat-grid">${stats}</div>

    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:16px;margin-bottom:18px" class="grid-2">
      <div class="panel">
        <div class="panel-head"><h2>중복 분석 요약</h2><span class="ph-note">우선 검토가 필요한 묶음</span><a class="ph-link" href="#/overlap">전체 보기 ${IC.arrow}</a></div>
        <div class="panel-body">${ovRows}</div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>출처별 분포</h2><a class="ph-link" href="#/settings">자세히 ${IC.arrow}</a></div>
        <div class="panel-body">${donut(dist,total)}</div>
      </div>
    </div>

    <div class="panel" style="margin-bottom:18px">
      <div class="panel-head"><h2>추천 흐름</h2><span class="ph-note">${flowWf?esc('샘플: '+(flowWf.label||flowWf.name)):''}</span><a class="ph-link" href="#/recommend">모든 추천 ${IC.arrow}</a></div>
      <div class="panel-body"><div class="flow">${flowHTML}</div></div>
    </div>

    <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:16px" class="grid-2">
      <div class="panel">
        <div class="panel-head"><h2>저장된 워크플로우</h2><a class="ph-link" href="#/workflows">모두 보기 ${IC.arrow}</a></div>
        <div class="panel-body"><div class="wf-grid">${wfCards}</div></div>
      </div>
      <div class="safe-panel">
        <span class="shield">${IC.shield}</span>
        <div class="st"><h3>안전한 정리</h3><p>검사는 읽기 전용이라 시스템을 바꾸지 않아요. 제거는 확인 후 휴지통으로 이동되며, 언제든 복원할 수 있어요.</p>
          <div class="chips"><span>읽기 전용 스캔</span><span>확인 후 휴지통</span><span>복원 가능</span></div></div>
        <a class="btn" href="#/manage" style="align-self:flex-start">스킬 정리로 ${IC.arrow}</a>
      </div>
    </div>
  </section>`));
}

/* ============================================================ 중복 분석(전체) ============================================================ */
async function renderOverlap(){
  setBusy(); let scan; try{ scan=await getScan(); }catch(e){ return showErr(e); }
  const groups=(scan.groups||[]).slice().sort((a,b)=>b.skills.length-a.skills.length);
  const max=Math.max(1,...groups.map((g)=>g.skills.length));

  const head=el(`<section>
    <a class="back" href="#/">← 대시보드</a>
    <div class="page-head"><div><h1>중복 분석</h1><p class="ph-sub">같은 일을 하는 스킬이 몇 곳에 있는지, 곳수 많은 순으로. 칸 색은 그 스킬의 출처예요.</p></div></div>
    <div class="legend" role="note"><span class="item"><span class="scale">칸 하나 = 한 곳 ·</span></span>
      <span class="item"><span class="sw" style="background:var(--src-gstack)"></span><span class="sw" style="background:var(--src-agentskills)"></span><span class="sw" style="background:var(--src-superpowers)"></span> <b>색 = 출처</b></span>
      <span class="item"><span class="swatch-none"></span>겹침 없음</span><span class="spacer"></span><span class="scale">줄 눌러서 실제 이름 보기</span></div>
    <div class="chart" id="chart"></div>
    <div class="note-box"><span class="ic">${IC.warn}</span><span>겹친다고 꼭 지울 필요는 없어요. 어디에 무엇이 있는지 <b>먼저 보고</b>, 어떤 하나를 쓸지 고민되면 <a href="#/recommend" style="color:var(--accent-deep);font-weight:700">추천</a>으로.</span></div>
  </section>`);
  app.innerHTML=''; app.append(head);
  const chart=head.querySelector('#chart');
  if(!groups.length){ chart.append(el('<p class="loading">겹치는 스킬이 없어요. 깔끔합니다.</p>')); return; }
  chart.append(el('<div class="chart-grid-head"><span>겹치는 일</span><span>겹친 곳 →</span><span class="r">곳수</span></div>'));
  const cellW=`calc((100% - ${(max-1)*4}px) / ${max})`;
  groups.forEach((g)=>{ const n=g.skills.length, none=g.duplicateLevel!=='high';
    const segs=g.skills.map((id)=>`<span class="seg${none?' none-seg':''}" style="width:${cellW};background:${srcVar(srcOf(id))}"></span>`).join('');
    const chips=(g.sources||[]).map(srcChip).join('');
    const detail=g.skills.map((id)=>`<div class="skill-line"><i style="background:${srcVar(srcOf(id))}"></i><span class="id">${esc(id)}</span><span class="role">${esc(srcOf(id))}</span></div>`).join('');
    const row=el(`<div class="bar-row${none?' none':''}" role="button" tabindex="0" aria-expanded="false" aria-label="${esc(g.label||g.capability)}, ${n}곳">
      <div class="bar-label"><span class="lab">${esc(g.label||g.capability)}</span><span class="srcs">${chips}</span></div>
      <div class="bar-track">${segs}</div>
      <div class="bar-count ${none?'':'hi'}"><span class="n">${n}</span><span class="u">곳</span></div>
      <span class="expand-hint">자세히 ▾</span>
      <div class="bar-detail"><div class="detail-inner"><div class="dh">이 묶음에 든 스킬 — 실제 이름 · 출처</div>${detail}</div></div></div>`);
    const toggle=()=>{ const o=row.classList.toggle('open'); row.setAttribute('aria-expanded',o?'true':'false'); };
    row.addEventListener('click',toggle);
    row.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggle(); } });
    chart.append(row);
  });
}

/* ============================================================ 추천 ============================================================ */
async function renderRecommend(capKey){
  setBusy(); let scan; try{ scan=await getScan(); }catch(e){ return showErr(e); }
  const groups=scan.groups||[]; const cov=coverage(scan);

  if(capKey){
    const g=groups.find((x)=>x.capability===capKey); if(!g){ location.hash='#/recommend'; return; }
    const rec=recommend(g,cov); const alts=(g.skills||[]).filter((id)=>id!==rec.pick);
    const altHTML=alts.length?alts.map((id)=>`<div class="alt-row"><i style="background:${srcVar(srcOf(id))}"></i><span class="id">${esc(id)}</span><span class="src">${esc(srcOf(id))}</span></div>`).join('')
      :'<div class="alt-row"><span class="src">다른 후보 없음 — 이 하나뿐이에요.</span></div>';
    app.innerHTML='';
    app.append(el(`<section>
      <a class="back" href="#/recommend">← 작업 고르기</a>
      <div class="reco-head"><h2>${esc(g.label||g.capability)}</h2><span class="cnt">${(g.skills||[]).length}곳에서 이 일을 할 수 있어요</span></div>
      <div class="reco-pick"><span class="tag">추천 · 이거 하나면 충분</span>
        <div class="pid"><i style="background:${srcVar(srcOf(rec.pick))}"></i>${esc(rec.pick)}</div>
        <p class="why">${esc(rec.why)}</p></div>
      <p class="alt-head">나머지는 이 흐름선 불필요 — 같은 일을 하는 다른 후보</p>
      <div class="alt-list">${altHTML}</div>
      <div class="note-box" style="margin-top:20px"><span class="ic">${IC.warn}</span><span>추천은 <b>측정 가능한 기준</b>(직접 만든 스킬 우선 → 가장 많은 작업을 함께 커버하는 출처)으로 골랐어요. 취향대로 다른 후보를 골라도 됩니다.</span></div>
    </section>`));
    return;
  }

  app.innerHTML='';
  const sec=el(`<section>
    <a class="back" href="#/">← 대시보드</a>
    <div class="page-head"><div><h1>이 작업 뭐 쓰지</h1><p class="ph-sub">하려는 일을 고르면, 같은 일을 하는 스킬 중 하나면 충분한 추천과 나머지 후보를 보여드려요.</p></div></div>
    <div class="filter"><svg viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5"/><path d="m11 11 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      <input id="capq" type="text" placeholder="예: 테스트, 리뷰, 디버깅 …" autocomplete="off" /><button class="clear" id="capclear" type="button">전체</button></div>
    <div class="cap-grid" id="capgrid"></div></section>`);
  app.append(sec);
  const grid=sec.querySelector('#capgrid'), input=sec.querySelector('#capq');
  const draw=(q)=>{ const ql=(q||'').trim().toLowerCase();
    const list=groups.filter((g)=>!ql||(g.label||'').toLowerCase().includes(ql)||(g.capability||'').toLowerCase().includes(ql));
    grid.innerHTML='';
    if(!list.length){ grid.append(el('<p class="loading">그런 작업은 못 찾았어요.</p>')); return; }
    for(const g of list){ const n=(g.skills||[]).length, solo=g.duplicateLevel!=='high';
      grid.append(el(`<a class="cap-card${solo?' solo':''}" href="#/recommend/${encodeURIComponent(g.capability)}">
        <span class="cl">${esc(g.label||g.capability)}</span><span class="cn">${solo?'겹침 없음 · 1곳':n+'곳에서 겹침'}</span>
        <span class="csrcs">${(g.sources||[]).map(srcChip).join('')}</span></a>`)); } };
  draw(''); input.addEventListener('input',()=>draw(input.value));
  sec.querySelector('#capclear').addEventListener('click',()=>{ input.value=''; draw(''); input.focus(); });
}

/* ============================================================ 워크플로우 ============================================================ */
function stepPill(r){
  if(!r) return '<span class="step-pill none">정보 없음</span>';
  if(r.kind==='pinned') return `<span class="step-pill pinned">고정 <span class="id">${esc((r.skills||[])[0]||'')}</span></span>`;
  if(r.kind==='none') return '<span class="step-pill none">기본 Claude로 (전담 스킬 없음)</span>';
  if(r.count===1) return `<span class="step-pill"><i style="background:${srcVar((r.sources||[])[0])}"></i>1곳 — <span class="id">${esc((r.sources||[])[0]||'')}</span></span>`;
  const dots=(r.sources||[]).map((s)=>`<i style="background:${srcVar(s)}" title="${esc(s)}"></i>`).join('');
  return `<span class="step-pill multi">${dots} ${r.count}곳 겹침 — 추천에서 하나로</span>`;
}
async function renderWorkflows(){
  setBusy(); let wf; try{ wf=await getWorkflows(); }catch(e){ return showErr(e); }
  const list=wf.workflows||[];
  app.innerHTML='';
  const sec=el(`<section>
    <a class="back" href="#/">← 대시보드</a>
    <div class="page-head"><div><h1>내 워크플로우</h1><p class="ph-sub">단계마다 어떤 스킬을 쓸지 미리 정해둔 순서예요. 겹치는 단계는 <a href="#/recommend" style="color:var(--accent-deep);font-weight:700">추천</a>에서 하나로 추립니다.</p></div></div>
    <div class="wf-list" id="wflist"></div>
    <div class="guide-box"><h3>내 흐름 새로 만들기 · 고치기</h3>
      <p>저장·수정·삭제는 읽기 전용 화면 대신 명령으로 안전하게 해요. 터미널이나 Claude에게:</p>
      <div class="cmd"><code>node scan.js --save &lt;이름&gt;</code><button class="copy" type="button" data-copy="node scan.js --save <이름>">복사</button></div>
      <div class="cmd"><code>node scan.js --set-skill &lt;이름&gt; --step &lt;번호&gt; --skill &lt;스킬id&gt;</code><button class="copy" type="button" data-copy="node scan.js --set-skill <이름> --step <번호> --skill <스킬id>">복사</button></div></div>
  </section>`);
  app.append(sec); const wrap=sec.querySelector('#wflist');
  if(!list.length){ wrap.append(el('<p class="loading">아직 흐름이 없어요.</p>')); return; }
  for(const w of list){ const mine=w.source==='user';
    const steps=(w.steps||[]).map((s,i)=>{ const r=s.resolved||{}; const label=r.label||s.capability||'';
      return `<div class="step-row"><span class="sn">${i+1}</span><span class="slabel">${esc(label)}${s.note?`<small>${esc(s.note)}</small>`:''}</span>${stepPill(r)}</div>`;}).join('');
    wrap.append(el(`<div class="wf-full"><div class="wfh"><span class="wfi">${IC.flow}</span><span class="wl">${esc(w.label||w.name)}</span><span class="wn">${esc(w.name)}</span><span class="wtag${mine?' mine':''}">${mine?'내 것':'내장'}</span></div>${steps}</div>`));
  }
}

/* ============================================================ 스킬 정리 ============================================================ */
async function renderManage(){
  setBusy(); let m; try{ m=await getManage(); }catch(e){ return showErr(e); }
  const s=m.summary||{}, standalone=m.standalone||[], plugins=m.plugins||[];
  const skillRows=standalone.length?standalone.map((sk)=>`<div class="skill-row"><span class="sname">${esc(sk.name)}</span><span class="remote">${esc(sk.remote||'')}</span><span class="badge ${sk.kind==='git'?'git':'copy'}">${sk.kind==='git'?'업데이트 가능 · git':'업데이트 경로 없음 · 복사본'}</span></div>`).join('')
    :'<div class="skill-row"><span class="remote">단독 설치된 스킬이 없어요.</span></div>';
  const pluginRows=plugins.length?plugins.map((p)=>`<div class="plugin-row"><span class="pname">${esc(p.name)}</span><span></span><span class="badge ${p.enabled?'on':'off'}">${p.enabled?'켜짐':'꺼짐'}</span></div>`).join('')
    :'<div class="plugin-row"><span class="remote">플러그인이 없어요.</span></div>';
  app.innerHTML='';
  app.append(el(`<section>
    <a class="back" href="#/">← 대시보드</a>
    <div class="page-head"><div><h1>스킬 정리</h1><p class="ph-sub">단독 설치된 스킬이 git으로 받은 거라 업데이트할 수 있는지부터 봐요. 제거는 미리보기 → 확인을 거쳐 <b>되돌릴 수 있는 보관함</b>으로만 옮깁니다.</p></div></div>
    <div class="manage-summary">
      <div class="mstat"><span class="big num">${s.standaloneTotal!=null?s.standaloneTotal:standalone.length}</span><span class="cap">단독 설치 스킬</span></div>
      <div class="mstat ok"><span class="big num">${s.gitUpdatable!=null?s.gitUpdatable:''}</span><span class="cap">업데이트 가능 (git)</span></div>
      <div class="mstat"><span class="big num">${s.noUpdatePath!=null?s.noUpdatePath:''}</span><span class="cap">업데이트 경로 없음</span></div></div>
    <div class="panel" style="margin-bottom:18px"><div class="panel-head"><h2>단독 설치 스킬 — 업데이트 상태</h2></div><div style="padding:0 18px 8px">${skillRows}</div></div>
    <div class="panel" style="margin-bottom:0"><div class="panel-head"><h2>플러그인</h2><span class="ph-note">${s.pluginNote?esc(s.pluginNote):''}</span></div><div style="padding:0 18px 8px">${pluginRows}</div></div>
    <div class="guide-box"><h3>안 쓰는 스킬 정리하기 (안전 · 되돌리기 가능)</h3>
      <p>이 화면은 <b>읽기 전용</b>이라 여기서 지우지 않아요. 아래 명령을 붙이면 먼저 <b>무엇이 옮겨질지 미리보기</b>와 확인 토큰을 보여주고, 직접 확인해야만 휴지통으로 옮깁니다. 영구 삭제가 아니에요.</p>
      <div class="cmd"><code>node manage-scan.js --remove &lt;스킬이름&gt;</code><button class="copy" type="button" data-copy="node manage-scan.js --remove <스킬이름>">복사</button></div>
      <div class="cmd"><code>node manage-scan.js --remove &lt;스킬이름&gt; --confirm &lt;토큰&gt;</code><button class="copy" type="button" data-copy="node manage-scan.js --remove <스킬이름> --confirm <토큰>">복사</button></div>
      <p style="margin-top:8px">플러그인 안의 스킬은 개별 삭제가 안 돼요 — <b>/plugin uninstall</b> 로 통째 제거합니다.</p></div>
  </section>`));
}

/* ============================================================ 설정 ============================================================ */
async function renderSettings(){
  setBusy(); let scan; try{ scan=await getScan(); }catch(e){ return showErr(e); }
  const env=scan.environment||{}; const c=scan.counts||{}; const dist=bySource(scan);
  const rows=[
    ['버전', scan.version||'—'],
    ['스킬 폴더 경로', env.skillsPath||'—'],
    ['Claude 감지', env.hasClaude?'예':'아니오'],
    ['총 스킬 수', String(c.total!=null?c.total:'—')],
    ['출처 수', String(dist.length)],
    ['중복 묶어 정리한 건수', String(env.mirrorsFolded!=null?env.mirrorsFolded:'—')],
    ['동작 원칙', '읽기 전용 — 검사만, 아무것도 바꾸지 않음'],
  ].map(([k,v])=>`<div class="kv-row"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('');
  app.innerHTML='';
  app.append(el(`<section>
    <a class="back" href="#/">← 대시보드</a>
    <div class="page-head"><div><h1>설정 · 환경</h1><p class="ph-sub">이 검사기가 무엇을, 어디서 읽는지 정보예요. 설정 변경은 없습니다(읽기 전용).</p></div></div>
    <div class="kv">${rows}</div></section>`));
}

/* ============================================================ 검색 ============================================================ */
async function renderSearch(q){
  setBusy(); let scan, wf;
  try{ [scan,wf]=await Promise.all([getScan(), getWorkflows().catch(()=>({workflows:[]}))]); }catch(e){ return showErr(e); }
  const ql=(q||'').trim().toLowerCase();
  const skills=(scan.skills||[]).filter((s)=>!ql||(s.id||'').toLowerCase().includes(ql)||(s.description||'').toLowerCase().includes(ql)||(s.source||'').toLowerCase().includes(ql)).slice(0,40);
  const caps=(scan.groups||[]).filter((g)=>!ql||(g.label||'').toLowerCase().includes(ql)||(g.capability||'').toLowerCase().includes(ql));
  const flows=(wf.workflows||[]).filter((w)=>!ql||(w.label||'').toLowerCase().includes(ql)||(w.name||'').toLowerCase().includes(ql));
  const sec=(title,html)=> html?`<div class="search-sec"><p class="sh">${title}</p><div class="res-list">${html}</div></div>`:'';
  const capHTML=caps.map((g)=>`<a class="res-row" href="#/recommend/${encodeURIComponent(g.capability)}"><i style="background:${srcVar((g.sources||[])[0])}"></i><span class="rid">${esc(g.label||g.capability)}</span><span class="rtag">작업 ${ (g.skills||[]).length }곳</span></a>`).join('');
  const flowHTML=flows.map((w)=>`<a class="res-row" href="#/workflows"><i style="background:var(--accent)"></i><span class="rid">${esc(w.label||w.name)}</span><span class="rtag">${(w.steps||[]).length}단계</span></a>`).join('');
  const skillHTML=skills.map((s)=>`<div class="res-row"><i style="background:${srcVar(s.source)}"></i><span class="rid">${esc(s.id)}</span><span class="rdesc">${esc(s.description||'')}</span></div>`).join('');
  const empty=(!caps.length&&!flows.length&&!skills.length);
  app.innerHTML='';
  app.append(el(`<section>
    <a class="back" href="#/">← 대시보드</a>
    <div class="page-head"><div><h1>검색 결과</h1><p class="ph-sub">"${esc(q)}" — 작업 ${caps.length} · 흐름 ${flows.length} · 스킬 ${skills.length}</p></div></div>
    ${empty?'<p class="loading">맞는 결과가 없어요. 다른 말로 검색해 보세요.</p>':''}
    ${sec('작업 종류',capHTML)}${sec('워크플로우',flowHTML)}${sec('스킬',skillHTML)}
  </section>`));
}

/* ---------- 복사 버튼 ---------- */
document.addEventListener('click',(e)=>{ const b=e.target.closest('.copy'); if(!b) return;
  const text=b.getAttribute('data-copy')||''; const done=()=>{ const o=b.textContent; b.textContent='복사됨 ✓'; setTimeout(()=>(b.textContent=o),1200); };
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(done); else done(); });

/* ---------- 상단 검색 ---------- */
const searchForm=document.getElementById('searchForm'), qInput=document.getElementById('q');
if(searchForm){ searchForm.addEventListener('submit',(e)=>{ e.preventDefault(); const q=(qInput.value||'').trim(); if(q) location.hash='#/search/'+encodeURIComponent(q); }); }
document.addEventListener('keydown',(e)=>{ if((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')){ e.preventDefault(); if(qInput) qInput.focus(); } });

/* ---------- 라우터 ---------- */
function setNav(view){ document.querySelectorAll('#nav a').forEach((a)=>a.setAttribute('aria-current', a.dataset.view===view?'true':'false')); }
function route(){
  const h=(location.hash||'#/').replace(/^#/,''); const parts=h.split('/').filter(Boolean); const top=parts[0]||'';
  if(top==='overlap'){ setNav('overlap'); return renderOverlap(); }
  if(top==='recommend'){ setNav('recommend'); return renderRecommend(parts[1]?decodeURIComponent(parts[1]):null); }
  if(top==='workflows'){ setNav('workflows'); return renderWorkflows(); }
  if(top==='manage'){ setNav('manage'); return renderManage(); }
  if(top==='settings'){ setNav('settings'); return renderSettings(); }
  if(top==='search'){ setNav(''); if(qInput&&parts[1]) qInput.value=decodeURIComponent(parts[1]); return renderSearch(parts[1]?decodeURIComponent(parts[1]):''); }
  setNav('dashboard'); return renderDashboard();
}
window.addEventListener('hashchange',route);
route();
