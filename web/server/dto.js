// dto.js — 원시 CLI(--json) 결과를 프론트가 그대로 렌더할 UI DTO로 정규화한다.
// 프론트는 raw scan.js 출력을 해석하지 않는다(유지보수성). 중복 카운트는 '출처 기반'으로 정직하게.
const sevOf = (g) => {
  if (g.duplicateLevel !== 'high') return { severity: 'low', recommendation: '정리 불필요 — 한 곳뿐' };
  const n = (g.skills || []).length;
  if (n >= 4) return { severity: 'high', recommendation: '한 곳으로 모으는 걸 권장' };
  return { severity: 'medium', recommendation: '겹침 검토 권장' };
};
const srcOf = (id) => String(id).split(':')[0];
const nameOf = (id) => String(id).split(':').slice(1).join(':') || id;

export function toSummary(scan) {
  const c = scan.counts || {}; const env = scan.environment || {};
  const bySrc = {}; for (const s of (scan.skills || [])) bySrc[s.source] = (bySrc[s.source] || 0) + 1;
  const high = (scan.groups || []).filter((g) => g.duplicateLevel === 'high').length;
  return {
    totalSkills: c.total != null ? c.total : (scan.skills || []).length,
    duplicateGroups: high,
    totalGroups: (scan.groups || []).length,
    activePlugins: (scan.plugins || []).length,
    agents: c.agents || 0,
    sources: Object.keys(bySrc).length,
    sourceDistribution: Object.entries(bySrc).sort((a, b) => b[1] - a[1]).map(([source, count]) => ({ source, count })),
    mirrorsFolded: env.mirrorsFolded || 0,
    skillsPath: env.skillsPath || '',
    version: scan.version || '',
    readOnly: true,
    hasSkillsFolder: !!env.hasClaude,
  };
}

export function toDuplicates(scan) {
  const idx = {}; for (const s of (scan.skills || [])) idx[s.id] = s;
  return (scan.groups || []).slice().sort((a, b) => (b.skills || []).length - (a.skills || []).length).map((g) => {
    const sv = sevOf(g);
    return {
      id: g.capability, capability: g.capability, label: g.label || g.capability,
      count: (g.skills || []).length, sources: g.sources || [],
      severity: sv.severity, recommendation: sv.recommendation, duplicateLevel: g.duplicateLevel,
      skills: (g.skills || []).map((id) => ({ id, name: nameOf(id), source: srcOf(id), enabled: idx[id] ? idx[id].enabled !== false : true, description: idx[id] ? idx[id].description || '' : '' })),
    };
  });
}

// 추천 기본값(출처 커버리지 근거)
function coverage(scan) { const cov = {}; for (const g of (scan.groups || [])) { if (g.duplicateLevel !== 'high') continue; for (const s of (g.sources || [])) cov[s] = (cov[s] || 0) + 1; } return cov; }
export function pickRecommended(group, cov) {
  const sk = group.skills || []; if (!sk.length) return null;
  if (group.duplicateLevel !== 'high' || sk.length === 1) return { id: sk[0], why: '겹침 없이 한 곳뿐 — 그대로 쓰면 돼요.' };
  const mine = sk.find((id) => srcOf(id) === 'user'); if (mine) return { id: mine, why: '직접 만든 스킬(user) 우선.' };
  const sorted = sk.slice().sort((a, b) => (cov[srcOf(b)] || 0) - (cov[srcOf(a)] || 0));
  return { id: sorted[0], why: `'${srcOf(sorted[0])}'가 가장 많은 작업을 커버 — 도구 하나로 모으기 좋음.` };
}
export function toRecommendations(scan) {
  const cov = coverage(scan); const idx = {}; for (const s of (scan.skills || [])) idx[s.id] = s;
  return (scan.groups || []).map((g) => {
    const rec = pickRecommended(g, cov);
    return { id: g.capability, capability: g.capability, label: g.label || g.capability, count: (g.skills || []).length, sources: g.sources || [],
      solo: g.duplicateLevel !== 'high', recommended: rec, alternatives: (g.skills || []).filter((id) => !rec || id !== rec.id).map((id) => ({ id, source: srcOf(id) })) };
  });
}
export function toWorkflows(wf) {
  return (wf.workflows || []).map((w) => ({ name: w.name, label: w.label || w.name, source: w.source || 'builtin',
    steps: (w.steps || []).map((s) => { const r = s.resolved || {}; return { capability: s.capability, note: s.note || '', kind: r.kind || 'none', label: r.label || s.capability, sources: r.sources || [], count: r.count || 0, skills: r.skills || [] }; }) }));
}
export function toManage(m) {
  const s = m.summary || {};
  return { summary: { standaloneTotal: s.standaloneTotal != null ? s.standaloneTotal : (m.standalone || []).length, gitUpdatable: s.gitUpdatable || 0, noUpdatePath: s.noUpdatePath || 0, pluginNote: s.pluginNote || '' },
    standalone: (m.standalone || []).map((sk) => ({ name: sk.name, kind: sk.kind, updatable: sk.kind === 'git', remote: sk.remote || '' })),
    plugins: (m.plugins || []).map((p) => ({ name: p.name, enabled: !!p.enabled })) };
}

// 정리 리포트용: 고신뢰 묶음만 → 유지권장(keep) + 개별정리 가능(removable) + 플러그인묶임(개별삭제 불가).
// removable = 중복 묶음 멤버 중 '단독 설치(standalone)'라서 휴지통으로 옮길 수 있는 것(keep 제외). 보수적.
export function toAudit(scan, manage) {
  const cov = coverage(scan);
  const standalone = new Set((manage.standalone || []).map((s) => s.name));
  const groups = (scan.groups || []).filter((g) => g.duplicateLevel === 'high')
    .sort((a, b) => (b.skills || []).length - (a.skills || []).length)
    .map((g) => {
      const keep = pickRecommended(g, cov);
      const others = (g.skills || []).filter((id) => !keep || id !== keep.id);
      const removable = others.filter((id) => standalone.has(nameOf(id))).map((id) => ({ id, name: nameOf(id), source: srcOf(id) }));
      const pluginBound = others.filter((id) => !standalone.has(nameOf(id))).map((id) => ({ id, name: nameOf(id), source: srcOf(id) }));
      return { capability: g.capability, label: g.label || g.capability, count: (g.skills || []).length,
        keep: keep ? { id: keep.id, name: nameOf(keep.id), source: srcOf(keep.id), why: keep.why } : null,
        removable, pluginBound };
    });
  const names = new Set(); for (const g of groups) for (const r of g.removable) names.add(r.name);
  const total = (scan.counts && scan.counts.total) || (scan.skills || []).length;
  return {
    summary: { totalSkills: total, removableCount: names.size, afterCount: total - names.size, groups: groups.length },
    groups, note: '고신뢰(겹침 확실) 묶음만 · 기본 미선택 · 휴지통으로 옮겨 되돌리기 가능',
  };
}
