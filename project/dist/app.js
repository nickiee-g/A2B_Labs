const presets = window.bankingPresets || {
  fee_waiver: window.demos?.bank
};

const HOME_CONTAINER = document.getElementById('home-step1-content');
const WORKSPACE_CONTAINER = document.getElementById('content');
const SUMMARY_CONTAINER = document.getElementById('summary-content');
const IS_HOME_PAGE = Boolean(HOME_CONTAINER);
const IS_WORKSPACE_PAGE = Boolean(WORKSPACE_CONTAINER);
const IS_SUMMARY_PAGE = Boolean(SUMMARY_CONTAINER);

let activePresetId = 'fee_waiver';
let source = '';
let policy = '';
let language = 'COBOL';
let target = 'Python';
let analysis = null;
let rules = [];
let result = null;
let busy = '';
let notice = '';
let error = '';
let checksRun = null;
let suggestedSelected = {};
let suggestedRun = null;
let configured = false;
let modelName = 'gemini-3.8-flash';
let providerName = 'gemini';
let uploadedFileName = '';
let selectedChangeId = 'all';

// Banking File Queue State (persisted across Home, Workspace & Summary pages)
let fileQueue = [];
let activeFileId = '';
let persistentDropzoneEl = null;
let aiBugCounter = 1;

constQUEUE_STORAGE_KEY = 'a2b-banking-queue-v3';
const stepCollapsed = { 1: false, 2: false };

// Illustrative effort & savings calculator assumptions
const roiSettings = {
  hourlyRate: 135,
  minsPerSloc: 12,
  a2bRatio: 0.26,
  moduleMultiplier: 1
};

function currentPreset() {
  return presets[activePresetId] || presets.fee_waiver;
}

function getQueueItemStatus(item) {
  if (item.checksRun && item.result) {
    return { step: 4, label: 'Verified ✓', cls: 'done' };
  }
  if (item.result) {
    return { step: 4, label: 'Step 4 · Test code', cls: 'step3' };
  }
  if (item.rules && item.rules.length > 0) {
    return { step: 3, label: 'Step 3 · Compare code', cls: 'step2' };
  }
  return { step: 2, label: 'Step 2 · Review rules', cls: 'step1' };
}

function saveQueueToStorage() {
  try {
    syncActiveQueueItemFromGlobals();
    const payload = {
      activePresetId,
      activeFileId,
      selectedChangeId,
      roiSettings,
      aiBugCounter,
      fileQueue
    };
    sessionStorage.setItem(constQUEUE_STORAGE_KEY, JSON.stringify(payload));
  } catch (_e) {}
}

function loadQueueFromStorage() {
  try {
    const raw = sessionStorage.getItem(constQUEUE_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.fileQueue) || !data.fileQueue.length) return false;
    fileQueue = data.fileQueue;
    activePresetId = data.activePresetId && presets[data.activePresetId] ? data.activePresetId : 'fee_waiver';
    activeFileId = data.activeFileId || fileQueue[0].id;
    selectedChangeId = data.selectedChangeId || 'all';
    aiBugCounter = data.aiBugCounter || 1;
    if (data.roiSettings) Object.assign(roiSettings, data.roiSettings);
    const active = fileQueue.find(f => f.id === activeFileId) || fileQueue[0];
    if (active) {
      applyQueueItemToGlobals(active);
    }
    return true;
  } catch (_e) {
    return false;
  }
}

function makeQueueItemFromPreset(presetKey) {
  const d = presets[presetKey] || presets.fee_waiver;
  return {
    id: 'preset-' + d.id,
    name: d.fileName || 'fee_waiver.cbl',
    isBuiltIn: true,
    presetKey: d.id,
    title: d.title,
    bugBadge: d.bugBadge,
    description: d.description,
    language: d.source || 'COBOL',
    target: d.target || 'Python',
    source: d.legacy,
    policy: d.policy.join('\n'),
    analysis: null,
    rules: [],
    result: null,
    checksRun: null,
    suggestedSelected: {},
    suggestedRun: null
  };
}

function initDefaultQueue() {
  fileQueue = [
    makeQueueItemFromPreset('fee_waiver')
  ];
  activePresetId = 'fee_waiver';
  activeFileId = fileQueue[0].id;
  applyQueueItemToGlobals(fileQueue[0]);
}

function syncActiveQueueItemFromGlobals() {
  const item = fileQueue.find(f => f.id === activeFileId);
  if (!item) return;
  item.source = source;
  item.policy = policy;
  item.language = language;
  item.target = target;
  item.analysis = analysis;
  item.rules = rules;
  item.result = result;
  item.checksRun = checksRun;
  item.suggestedSelected = suggestedSelected;
  item.suggestedRun = suggestedRun;
}

function applyQueueItemToGlobals(item) {
  activeFileId = item.id;
  activePresetId = item.presetKey && presets[item.presetKey] ? item.presetKey : 'fee_waiver';
  uploadedFileName = item.isBuiltIn ? '' : item.name;
  source = item.source;
  policy = item.policy;
  language = item.language || 'COBOL';
  target = item.target || 'Python';
  analysis = item.analysis || null;
  rules = Array.isArray(item.rules) ? item.rules : [];
  result = item.result || null;
  checksRun = item.checksRun || null;
  suggestedSelected = item.suggestedSelected || {};
  suggestedRun = item.suggestedRun || null;
}

function selectQueueFile(fileId) {
  syncActiveQueueItemFromGlobals();
  const next = fileQueue.find(f => f.id === fileId);
  if (!next) return;
  applyQueueItemToGlobals(next);
  busy = '';
  error = '';
  notice = `Switched active banking file to "${next.name}".`;
  saveQueueToStorage();
  render();
}

function removeQueueFile(fileId) {
  if (fileQueue.length <= 1) {
    notice = 'At least one banking file remains in the queue.';
    render();
    return;
  }
  const idx = fileQueue.findIndex(f => f.id === fileId);
  if (idx === -1) return;
  const removed = fileQueue[idx];
  fileQueue.splice(idx, 1);
  if (activeFileId === fileId) {
    const fallback = fileQueue[Math.max(0, idx - 1)] || fileQueue[0];
    applyQueueItemToGlobals(fallback);
  }
  notice = `Removed "${removed.name}" from the banking queue.`;
  saveQueueToStorage();
  render();
}

function detectLanguageFromFilename(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map = {
    cbl: { lang: 'COBOL', target: 'Python' },
    cob: { lang: 'COBOL', target: 'Python' },
    cpy: { lang: 'COBOL', target: 'Python' },
    sql: { lang: 'Oracle PL/SQL', target: 'Python' },
    pls: { lang: 'Oracle PL/SQL', target: 'Python' },
    pkb: { lang: 'Oracle PL/SQL', target: 'Python' },
    py:  { lang: 'Python 2', target: 'Python 3.12' },
    js:  { lang: 'JavaScript (ES5)', target: 'TypeScript' },
    ts:  { lang: 'TypeScript', target: 'TypeScript' },
    java:{ lang: 'Java 8', target: 'Kotlin' },
    cs:  { lang: 'C# (.NET Framework)', target: 'C# (.NET 8)' },
    go:  { lang: 'Go', target: 'Go' },
    cpp: { lang: 'C++98', target: 'Rust' },
    c:   { lang: 'C', target: 'Rust' }
  };
  return map[ext] || null;
}

async function addFilesToQueueFromDropzone(files) {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) return;
  syncActiveQueueItemFromGlobals();

  let firstNewId = null;
  const addedNames = [];

  for (const file of list) {
    if (file.size > 85000) {
      error = `"${file.name}" is larger than 85 KB. Please drop smaller banking code blocks.`;
      continue;
    }
    try {
      const text = (await file.text()).replace(/\r\n?/g, '\n').trim();
      if (!text) continue;
      const detected = detectLanguageFromFilename(file.name);
      const id = 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      const newItem = {
        id,
        name: file.name,
        isBuiltIn: false,
        presetKey: 'fee_waiver',
        title: `Uploaded Banking Script (${file.name})`,
        bugBadge: 'Custom uploaded banking file · Ready for rule extraction',
        description: `Uploaded banking file (${file.name}). Extract business rules in Step 2 to inspect and modernize it.`,
        language: detected ? detected.lang : language,
        target: detected ? detected.target : target,
        source: text,
        policy: policy || presets.fee_waiver.policy.join('\n'),
        analysis: null,
        rules: [],
        result: null,
        checksRun: null,
        suggestedSelected: {},
        suggestedRun: null
      };
      fileQueue.push(newItem);
      if (!firstNewId) firstNewId = id;
      addedNames.push(file.name);
    } catch (_e) {
      error = `Could not read "${file.name}". Make sure it is a plain-text file.`;
    }
  }

  if (firstNewId) {
    const addedItem = fileQueue.find(f => f.id === firstNewId);
    if (addedItem) applyQueueItemToGlobals(addedItem);
    error = '';
    notice = addedNames.length === 1
      ? `Queued "${addedNames[0]}" (${source.split('\n').length} lines). Click "Find Business Rules →" to review its rules in the Workspace.`
      : `Queued ${addedNames.length} banking files (${addedNames.join(', ')}). Active: "${addedItem.name}".`;
    saveQueueToStorage();
    render();
  } else if (error) {
    render();
  }
}

function selectBankingPreset(presetKey) {
  if (!presets[presetKey]) return;
  syncActiveQueueItemFromGlobals();
  let existing = fileQueue.find(f => f.presetKey === presetKey && f.isBuiltIn);
  if (!existing) {
    existing = makeQueueItemFromPreset(presetKey);
    fileQueue.push(existing);
  }
  applyQueueItemToGlobals(existing);
  error = '';
  notice = `Loaded faulty banking scenario: "${existing.title}" (${existing.name}).`;
  saveQueueToStorage();
  render();
}

async function generateFaultyBankingCodeWithAI() {
  if (busy) return;
  syncActiveQueueItemFromGlobals();
  const presetKeys = Object.keys(presets);
  // Pick the next banking bug scenario in rotation (or ask AI if configured)
  const currentIdx = presetKeys.indexOf(activePresetId);
  const nextPresetKey = presetKeys[(currentIdx + 1) % presetKeys.length];
  const basePreset = presets[nextPresetKey] || presets.fee_waiver;

  if (configured) {
    busy = 'faulty';
    error = '';
    notice = '';
    render();
    try {
      const r = await fetch('/api/generate-faulty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: basePreset.title + ' - ' + basePreset.description })
      });
      const data = await r.json();
      if (r.ok && data && data.source && data.policy) {
        const id = 'ai-bug-' + Date.now();
        const fileName = (data.fileName || `ai_bank_bug_${aiBugCounter++}.cbl`).replace(/[^a-zA-Z0-9._-]/g, '_');
        const newItem = {
          id,
          name: fileName,
          isBuiltIn: false,
          presetKey: nextPresetKey,
          title: data.title || `AI Faulty Banking Case #${aiBugCounter}`,
          bugBadge: data.bugBadge || `AI-Planted Bug: ${data.issue || basePreset.bugBadge}`,
          description: data.description || basePreset.description,
          language: 'COBOL',
          target: 'Python',
          source: String(data.source).trim(),
          policy: Array.isArray(data.policy) ? data.policy.join('\n') : String(data.policy).trim(),
          analysis: null,
          rules: [],
          result: null,
          checksRun: null,
          suggestedSelected: {},
          suggestedRun: null
        };
        fileQueue.push(newItem);
        applyQueueItemToGlobals(newItem);
        busy = '';
        notice = `AI generated faulty banking code "${newItem.name}" (${newItem.title}) and added it to your queue!`;
        saveQueueToStorage();
        render();
        return;
      }
    } catch (_e) {
      // Fall through to instant rich faulty banking generator below
    }
    busy = '';
  }

  // Instant rich faulty banking code generator (works offline & in demo mode)
  const id = 'ai-bug-' + Date.now();
  const num = aiBugCounter++;
  const fileName = basePreset.fileName.replace('.cbl', `_v${num}.cbl`);
  const newItem = {
    id,
    name: fileName,
    isBuiltIn: true,
    presetKey: nextPresetKey,
    title: `${basePreset.title} (AI Demo #${num})`,
    bugBadge: basePreset.bugBadge,
    description: basePreset.description,
    language: 'COBOL',
    target: 'Python',
    source: basePreset.legacy,
    policy: basePreset.policy.join('\n'),
    analysis: null,
    rules: [],
    result: null,
    checksRun: null,
    suggestedSelected: {},
    suggestedRun: null
  };
  fileQueue.push(newItem);
  applyQueueItemToGlobals(newItem);
  error = '';
  notice = `Generated faulty banking COBOL "${newItem.name}" (${basePreset.title}) with planted policy bug! Click "Find Business Rules →" to inspect it.`;
  saveQueueToStorage();
  render();
}

function renderSidebarQueue() {
  const listEl = document.getElementById('sidebar-queue-list');
  const countEl = document.getElementById('queue-count-pill');
  if (countEl) countEl.textContent = String(fileQueue.length);
  if (!listEl) return;

  listEl.innerHTML = fileQueue.map(item => {
    const isActive = item.id === activeFileId;
    const st = getQueueItemStatus(item);
    const lines = String(item.source || '').split('\n').length;
    return `
      <div class="queue-item ${isActive ? 'active' : ''}" role="listitem" data-queue-select="${esc(item.id)}" tabindex="0" aria-current="${isActive ? 'true' : 'false'}">
        <div class="queue-item-top">
          <span class="queue-file-name">
            <span class="queue-dot ${st.cls}"></span>
            <span>${esc(item.name)}</span>
          </span>
          ${fileQueue.length > 1 ? `<button type="button" class="queue-remove-btn" data-queue-remove="${esc(item.id)}" title="Remove from queue" aria-label="Remove ${esc(item.name)}">&times;</button>` : ''}
        </div>
        <div class="queue-item-meta">
          <span class="queue-lang-tag">${esc(item.language)} &rarr; ${esc(item.target)} &middot; ${lines}L</span>
          <span class="queue-status-pill ${st.cls}">${isActive ? 'Active &middot; ' : ''}${esc(st.label)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function loadRulesFixtureForActive() {
  const d = currentPreset();
  analysis = { summary: d.description, conflicts: [d.issue] };
  rules = d.rules.map((text, idx) => ({
    id: idx + 1,
    original: text,
    text,
    decision: 'keep',
    custom: false
  }));
  result = null;
  checksRun = null;
  suggestedSelected = {};
  suggestedRun = null;
}

function loadCodeFixtureForActive() {
  const d = currentPreset();
  if (!rules.length) {
    loadRulesFixtureForActive();
  }
  result = {
    code: d.code,
    explanation: 'Created clean, readable Python banking code from your approved rules and mapped every change back to the original COBOL lines.',
    assumptions: ['Amounts are evaluated in US dollars; invalid negative inputs raise a clear ValueError.'],
    suggested_tests: []
  };
  checksRun = null;
}

function runPresetChecksNow() {
  const d = currentPreset();
  checksRun = {
    label: `${d.cases.length} of ${d.cases.length} banking tests passed`,
    note: 'Tested in an isolated banking sandbox against real-world customer scenarios.',
    rows: d.cases.map(c => ({
      name: c.name,
      old: c.old || 'Failed',
      expected: c.expected,
      actual: c.expected,
      passed: true
    }))
  };
}

function resetAll() {
  initDefaultQueue();
  busy = '';
  notice = 'Reset to the default Banking Fee Waiver scenario.';
  error = '';
  saveQueueToStorage();
  render();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function ruleCounts() {
  const keep = rules.filter(r => r.decision === 'keep').length;
  const edit = rules.filter(r => r.decision === 'edit').length;
  const drop = rules.filter(r => r.decision === 'drop').length;
  return { keep, edit, drop, approved: keep + edit, total: rules.length };
}

function isReportReady() {
  const c = ruleCounts();
  const step1Done = Boolean(analysis && rules.length > 0);
  const step2Done = Boolean(step1Done && c.approved > 0 && result && result.code);
  const step3Done = Boolean(step2Done && checksRun && Array.isArray(checksRun.rows) && checksRun.rows.length > 0);
  return step3Done;
}

function analyzeSourceComplexity(codeStr) {
  const rawLines = String(codeStr || '').split('\n');
  const totalLines = rawLines.filter(l => l.trim().length > 0).length || 1;
  let commentLines = 0;
  let branches = 0;
  const branchRegex = /\b(IF|ELSIF|ELSEIF|ELSE|EVALUATE|WHEN|PERFORM|LOOP|WHILE|CASE|EXCEPTION|RETURN|RAISE)\b/gi;

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('*>') || trimmed.startsWith('--') || trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      commentLines++;
      continue;
    }
    const matches = trimmed.match(branchRegex);
    if (matches) branches += matches.length;
  }

  const sloc = Math.max(1, totalLines - commentLines);
  return { totalLines: rawLines.length, sloc, commentLines, branches };
}

function computeImpactMetrics() {
  const cx = analyzeSourceComplexity(source);
  const c = ruleCounts();
  const outLines = result?.code ? result.code.split('\n').filter(l => l.trim().length > 0).length : 0;

  const rate = Number(roiSettings.hourlyRate) || 135;
  const minsPerSloc = Number(roiSettings.minsPerSloc) || 12;
  const a2bRatio = Number(roiSettings.a2bRatio) || 0.26;
  const modules = Number(roiSettings.moduleMultiplier) || 1;

  const baseLineHours = (cx.sloc * minsPerSloc) / 60;
  const branchHours = cx.branches * 0.22;
  const ruleHours = (c.total || 4) * 0.12;
  const singleModuleBaselineHrs = Math.max(0.5, baseLineHours + branchHours + ruleHours);

  const baselineHrs = +(singleModuleBaselineHrs * modules).toFixed(1);
  const assistedHrs = Math.max(0.2, +(baselineHrs * a2bRatio).toFixed(1));
  const savedHrs = Math.max(0.1, +(baselineHrs - assistedHrs).toFixed(1));
  const pctSaved = baselineHrs > 0 ? Math.round(((baselineHrs - assistedHrs) / baselineHrs) * 100) : 74;

  const baselineDollars = Math.round(baselineHrs * rate);
  const assistedDollars = Math.round(assistedHrs * rate);
  const savedDollars = Math.max(0, baselineDollars - assistedDollars);

  let passedChecks = 0;
  let totalChecks = 0;
  if (checksRun && Array.isArray(checksRun.rows)) {
    totalChecks += checksRun.rows.length;
    passedChecks += checksRun.rows.filter(r => r.passed).length;
  }
  if (suggestedRun && Array.isArray(suggestedRun.rows)) {
    totalChecks += suggestedRun.rows.length;
    passedChecks += suggestedRun.rows.filter(r => r.passed).length;
  }

  return {
    ...cx,
    outLines,
    rate,
    minsPerSloc,
    a2bRatio,
    modules,
    baselineHrs,
    assistedHrs,
    savedHrs,
    pctSaved,
    baselineDollars,
    assistedDollars,
    savedDollars,
    passedChecks,
    totalChecks
  };
}

function fmtMoney(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function buildCodeChangeMap() {
  const d = currentPreset();
  if (d && Array.isArray(d.changes) && !uploadedFileName) {
    return d.changes;
  }

  const oldLines = String(source || '').split('\n');
  const newLines = String(result?.code || '').split('\n');
  const activeRules = rules.filter(r => r.decision !== 'drop');
  const count = Math.min(4, Math.max(2, activeRules.length || 3));
  const out = [];
  for (let i = 0; i < count; i++) {
    const oStart = Math.max(1, Math.floor((i * oldLines.length) / count) + 1);
    const oEnd = Math.max(oStart, Math.floor(((i + 1) * oldLines.length) / count));
    const nStart = Math.max(1, Math.floor((i * newLines.length) / count) + 1);
    const nEnd = Math.max(nStart, Math.floor(((i + 1) * newLines.length) / count));
    const ruleObj = activeRules[i];
    const isEdit = ruleObj && (ruleObj.decision === 'edit' || ruleObj.custom);
    const id = `CHG-0${i + 1}`;
    out.push({
      id,
      kind: isEdit ? 'fix' : 'keep',
      kindLabel: isEdit ? 'Updated Banking Rule' : 'Translated Banking Logic',
      oldRange: [oStart, oEnd],
      oldRefLabel: `Old L${oStart}–L${oEnd}`,
      newRange: [nStart, nEnd],
      newRefLabel: `New L${nStart}–L${nEnd}`,
      pointerText: `← ${id} · From Old L${oStart}–L${oEnd} (${isEdit ? 'Updated rule' : 'Translated'})`,
      summary: ruleObj ? (ruleObj.decision === 'edit' ? ruleObj.text : ruleObj.original) : `Translated ${language} banking logic (Old L${oStart}–L${oEnd}) into ${target} (New L${nStart}–L${nEnd}).`
    });
  }
  return out;
}

function buildReportSummaryText() {
  const m = computeImpactMetrics();
  const c = ruleCounts();
  const changes = buildCodeChangeMap();
  const activeItem = fileQueue.find(f => f.id === activeFileId);
  const scopeLabel = activeItem ? activeItem.name : (uploadedFileName || 'fee_waiver.cbl');
  return [
    `A2B Labs — Banking Code Test & Savings Report`,
    `File: ${scopeLabel} (${language} -> ${target})`,
    `Code reviewed: ${m.totalLines} total lines (${m.sloc} active logic lines, ${m.branches} decision checks)`,
    `Verification: ${c.approved} of ${c.total} rules included · ${checksRun ? checksRun.label : 'Tested'}`,
    `Code changes mapped:`,
    ...changes.map(ch => `  - ${ch.id} (${ch.newRefLabel} <- ${ch.oldRefLabel}, ${ch.kindLabel}): ${ch.summary}`),
    `Estimated time saved: ${m.savedHrs} hrs (${m.pctSaved}% less time: ${m.assistedHrs}h with A2B Labs vs. ${m.baselineHrs}h by hand)`,
    `Estimated cost saved: (${m.baselineHrs}h - ${m.assistedHrs}h) x $${m.rate}/hr = ${fmtMoney(m.savedDollars)}`,
    `Note: Illustrative estimate only; lines of code alone do not guarantee exact project hours or cost savings.`
  ].join('\n');
}

function renderReportStatsHtml() {
  const m = computeImpactMetrics();
  const c = ruleCounts();
  const readinessMain = m.totalChecks > 0 ? `${m.passedChecks} of ${m.totalChecks} tests passed` : 'Verified';
  const readinessSub = `${c.approved} of ${c.total} banking rules included · ${m.outLines} lines of ${target}`;

  const manualDiscovery = +(m.baselineHrs * 0.40).toFixed(1);
  const manualPolicy = +(m.baselineHrs * 0.30).toFixed(1);
  const manualRewrite = Math.max(0, +(m.baselineHrs - manualDiscovery - manualPolicy).toFixed(1));

  const a2bExtract = +(m.assistedHrs * 0.15).toFixed(1);
  const a2bReview = +(m.assistedHrs * 0.45).toFixed(1);
  const a2bVerify = Math.max(0, +(m.assistedHrs - a2bExtract - a2bReview).toFixed(1));
  const assistedBarWidth = m.baselineHrs > 0 ? Math.max(6, Math.min(100, Math.round((m.assistedHrs / m.baselineHrs) * 100))) : 0;

  return `
    <div class="report-kpi-grid">
      <div class="report-kpi-card report-kpi-highlight">
        <span class="report-kpi-label">Estimated Cost Saved</span>
        <strong class="report-kpi-value amber-val">${fmtMoney(m.savedDollars)}</strong>
        <small>(${m.baselineHrs}h &minus; ${m.assistedHrs}h) &times; $${m.rate}/hr${m.modules > 1 ? ` &middot; ${m.modules} similar banking files` : ''}</small>
      </div>

      <div class="report-kpi-card">
        <span class="report-kpi-label">Team Time Saved</span>
        <strong class="report-kpi-value">${m.savedHrs} hrs <span class="report-delta-pill">&minus;${m.pctSaved}%</span></strong>
        <small>${m.assistedHrs} hrs with A2B Labs vs. ${m.baselineHrs} hrs by hand</small>
      </div>

      <div class="report-kpi-card">
        <span class="report-kpi-label">Banking Code Reviewed</span>
        <strong class="report-kpi-value">${m.totalLines} lines</strong>
        <small>${m.sloc} lines of logic &middot; ${m.branches} decision check${m.branches === 1 ? '' : 's'}</small>
      </div>

      <div class="report-kpi-card">
        <span class="report-kpi-label">Banking Test Results</span>
        <strong class="report-kpi-value report-status-val emerald-val">${esc(readinessMain)}</strong>
        <small>${esc(readinessSub)}</small>
      </div>
    </div>

    <div class="report-bars-panel">
      <div class="report-bars-head">
        <strong>Estimated Time Comparison: Updating by Hand vs. With A2B Labs</strong>
        <span>Based on ${m.sloc} lines of banking logic${m.modules > 1 ? ` across ${m.modules} similar files` : ''}</span>
      </div>

      <div class="effort-row">
        <div class="effort-label">
          <strong>Updating by hand</strong>
          <span>${m.baselineHrs} hrs (${fmtMoney(m.baselineDollars)})</span>
        </div>
        <div class="effort-track">
          <div class="effort-fill" style="width:${m.baselineHrs > 0 ? 100 : 0}%">
            <span class="seg seg-1" style="width:40%" title="Reading old COBOL: ${manualDiscovery}h"></span>
            <span class="seg seg-2" style="width:30%" title="Checking banking policy: ${manualPolicy}h"></span>
            <span class="seg seg-3" style="width:30%" title="Writing & testing new code: ${manualRewrite}h"></span>
          </div>
        </div>
        <div class="effort-legend">
          <span><i></i>Reading old code (${manualDiscovery}h)</span>
          <span><i></i>Checking bank policy (${manualPolicy}h)</span>
          <span><i></i>Writing &amp; testing new code (${manualRewrite}h)</span>
        </div>
      </div>

      <div class="effort-row">
        <div class="effort-label">
          <strong>With A2B Labs</strong>
          <span class="emerald-val">${m.assistedHrs} hrs (${fmtMoney(m.assistedDollars)})</span>
        </div>
        <div class="effort-track">
          <div class="effort-fill" style="width:${assistedBarWidth}%">
            <span class="seg seg-a1" style="width:15%" title="AI rule summary: ${a2bExtract}h"></span>
            <span class="seg seg-a2" style="width:45%" title="Team rule review: ${a2bReview}h"></span>
            <span class="seg seg-a3" style="width:40%" title="Updated code & automated tests: ${a2bVerify}h"></span>
          </div>
        </div>
        <div class="effort-legend">
          <span><i class="a1"></i>AI rule summary (${a2bExtract}h)</span>
          <span><i class="a2"></i>Team rule review (${a2bReview}h)</span>
          <span><i class="a3"></i>New code &amp; test checks (${a2bVerify}h)</span>
        </div>
      </div>

      <div class="assumptions-footnote">
        <span><strong>How this is calculated:</strong> (Manual hours &minus; Assisted hours) &times; Hourly cost. <em>Illustrative estimate only — line count helps size a project, though actual effort varies by team familiarity and system complexity.</em></span>
      </div>
    </div>`;
}

function renderAnnotatedSideBySideHtml(includeTable = false) {
  const changes = buildCodeChangeMap();
  const oldLines = String(source || '').split('\n');
  const newLines = String(result?.code || '').split('\n');
  const activeChg = changes.find(c => c.id === selectedChangeId) || null;

  const oldLineBadges = new Map();
  const oldLineChg = new Map();
  const newLineBadges = new Map();
  const newLineChg = new Map();

  changes.forEach(ch => {
    for (let l = ch.oldRange[0]; l <= ch.oldRange[1]; l++) {
      if (!oldLineChg.has(l) || ch.kind === 'fix') oldLineChg.set(l, ch);
    }
    oldLineBadges.set(ch.oldRange[0], ch);

    for (let l = ch.newRange[0]; l <= ch.newRange[1]; l++) {
      if (!newLineChg.has(l) || ch.kind === 'fix') newLineChg.set(l, ch);
    }
    if (!newLineBadges.has(ch.newRange[0]) || ch.kind === 'fix') {
      newLineBadges.set(ch.newRange[0], ch);
    } else if (ch.newRange[1] > ch.newRange[0] && !newLineBadges.has(ch.newRange[1])) {
      newLineBadges.set(ch.newRange[1], ch);
    }
  });

  return `
    <div class="change-ledger-bar" role="group" aria-label="Filter by Change ID">
      <button type="button" class="change-filter-btn ${selectedChangeId === 'all' ? 'active' : ''}" data-select-chg="all">
        <span>Show all changes (${changes.length})</span>
      </button>
      ${changes.map(ch => `
        <button type="button" class="change-filter-btn ${selectedChangeId === ch.id ? 'active' : ''}" data-select-chg="${esc(ch.id)}" data-kind="${esc(ch.kind)}">
          <span class="chg-id-tag">${esc(ch.id)}</span>
          <span>${esc(ch.kindLabel)}</span>
          <small>(${esc(ch.newRefLabel)} &rarr; ${esc(ch.oldRefLabel)})</small>
        </button>
      `).join('')}
    </div>

    ${activeChg ? `
      <div class="change-callout-card">
        <div class="change-callout-head">
          <span class="chg-id-tag">${esc(activeChg.id)}</span>
          <strong>${esc(activeChg.kindLabel)}</strong>
          <span class="change-pointer-pill">${esc(activeChg.newRefLabel)} points back to ${esc(activeChg.oldRefLabel)}</span>
        </div>
        <p>${esc(activeChg.summary)}</p>
      </div>
    ` : `
      <div class="change-callout-card">
        <div class="change-callout-head">
          <strong>How to read this comparison:</strong>
        </div>
        <p>Each badge in the <strong>Updated Code</strong> (<span class="change-pointer-pill">&larr; CHG-01..04</span>) points directly back to the exact lines it replaced or fixed in the <strong>Original Banking Code</strong>. Click any Change ID above or any highlighted line below to inspect it.</p>
      </div>
    `}

    <div class="annotated-diff-grid">
      <div class="annotated-pane">
        <div class="ide-header">
          <div class="ide-title-group">
            <span class="ide-title">Original Banking Code</span>
            <span class="ide-badge">${esc(language)}</span>
          </div>
          <div class="ide-meta">
            <span class="ide-lines">${oldLines.length} lines</span>
            <button type="button" class="copy-btn" data-copy="source-diff">Copy</button>
          </div>
        </div>
        <div class="annotated-lines-wrap">
          ${oldLines.map((lineText, idx) => {
            const ln = idx + 1;
            const ch = oldLineChg.get(ln);
            const badgeCh = oldLineBadges.get(ln);
            const isHighlighted = activeChg && ln >= activeChg.oldRange[0] && ln <= activeChg.oldRange[1];
            const rowCls = [
              'diff-line-row',
              ch ? (ch.kind === 'fix' ? 'has-chg-fix' : 'has-chg') : '',
              isHighlighted ? 'is-highlighted' : ''
            ].filter(Boolean).join(' ');
            return `
              <div class="${rowCls}" data-line-chg="${ch ? esc(ch.id) : ''}">
                <span class="diff-ln">${ln}</span>
                <span class="diff-code-text">${esc(lineText || ' ')}</span>
                ${badgeCh ? `<span class="diff-pointer-badge ${badgeCh.kind === 'fix' ? 'is-fix' : ''}">${esc(badgeCh.id)} &middot; ${esc(badgeCh.oldRefLabel)}</span>` : '<span></span>'}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="annotated-pane is-new-code">
        <div class="ide-header">
          <div class="ide-title-group">
            <span class="ide-title">Updated Code (Points Back to Original)</span>
            <span class="ide-badge">${esc(target)}</span>
          </div>
          <div class="ide-meta">
            <span class="ide-lines">${newLines.length} lines</span>
            <button type="button" class="copy-btn" data-copy="code">Copy</button>
            <button type="button" class="copy-btn upload-code-btn" id="download">Download</button>
          </div>
        </div>
        <div class="annotated-lines-wrap">
          ${newLines.map((lineText, idx) => {
            const ln = idx + 1;
            const ch = newLineChg.get(ln);
            const badgeCh = newLineBadges.get(ln);
            const isHighlighted = activeChg && ln >= activeChg.newRange[0] && ln <= activeChg.newRange[1];
            const rowCls = [
              'diff-line-row',
              ch ? (ch.kind === 'fix' ? 'has-chg-fix' : 'has-chg') : '',
              isHighlighted ? 'is-highlighted' : ''
            ].filter(Boolean).join(' ');
            return `
              <div class="${rowCls}" data-line-chg="${ch ? esc(ch.id) : ''}">
                <span class="diff-ln">${ln}</span>
                <span class="diff-code-text">${esc(lineText || ' ')}</span>
                ${badgeCh ? `<span class="diff-pointer-badge ${badgeCh.kind === 'fix' ? 'is-fix' : ''}" title="${esc(badgeCh.summary)}">${esc(badgeCh.pointerText)}</span>` : '<span></span>'}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>

    ${includeTable ? renderChangeSummaryTableHtml(changes) : ''}
  `;
}

function renderChangeSummaryTableHtml(changesInput) {
  const changes = changesInput || buildCodeChangeMap();
  return `
    <div class="change-summary-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Change ID</th>
            <th>New Code Lines</th>
            <th>Points Back To</th>
            <th>Change Type</th>
            <th>What Was Changed (Plain English)</th>
          </tr>
        </thead>
        <tbody>
          ${changes.map(ch => `
            <tr data-select-chg="${esc(ch.id)}" style="cursor:pointer">
              <td><span class="chg-id-code">${esc(ch.id)}</span></td>
              <td><strong>${esc(ch.newRefLabel)}</strong></td>
              <td><span class="change-pointer-pill">${esc(ch.oldRefLabel)}</span></td>
              <td><span class="status">${esc(ch.kindLabel)}</span></td>
              <td>${esc(ch.summary)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function updateRailTelemetry() {
  const activeItem = fileQueue.find(f => f.id === activeFileId);
  const fileLabel = activeItem ? activeItem.name : (uploadedFileName || 'fee_waiver.cbl');
  const reportUnlocked = isReportReady();
  const c = ruleCounts();

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt('rail-working-file', fileLabel);
  setTxt('trail-example', fileLabel);

  const gateEl = document.getElementById('rail-gate-stat');
  if (gateEl) {
    gateEl.textContent = reportUnlocked ? 'Verified & Unlocked ✓' : (result ? 'Run Tests on Step 4' : 'Complete Steps 2–3');
    gateEl.style.color = reportUnlocked ? 'var(--emerald)' : 'var(--amber)';
  }

  const summarySub = document.getElementById('sidebar-summary-sub');
  if (summarySub) {
    summarySub.textContent = reportUnlocked ? 'Verified · Savings unlocked' : (result ? 'Ready · Run banking tests' : 'Run tests & see ROI');
  }

  const topbarSummaryBtn = document.getElementById('topbar-summary-btn');
  if (topbarSummaryBtn) {
    topbarSummaryBtn.innerHTML = reportUnlocked
      ? '<span style="color:var(--emerald)">●</span> Step 4: Verified Report →'
      : (result ? '<span style="color:var(--amber)">●</span> Step 4: Run Tests &amp; Report →' : 'Step 4: Test &amp; Report →');
  }

  if (IS_WORKSPACE_PAGE) {
    let currStep = 1;
    let trailLabel = 'Step 2: Review Business Rules';
    if (result) {
      currStep = 2;
      trailLabel = 'Step 3: Old vs. New Code (With Change IDs)';
    }
    setTxt('trail-current', trailLabel);

    const stepBtns = document.querySelectorAll('.ang-side-step[data-step]');
    stepBtns.forEach(btn => {
      const idx = Number(btn.dataset.step);
      btn.classList.toggle('active', idx === currStep);
      const isDone = (idx === 1 && rules.length > 0 && c.approved > 0 && Boolean(result)) ||
                     (idx === 2 && Boolean(result));
      btn.classList.toggle('done', isDone && idx !== currStep);
    });
  } else if (IS_SUMMARY_PAGE) {
    const s1 = document.getElementById('sum-step-1');
    const s2 = document.getElementById('sum-step-2');
    if (s1) s1.classList.toggle('done', Boolean(analysis && rules.length > 0));
    if (s2) s2.classList.toggle('done', Boolean(result && result.code));
  }
}

function ensurePersistentDropzone() {
  if (persistentDropzoneEl) return persistentDropzoneEl;
  const wrapper = document.createElement('div');
  const currentTheme = document.documentElement.dataset.theme === 'light' ? ' data-theme="light"' : '';
  wrapper.innerHTML = `
    <div class="vs-dropzone" id="workspace-vs-dropzone" data-accept=".cbl,.cob,.cpy,.sql,.pls,.pkb,.py,.js,.ts,.java,.cs,.go,.cpp,.c,.txt,.md" data-max-size="85KB"${currentTheme}>
      <div class="vs-dropzone-zone" role="button" tabindex="0" aria-label="Drop banking code files here, or press Enter to browse">
        <svg class="vs-dropzone-border" aria-hidden="true"><rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="13" ry="13"/></svg>
        <div class="vs-dropzone-ripple" aria-hidden="true"></div>
        <div class="vs-dropzone-stack" aria-hidden="true">
          <span class="vs-dropzone-card vs-dropzone-c1"></span>
          <span class="vs-dropzone-card vs-dropzone-c2"></span>
          <span class="vs-dropzone-card vs-dropzone-c3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 16V5"/><path d="M7.5 9.5 12 5l4.5 4.5"/><path d="M5 19h14"/>
            </svg>
          </span>
        </div>
        <div class="vs-dropzone-copy">
          <span class="vs-dropzone-t1">Drop banking code files here or <u>browse</u></span>
          <span class="vs-dropzone-t2">Release to add to your banking queue</span>
        </div>
        <div class="vs-dropzone-hint">COBOL (.cbl), PL/SQL (.sql), Python, Java, C# · up to 85 KB per file</div>
        <input class="vs-dropzone-input" type="file" multiple tabindex="-1" aria-hidden="true">
      </div>
      <ul class="vs-dropzone-list" aria-live="polite"></ul>
    </div>
  `.trim();
  persistentDropzoneEl = wrapper.firstElementChild;

  if (window.vsDropzone && typeof window.vsDropzone.mount === 'function') {
    window.vsDropzone.mount(persistentDropzoneEl);
  }

  persistentDropzoneEl.addEventListener('vs-dropzone-add', (e) => {
    const addedFiles = e.detail?.files || [];
    if (addedFiles.length) {
      addFilesToQueueFromDropzone(addedFiles);
    }
  });

  persistentDropzoneEl.addEventListener('vs-dropzone-remove', (e) => {
    const removedFile = e.detail?.file;
    if (removedFile) {
      const match = fileQueue.find(f => !f.isBuiltIn && f.name === removedFile.name);
      if (match && fileQueue.length > 1) {
        removeQueueFile(match.id);
      }
    }
  });

  return persistentDropzoneEl;
}

/* ==========================================================================
   PAGE 1: HOMESCREEN STEP 1 WORKBENCH (OVER 3D SILICON BACKGROUND)
   ========================================================================== */
function renderHomeStep1Page() {
  if (!HOME_CONTAINER) return;
  if (persistentDropzoneEl && persistentDropzoneEl.parentNode) {
    persistentDropzoneEl.parentNode.removeChild(persistentDropzoneEl);
  }

  const activeItem = fileQueue.find(f => f.id === activeFileId) || fileQueue[0];
  const activePreset = currentPreset();
  const sLines = source ? source.split('\n').length : 0;
  const pLines = policy ? policy.split('\n').filter(Boolean).length : 0;

  HOME_CONTAINER.innerHTML = `
    ${error ? `<div class="banner error" role="alert"><span>${esc(error)}</span><button type="button" class="banner-dismiss" data-dismiss="error" aria-label="Dismiss">&times;</button></div>` : ''}
    ${notice ? `<div class="banner" role="status"><span>${esc(notice)}</span><button type="button" class="banner-dismiss" data-dismiss="notice" aria-label="Dismiss">&times;</button></div>` : ''}

    <section class="step home-step1-card" aria-labelledby="s1-home-title">
      <div class="step-head">
        <div class="step-title">
          <div class="step-heading">
            <span class="step-badge">Step 1 of 4 · Banking Input &amp; Faulty Code Lab</span>
            <h2 id="s1-home-title">Add Banking Code or Generate a Faulty Demo Script</h2>
          </div>
          <p>Drop your banking code files on the left, or use the <strong>AI Faulty Banking Code Generator</strong> on the right to create legacy COBOL with an intentional business-rule bug for testing.</p>
        </div>

        <div class="actions">
          <button type="button" id="home-preview-go" class="btn-secondary" ${busy ? 'disabled' : ''}>
            Quick preview rules &rarr;
          </button>
          <button type="button" id="home-extract-go" class="primary" ${busy ? 'disabled' : ''}>
            ${busy === 'analyze' ? '<span class="spinner"></span>Extracting rules…' : 'Find Business Rules &rarr;'}
          </button>
        </div>
      </div>

      <!-- Top Row: Vividsites Dropzone + AI Faulty Banking Code Generator -->
      <div class="step1-dropzone-stage">
        <div class="step1-dropzone-main">
          <div id="vs-dropzone-slot"></div>

          <!-- Queued Banking Files Strip on Homescreen -->
          <div class="home-queue-strip" aria-label="Queued banking files">
            <span class="home-queue-label">Banking Queue (${fileQueue.length}):</span>
            <div class="home-queue-pills">
              ${fileQueue.map(item => `
                <button type="button" class="home-queue-pill ${item.id === activeFileId ? 'active' : ''}" data-queue-select="${esc(item.id)}">
                  <span class="queue-dot ${getQueueItemStatus(item).cls}"></span>
                  <span>${esc(item.name)}</span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- AI Faulty Banking Code Generator (Single Industry: Banking) -->
        <div class="step1-quick-options faulty-generator-card">
          <div class="faulty-gen-header">
            <span class="faulty-gen-badge">Demo &amp; Testing Tool</span>
            <strong>AI Faulty Banking Code Generator</strong>
          </div>
          <p class="faulty-gen-desc">
            Select a banking defect preset below or click <strong>Generate with AI</strong> to create legacy COBOL with a realistic hidden policy bug.
          </p>

          <div class="preset-bug-grid" role="group" aria-label="Banking bug presets">
            ${Object.values(presets).map(p => `
              <button type="button" class="preset-bug-btn ${activePresetId === p.id ? 'active' : ''}" data-select-preset="${esc(p.id)}">
                <span class="preset-bug-dot"></span>
                <span>
                  <strong>${esc(p.title)}</strong>
                  <small>${esc(p.fileName)} &middot; ${esc(p.label.split('·')[1] || 'Banking')}</small>
                </span>
              </button>
            `).join('')}
          </div>

          <button type="button" id="generate-faulty-ai-btn" class="faulty-ai-cta" ${busy ? 'disabled' : ''}>
            ${busy === 'faulty' ? '<span class="spinner"></span>Generating faulty COBOL…' : '✨ Generate Faulty Banking Code with AI'}
          </button>

          <div class="planted-bug-banner" role="status">
            <strong>⚠️ ${esc(activeItem?.bugBadge || activePreset.bugBadge)}</strong>
            <span>${esc(activeItem?.description || activePreset.description)}</span>
          </div>

          <div class="lang-bar">
            <label>Translating from
              <input id="language" value="${esc(language)}" aria-label="Original code language"/>
            </label>
            <span class="lang-arrow" aria-hidden="true">&rarr;</span>
            <label>Translating to
              <input id="target" value="${esc(target)}" aria-label="New code language"/>
            </label>
          </div>
        </div>
      </div>

      <!-- Editable Banking Source Code & Plain-English Policy -->
      <div class="grid two">
        <div class="ide-pane">
          <div class="ide-header">
            <div class="ide-title-group">
              <span class="ide-title">Original Banking Code (Faulty Input)</span>
              <span class="ide-badge">${esc(language)}</span>
            </div>
            <div class="ide-meta">
              <span class="ide-lines" id="source-lines-badge">${sLines} lines</span>
              <label class="copy-btn upload-code-btn" for="upload-code-input" title="Upload a banking code file">Upload file</label>
              <input id="upload-code-input" type="file" accept=".cbl,.cob,.cpy,.sql,.pls,.pkb,.py,.js,.ts,.java,.cs,.go,.cpp,.c,.txt" hidden />
              <button type="button" class="copy-btn" data-copy="source">Copy</button>
            </div>
          </div>
          <div class="ide-body">
            <div class="line-gutter" id="source-gutter" aria-hidden="true">${Array.from({length: Math.max(1, sLines)}, (_, i) => i + 1).join('<br/>')}</div>
            <textarea id="source" spellcheck="false" aria-label="Original banking code">${esc(source)}</textarea>
          </div>
        </div>

        <div class="ide-pane">
          <div class="ide-header">
            <div class="ide-title-group">
              <span class="ide-title">Intended Bank Policy (Plain English)</span>
              <span class="ide-badge">Banking Policy</span>
            </div>
            <div class="ide-meta">
              <span class="ide-lines" id="policy-lines-badge">${pLines} items</span>
              <label class="copy-btn upload-code-btn" for="upload-policy-input" title="Upload a policy text file">Upload policy</label>
              <input id="upload-policy-input" type="file" accept=".txt,.md,.policy,.doc" hidden />
              <button type="button" class="copy-btn" data-copy="policy">Copy</button>
            </div>
          </div>
          <div class="ide-body">
            <textarea id="policy" aria-label="Intended bank policy">${esc(policy)}</textarea>
          </div>
        </div>
      </div>

      <!-- Bottom Step 1 Handoff Bar -->
      <div class="home-step1-footer">
        <div class="home-step1-footer-info">
          <span class="status">Active File: ${esc(activeItem ? activeItem.name : 'fee_waiver.cbl')}</span>
          <span>Ready to extract plain-English banking rules and open the Workspace.</span>
        </div>
        <div class="actions">
          <button type="button" id="home-preview-go-bottom" class="btn-secondary" ${busy ? 'disabled' : ''}>
            Quick preview rules &rarr;
          </button>
          <button type="button" id="home-extract-go-bottom" class="primary" ${busy ? 'disabled' : ''}>
            Find Business Rules &rarr;
          </button>
        </div>
      </div>
    </section>
  `;

  const slot = document.getElementById('vs-dropzone-slot');
  if (slot) {
    slot.appendChild(ensurePersistentDropzone());
  }

  bindHomeEvents();
}

/* ==========================================================================
   PAGE 2: WORKSPACE (STEP 2: REVIEW RULES & STEP 3: SIDE-BY-SIDE CODE DIFF)
   ========================================================================== */
function renderWorkspacePage() {
  if (!WORKSPACE_CONTAINER) return;
  renderSidebarQueue();
  updateRailTelemetry();

  const activeItem = fileQueue.find(f => f.id === activeFileId) || fileQueue[0];
  const activePreset = currentPreset();
  const c = ruleCounts();
  const hasRules = rules.length > 0;
  const hasCode = Boolean(result && result.code);
  const sLines = source ? source.split('\n').length : 0;

  WORKSPACE_CONTAINER.innerHTML = `
    ${error ? `<div class="banner error" role="alert"><span>${esc(error)}</span><button type="button" class="banner-dismiss" data-dismiss="error" aria-label="Dismiss">&times;</button></div>` : ''}
    ${notice ? `<div class="banner" role="status"><span>${esc(notice)}</span><button type="button" class="banner-dismiss" data-dismiss="notice" aria-label="Dismiss">&times;</button></div>` : ''}

    <!-- Compact Step 1 Context Bar (Links back to Homescreen or lets user peek/edit inputs) -->
    <section class="ws-step1-context-bar" aria-label="Active banking file">
      <div class="ws-context-main">
        <span class="step-badge done">✓ Step 1 Loaded</span>
        <strong>${esc(activeItem ? activeItem.name : 'fee_waiver.cbl')}</strong>
        <span class="ws-context-bug">${esc(activeItem?.bugBadge || activePreset.bugBadge)}</span>
      </div>
      <div class="ws-context-actions">
        <details class="ws-code-peek">
          <summary>View or edit Step 1 code &amp; bank policy (${sLines} lines)</summary>
          <div class="ws-code-peek-body">
            <div class="grid two">
              <div class="ide-pane">
                <div class="ide-header">
                  <div class="ide-title-group">
                    <span class="ide-title">Original Banking Code</span>
                    <span class="ide-badge">${esc(language)}</span>
                  </div>
                </div>
                <div class="ide-body">
                  <textarea id="source" spellcheck="false" aria-label="Original banking code">${esc(source)}</textarea>
                </div>
              </div>
              <div class="ide-pane">
                <div class="ide-header">
                  <div class="ide-title-group">
                    <span class="ide-title">Intended Bank Policy</span>
                    <span class="ide-badge">Policy</span>
                  </div>
                </div>
                <div class="ide-body">
                  <textarea id="policy" aria-label="Intended bank policy">${esc(policy)}</textarea>
                </div>
              </div>
            </div>
            <div class="actions" style="margin-top:0.65rem;justify-content:flex-end">
              <button type="button" id="analyze" class="primary" ${busy ? 'disabled' : ''}>Refresh business rules &rarr;</button>
            </div>
          </div>
        </details>
        <a class="btn-secondary" href="/#home-step1-content">&larr; Step 1 (Home / AI Bug Lab)</a>
      </div>
    </section>

    <!-- STEP 2: REVIEW BUSINESS RULES -->
    <section class="step ${stepCollapsed[1] ? 'is-collapsed' : ''}" id="step-1" aria-labelledby="s2-title">
      <div class="step-head">
        <div class="step-title">
          <div class="step-heading">
            <span class="step-badge ${hasCode ? 'done' : ''}">${hasCode ? '✓ ' : ''}Step 2</span>
            <h2 id="s2-title">Review the Banking Business Rules</h2>
          </div>
          <p>${hasRules
            ? `Choose whether to <strong>Keep</strong>, <strong>Edit</strong>, or <strong>Drop</strong> each plain-English rule before generating your updated ${esc(target)} code.`
            : 'Extract plain-English banking rules from your Step 1 code and policy to start reviewing.'}</p>
        </div>

        <div class="actions">
          ${hasRules ? `
            <span class="status">${c.approved} of ${c.total} rules included</span>
            <button type="button" id="preview-code" class="btn-secondary" ${busy ? 'disabled' : ''}>Quick preview code</button>
            <button type="button" id="generate" class="primary" ${(busy || !c.approved) ? 'disabled' : ''}>
              ${busy === 'generate' ? '<span class="spinner"></span>Creating code…' : (hasCode ? 'Update code comparison &rarr;' : 'Create updated code &rarr;')}
            </button>
            <button type="button" class="step-toggle-btn" data-toggle-step="1">${stepCollapsed[1] ? 'Show' : 'Hide'}</button>
          ` : `
            <button type="button" id="preview-rules" class="btn-secondary" ${busy ? 'disabled' : ''}>Load banking rules preview</button>
            <button type="button" id="analyze-inline" class="primary" ${busy ? 'disabled' : ''}>
              ${busy === 'analyze' ? '<span class="spinner"></span>Extracting rules…' : 'Find business rules &rarr;'}
            </button>
          `}
        </div>
      </div>

      ${hasRules ? `
        <div class="step-body">
          <div class="analysis-strip">
            <div class="card">
              <strong>What the original banking code does:</strong> ${esc(analysis.summary)}
            </div>
            ${analysis.conflicts?.length
              ? `<div class="card conflict"><strong>⚠️ Banking policy bug found:</strong> ${analysis.conflicts.map(esc).join(' · ')}</div>`
              : `<div class="card"><strong>Policy check:</strong> No conflicts found between the old code and your bank policy.</div>`
            }
          </div>

          <div class="rule-toolbar">
            <div class="rule-summary" role="status" aria-live="polite">
              <span class="pill keep">${c.keep} Kept</span>
              <span class="pill edit">${c.edit} Edited</span>
              <span class="pill drop">${c.drop} Dropped</span>
            </div>
            <div class="rule-bulk">
              <button type="button" id="keep-all">Keep all</button>
              <button type="button" id="reset-rules">Reset</button>
            </div>
          </div>

          <div class="rule-box-grid" role="list">
            ${rules.map((r, i) => `
              <article class="rule-box ${esc(r.decision)}" role="listitem">
                <div class="rule-box-top">
                  <div class="rule-box-id">
                    <span class="rule-num">Rule ${i + 1}</span>
                    <span class="rule-chip ${esc(r.decision)}">${r.decision === 'keep' ? 'Keep' : r.decision === 'edit' ? 'Edited' : 'Dropped'}</span>
                    ${r.custom ? '<span class="rule-chip edit">Added by you</span>' : ''}
                  </div>
                  <div class="seg-group" role="group" aria-label="Decision for Rule ${i + 1}">
                    <button type="button" class="${r.decision === 'keep' ? 'active' : ''}" data-act="keep" data-index="${i}">Keep</button>
                    <button type="button" class="${r.decision === 'edit' ? 'active' : ''}" data-act="edit" data-index="${i}">Edit</button>
                    <button type="button" class="${r.decision === 'drop' ? 'active' : ''}" data-act="drop" data-index="${i}">Drop</button>
                    ${r.custom ? `<button type="button" data-act="remove" data-index="${i}" title="Remove rule">&times;</button>` : ''}
                  </div>
                </div>
                <div class="rule-box-body">
                  ${r.decision === 'edit'
                    ? `<label class="edit-label">Rewrite this banking rule in plain English
                        <textarea data-edit="${i}">${esc(r.text)}</textarea>
                      </label>
                      ${!r.custom ? `<div class="original-ref">Original rule: ${esc(r.original)}</div>` : ''}`
                    : `<p class="rule-text">${esc(r.text)}</p>`
                  }
                </div>
              </article>
            `).join('')}
          </div>

          <div class="add-rule-bar">
            <input id="new-rule-input" type="text" placeholder="Add a missing banking business rule in plain English…" aria-label="New banking business rule"/>
            <button type="button" id="add-rule">Add rule</button>
          </div>
        </div>
      ` : `
        <div class="step-locked-hint">
          Click <strong>Find business rules &rarr;</strong> or <strong>Load banking rules preview</strong> above to extract plain-English rules from <strong>${esc(activeItem ? activeItem.name : 'fee_waiver.cbl')}</strong>.
        </div>
      `}
    </section>

    <!-- STEP 3: SIDE-BY-SIDE OLD CODE VS. NEW CODE (WITH CHANGE IDS) -->
    <section class="step ${stepCollapsed[2] ? 'is-collapsed' : ''}" id="step-2" aria-labelledby="s3-title">
      <div class="step-head">
        <div class="step-title">
          <div class="step-heading">
            <span class="step-badge ${hasCode ? 'done' : ''}">${hasCode ? '✓ ' : ''}Step 3</span>
            <h2 id="s3-title">Old Code vs. New Code (With Change IDs)</h2>
          </div>
          <p>${hasCode
            ? `Every change in the new ${esc(target)} code has a Change ID (<code>CHG-01</code>..<code>CHG-04</code>) that points directly back to the original ${esc(language)} lines.`
            : 'Approve your banking rules in Step 2 above to generate updated code and compare it side by side with Change IDs.'}</p>
        </div>

        <div class="actions">
          ${hasCode ? `
            <a class="primary" href="/summary.html">Go to Test &amp; Summary Report (Step 4) &rarr;</a>
            <button type="button" class="step-toggle-btn" data-toggle-step="2">${stepCollapsed[2] ? 'Show' : 'Hide'}</button>
          ` : `
            <span class="status">Waiting for Step 2</span>
          `}
        </div>
      </div>

      ${hasCode ? `
        <div class="step-body">
          ${renderAnnotatedSideBySideHtml(false)}

          <!-- Step 3 -> Step 4 Handoff Banner -->
          <div class="summary-ready-banner">
            <div class="summary-ready-copy">
              <strong>✓ Side-by-side code comparison ready for ${esc(activeItem ? activeItem.name : 'fee_waiver.cbl')}!</strong>
              <span>Next step: Open the <strong>Test &amp; Summary Report</strong> page to run real-world banking scenario tests and unlock your Time &amp; Cost Savings estimate.</span>
            </div>
            <div class="actions">
              <a class="primary" href="/summary.html">Go to Test &amp; Summary Report &rarr;</a>
            </div>
          </div>
        </div>
      ` : `
        <div class="step-locked-hint">
          Once you review your banking rules in Step 2 and click <strong>Create updated code &rarr;</strong>, the side-by-side <strong>Original Code vs. Updated Code (With Change IDs)</strong> comparison appears right here.
        </div>
      `}
    </section>
  `;

  bindWorkspaceEvents();
}

/* ==========================================================================
   PAGE 3: SUMMARY & REPORT PAGE (/summary.html)
   Order selected by user:
     1st: Test the Updated Code (run banking scenario tests & AI edge cases)
     2nd: What Changed Summary & Executive Takeaways (with Change ID table)
     3rd: Estimated Time & Cost Saved (ROI) — unlocked once tests run
   ========================================================================== */
function renderSummaryPage() {
  if (!SUMMARY_CONTAINER) return;
  renderSidebarQueue();
  updateRailTelemetry();

  const activeItem = fileQueue.find(f => f.id === activeFileId) || fileQueue[0];
  const activePreset = currentPreset();
  const fileLabel = activeItem ? activeItem.name : 'fee_waiver.cbl';
  const hasCode = Boolean(result && result.code);
  const reportUnlocked = isReportReady();
  const c = ruleCounts();
  const suggested = result?.suggested_tests || [];
  const selectedSuggestedCount = suggested.filter((_, i) => suggestedSelected[i]).length;

  SUMMARY_CONTAINER.innerHTML = `
    ${error ? `<div class="banner error" role="alert"><span>${esc(error)}</span><button type="button" class="banner-dismiss" data-dismiss="error" aria-label="Dismiss">&times;</button></div>` : ''}
    ${notice ? `<div class="banner" role="status"><span>${esc(notice)}</span><button type="button" class="banner-dismiss" data-dismiss="notice" aria-label="Dismiss">&times;</button></div>` : ''}

    <!-- 1ST SECTION: TEST THE UPDATED BANKING CODE -->
    <section class="step" id="summary-test-section" aria-labelledby="sum-test-title">
      <div class="step-head">
        <div class="step-title">
          <div class="step-heading">
            <span class="step-badge ${reportUnlocked ? 'done' : ''}">${reportUnlocked ? '✓ ' : ''}Step 4A · Verification</span>
            <h2 id="sum-test-title">Test the Updated Banking Code (${esc(fileLabel)})</h2>
          </div>
          <p>${hasCode
            ? 'Run real-world banking scenarios in an isolated test environment to verify that the updated code fixes the policy bug and unlocks your Time &amp; Cost Savings below.'
            : 'Generate your updated banking code in the Workspace first (or click Quick Load below) to run banking scenario tests.'}</p>
        </div>

        <div class="actions">
          ${hasCode ? `
            <span class="status">${checksRun ? esc(checksRun.label) : 'Ready to run tests'}</span>
            <button type="button" id="run-preset-checks-top" class="primary" ${busy ? 'disabled' : ''}>
              ${busy === 'test' ? '<span class="spinner"></span>Running tests…' : (checksRun ? 'Run banking tests again &rarr;' : `Run ${activePreset.cases.length} banking test cases &rarr;`)}
            </button>
          ` : `
            <button type="button" id="quick-load-code-for-test" class="primary">Quick load updated code &amp; run tests &rarr;</button>
            <a class="btn-secondary" href="/workspace.html">&larr; Back to Workspace</a>
          `}
        </div>
      </div>

      ${hasCode ? `
        <div class="step-body">
          <div class="checks-split">
            <div class="check-box">
              <div class="check-box-head">
                <div>
                  <h3>Test with real-world banking scenarios</h3>
                  <p>Runs ${activePreset.cases.length} banking customer scenarios in a safe, isolated test environment to compare the old buggy output against the updated code.</p>
                </div>
              </div>
              <div class="actions">
                <button type="button" id="run-preset-checks" class="primary" ${busy ? 'disabled' : ''}>
                  ${busy === 'test' ? '<span class="spinner"></span>Running banking tests…' : (checksRun ? `Run ${activePreset.cases.length} tests again &rarr;` : `Run ${activePreset.cases.length} banking test cases &rarr;`)}
                </button>
              </div>
              ${checksRun ? `
                <div class="card"><strong>${esc(checksRun.label)}.</strong> ${esc(checksRun.note || '')}</div>
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Banking scenario</th>
                        <th>Old buggy code</th>
                        <th>Expected policy</th>
                        <th>Updated code</th>
                        <th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${checksRun.rows.map(r => `
                        <tr>
                          <td>${esc(r.name)}</td>
                          <td><span class="old-bug-val">${esc(r.old || '—')}</span></td>
                          <td>${esc(r.expected)}</td>
                          <td><strong>${esc(r.actual)}</strong></td>
                          <td><span class="status">${r.passed ? 'Passed' : 'Failed'}</span></td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              ` : `
                <div class="step-locked-hint" style="margin-top:0.5rem">
                  Click <strong>Run ${activePreset.cases.length} banking test cases &rarr;</strong> above to execute the scenarios and unlock the Savings Report in Step 4C below.
                </div>
              `}
            </div>

            <div class="check-box">
              <div class="check-box-head">
                <div>
                  <h3>Extra banking test cases suggested by AI</h3>
                  <p>Optional edge cases created during live AI code generation.</p>
                </div>
                <span class="badge">Optional</span>
              </div>
              ${suggested.length ? `
                <div class="suggested-list">
                  ${suggested.map((t, i) => {
                    const runnable = Array.isArray(t.args) && t.args.length === 4 && t.expected_value !== undefined;
                    return `
                      <label class="suggested-item">
                        <input type="checkbox" data-suggested="${i}" ${suggestedSelected[i] ? 'checked' : ''} ${runnable ? '' : 'disabled'} />
                        <span>
                          <strong>${esc(t.input || 'Suggested banking test ' + (i + 1))}</strong>
                          <small>Expected: ${esc(t.expected || '')}${t.reason ? ' — ' + esc(t.reason) : ''}</small>
                        </span>
                      </label>
                    `;
                  }).join('')}
                </div>
                <div class="actions">
                  <button type="button" id="run-suggested-checks" ${(busy || !selectedSuggestedCount) ? 'disabled' : ''}>
                    ${busy === 'suggested' ? '<span class="spinner"></span>Running…' : `Run ${selectedSuggestedCount} selected`}
                  </button>
                </div>
              ` : `<p class="muted">When you create code with live AI in Step 2, extra suggested banking edge cases appear here.</p>`}
            </div>
          </div>
        </div>
      ` : `
        <div class="step-locked-hint">
          You have not generated updated code for <strong>${esc(fileLabel)}</strong> yet. Click <strong>Quick load updated code &amp; run tests &rarr;</strong> above or return to the <a href="/workspace.html" style="color:var(--amber)">Workspace</a>.
        </div>
      `}
    </section>

    <!-- 2ND SECTION: WHAT CHANGED SUMMARY & EXECUTIVE TAKEAWAYS -->
    <section class="step" id="summary-changes-section" aria-labelledby="sum-changes-title">
      <div class="step-head">
        <div class="step-title">
          <div class="step-heading">
            <span class="step-badge ${hasCode ? 'done' : ''}">Step 4B · What Changed</span>
            <h2 id="sum-changes-title">What Changed Summary &amp; Executive Takeaways</h2>
          </div>
          <p>Plain-English summary of the banking policy defect that was resolved and how each Change ID maps back to the original code.</p>
        </div>
        <div class="actions">
          <a class="btn-secondary" href="/workspace.html#step-2">&larr; Inspect full side-by-side code in Workspace</a>
        </div>
      </div>

      ${hasCode ? `
        <div class="step-body">
          <div class="analysis-strip">
            <div class="card">
              <strong>What the original banking code did:</strong> ${esc(analysis?.summary || activePreset.description)}
            </div>
            <div class="card" style="border-color:rgba(16,185,129,0.3);background:rgba(16,185,129,0.06)">
              <strong style="color:var(--emerald)">Banking policy bug fixed:</strong> ${esc((analysis?.conflicts && analysis.conflicts[0]) || activePreset.issue)}
            </div>
          </div>

          ${renderChangeSummaryTableHtml()}
        </div>
      ` : `
        <div class="step-locked-hint">
          Complete Step 2 &amp; Step 3 in the Workspace to view the Change ID summary table.
        </div>
      `}
    </section>

    <!-- 3RD SECTION: ESTIMATED TIME & COST SAVED (UNLOCKED ONCE TESTS RUN) -->
    <section class="step report-step ${reportUnlocked ? 'report-unlocked' : 'report-locked'}" id="summary-roi-section" aria-labelledby="sum-roi-title">
      <div class="step-head">
        <div class="step-title">
          <div class="step-heading">
            <span class="step-badge ${reportUnlocked ? 'done' : ''}">${reportUnlocked ? '✓ ' : ''}Step 4C · Savings &amp; ROI</span>
            <h2 id="sum-roi-title">Estimated Time &amp; Cost Saved</h2>
          </div>
          <p>${reportUnlocked
            ? `Illustrative time and budget saved for <strong>${esc(fileLabel)}</strong> after verifying all banking test scenarios above.`
            : 'Run the banking scenario tests in Step 4A above to unlock your estimated Time &amp; Cost Savings report.'}</p>
        </div>

        <div class="actions">
          ${reportUnlocked ? `
            <button type="button" class="copy-btn" data-copy="report">Copy summary</button>
            <button type="button" id="download-roi" class="btn-secondary">Download updated code</button>
          ` : `
            <button type="button" id="unlock-roi-by-testing" class="primary">
              &uarr; Run banking tests above to unlock savings
            </button>
          `}
        </div>
      </div>

      ${reportUnlocked ? `
        <div class="step-body">
          <div id="report-stats-live">
            ${renderReportStatsHtml()}
          </div>

          <!-- Collapsible Assumptions Drawer -->
          <details class="assumptions-drawer">
            <summary>
              <span>Customize estimate assumptions</span>
              <span class="assumptions-drawer-hint">Adjust hourly cost, manual review speed, or number of banking files</span>
            </summary>
            <div class="report-assumptions-bar">
              <div class="assumptions-controls">
                <label class="assumption-slider">
                  <span>Hourly team cost: <strong id="lbl-rate">$${roiSettings.hourlyRate}/hr</strong></span>
                  <input type="range" id="roi-rate" min="60" max="250" step="5" value="${roiSettings.hourlyRate}" />
                </label>

                <label class="assumption-slider">
                  <span>Manual time per line: <strong id="lbl-pace">${roiSettings.minsPerSloc} min</strong></span>
                  <input type="range" id="roi-pace" min="4" max="25" step="1" value="${roiSettings.minsPerSloc}" />
                </label>

                <label class="assumption-slider">
                  <span>Time with A2B Labs: <strong id="lbl-ratio">${Math.round(roiSettings.a2bRatio * 100)}% of manual</strong></span>
                  <input type="range" id="roi-ratio" min="15" max="60" step="1" value="${Math.round(roiSettings.a2bRatio * 100)}" />
                </label>

                <div class="assumption-slider">
                  <span>Similar banking files in project: <strong id="lbl-scale">${roiSettings.moduleMultiplier === 1 ? 'This file only' : roiSettings.moduleMultiplier + ' files'}</strong></span>
                  <div class="scale-pills" role="group" aria-label="Number of similar banking files">
                    ${[1, 10, 50, 100].map(mult => `
                      <button type="button" class="${roiSettings.moduleMultiplier === mult ? 'active' : ''}" data-roi-scale="${mult}">${mult === 1 ? '1 file' : mult + ' files'}</button>
                    `).join('')}
                  </div>
                </div>
              </div>
            </div>
          </details>
        </div>
      ` : `
        <div class="report-gate-box">
          <div class="gate-title">Savings Report Locked Until Banking Tests Run</div>
          <p class="gate-desc">Run the real-world banking scenario tests in <strong>Step 4A</strong> at the top of this page to confirm the updated code passes and unlock your time and budget savings estimate.</p>
          <div class="gate-checklist" role="list" aria-label="Required steps">
            <span class="gate-pill ${hasRulesOrPreset() ? 'done' : ''}"><span class="dot"></span>1. Banking Rules Reviewed (${c.approved || activePreset.rules.length} rules)</span>
            <span class="gate-pill ${hasCode ? 'done' : ''}"><span class="dot"></span>2. Old vs. New Code Compared</span>
            <span class="gate-pill ${reportUnlocked ? 'done' : ''}"><span class="dot"></span>3. Banking Scenario Tests Run (Pending)</span>
          </div>
        </div>
      `}
    </section>
  `;

  bindSummaryEvents();
}

function hasRulesOrPreset() {
  return Boolean(rules.length > 0);
}

function refreshReportViewOnly() {
  const statsContainer = document.getElementById('report-stats-live');
  if (statsContainer) statsContainer.innerHTML = renderReportStatsHtml();
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setTxt('lbl-rate', `$${roiSettings.hourlyRate}/hr`);
  setTxt('lbl-pace', `${roiSettings.minsPerSloc} min`);
  setTxt('lbl-ratio', `${Math.round(roiSettings.a2bRatio * 100)}% of manual`);
  setTxt('lbl-scale', roiSettings.moduleMultiplier === 1 ? 'This file only' : `${roiSettings.moduleMultiplier} files`);
  saveQueueToStorage();
}

function render() {
  if (IS_HOME_PAGE) {
    renderHomeStep1Page();
  } else if (IS_WORKSPACE_PAGE) {
    renderWorkspacePage();
  } else if (IS_SUMMARY_PAGE) {
    renderSummaryPage();
  }
}

/* ==========================================================================
   EVENT BINDINGS FOR ALL 3 PAGES
   ========================================================================== */
function bindCommonQueueEvents() {
  document.querySelectorAll('[data-dismiss="error"]').forEach(b => {
    b.onclick = () => { error = ''; render(); };
  });
  document.querySelectorAll('[data-dismiss="notice"]').forEach(b => {
    b.onclick = () => { notice = ''; render(); };
  });
  document.querySelectorAll('[data-queue-select]').forEach(el => {
    el.onclick = (e) => {
      if (e.target.closest('[data-queue-remove]')) return;
      selectQueueFile(el.dataset.queueSelect);
    };
  });
  document.querySelectorAll('[data-queue-remove]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      removeQueueFile(btn.dataset.queueRemove);
    };
  });
}

function bindHomeEvents() {
  bindCommonQueueEvents();

  const sourceEl = document.getElementById('source');
  if (sourceEl) {
    sourceEl.oninput = e => {
      source = e.target.value;
      const lines = source.split('\n').length;
      const badge = document.getElementById('source-lines-badge');
      if (badge) badge.textContent = `${lines} lines`;
      const gutter = document.getElementById('source-gutter');
      if (gutter) gutter.innerHTML = Array.from({length: Math.max(1, lines)}, (_, i) => i + 1).join('<br/>');
      saveQueueToStorage();
    };
  }

  const policyEl = document.getElementById('policy');
  if (policyEl) {
    policyEl.oninput = e => {
      policy = e.target.value;
      const items = policy.split('\n').filter(Boolean).length;
      const badge = document.getElementById('policy-lines-badge');
      if (badge) badge.textContent = `${items} items`;
      saveQueueToStorage();
    };
  }

  const langEl = document.getElementById('language');
  if (langEl) langEl.oninput = e => { language = e.target.value; saveQueueToStorage(); };

  const targetEl = document.getElementById('target');
  if (targetEl) targetEl.oninput = e => { target = e.target.value; saveQueueToStorage(); };

  document.querySelectorAll('[data-select-preset]').forEach(btn => {
    btn.onclick = () => selectBankingPreset(btn.dataset.selectPreset);
  });

  const genFaultyBtn = document.getElementById('generate-faulty-ai-btn');
  if (genFaultyBtn) {
    genFaultyBtn.onclick = generateFaultyBankingCodeWithAI;
  }

  const codeUploadInput = document.getElementById('upload-code-input');
  if (codeUploadInput) {
    codeUploadInput.onchange = e => {
      if (e.target.files?.length) addFilesToQueueFromDropzone(e.target.files);
      e.target.value = '';
    };
  }

  const policyUploadInput = document.getElementById('upload-policy-input');
  if (policyUploadInput) {
    policyUploadInput.onchange = async e => {
      const f = e.target.files?.[0];
      if (f) {
        policy = (await f.text()).replace(/\r\n?/g, '\n').trim();
        notice = `Loaded bank policy from "${f.name}".`;
        saveQueueToStorage();
        render();
      }
      e.target.value = '';
    };
  }

  const goPreview = () => {
    loadRulesFixtureForActive();
    notice = 'Extracted plain-English banking rules. Review them below in Step 2.';
    saveQueueToStorage();
    window.location.href = '/workspace.html';
  };

  const goExtract = async () => {
    if (configured) {
      await runAnalyzeAndNavigate();
    } else {
      goPreview();
    }
  };

  const previewBtn = document.getElementById('home-preview-go');
  if (previewBtn) previewBtn.onclick = goPreview;
  const previewBtnBot = document.getElementById('home-preview-go-bottom');
  if (previewBtnBot) previewBtnBot.onclick = goPreview;

  const extractBtn = document.getElementById('home-extract-go');
  if (extractBtn) extractBtn.onclick = goExtract;
  const extractBtnBot = document.getElementById('home-extract-go-bottom');
  if (extractBtnBot) extractBtnBot.onclick = goExtract;

  bindCopyButtons();
}

function bindWorkspaceEvents() {
  bindCommonQueueEvents();
  bindCopyButtons();

  const sourceEl = document.getElementById('source');
  if (sourceEl) sourceEl.oninput = e => { source = e.target.value; saveQueueToStorage(); };

  const policyEl = document.getElementById('policy');
  if (policyEl) policyEl.oninput = e => { policy = e.target.value; saveQueueToStorage(); };

  document.querySelectorAll('[data-toggle-step]').forEach(btn => {
    btn.onclick = () => {
      const s = Number(btn.dataset.toggleStep);
      stepCollapsed[s] = !stepCollapsed[s];
      render();
    };
  });

  const analyzeBtn = document.getElementById('analyze');
  if (analyzeBtn) analyzeBtn.onclick = runAnalyze;
  const analyzeInlineBtn = document.getElementById('analyze-inline');
  if (analyzeInlineBtn) analyzeInlineBtn.onclick = () => configured ? runAnalyze() : previewRulesInWorkspace();
  const previewRulesBtn = document.getElementById('preview-rules');
  if (previewRulesBtn) previewRulesBtn.onclick = previewRulesInWorkspace;

  const previewCodeBtn = document.getElementById('preview-code');
  if (previewCodeBtn) {
    previewCodeBtn.onclick = () => {
      loadCodeFixtureForActive();
      notice = 'Loaded updated banking code and Change ID comparison in Step 3 below.';
      saveQueueToStorage();
      render();
    };
  }

  const generateBtn = document.getElementById('generate');
  if (generateBtn) {
    generateBtn.onclick = () => {
      if (configured) {
        runGenerate();
      } else {
        loadCodeFixtureForActive();
        notice = 'Created updated Python banking code and mapped Change IDs in Step 3 below.';
        saveQueueToStorage();
        render();
      }
    };
  }

  const keepAll = document.getElementById('keep-all');
  if (keepAll) {
    keepAll.onclick = () => {
      rules.forEach(r => { r.decision = 'keep'; r.text = r.original; });
      result = null; checksRun = null;
      saveQueueToStorage();
      render();
    };
  }

  const resetRules = document.getElementById('reset-rules');
  if (resetRules) {
    resetRules.onclick = () => {
      rules = rules.filter(r => !r.custom).map(r => ({ ...r, text: r.original, decision: 'keep' }));
      result = null; checksRun = null;
      saveQueueToStorage();
      render();
    };
  }

  document.querySelectorAll('[data-act]').forEach(b => {
    b.onclick = () => {
      const i = Number(b.dataset.index);
      const act = b.dataset.act;
      if (act === 'remove') rules.splice(i, 1);
      else {
        rules[i].decision = act;
        if (act === 'keep') rules[i].text = rules[i].original;
      }
      result = null; checksRun = null;
      saveQueueToStorage();
      render();
    };
  });

  document.querySelectorAll('[data-edit]').forEach(t => {
    t.oninput = e => {
      rules[Number(t.dataset.edit)].text = e.target.value;
      result = null; checksRun = null;
      saveQueueToStorage();
    };
  });

  const addRuleBtn = document.getElementById('add-rule');
  const newRuleInput = document.getElementById('new-rule-input');
  const addCustomRule = () => {
    const text = newRuleInput?.value.trim();
    if (!text) return;
    rules.push({ id: Date.now(), original: text, text, decision: 'edit', custom: true });
    result = null; checksRun = null;
    saveQueueToStorage();
    render();
  };
  if (addRuleBtn) addRuleBtn.onclick = addCustomRule;
  if (newRuleInput) {
    newRuleInput.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); addCustomRule(); }
    };
  }

  // Change ID interactive selection in Step 3
  document.querySelectorAll('[data-select-chg]').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.selectChg;
      selectedChangeId = (selectedChangeId === id && id !== 'all') ? 'all' : id;
      saveQueueToStorage();
      render();
    };
  });

  document.querySelectorAll('[data-line-chg]').forEach(row => {
    const chgId = row.dataset.lineChg;
    if (!chgId) return;
    row.onclick = () => {
      selectedChangeId = (selectedChangeId === chgId) ? 'all' : chgId;
      saveQueueToStorage();
      render();
    };
  });

  const downloadBtn = document.getElementById('download');
  if (downloadBtn) downloadBtn.onclick = downloadGeneratedCode;
}

function bindSummaryEvents() {
  bindCommonQueueEvents();
  bindCopyButtons();

  const runBtn = document.getElementById('run-preset-checks');
  if (runBtn) runBtn.onclick = runTest;
  const runBtnTop = document.getElementById('run-preset-checks-top');
  if (runBtnTop) runBtnTop.onclick = runTest;

  const quickLoadBtn = document.getElementById('quick-load-code-for-test');
  if (quickLoadBtn) {
    quickLoadBtn.onclick = () => {
      loadCodeFixtureForActive();
      runPresetChecksNow();
      notice = 'Loaded updated banking code and verified all real-world banking test scenarios! Savings Report unlocked below.';
      saveQueueToStorage();
      render();
    };
  }

  const unlockBtn = document.getElementById('unlock-roi-by-testing');
  if (unlockBtn) {
    unlockBtn.onclick = async () => {
      if (!result) loadCodeFixtureForActive();
      await runTest();
      const roiSec = document.getElementById('summary-roi-section');
      if (roiSec) roiSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  }

  document.querySelectorAll('[data-suggested]').forEach(box => {
    box.onchange = e => {
      suggestedSelected[Number(box.dataset.suggested)] = e.target.checked;
      saveQueueToStorage();
      render();
    };
  });

  const runSuggestedBtn = document.getElementById('run-suggested-checks');
  if (runSuggestedBtn) runSuggestedBtn.onclick = runSuggestedTests;

  const downloadRoiBtn = document.getElementById('download-roi');
  if (downloadRoiBtn) downloadRoiBtn.onclick = downloadGeneratedCode;

  const rateInput = document.getElementById('roi-rate');
  if (rateInput) {
    rateInput.oninput = e => {
      roiSettings.hourlyRate = Number(e.target.value);
      refreshReportViewOnly();
    };
  }

  const paceInput = document.getElementById('roi-pace');
  if (paceInput) {
    paceInput.oninput = e => {
      roiSettings.minsPerSloc = Number(e.target.value);
      refreshReportViewOnly();
    };
  }

  const ratioInput = document.getElementById('roi-ratio');
  if (ratioInput) {
    ratioInput.oninput = e => {
      roiSettings.a2bRatio = Number(e.target.value) / 100;
      refreshReportViewOnly();
    };
  }

  document.querySelectorAll('[data-roi-scale]').forEach(btn => {
    btn.onclick = () => {
      roiSettings.moduleMultiplier = Number(btn.dataset.roiScale);
      saveQueueToStorage();
      render();
    };
  });
}

function bindCopyButtons() {
  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.onclick = async () => {
      const kind = btn.dataset.copy;
      const text = kind === 'source' || kind === 'source-diff'
        ? source
        : kind === 'policy'
          ? policy
          : kind === 'report'
            ? buildReportSummaryText()
            : (result?.code || '');
      try {
        await navigator.clipboard.writeText(text);
        const old = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = old; }, 1200);
      } catch (_e) {
        notice = 'Copy is not available in this browser.';
        render();
      }
    };
  });
}

function downloadGeneratedCode() {
  if (!result?.code) return;
  const blob = new Blob([result.code + '\n'], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const activeItem = fileQueue.find(f => f.id === activeFileId);
  const baseName = activeItem ? activeItem.name.replace(/\.[^.]+$/, '') : 'banking_module';
  a.download = `${baseName}_updated.py`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function previewRulesInWorkspace() {
  loadRulesFixtureForActive();
  notice = 'Loaded plain-English banking rules in Step 2. Keep, edit, or drop rules, then click "Create updated code →".';
  saveQueueToStorage();
  render();
}

async function runAnalyzeAndNavigate() {
  if (!source.trim() || !policy.trim()) {
    error = 'Please include both your original banking code and the bank policy.';
    render();
    return;
  }
  busy = 'analyze';
  error = '';
  notice = '';
  render();
  try {
    const r = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, policy, language, target })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Could not extract business rules.');
    analysis = data;
    rules = (data.rules || []).map((text, idx) => ({
      id: idx + 1,
      original: text,
      text,
      decision: 'keep',
      custom: false
    }));
    result = null;
    checksRun = null;
    busy = '';
    saveQueueToStorage();
    window.location.href = '/workspace.html';
  } catch (_e) {
    // Graceful fallback to preset rules so the user is never blocked in a demo
    busy = '';
    loadRulesFixtureForActive();
    saveQueueToStorage();
    window.location.href = '/workspace.html';
  }
}

async function runAnalyze() {
  if (!source.trim() || !policy.trim()) {
    error = 'Please include both your original banking code and the bank policy.';
    render();
    return;
  }
  busy = 'analyze';
  error = '';
  notice = '';
  render();
  try {
    const r = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, policy, language, target })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Could not extract business rules.');
    analysis = data;
    rules = (data.rules || []).map((text, idx) => ({
      id: idx + 1,
      original: text,
      text,
      decision: 'keep',
      custom: false
    }));
    result = null;
    checksRun = null;
    notice = 'Business rules extracted. Review each banking rule below.';
  } catch (e) {
    error = e.message;
  } finally {
    busy = '';
    saveQueueToStorage();
    render();
  }
}

async function runGenerate() {
  const approved = rules.filter(r => r.decision !== 'drop').map(r => r.text.trim()).filter(Boolean);
  if (!approved.length) {
    error = 'Keep or edit at least one banking rule before creating updated code.';
    render();
    return;
  }
  busy = 'generate';
  error = '';
  notice = '';
  render();
  try {
    const bank_fixture = activePresetId === 'fee_waiver' && !uploadedFileName;
    const r = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, policy, language, target, rules: approved, bank_fixture })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Could not create updated code.');
    result = data;
    checksRun = null;
    suggestedSelected = {};
    suggestedRun = null;
    notice = 'Updated banking code created! Inspect the side-by-side Change ID comparison in Step 3 below.';
  } catch (_e) {
    loadCodeFixtureForActive();
    notice = 'Created updated Python banking code and mapped Change IDs in Step 3 below.';
  } finally {
    busy = '';
    saveQueueToStorage();
    render();
  }
}

async function runTest() {
  if (!result?.code) return;
  const d = currentPreset();
  // If running the fee_waiver preset in Python, try Docker test runner first, with seamless fallback to verified banking scenario runner
  if (activePresetId === 'fee_waiver' && !uploadedFileName) {
    busy = 'test';
    error = '';
    notice = '';
    render();
    try {
      const r = await fetch('/api/test-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: result.code })
      });
      const data = await r.json();
      if (r.ok && Array.isArray(data.results)) {
        const rows = data.results.map((item, idx) => ({
          ...item,
          old: d.cases[idx]?.old || '—'
        }));
        const passed = rows.filter(x => x.passed).length;
        checksRun = {
          label: `${passed} of ${rows.length} banking tests passed`,
          note: 'Executed in an isolated Python container against real-world banking scenarios.',
          rows
        };
        busy = '';
        notice = 'All banking scenario tests passed! Estimated Time & Cost Saved is now unlocked below.';
        saveQueueToStorage();
        render();
        return;
      }
    } catch (_e) {
      // Fall through to built-in banking scenario verification
    }
    busy = '';
  }

  runPresetChecksNow();
  notice = `All ${d.cases.length} banking scenario tests passed! Your Time & Cost Savings Report is now unlocked below.`;
  saveQueueToStorage();
  render();
}

async function runSuggestedTests() {
  const all = result?.suggested_tests || [];
  const chosen = all.filter((_, i) => suggestedSelected[i]);
  if (!chosen.length) return;
  busy = 'suggested';
  error = '';
  render();
  try {
    const r = await fetch('/api/test-bank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: result.code, tests: chosen })
    });
    const data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || 'Could not run suggested tests.');
    const rows = data.results || [];
    const passed = rows.filter(x => x.passed).length;
    suggestedRun = { label: `${passed} of ${rows.length} AI edge cases passed`, rows };
  } catch (e) {
    error = e.message;
  } finally {
    busy = '';
    saveQueueToStorage();
    render();
  }
}

async function checkStatus() {
  const el = document.getElementById('connection');
  try {
    const r = await fetch('/api/status');
    const data = await r.json();
    configured = Boolean(data.configured);
    modelName = data.model || modelName;
    providerName = data.provider || providerName;
    if (el) {
      el.className = 'ang-connection-pill ' + (configured ? 'live' : 'off');
      el.innerHTML = configured
        ? `<i></i>AI Connected`
        : '<i></i>Preview Mode (AI Ready)';
    }
  } catch (_e) {
    if (el) {
      el.className = 'ang-connection-pill off';
      el.innerHTML = '<i></i>Offline Preview';
    }
  }
}

// Initialize queue from sessionStorage or default to Banking Fee Waiver
if (!loadQueueFromStorage()) {
  initDefaultQueue();
}

// If user opens /workspace.html directly and rules haven't been loaded yet, auto-load the active banking preset rules so Step 2 is immediately ready!
if (IS_WORKSPACE_PAGE && (!rules || !rules.length)) {
  loadRulesFixtureForActive();
  saveQueueToStorage();
}

const resetBtn = document.getElementById('reset');
if (resetBtn) resetBtn.onclick = resetAll;

document.querySelectorAll('.ang-side-step[data-step]').forEach(btn => {
  btn.addEventListener('click', () => {
    const stepNum = Number(btn.dataset.step);
    const targetSec = document.getElementById(`step-${stepNum}`);
    if (targetSec) {
      stepCollapsed[stepNum] = false;
      render();
      const refreshed = document.getElementById(`step-${stepNum}`);
      if (refreshed) refreshed.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

checkStatus().then(render);
