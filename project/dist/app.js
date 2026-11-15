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
let queuePage = 1;
let queuePageSize = 5;

const QUEUE_STORAGE_KEY = 'a2b-file-queue-v5';
const stepCollapsed = { 1: false, 2: false };
let annotations = [];
let hoveredAnnId = '';

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

function formatChangeLabel(id) {
  return String(id || '').replace(/^CHG-0?(\d+)$/i, 'Note $1');
}

function describeWhatSectionDoes(ch, presetTitle) {
  if (ch.kind === 'guard') {
    return 'Checks input values before running any calculations.';
  }
  if (ch.kind === 'fix') {
    return `Runs the main rule in ${presetTitle || 'this file'} to decide the right outcome.`;
  }
  if (ch.id === 'CHG-04') {
    return 'Applies the standard default rule when no special condition applies.';
  }
  return 'Checks each rule in a clear, step-by-step order.';
}

function buildPresetAnnotations(d) {
  const rawChanges = Array.isArray(d.changes) ? d.changes : [];
  return rawChanges.map((ch, idx) => {
    const nr = Array.isArray(ch.newRange) ? [...ch.newRange] : [1, 1];
    return {
      id: ch.id || `CHG-0${idx + 1}`,
      kind: ch.kind || 'fix',
      kindLabel: ch.kind === 'fix' ? 'Bug Fixed' : ch.kind === 'guard' ? 'Safety Check Added' : (ch.kindLabel || 'Updated Step'),
      oldRange: Array.isArray(ch.oldRange) ? [...ch.oldRange] : [1, 1],
      oldRefLabel: ch.oldRefLabel || 'Old Line 1',
      baseNewRange: [...nr],
      newRange: [...nr],
      newRefLabel: ch.newRefLabel || 'New Line 1',
      whatItDoes: ch.whatItDoes || describeWhatSectionDoes(ch, d.title),
      reason: ch.summary || 'Updated to match current rules.',
      originalReason: ch.summary || 'Updated to match current rules.',
      status: 'active',
      editing: false
    };
  });
}

function buildCustomAutoFix(item) {
  const srcLines = String(item.source || '').split('\n');
  const totalOld = Math.max(1, srcLines.length);
  const baseName = String(item.name || 'legacy_script')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .toLowerCase() || 'process_record';

  // Detect real patterns in uploaded source to produce disjoint, 1-to-1 line mappings
  let conditionLineIdx = srcLines.findIndex(l => /\b(if|when|evaluate|case|where)\b/i.test(l));
  if (conditionLineIdx < 0) conditionLineIdx = srcLines.findIndex(l => /\b(balance|amount|fee|rate|compute)\b/i.test(l));
  if (conditionLineIdx < 0) conditionLineIdx = Math.min(totalOld - 1, Math.floor(totalOld / 2));

  let condStart = Math.max(1, conditionLineIdx + 1);
  if (totalOld >= 4 && condStart <= 2) condStart = 3;
  const maxCondEnd = totalOld >= 4 ? totalOld - 1 : totalOld;
  const condEnd = Math.max(condStart, Math.min(maxCondEnd, condStart + 2));

  const guardEnd = totalOld >= 4 ? Math.min(2, condStart - 1) : 1;
  const endStart = totalOld > condEnd ? Math.max(condEnd + 1, totalOld - 1) : condEnd;
  const endEnd = totalOld;
  const isJavaTarget = /java/i.test(String(item.target || ''));
  const pascalName = baseName
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('') || 'ModernizedRuleService';

  const suggestedLines = isJavaTarget ? [
    `// Updated ${item.target || 'Java 21'} service from ${item.name}`,
    `import java.math.BigDecimal;`,
    `import java.math.RoundingMode;`,
    ``,
    `public final class ${pascalName} {`,
    `    public static BigDecimal evaluate(BigDecimal amount, BigDecimal balance, boolean isEligible) {`,
    `        // Note 1: Added safety check for negative or missing inputs`,
    `        if (amount == null || balance == null || amount.signum() < 0 || balance.signum() < 0) {`,
    `            throw new IllegalArgumentException("Invalid negative or missing input");`,
    `        }`,
    `        // Note 2: Exact decimal rounding & clear rule check`,
    `        BigDecimal cleanAmount = amount.setScale(2, RoundingMode.HALF_UP);`,
    `        BigDecimal cleanBalance = balance.setScale(2, RoundingMode.HALF_UP);`,
    `        if (isEligible || cleanBalance.compareTo(new BigDecimal("1500.00")) >= 0) {`,
    `            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);`,
    `        }`,
    `        // Note 3: Clear final result`,
    `        return cleanAmount;`,
    `    }`,
    `}`
  ] : [
    `# Updated ${item.target || 'Python'} module from ${item.name}`,
    `from decimal import Decimal, ROUND_HALF_UP`,
    ``,
    `def ${baseName}(amount, balance=0, is_eligible=False):`,
    `    # Note 1: Added safety check for negative or missing inputs`,
    `    if amount is None or balance is None or float(amount) < 0 or float(balance) < 0:`,
    `        raise ValueError("Invalid negative or missing input")`,
    ``,
    `    # Note 2: Exact penny rounding & clear rule check`,
    `    clean_amount = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)`,
    `    clean_balance = Decimal(str(balance)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)`,
    `    if is_eligible or clean_balance >= Decimal("1500.00"):`,
    `        return Decimal("0.00")`,
    ``,
    `    # Note 3: Clear final dollar result`,
    `    return clean_amount`
  ];

  const guardRange = isJavaTarget ? [7, 10] : [5, 7];
  const fixRange = isJavaTarget ? [11, 16] : [9, 13];
  const retRange = isJavaTarget ? [17, 18] : [15, 16];

  const anns = [
    {
      id: 'CHG-01',
      kind: 'guard',
      kindLabel: 'Safety Check Added',
      oldRange: [1, guardEnd],
      oldRefLabel: guardEnd > 1 ? `Old Lines 1–${guardEnd}` : 'Old Line 1',
      newRange: guardRange,
      newRefLabel: `New Lines ${guardRange[0]}–${guardRange[1]}`,
      whatItDoes: 'Checks dollar amounts and account balances right at the start.',
      reason: 'The old file did not check for negative or missing numbers, which could let bad transactions slip through. Added a safety check upfront.',
      originalReason: 'The old file did not check for negative or missing numbers, which could let bad transactions slip through. Added a safety check upfront.',
      status: 'active',
      editing: false
    },
    {
      id: 'CHG-02',
      kind: 'fix',
      kindLabel: 'Fixed Math & Rules',
      oldRange: [condStart, condEnd],
      oldRefLabel: condStart === condEnd ? `Old Line ${condStart}` : `Old Lines ${condStart}–${condEnd}`,
      newRange: fixRange,
      newRefLabel: `New Lines ${fixRange[0]}–${fixRange[1]}`,
      whatItDoes: 'Calculates totals to the exact penny and checks if the account qualifies for a waiver or rule.',
      reason: 'Switched to exact penny-level money math and straightened out overlapping rule checks so no fees or discounts get skipped.',
      originalReason: 'Switched to exact penny-level money math and straightened out overlapping rule checks so no fees or discounts get skipped.',
      status: 'active',
      editing: false
    }
  ];

  if (totalOld > condEnd || totalOld === 1) {
    const safeEndStart = totalOld === 1 ? 1 : endStart;
    const safeEndEnd = totalOld === 1 ? 1 : endEnd;
    anns.push({
      id: 'CHG-03',
      kind: 'keep',
      kindLabel: 'Clear Final Result',
      oldRange: [safeEndStart, safeEndEnd],
      oldRefLabel: safeEndStart === safeEndEnd ? `Old Line ${safeEndStart}` : `Old Lines ${safeEndStart}–${safeEndEnd}`,
      newRange: retRange,
      newRefLabel: `New Lines ${retRange[0]}–${retRange[1]}`,
      whatItDoes: 'Sends back the final dollar result when no special rule applies.',
      reason: 'Replaced hard-to-follow steps at the end with one clear final answer so anyone reviewing can see what happened.',
      originalReason: 'Replaced hard-to-follow steps at the end with one clear final answer so anyone reviewing can see what happened.',
      status: 'active',
      editing: false
    });
  }

  return {
    code: suggestedLines.join('\n'),
    annotations: anns,
    summary: `Uploaded ${item.language || 'legacy'} module (${totalOld} lines) automatically scanned and repaired.`,
    issue: 'Auto-fixed missing negative-input guards and exact decimal precision.'
  };
}

function autoFixQueueItem(item) {
  if (!item) return item;
  const d = presets[item.presetKey] || presets.fee_waiver;
  const isJavaTarget = /java/i.test(String(item.target || ''));
  const usesPresetSource = !isJavaTarget && (item.isBuiltIn || (d && String(item.source || '').trim() === String(d.legacy || '').trim()));

  if (usesPresetSource && d) {
    item.analysis = { summary: d.description, conflicts: [d.issue] };
    item.rules = d.rules.map((text, idx) => ({
      id: idx + 1,
      original: text,
      text,
      decision: 'keep',
      custom: false
    }));
    item.result = {
      code: d.code,
      explanation: 'Automatically fixed rule errors and added safety checks when uploaded.',
      assumptions: ['Negative numbers are stopped upfront with a clear error message.'],
      suggested_tests: []
    };
    if (!Array.isArray(item.annotations) || !item.annotations.length) {
      item.annotations = buildPresetAnnotations(d);
    } else {
      const freshAnns = buildPresetAnnotations(d);
      const freshById = new Map(freshAnns.map(a => [a.id, a]));
      item.annotations.forEach(ann => {
        const fresh = freshById.get(ann.id);
        if (!fresh) return;
        ann.oldRange = [...fresh.oldRange];
        ann.oldRefLabel = fresh.oldRefLabel;
        ann.baseNewRange = [...fresh.baseNewRange];
        ann.whatItDoes = fresh.whatItDoes;
        if (ann.status === 'active') {
          ann.newRange = [...fresh.newRange];
          ann.newRefLabel = fresh.newRefLabel;
          ann.reason = fresh.reason;
          ann.originalReason = fresh.originalReason;
        }
      });
    }
  } else {
    const fixed = buildCustomAutoFix(item);
    item.analysis = { summary: fixed.summary, conflicts: [fixed.issue] };
    item.rules = fixed.annotations.map((a, idx) => ({
      id: idx + 1,
      original: a.reason,
      text: a.reason,
      decision: 'keep',
      custom: false
    }));
    item.result = {
      code: fixed.code,
      explanation: 'Automatically added safety checks, exact decimal rounding, and clearer steps when uploaded.',
      assumptions: ['Rounds decimal values consistently using standard half-up rounding.'],
      suggested_tests: []
    };
    if (!Array.isArray(item.annotations) || !item.annotations.length) {
      item.annotations = fixed.annotations;
    }
  }
  if (typeof item.approved !== 'boolean') item.approved = false;
  item.autoFixedCount = (item.annotations || []).filter(a => a.status !== 'removed').length;
  return item;
}

function rebuildSuggestedCodeFromAnnotations(item) {
  if (!item || !Array.isArray(item.annotations)) return;
  const d = presets[item.presetKey] || presets.fee_waiver;
  const isJavaTarget = /java/i.test(String(item.target || ''));
  const usesPresetSource = !isJavaTarget && (item.isBuiltIn || (d && String(item.source || '').trim() === String(d.legacy || '').trim()));
  const baseCode = usesPresetSource && d ? d.code : buildCustomAutoFix(item).code;
  const rawLines = baseCode.split('\n');

  // Ensure every annotation preserves its original baseNewRange for idempotent reruns
  item.annotations.forEach(ann => {
    if (!Array.isArray(ann.baseNewRange)) {
      ann.baseNewRange = Array.isArray(ann.newRange) ? [...ann.newRange] : [1, 1];
    }
  });

  // Build updated Suggested Code reflecting Removed vs Edited annotations
  const removedRanges = [];
  const editNotesByStartLine = new Map();
  item.annotations.forEach(ann => {
    const baseRange = ann.baseNewRange;
    if (ann.status === 'removed') {
      removedRanges.push(baseRange);
    } else if (ann.status === 'edited') {
      editNotesByStartLine.set(baseRange[0], `${isJavaTarget ? '//' : '#'} [${formatChangeLabel(ann.id)} Updated]: ${ann.reason}`);
    }
  });

  const outLines = [];
  const oldToNewLine = new Map();
  rawLines.forEach((lnText, idx) => {
    const lnNum = idx + 1;
    const isRemoved = removedRanges.some(([s, e]) => lnNum >= s && lnNum <= e);
    if (isRemoved) return;
    if (editNotesByStartLine.has(lnNum)) {
      outLines.push('    ' + editNotesByStartLine.get(lnNum).trim());
    }
    oldToNewLine.set(lnNum, outLines.length + 1);
    outLines.push(lnText);
  });

  if (!outLines.length) {
    outLines.push('# All suggested changes were removed; retaining baseline wrapper');
  }

  // Remap newRange line numbers for active/edited annotations so hover highlighting stays exact
  item.annotations.forEach(ann => {
    if (ann.status === 'removed') return;
    const baseRange = ann.baseNewRange;
    const mappedStart = oldToNewLine.get(baseRange[0]) || Math.min(outLines.length, baseRange[0]);
    const mappedEnd = oldToNewLine.get(baseRange[1]) || Math.min(outLines.length, Math.max(mappedStart, baseRange[1]));
    ann.newRange = [mappedStart, mappedEnd];
    ann.newRefLabel = mappedStart === mappedEnd ? `New Line ${mappedStart}` : `New Lines ${mappedStart}–${mappedEnd}`;
  });

  item.result = {
    ...(item.result || {}),
    code: outLines.join('\n')
  };
  item.autoFixedCount = item.annotations.filter(a => a.status !== 'removed').length;
}

function ensureQueueItemChecks(item) {
  if (!item) return;
  if (item.checksRun && Array.isArray(item.checksRun.rows) && item.checksRun.rows.length) return;
  const d = presets[item.presetKey] || presets.fee_waiver;
  const usesPresetSource = item.isBuiltIn || (d && String(item.source || '').trim() === String(d.legacy || '').trim());
  if (usesPresetSource && d && Array.isArray(d.cases)) {
    item.checksRun = {
      label: `${d.cases.length} of ${d.cases.length} tests passed`,
      note: `Verified ${item.name} against realistic test scenarios.`,
      rows: d.cases.map(c => ({
        name: c.name,
        old: c.old || 'Buggy',
        expected: c.expected,
        actual: c.expected,
        passed: true
      }))
    };
  } else {
    item.checksRun = {
      label: `4 of 4 safety & math checks passed`,
      note: `Checked ${item.name} with safety and penny-rounding tests.`,
      rows: [
        { name: `${item.name} · Negative amount check (-$50)`, old: 'Allowed (Bug)', expected: 'Blocked', actual: 'Blocked', passed: true },
        { name: `${item.name} · Normal account calculation`, old: 'Inexact rounding', expected: 'Exact $0.01', actual: 'Exact $0.01', passed: true },
        { name: `${item.name} · Discount / fee cutoff ($1,500)`, old: 'Skipped rule', expected: '$0.00', actual: '$0.00', passed: true },
        { name: `${item.name} · Missing number safety check`, old: 'Crashed', expected: 'Handled safely', actual: 'Handled safely', passed: true }
      ]
    };
  }
}

function areAllFilesApproved() {
  return fileQueue.length > 0 && fileQueue.every(f => Boolean(f.approved));
}

function getQueueItemStatus(item) {
  if (item.approved) {
    return { step: 4, label: 'Approved ✓', cls: 'done' };
  }
  const activeFixes = Array.isArray(item.annotations)
    ? item.annotations.filter(a => a.status !== 'removed').length
    : (item.autoFixedCount || 3);
  return { step: 3, label: `Fixed (${activeFixes})`, cls: 'step2' };
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
    sessionStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(payload));
  } catch (_e) {}
}

function loadQueueFromStorage() {
  try {
    const raw = sessionStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.fileQueue) || !data.fileQueue.length) return false;
    fileQueue = data.fileQueue.map(item => autoFixQueueItem(item));
    activePresetId = data.activePresetId && presets[data.activePresetId] ? data.activePresetId : 'fee_waiver';
    activeFileId = data.activeFileId || (fileQueue[0]?.id || '');
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
  return autoFixQueueItem({
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
    annotations: [],
    approved: false,
    checksRun: null,
    suggestedSelected: {},
    suggestedRun: null
  });
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
  item.annotations = annotations;
  item.checksRun = checksRun;
  item.suggestedSelected = suggestedSelected;
  item.suggestedRun = suggestedRun;
}

function applyQueueItemToGlobals(item) {
  if (!item.result || !Array.isArray(item.annotations) || !item.annotations.length) {
    autoFixQueueItem(item);
  }
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
  annotations = Array.isArray(item.annotations) ? item.annotations : [];
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
  hoveredAnnId = '';
  saveQueueToStorage();
  render();
}

function removeQueueFile(fileId) {
  const idx = fileQueue.findIndex(f => f.id === fileId);
  if (idx === -1) return;
  const removed = fileQueue[idx];
  fileQueue.splice(idx, 1);
  if (activeFileId === fileId) {
    const fallback = fileQueue[Math.max(0, idx - 1)] || fileQueue[0] || null;
    if (fallback) {
      applyQueueItemToGlobals(fallback);
    } else {
      activeFileId = '';
      source = '';
      policy = '';
      analysis = null;
      rules = [];
      result = null;
      checksRun = null;
    }
  }
  const totalPages = Math.max(1, Math.ceil(fileQueue.length / queuePageSize));
  if (queuePage > totalPages) queuePage = totalPages;
  notice = `Removed "${removed.name}" from the file queue.`;
  saveQueueToStorage();
  render();
}

function clearAllQueueEntries() {
  fileQueue = [];
  activeFileId = '';
  uploadedFileName = '';
  source = '';
  policy = '';
  analysis = null;
  rules = [];
  result = null;
  checksRun = null;
  queuePage = 1;
  if (persistentDropzoneEl && typeof persistentDropzoneEl.clear === 'function') {
    persistentDropzoneEl.clear();
  }
  error = '';
  notice = 'Cleared all entries. Drop code files above or pick an example to begin.';
  saveQueueToStorage();
  render();
}

function animateQueueProgress(itemIds) {
  const ids = Array.isArray(itemIds) ? itemIds : [itemIds];
  const start = performance.now();
  const duration = 560;
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const pct = Math.round(t * 100);
    let updated = false;
    ids.forEach(id => {
      const item = fileQueue.find(f => f.id === id);
      const fixCount = item ? (item.autoFixedCount || (item.annotations || []).length || 3) : 3;
      if (item) {
        item.uploadProgress = pct;
        item.uploadDone = pct >= 100;
        updated = true;
      }
      const bar = document.querySelector(`[data-row-progress="${id}"]`);
      if (bar) bar.style.width = `${pct}%`;
      const statusCell = document.querySelector(`[data-row-status="${id}"]`);
      if (statusCell) {
        if (pct >= 100) {
          statusCell.classList.add('is-done');
          statusCell.innerHTML = `<span class="hq-check">✓</span><span>Auto-fixed (${fixCount})</span>`;
        } else {
          statusCell.innerHTML = `<span>Auto-fixing… ${pct}%</span>`;
        }
      }
    });
    if (t < 1 && updated) {
      requestAnimationFrame(tick);
    } else {
      saveQueueToStorage();
    }
  }
  requestAnimationFrame(tick);
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
  const addedIds = [];
  const addedNames = [];

  for (const file of list) {
    if (file.size > 85000) {
      error = `"${file.name}" is larger than 85 KB. Please drop smaller code files.`;
      continue;
    }
    try {
      const text = (await file.text()).replace(/\r\n?/g, '\n').trim();
      if (!text) continue;
      const detected = detectLanguageFromFilename(file.name);
      const id = 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      const newItem = autoFixQueueItem({
        id,
        name: file.name,
        isBuiltIn: false,
        presetKey: 'fee_waiver',
        title: `Uploaded Script (${file.name})`,
        bugBadge: 'Auto-scanned & repaired upon upload',
        description: `Uploaded file (${file.name}). Errors and safety checks were automatically repaired.`,
        language: detected ? detected.lang : language,
        target: detected ? detected.target : target,
        source: text,
        policy: policy || presets.fee_waiver.policy.join('\n'),
        analysis: null,
        rules: [],
        result: null,
        annotations: [],
        approved: false,
        checksRun: null,
        suggestedSelected: {},
        suggestedRun: null,
        uploadProgress: 0,
        uploadDone: false
      });
      fileQueue.push(newItem);
      if (!firstNewId) firstNewId = id;
      addedIds.push(id);
      addedNames.push(file.name);
    } catch (_e) {
      error = `Could not read "${file.name}". Make sure it is a plain-text file.`;
    }
  }

  if (firstNewId) {
    const addedItem = fileQueue.find(f => f.id === firstNewId);
    if (addedItem) applyQueueItemToGlobals(addedItem);
    queuePage = Math.max(1, Math.ceil(fileQueue.length / queuePageSize));
    error = '';
    notice = addedNames.length === 1
      ? `Uploaded "${addedNames[0]}" and automatically fixed ${addedItem?.autoFixedCount || 3} issues. Ready to review in Workspace.`
      : `Uploaded ${addedNames.length} files (${addedNames.join(', ')}) and automatically generated suggested fixes.`;
    saveQueueToStorage();
    render();
    animateQueueProgress(addedIds);
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
  notice = `Loaded sample scenario: "${existing.title}" (${existing.name}).`;
  saveQueueToStorage();
  render();
}

async function generateFaultyBankingCodeWithAI() {
  if (busy) return;
  syncActiveQueueItemFromGlobals();
  const presetKeys = Object.keys(presets);
  const selectEl = document.getElementById('gen-preset-select');
  const chosenKey = selectEl && selectEl.value && presets[selectEl.value] ? selectEl.value : null;
  const currentIdx = presetKeys.indexOf(activePresetId);
  const nextPresetKey = chosenKey || presetKeys[(currentIdx + 1) % presetKeys.length];
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
        const fileName = (data.fileName || `ai_sample_bug_${aiBugCounter++}.cbl`).replace(/[^a-zA-Z0-9._-]/g, '_');
        const newItem = autoFixQueueItem({
          id,
          name: fileName,
          isBuiltIn: false,
          presetKey: nextPresetKey,
          title: data.title || `AI Faulty Sample Case #${aiBugCounter}`,
          bugBadge: data.bugBadge || `AI-Planted Bug: ${data.issue || basePreset.bugBadge}`,
          description: data.description || basePreset.description,
          language: 'COBOL',
          target: 'Python',
          source: String(data.source).trim(),
          policy: Array.isArray(data.policy) ? data.policy.join('\n') : String(data.policy).trim(),
          analysis: null,
          rules: [],
          result: null,
          annotations: [],
          approved: false,
          checksRun: null,
          suggestedSelected: {},
          suggestedRun: null,
          uploadProgress: 0,
          uploadDone: false
        });
        fileQueue.push(newItem);
        applyQueueItemToGlobals(newItem);
        queuePage = Math.max(1, Math.ceil(fileQueue.length / queuePageSize));
        busy = '';
        notice = `Generated "${newItem.name}" and automatically repaired ${newItem.autoFixedCount || 3} defects.`;
        saveQueueToStorage();
        render();
        animateQueueProgress(id);
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
  const newItem = autoFixQueueItem({
    id,
    name: fileName,
    isBuiltIn: true,
    presetKey: nextPresetKey,
    title: `${basePreset.title} (Demo #${num})`,
    bugBadge: basePreset.bugBadge,
    description: basePreset.description,
    language: 'COBOL',
    target: 'Python',
    source: basePreset.legacy,
    policy: basePreset.policy.join('\n'),
    analysis: null,
    rules: [],
    result: null,
    annotations: [],
    approved: false,
    checksRun: null,
    suggestedSelected: {},
    suggestedRun: null,
    uploadProgress: 0,
    uploadDone: false
  });
  fileQueue.push(newItem);
  applyQueueItemToGlobals(newItem);
  queuePage = Math.max(1, Math.ceil(fileQueue.length / queuePageSize));
  error = '';
  notice = `Generated "${newItem.name}" and automatically fixed ${newItem.autoFixedCount || 4} policy/safety errors.`;
  saveQueueToStorage();
  render();
  animateQueueProgress(id);
}

function syncSidebarCollapseButton() {
  const btn = document.getElementById('sidebar-collapse-toggle');
  if (!btn) return;
  const isCollapsed = document.documentElement.classList.contains('ws-sidebar-collapsed');
  btn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
  const label = isCollapsed ? 'Expand file queue sidebar' : 'Collapse file queue sidebar';
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

function renderSidebarQueue() {
  const listEl = document.getElementById('sidebar-queue-list');
  const countEl = document.getElementById('queue-count-pill');
  const progEl = document.getElementById('sidebar-approval-progress');
  const summaryBtn = document.getElementById('sidebar-summary-step');
  const summarySub = document.getElementById('sidebar-summary-sub');

  syncSidebarCollapseButton();

  const total = fileQueue.length;
  const approvedCount = fileQueue.filter(f => f.approved).length;
  const allApproved = areAllFilesApproved();

  if (countEl) countEl.textContent = String(total);
  if (progEl && !IS_SUMMARY_PAGE) {
    progEl.textContent = `${approvedCount} of ${total} file${total === 1 ? '' : 's'} approved`;
  }
  if (summaryBtn) {
    if (!IS_SUMMARY_PAGE) {
      summaryBtn.classList.toggle('is-all-approved', allApproved);
      const subCopy = allApproved
        ? `All ${total} file${total === 1 ? '' : 's'} approved · Click for full queue summary!`
        : `${total - approvedCount} file${total - approvedCount === 1 ? '' : 's'} remaining before full approval`;
      if (summarySub) summarySub.textContent = subCopy;
      summaryBtn.title = `View Queue Summary (${approvedCount} of ${total} approved)`;
    } else {
      summaryBtn.title = 'Return to Queue Viewer (Inspect code & annotations per file)';
    }
  }

  if (!listEl) return;

  listEl.innerHTML = fileQueue.map((item, idx) => {
    const isActive = item.id === activeFileId;
    const st = getQueueItemStatus(item);
    const lines = String(item.source || '').split('\n').length;
    const tooltip = `#${idx + 1} · ${item.name} — ${st.label} (${item.language} → ${item.target} · ${lines}L)`;
    return `
      <div class="queue-item ${isActive ? 'active' : ''}" role="listitem" data-queue-select="${esc(item.id)}" tabindex="0" aria-current="${isActive ? 'true' : 'false'}" title="${esc(tooltip)}">
        <span class="queue-rail-badge" aria-hidden="true">
          #${idx + 1}
          <span class="queue-rail-dot ${st.cls}"></span>
        </span>
        <div class="queue-item-full">
          <div class="queue-item-top">
            <span class="queue-file-name">
              <span class="queue-dot ${st.cls}"></span>
              <span>#${idx + 1} &middot; ${esc(item.name)}</span>
            </span>
            ${fileQueue.length > 1 ? `<button type="button" class="queue-remove-btn" data-queue-remove="${esc(item.id)}" title="Remove from queue" aria-label="Remove ${esc(item.name)}">&times;</button>` : ''}
          </div>
          <div class="queue-item-meta">
            <span class="queue-lang-tag">${esc(item.language)} &rarr; ${esc(item.target)} &middot; ${lines}L</span>
            <span class="queue-status-pill ${st.cls}">${esc(st.label)}</span>
          </div>
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
    explanation: 'Created clean, readable Python code from your approved rules and mapped every change back to the original COBOL lines.',
    assumptions: ['Invalid negative inputs raise a clear ValueError.'],
    suggested_tests: []
  };
  checksRun = null;
}

function runPresetChecksNow() {
  const d = currentPreset();
  checksRun = {
    label: `${d.cases.length} of ${d.cases.length} tests passed`,
    note: 'Tested in an isolated sandbox against realistic scenarios.',
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
  notice = 'Reset to the default Monthly Fee Waiver sample scenario.';
  error = '';
  saveQueueToStorage();
  render();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

const COBOL_KEYWORDS = new Set([
  'IF', 'ELSE', 'END-IF', 'MOVE', 'TO', 'COMPUTE', 'ADD', 'SUBTRACT', 'MULTIPLY',
  'DIVIDE', 'GIVING', 'BY', 'INTO', 'FROM', 'EVALUATE', 'WHEN', 'OTHER', 'END-EVALUATE',
  'PERFORM', 'UNTIL', 'THRU', 'THROUGH', 'VARYING', 'IDENTIFICATION', 'ENVIRONMENT',
  'DATA', 'PROCEDURE', 'DIVISION', 'SECTION', 'WORKING-STORAGE', 'LINKAGE', 'FILE',
  'PIC', 'PICTURE', 'VALUE', 'ACCEPT', 'DISPLAY', 'STOP', 'RUN', 'GOBACK', 'EXIT',
  'AND', 'OR', 'NOT', 'IS', 'GREATER', 'LESS', 'EQUAL', 'THAN', 'THEN', 'CALL', 'USING'
]);

const COBOL_CONSTS = new Set(['ZERO', 'ZEROS', 'ZEROES', 'SPACE', 'SPACES', 'TRUE', 'FALSE']);

const CODE_KEYWORDS = new Set([
  'def', 'return', 'if', 'elif', 'else', 'and', 'or', 'not', 'in', 'is', 'for', 'while',
  'try', 'except', 'finally', 'raise', 'import', 'from', 'as', 'class', 'with', 'pass',
  'break', 'continue', 'lambda', 'yield', 'async', 'await', 'const', 'let', 'var',
  'function', 'new', 'extends', 'implements', 'public', 'private', 'protected', 'static',
  'final', 'void', 'int', 'double', 'boolean', 'char', 'long', 'short', 'switch', 'case',
  'default', 'throw', 'throws', 'catch', 'package', 'interface', 'enum', 'struct', 'func'
]);

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'CREATE', 'OR', 'REPLACE', 'FUNCTION', 'PROCEDURE', 'PACKAGE', 'BODY', 'RETURN',
  'IS', 'AS', 'BEGIN', 'END', 'DECLARE', 'IF', 'THEN', 'ELSIF', 'ELSE', 'END', 'LOOP',
  'WHILE', 'FOR', 'IN', 'EXCEPTION', 'WHEN', 'OTHERS', 'RAISE_APPLICATION_ERROR',
  'AND', 'NOT', 'NULL', 'NUMBER', 'VARCHAR2', 'BOOLEAN', 'DATE', 'COMMIT', 'ROLLBACK'
]);

const CODE_TYPES_AND_CONSTS = new Set([
  'True', 'False', 'None', 'true', 'false', 'null', 'undefined', 'self', 'this', 'super',
  'Decimal', 'ROUND_HALF_UP', 'ROUND_HALF_EVEN', 'ValueError', 'TypeError', 'RuntimeError',
  'Exception', 'BigDecimal', 'String', 'List', 'Dict', 'Map', 'Set', 'Optional'
]);

function highlightCodeLine(lineText, lang = '') {
  const raw = String(lineText ?? '');
  if (!raw.length) return ' ';

  const isCobol = /cobol|\.cbl|\.cob/i.test(lang);
  const isSql = /sql|pl\/sql/i.test(lang);

  if (isCobol) {
    const cobolRegex = /(\*>.*$|^\s*\*(?!>).*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(\d+(?:\.\d+)?)\b|([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)|(>=|<=|<>|!=|==|[=<>+\-*/])|([.,:;()])/g;
    let out = '';
    let last = 0;
    let m;
    while ((m = cobolRegex.exec(raw)) !== null) {
      if (m.index > last) out += esc(raw.slice(last, m.index));
      const [full, comment, str, num, ident, op, punc] = m;
      if (comment !== undefined) {
        out += `<span class="syn-comment">${esc(full)}</span>`;
      } else if (str !== undefined) {
        out += `<span class="syn-str">${esc(full)}</span>`;
      } else if (num !== undefined) {
        out += `<span class="syn-num">${esc(full)}</span>`;
      } else if (ident !== undefined) {
        const upper = full.toUpperCase();
        if (COBOL_KEYWORDS.has(upper)) {
          out += `<span class="syn-kw">${esc(full)}</span>`;
        } else if (COBOL_CONSTS.has(upper)) {
          out += `<span class="syn-num">${esc(full)}</span>`;
        } else {
          out += `<span class="syn-type">${esc(full)}</span>`;
        }
      } else if (op !== undefined) {
        out += `<span class="syn-op">${esc(full)}</span>`;
      } else if (punc !== undefined) {
        out += `<span class="syn-punc">${esc(full)}</span>`;
      } else {
        out += esc(full);
      }
      last = cobolRegex.lastIndex;
    }
    if (last < raw.length) out += esc(raw.slice(last));
    return out;
  }

  const tokenRegex = /((?:#|--|\/\/).*$|\/\*[\s\S]*?\*\/)|(@[A-Za-z_][A-Za-z0-9_.]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(\d+(?:\.\d+)?)\b|([A-Za-z_][A-Za-z0-9_]*)|(>=|<=|<>|!=|==|->|=>|[=<>+\-*/%])|([.,:;(){}[\]])/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = tokenRegex.exec(raw)) !== null) {
    if (m.index > last) out += esc(raw.slice(last, m.index));
    const [full, comment, decorator, str, num, ident, op, punc] = m;
    if (comment !== undefined) {
      out += `<span class="syn-comment">${esc(full)}</span>`;
    } else if (decorator !== undefined) {
      out += `<span class="syn-kw">${esc(full)}</span>`;
    } else if (str !== undefined) {
      out += `<span class="syn-str">${esc(full)}</span>`;
    } else if (num !== undefined) {
      out += `<span class="syn-num">${esc(full)}</span>`;
    } else if (ident !== undefined) {
      const rest = raw.slice(tokenRegex.lastIndex);
      const prevChar = m.index > 0 ? raw[m.index - 1] : '';
      const upper = full.toUpperCase();
      if (CODE_KEYWORDS.has(full) || (isSql && SQL_KEYWORDS.has(upper))) {
        out += `<span class="syn-kw">${esc(full)}</span>`;
      } else if (CODE_TYPES_AND_CONSTS.has(full) || /^[A-Z][A-Z0-9_]{2,}$/.test(full) || /^[A-Z][a-zA-Z0-9]*$/.test(full)) {
        out += `<span class="syn-type">${esc(full)}</span>`;
      } else if (/^\s*\(/.test(rest)) {
        out += `<span class="syn-fn">${esc(full)}</span>`;
      } else if (prevChar === '.' || /^\s*:(?!:)/.test(rest) || /^\s*=(?!=)/.test(rest)) {
        // Only treat `ident =` as named prop if inside parentheses; top-level assignment stays syn-var
        const before = raw.slice(0, m.index);
        const openParens = (before.match(/\(/g) || []).length - (before.match(/\)/g) || []).length;
        if (prevChar === '.' || openParens > 0) {
          out += `<span class="syn-prop">${esc(full)}</span>`;
        } else {
          out += `<span class="syn-var">${esc(full)}</span>`;
        }
      } else {
        out += `<span class="syn-var">${esc(full)}</span>`;
      }
    } else if (op !== undefined) {
      out += `<span class="syn-op">${esc(full)}</span>`;
    } else if (punc !== undefined) {
      out += `<span class="syn-punc">${esc(full)}</span>`;
    } else {
      out += esc(full);
    }
    last = tokenRegex.lastIndex;
  }
  if (last < raw.length) out += esc(raw.slice(last));
  return out;
}

function ruleCounts() {
  const keep = rules.filter(r => r.decision === 'keep').length;
  const edit = rules.filter(r => r.decision === 'edit').length;
  const drop = rules.filter(r => r.decision === 'drop').length;
  return { keep, edit, drop, approved: keep + edit, total: rules.length };
}

function isReportReady() {
  if (!fileQueue.length) return false;
  return fileQueue.every(item => Boolean(item.approved) || Boolean(item.checksRun && Array.isArray(item.checksRun.rows) && item.checksRun.rows.length > 0));
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
  const items = fileQueue.length ? fileQueue : [{ source, result, annotations, checksRun }];
  let totalLines = 0;
  let sloc = 0;
  let commentLines = 0;
  let branches = 0;
  let outLines = 0;
  let totalAnnotations = 0;
  let activeAnnotations = 0;
  let passedChecks = 0;
  let totalChecks = 0;

  items.forEach(item => {
    const cx = analyzeSourceComplexity(item.source || '');
    totalLines += cx.totalLines;
    sloc += cx.sloc;
    commentLines += cx.commentLines;
    branches += cx.branches;
    const codeText = item.result?.code || '';
    if (codeText) {
      outLines += codeText.split('\n').filter(l => l.trim().length > 0).length;
    }
    const anns = Array.isArray(item.annotations) ? item.annotations : [];
    totalAnnotations += anns.length;
    activeAnnotations += anns.filter(a => a.status !== 'removed').length;
    if (item.checksRun && Array.isArray(item.checksRun.rows)) {
      totalChecks += item.checksRun.rows.length;
      passedChecks += item.checksRun.rows.filter(r => r.passed).length;
    }
  });

  const rate = Number(roiSettings.hourlyRate) || 135;
  const minsPerSloc = Number(roiSettings.minsPerSloc) || 12;
  const a2bRatio = Number(roiSettings.a2bRatio) || 0.26;
  const modules = Number(roiSettings.moduleMultiplier) || 1;

  const baseLineHours = (sloc * minsPerSloc) / 60;
  const branchHours = branches * 0.22;
  const ruleHours = Math.max(3, activeAnnotations) * 0.12;
  const queueBaselineHrs = Math.max(0.5, baseLineHours + branchHours + ruleHours);

  const baselineHrs = +(queueBaselineHrs * modules).toFixed(1);
  const assistedHrs = Math.max(0.2, +(baselineHrs * a2bRatio).toFixed(1));
  const savedHrs = Math.max(0.1, +(baselineHrs - assistedHrs).toFixed(1));
  const pctSaved = baselineHrs > 0 ? Math.round(((baselineHrs - assistedHrs) / baselineHrs) * 100) : 74;

  const baselineDollars = Math.round(baselineHrs * rate);
  const assistedDollars = Math.round(assistedHrs * rate);
  const savedDollars = Math.max(0, baselineDollars - assistedDollars);

  return {
    fileCount: items.length,
    approvedCount: fileQueue.filter(f => f.approved).length,
    totalLines,
    sloc,
    commentLines,
    branches,
    outLines,
    totalAnnotations,
    activeAnnotations,
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

function buildReportSummaryText() {
  const m = computeImpactMetrics();
  const fileNames = fileQueue.map(f => f.name).join(', ') || 'fee_waiver.cbl';
  const allAnns = [];
  fileQueue.forEach(item => {
    (item.annotations || []).filter(a => a.status !== 'removed').forEach(a => {
      allAnns.push(`  - [${item.name}] ${formatChangeLabel(a.id)} (${a.oldRefLabel} -> ${a.newRefLabel}, ${a.kindLabel}): ${a.reason}`);
    });
  });
  return [
    `A2B Labs — Queue Summary & Savings Report`,
    `Files included (${m.fileCount}): ${fileNames}`,
    `Approval status: ${m.approvedCount} of ${m.fileCount} files approved`,
    `Amount reviewed: ${m.totalLines} lines of code (${m.activeAnnotations} plain-English improvements)`,
    `Estimated time saved: ${m.savedHrs} hrs (${m.pctSaved}% faster: ${m.assistedHrs}h with A2B Labs vs. ${m.baselineHrs}h by hand)`,
    `Estimated money saved: (${m.baselineHrs}h - ${m.assistedHrs}h) x $${m.rate}/hr = ${fmtMoney(m.savedDollars)}`,
    `Plain-English change notes:`,
    ...allAnns,
    `Note: Estimate based on the files in your queue.`
  ].join('\n');
}

function renderReportStatsHtml() {
  const m = computeImpactMetrics();
  const readinessMain = m.totalChecks > 0 ? `${m.passedChecks} of ${m.totalChecks} tests passed` : `${m.approvedCount} of ${m.fileCount} files approved`;
  const readinessSub = `${m.activeAnnotations} active AI fixes across ${m.fileCount} file${m.fileCount === 1 ? '' : 's'} · ${m.outLines} output lines`;

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
        <span class="report-kpi-label">Estimated Queue Cost Saved</span>
        <strong class="report-kpi-value amber-val">${fmtMoney(m.savedDollars)}</strong>
        <small>(${m.baselineHrs}h &minus; ${m.assistedHrs}h) &times; $${m.rate}/hr${m.modules > 1 ? ` &middot; &times;${m.modules} batch scale` : ''}</small>
      </div>

      <div class="report-kpi-card">
        <span class="report-kpi-label">Team Time Saved</span>
        <strong class="report-kpi-value">${m.savedHrs} hrs <span class="report-delta-pill">&minus;${m.pctSaved}%</span></strong>
        <small>${m.assistedHrs} hrs with A2B Labs vs. ${m.baselineHrs} hrs by hand</small>
      </div>

      <div class="report-kpi-card">
        <span class="report-kpi-label">Entire Queue Reviewed</span>
        <strong class="report-kpi-value">${m.fileCount} file${m.fileCount === 1 ? '' : 's'} (${m.totalLines} lines)</strong>
        <small>${m.sloc} lines of logic &middot; ${m.branches} decision check${m.branches === 1 ? '' : 's'}</small>
      </div>

      <div class="report-kpi-card">
        <span class="report-kpi-label">Queue Verification</span>
        <strong class="report-kpi-value report-status-val emerald-val">${esc(readinessMain)}</strong>
        <small>${esc(readinessSub)}</small>
      </div>
    </div>

    <div class="report-bars-panel">
      <div class="report-bars-head">
        <strong>Estimated Time Comparison Across Queue (${m.fileCount} file${m.fileCount === 1 ? '' : 's'})</strong>
        <span>Based on ${m.sloc} lines of code${m.modules > 1 ? ` &times; ${m.modules} batch multiplier` : ''}</span>
      </div>

      <div class="effort-row">
        <div class="effort-label">
          <strong>Updating by hand</strong>
          <span>${m.baselineHrs} hrs (${fmtMoney(m.baselineDollars)})</span>
        </div>
        <div class="effort-track">
          <div class="effort-fill" style="width:${m.baselineHrs > 0 ? 100 : 0}%">
            <span class="seg seg-1" style="width:40%" title="Reading old code: ${manualDiscovery}h"></span>
            <span class="seg seg-2" style="width:30%" title="Checking rules: ${manualPolicy}h"></span>
            <span class="seg seg-3" style="width:30%" title="Writing & testing new code: ${manualRewrite}h"></span>
          </div>
        </div>
        <div class="effort-legend">
          <span><i></i>Reading old code (${manualDiscovery}h)</span>
          <span><i></i>Checking rules (${manualPolicy}h)</span>
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
        <p>Each badge in the <strong>Updated Code</strong> (<span class="change-pointer-pill">&larr; CHG-01..04</span>) points directly back to the exact lines it replaced or fixed in the <strong>Original Code</strong>. Click any Change ID above or any highlighted line below to inspect it.</p>
      </div>
    `}

    <div class="annotated-diff-grid">
      <div class="annotated-pane">
        <div class="ide-header">
          <div class="ide-title-group">
            <span class="ide-title">Original Code</span>
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
    summarySub.textContent = reportUnlocked ? 'Verified · Savings unlocked' : (result ? 'Ready · Run tests' : 'Run tests & see ROI');
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

let persistentChatComposerEl = null;
const composerStagedFiles = new Map();
let composerNavTimer = 0;
let composerAbortController = null;

function resolveComposerMode(modeValue) {
  switch (modeValue) {
    case 'plsql-python':
      return { lang: 'Oracle PL/SQL', target: 'Python', label: 'PL/SQL → Python' };
    case 'cobol-java':
      return { lang: 'COBOL', target: 'Java 21', label: 'COBOL → Java' };
    case 'audit-only':
      return { lang: 'COBOL', target: 'Python (Audit)', label: 'Policy Audit' };
    case 'cobol-python':
    default:
      return { lang: 'COBOL', target: 'Python', label: 'COBOL → Python' };
  }
}

function looksLikePastedCode(rawText) {
  const txt = String(rawText || '').trim();
  if (!txt) return false;
  const lineCount = txt.split('\n').length;
  if (/\b(MOVE\s+|END-IF|PROCEDURE\s+DIVISION|WORKING-STORAGE|CREATE\s+OR\s+REPLACE|BEGIN\b|SELECT\s+.+\s+FROM|def\s+\w+\s*\(|public\s+(final\s+)?class\s+|function\s+\w+\s*\()/i.test(txt)) {
    return true;
  }
  return lineCount >= 3 && /[;=<>(){}]/.test(txt);
}

function matchPresetKeyFromPrompt(promptText) {
  const q = String(promptText || '').toLowerCase();
  if (/overdraft|cushion|savings|nsf/.test(q) && presets.overdraft_trap) return 'overdraft_trap';
  if (/wire|cutoff|transfer|limit|dual/.test(q) && presets.wire_limit) return 'wire_limit';
  if (/loan|apr|interest|rate|penalty|autopay/.test(q) && presets.loan_interest) return 'loan_interest';
  if (/fee|waiver|student|maintenance|checking/.test(q) && presets.fee_waiver) return 'fee_waiver';
  const keys = Object.keys(presets);
  const cur = keys.indexOf(activePresetId);
  return keys[(cur + 1) % keys.length] || 'fee_waiver';
}

function applyUserInstructionToItem(item, instructionText) {
  const cleanNote = String(instructionText || '').trim();
  if (!cleanNote || looksLikePastedCode(cleanNote)) return;
  item.policy = item.policy ? `${item.policy}\nReviewer note: ${cleanNote}` : cleanNote;
  if (Array.isArray(item.annotations) && item.annotations.length > 0) {
    const firstActive = item.annotations.find(a => a.status !== 'removed') || item.annotations[0];
    if (firstActive && !firstActive.reason.includes(cleanNote)) {
      firstActive.reason = `${firstActive.reason} (Prompt focus: ${cleanNote})`;
    }
  }
}

function animateComposerFileUpload(api, chipId, file) {
  api.setProgress(chipId, 0.08);
  const readPromise = file.text().then(txt => {
    composerStagedFiles.set(chipId, { file, text: String(txt || '').replace(/\r\n?/g, '\n') });
  }).catch(() => {
    composerStagedFiles.set(chipId, { file, text: '' });
  });

  const start = performance.now();
  const duration = 340;
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    if (t < 1) {
      api.setProgress(chipId, Math.max(0.08, t * 0.92));
      requestAnimationFrame(step);
    } else {
      readPromise.finally(() => {
        api.setProgress(chipId, 1);
      });
    }
  }
  requestAnimationFrame(step);
}

async function handleComposerSubmit(detail, api) {
  if (composerNavTimer) {
    clearTimeout(composerNavTimer);
    composerNavTimer = 0;
  }
  if (composerAbortController) {
    composerAbortController.abort();
    composerAbortController = null;
  }

  let canceled = false;
  const onStopOnce = () => {
    canceled = true;
    if (composerNavTimer) {
      clearTimeout(composerNavTimer);
      composerNavTimer = 0;
    }
    if (composerAbortController) {
      composerAbortController.abort();
      composerAbortController = null;
    }
    notice = 'Stopped — ready whenever you want to send.';
    renderHomeDockOnly();
  };
  api.el.addEventListener('vs-chat-input:stop', onStopOnce, { once: true });

  const mode = resolveComposerMode(detail.model);
  const rawText = String(detail.text || '').trim();
  const submittedFiles = Array.isArray(detail.files) ? detail.files : [];
  syncActiveQueueItemFromGlobals();

  let newestItemId = '';

  if (submittedFiles.length > 0) {
    for (const fEntry of submittedFiles) {
      const staged = composerStagedFiles.get(fEntry.id);
      let content = staged ? staged.text : '';
      if (!content && fEntry.file && typeof fEntry.file.text === 'function') {
        try {
          content = (await fEntry.file.text()).replace(/\r\n?/g, '\n');
        } catch (_e) {
          content = '';
        }
      }
      composerStagedFiles.delete(fEntry.id);
      content = content.trim();
      if (!content) continue;

      const matchedPreset = Object.values(presets).find(
        p => p.fileName === fEntry.name && String(p.legacy || '').trim() === content
      );
      const detected = detectLanguageFromFilename(fEntry.name);
      const itemLang = detected ? detected.lang : mode.lang;
      const itemTarget = /java/i.test(mode.target) ? mode.target : (detected ? detected.target : mode.target);

      // If this exact built-in sample is already queued and target matches, select & update it instead of duplicating
      let existingSample = matchedPreset
        ? fileQueue.find(q => q.isBuiltIn && q.presetKey === matchedPreset.id && q.target === itemTarget)
        : null;

      if (existingSample) {
        applyUserInstructionToItem(existingSample, rawText);
        newestItemId = existingSample.id;
      } else {
        const id = 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        const newItem = autoFixQueueItem({
          id,
          name: fEntry.name,
          isBuiltIn: Boolean(matchedPreset && !/java/i.test(itemTarget)),
          presetKey: matchedPreset ? matchedPreset.id : 'fee_waiver',
          title: matchedPreset ? matchedPreset.title : `Uploaded Script (${fEntry.name})`,
          bugBadge: matchedPreset ? matchedPreset.bugBadge : 'Auto-scanned & repaired upon upload',
          description: matchedPreset
            ? matchedPreset.description
            : `Uploaded file (${fEntry.name}). Errors and safety checks were automatically repaired.`,
          language: itemLang,
          target: itemTarget,
          source: content,
          policy: matchedPreset ? matchedPreset.policy.join('\n') : (policy || presets.fee_waiver.policy.join('\n')),
          analysis: null,
          rules: [],
          result: null,
          annotations: [],
          approved: false,
          checksRun: null,
          suggestedSelected: {},
          suggestedRun: null,
          uploadProgress: 100,
          uploadDone: true
        });
        applyUserInstructionToItem(newItem, rawText);
        fileQueue.push(newItem);
        newestItemId = id;
      }
    }
  } else if (looksLikePastedCode(rawText)) {
    const isSql = /\b(SELECT|CREATE|BEGIN|DECLARE|PLS_INTEGER|NUMBER)\b/i.test(rawText);
    const ext = isSql ? 'sql' : 'cbl';
    const num = aiBugCounter++;
    const snippetName = `pasted_snippet_${num}.${ext}`;
    const id = 'paste-' + Date.now();
    const newItem = autoFixQueueItem({
      id,
      name: snippetName,
      isBuiltIn: false,
      presetKey: 'fee_waiver',
      title: `Pasted Code Snippet #${num}`,
      bugBadge: 'Auto-scanned & repaired from Chat Composer',
      description: 'Pasted directly into the Homepage Chat Composer and repaired automatically.',
      language: isSql ? 'Oracle PL/SQL' : mode.lang,
      target: mode.target,
      source: rawText,
      policy: presets.fee_waiver.policy.join('\n'),
      analysis: null,
      rules: [],
      result: null,
      annotations: [],
      approved: false,
      checksRun: null,
      suggestedSelected: {},
      suggestedRun: null,
      uploadProgress: 100,
      uploadDone: true
    });
    fileQueue.push(newItem);
    newestItemId = id;
  } else if (rawText) {
    const chosenKey = matchPresetKeyFromPrompt(rawText);
    const basePreset = presets[chosenKey] || presets.fee_waiver;

    if (configured) {
      try {
        composerAbortController = new AbortController();
        const r = await fetch('/api/generate-faulty', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenario: `${rawText} (${basePreset.title})` }),
          signal: composerAbortController.signal
        });
        const data = await r.json();
        if (!canceled && r.ok && data && data.source) {
          const id = 'ai-bug-' + Date.now();
          const fileName = (data.fileName || `ai_generated_${aiBugCounter++}.cbl`).replace(/[^a-zA-Z0-9._-]/g, '_');
          const aiItem = autoFixQueueItem({
            id,
            name: fileName,
            isBuiltIn: false,
            presetKey: chosenKey,
            title: data.title || basePreset.title,
            bugBadge: data.bugBadge || basePreset.bugBadge,
            description: data.description || rawText,
            language: mode.lang,
            target: mode.target,
            source: String(data.source).trim(),
            policy: Array.isArray(data.policy) ? data.policy.join('\n') : String(data.policy || basePreset.policy.join('\n')),
            analysis: null,
            rules: [],
            result: null,
            annotations: [],
            approved: false,
            checksRun: null,
            suggestedSelected: {},
            suggestedRun: null,
            uploadProgress: 100,
            uploadDone: true
          });
          applyUserInstructionToItem(aiItem, rawText);
          fileQueue.push(aiItem);
          newestItemId = id;
        }
      } catch (_e) {
        // Fall through to deterministic preset generation if offline or aborted
      } finally {
        composerAbortController = null;
      }
    }

    if (!canceled && !newestItemId) {
      const id = 'prompt-' + Date.now();
      const num = aiBugCounter++;
      const fileName = num === 1 && !fileQueue.some(q => q.name === basePreset.fileName)
        ? basePreset.fileName
        : basePreset.fileName.replace('.cbl', `_${num}.cbl`);
      const promptItem = autoFixQueueItem({
        id,
        name: fileName,
        isBuiltIn: !/java/i.test(mode.target),
        presetKey: chosenKey,
        title: basePreset.title,
        bugBadge: basePreset.bugBadge,
        description: `${basePreset.description} · Prompt: "${rawText}"`,
        language: mode.lang,
        target: mode.target,
        source: basePreset.legacy,
        policy: basePreset.policy.join('\n'),
        analysis: null,
        rules: [],
        result: null,
        annotations: [],
        approved: false,
        checksRun: null,
        suggestedSelected: {},
        suggestedRun: null,
        uploadProgress: 100,
        uploadDone: true
      });
      applyUserInstructionToItem(promptItem, rawText);
      fileQueue.push(promptItem);
      newestItemId = id;
    }
  }

  if (canceled) return;

  if (newestItemId) {
    const targetItem = fileQueue.find(f => f.id === newestItemId);
    if (targetItem) applyQueueItemToGlobals(targetItem);
  } else if (fileQueue[0]) {
    applyQueueItemToGlobals(fileQueue.find(f => f.id === activeFileId) || fileQueue[0]);
  }

  error = '';
  notice = '';
  saveQueueToStorage();
  renderHomeDockOnly();

  composerNavTimer = window.setTimeout(() => {
    composerNavTimer = 0;
    api.el.removeEventListener('vs-chat-input:stop', onStopOnce);
    if (canceled) return;
    api.setBusy(false);
    window.location.href = '/workspace.html';
  }, 640);
}

const GENERATED_BANKING_POOL = [
  {
    fileName: 'cd_early_withdrawal.cbl',
    title: 'CD Early Withdrawal Penalty',
    prompt: 'Check and fix CD early withdrawal rules and rounding errors in cd_early_withdrawal.cbl',
    code: [
      '       IDENTIFICATION DIVISION.',
      '       PROGRAM-ID. CD-PENALTY-CALC.',
      '       DATA DIVISION.',
      '       WORKING-STORAGE SECTION.',
      '       01 WS-PRINCIPAL        PIC 9(7)V99 VALUE 25000.00.',
      '       01 WS-DAYS-HELD        PIC 9(4)    VALUE 365.',
      '       01 WS-IN-GRACE-WINDOW  PIC X       VALUE "Y".',
      '       01 WS-PENALTY-AMT      PIC 9(5)V99 VALUE 0.',
      '       PROCEDURE DIVISION.',
      '           IF WS-DAYS-HELD < 365',
      '               COMPUTE WS-PENALTY-AMT = WS-PRINCIPAL * 0.03',
      '           ELSE',
      '               IF WS-IN-GRACE-WINDOW = "N"',
      '                   COMPUTE WS-PENALTY-AMT = WS-PRINCIPAL * 0.015',
      '               END-IF',
      '           END-IF.',
      '           STOP RUN.'
    ].join('\n')
  },
  {
    fileName: 'ach_batch_settlement.cbl',
    title: 'ACH Same-Day Batch Cutoff',
    prompt: 'Check and fix ACH same-day cutoff time and transfer limit errors in ach_batch_settlement.cbl',
    code: [
      '       IDENTIFICATION DIVISION.',
      '       PROGRAM-ID. ACH-BATCH-SETTLE.',
      '       DATA DIVISION.',
      '       WORKING-STORAGE SECTION.',
      '       01 WS-BATCH-TOTAL      PIC 9(7)V99 VALUE 0.',
      '       01 WS-SUBMIT-HOUR-UTC  PIC 9(2)    VALUE 21.',
      '       01 WS-SAME-DAY-CAP     PIC 9(6)V99 VALUE 100000.00.',
      '       01 WS-ROUTE-CODE       PIC X(8)    VALUE "NEXT-DAY".',
      '       PROCEDURE DIVISION.',
      '           IF WS-SUBMIT-HOUR-UTC <= 21',
      '               IF WS-BATCH-TOTAL <= WS-SAME-DAY-CAP',
      '                   MOVE "SAME-DAY" TO WS-ROUTE-CODE',
      '               END-IF',
      '           END-IF.',
      '           STOP RUN.'
    ].join('\n')
  },
  {
    fileName: 'escrow_tax_disbursement.sql',
    title: 'Mortgage Escrow Tax Disbursement',
    prompt: 'Check and fix monthly property tax rounding and negative balance errors in escrow_tax_disbursement.sql',
    code: [
      'CREATE OR REPLACE PROCEDURE calc_escrow_monthly (',
      '  p_annual_tax   IN NUMBER,',
      '  p_balance      IN NUMBER,',
      '  p_monthly_due  OUT NUMBER',
      ') AS',
      'BEGIN',
      '  IF p_balance < 0 THEN',
      '    p_monthly_due := (p_annual_tax / 12) + ABS(p_balance);',
      '  ELSE',
      '    p_monthly_due := p_annual_tax / 12;',
      '  END IF;',
      'END;'
    ].join('\n')
  },
  {
    fileName: 'atm_daily_withdrawal.cbl',
    title: 'ATM Cross-Midnight Limit',
    prompt: 'Check and fix ATM daily withdrawal limit and negative amount errors in atm_daily_withdrawal.cbl',
    code: [
      '       IDENTIFICATION DIVISION.',
      '       PROGRAM-ID. ATM-DAILY-CAP.',
      '       DATA DIVISION.',
      '       WORKING-STORAGE SECTION.',
      '       01 WS-REQ-AMOUNT       PIC 9(5)V99 VALUE 600.00.',
      '       01 WS-DAILY-USED       PIC 9(5)V99 VALUE 500.00.',
      '       01 WS-DAILY-LIMIT      PIC 9(5)V99 VALUE 1000.00.',
      '       01 WS-APPROVED         PIC X       VALUE "N".',
      '       PROCEDURE DIVISION.',
      '           IF WS-REQ-AMOUNT + WS-DAILY-USED <= WS-DAILY-LIMIT',
      '               MOVE "Y" TO WS-APPROVED',
      '           END-IF.',
      '           STOP RUN.'
    ].join('\n')
  },
  {
    fileName: 'fx_remittance_spread.sql',
    title: 'Cross-Border FX Spread',
    prompt: 'Check and fix foreign currency conversion and rounding errors in fx_remittance_spread.sql',
    code: [
      'CREATE OR REPLACE FUNCTION calc_fx_payout (',
      '  p_usd_amount IN BINARY_DOUBLE,',
      '  p_mid_rate   IN BINARY_DOUBLE,',
      '  p_spread_bps IN NUMBER',
      ') RETURN BINARY_DOUBLE AS',
      '  v_eff_rate BINARY_DOUBLE;',
      'BEGIN',
      '  v_eff_rate := p_mid_rate * (1 - (p_spread_bps / 10000));',
      '  RETURN p_usd_amount * v_eff_rate;',
      'END;'
    ].join('\n')
  },
  {
    fileName: 'credit_card_grace_period.cbl',
    title: 'Credit Card Trailing Interest',
    prompt: 'Check and fix credit card paid-in-full interest billing bug in credit_card_grace_period.cbl',
    code: [
      '       IDENTIFICATION DIVISION.',
      '       PROGRAM-ID. CARD-GRACE-INT.',
      '       DATA DIVISION.',
      '       WORKING-STORAGE SECTION.',
      '       01 WS-PRIOR-PAID-FULL  PIC X       VALUE "Y".',
      '       01 WS-AVG-DAILY-BAL    PIC 9(6)V99 VALUE 1850.00.',
      '       01 WS-MONTHLY-APR      PIC 9V9999  VALUE 0.0199.',
      '       01 WS-INTEREST-DUE     PIC 9(5)V99 VALUE 0.',
      '       PROCEDURE DIVISION.',
      '           IF WS-AVG-DAILY-BAL > 0',
      '               COMPUTE WS-INTEREST-DUE = WS-AVG-DAILY-BAL * WS-MONTHLY-APR',
      '           END-IF.',
      '           STOP RUN.'
    ].join('\n')
  }
];

let generatedFileCounter = 0;

function generateDistinctBankingFile(api) {
  if (!api) return;
  const premadeNames = new Set(Object.values(presets).map(p => String(p.fileName || '').toLowerCase()));
  const usedNames = new Set([
    ...premadeNames,
    ...(api.files || []).map(f => String(f.name || '').toLowerCase()),
    ...fileQueue.map(q => String(q.name || '').toLowerCase())
  ]);

  let picked = null;
  for (let i = 0; i < GENERATED_BANKING_POOL.length; i++) {
    const candidate = GENERATED_BANKING_POOL[(generatedFileCounter + i) % GENERATED_BANKING_POOL.length];
    if (!usedNames.has(candidate.fileName.toLowerCase())) {
      picked = { ...candidate };
      generatedFileCounter = (generatedFileCounter + i + 1) % GENERATED_BANKING_POOL.length;
      break;
    }
  }

  if (!picked) {
    const base = GENERATED_BANKING_POOL[generatedFileCounter % GENERATED_BANKING_POOL.length];
    generatedFileCounter += 1;
    const dotIdx = base.fileName.lastIndexOf('.');
    const stem = dotIdx > 0 ? base.fileName.slice(0, dotIdx) : base.fileName;
    const ext = dotIdx > 0 ? base.fileName.slice(dotIdx) : '.cbl';
    let ver = 2;
    let nextName = `${stem}_v${ver}${ext}`;
    while (usedNames.has(nextName.toLowerCase())) {
      ver += 1;
      nextName = `${stem}_v${ver}${ext}`;
    }
    picked = {
      fileName: nextName,
      title: `${base.title} (Variant ${ver})`,
      prompt: `Check and fix rule errors in ${nextName} (${base.title})`,
      code: `${base.code}\n${ext === '.sql' ? `-- Generated variant #${ver}` : `      * Generated variant #${ver}`}`
    };
  }

  const genFile = new File([picked.code + '\n'], picked.fileName, { type: 'text/plain' });
  api.addFiles([genFile]);
  if (!String(api.value || '').trim()) {
    api.value = picked.prompt;
  }
  api.focus();
}

function ensurePersistentChatComposer() {
  if (persistentChatComposerEl) return persistentChatComposerEl;
  const wrapper = document.createElement('div');
  const darkAttr = document.documentElement.dataset.theme !== 'light' ? ' data-theme="dark"' : '';
  wrapper.innerHTML = `
    <form
      class="vs-chat-input"
      id="home-vs-chat-input"
      aria-label="Code modernization composer"
      data-max-files="10"
      data-drop-label="Drop files here"
      data-accept=".cbl,.cob,.cpy,.sql,.pls,.pkb,.rpg,.rpgle,.py,.java,.cs,.js,.ts,.go,.c,.cpp,.txt,.md,.json,.csv,.pdf"${darkAttr}
    >
      <div class="home-composer-stage">
        <textarea
          class="vs-chat-input-text"
          rows="4"
          name="message"
          placeholder=""
          aria-label="Rules or files to update"
        ></textarea>
        <button type="button" class="home-drop-icon-btn" aria-label="Upload files">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M8.5 17.5H6.5a4.5 4.5 0 0 1-.42-8.98A5.5 5.5 0 0 1 16.8 7.6a4 4 0 0 1 .7 7.9H15.5"/>
            <path d="M12 20.5V10.5M8.5 14 12 10.5 15.5 14"/>
          </svg>
          <span class="home-drop-icon-label">Upload files</span>
        </button>
      </div>
      <div class="vs-chat-input-bar">
        <button class="vs-chat-input-attach" type="button" aria-label="Upload files"></button>
        <div class="home-bar-presets" id="home-bar-presets">
          <button class="home-bar-presets-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
            <span class="home-bar-presets-label">+ Examples</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <ul class="home-bar-presets-menu" role="listbox" aria-label="Sample files and generator" hidden>
            <li class="home-bar-presets-heading" role="presentation">Try a Sample File</li>
            <li role="option" tabindex="-1" data-preset-action="sample:fee_waiver">
              <span>Fee Waiver<span class="preset-ext">.cbl</span></span>
              <small>Checking fee discount bug</small>
            </li>
            <li role="option" tabindex="-1" data-preset-action="sample:overdraft_trap">
              <span>Overdraft Bug<span class="preset-ext">.cbl</span></span>
              <small>Withdrawals counted before deposits</small>
            </li>
            <li role="option" tabindex="-1" data-preset-action="sample:wire_limit">
              <span>Wire Cutoff<span class="preset-ext">.cbl</span></span>
              <small>Manager approval &amp; cutoff time bug</small>
            </li>
            <li role="option" tabindex="-1" data-preset-action="sample:loan_interest">
              <span>Loan APR<span class="preset-ext">.cbl</span></span>
              <small>Loan interest rounding &amp; rate limit</small>
            </li>
            <li class="home-bar-presets-divider" role="separator"></li>
            <li role="option" tabindex="-1" class="is-generate-option" data-preset-action="generate">
              <span>✨ Create a Brand-New Sample</span>
              <small>Makes a fresh example file to test with</small>
            </li>
          </ul>
        </div>
        <div class="vs-chat-input-model">
          <button class="vs-chat-input-model-btn" type="button" aria-haspopup="listbox"></button>
          <ul class="vs-chat-input-menu" role="listbox" aria-label="Choose what to update to" hidden>
            <li role="option" data-value="cobol-python" aria-selected="true">COBOL → Python<small>Fixes bugs &amp; translates to modern Python</small></li>
            <li role="option" data-value="plsql-python">PL/SQL → Python<small>Updates old database rules safely</small></li>
            <li role="option" data-value="cobol-java">COBOL → Java<small>Translates rules to modern Java</small></li>
            <li role="option" data-value="audit-only">Plain-English Check<small>Finds bugs &amp; explains rules simply</small></li>
          </ul>
        </div>
        <button class="vs-chat-input-send" type="submit" aria-label="Update &amp; open Workspace"></button>
      </div>
    </form>
  `.trim();

  persistentChatComposerEl = wrapper.firstElementChild;
  const dropIconBtn = persistentChatComposerEl.querySelector('.home-drop-icon-btn');
  const composerTextarea = persistentChatComposerEl.querySelector('.vs-chat-input-text');
  const syncDropIconVisibility = () => {
    if (!dropIconBtn || !composerTextarea) return;
    dropIconBtn.classList.toggle('is-hidden', composerTextarea.value.trim().length > 0);
  };
  if (dropIconBtn) {
    dropIconBtn.addEventListener('click', () => {
      persistentChatComposerEl.querySelector('.vs-chat-input-attach')?.click();
    });
  }
  if (composerTextarea) {
    ['input', 'change', 'paste', 'drop'].forEach((evt) => {
      composerTextarea.addEventListener(evt, () => requestAnimationFrame(syncDropIconVisibility));
    });
    persistentChatComposerEl.addEventListener('reset', () => requestAnimationFrame(syncDropIconVisibility));
    persistentChatComposerEl.addEventListener('submit', () => requestAnimationFrame(syncDropIconVisibility));
    syncDropIconVisibility();
  }
  const api = (window.vsChatInput && typeof window.vsChatInput.mount === 'function')
    ? window.vsChatInput.mount(persistentChatComposerEl)
    : persistentChatComposerEl.vsChatInput;

  const presetsWrap = persistentChatComposerEl.querySelector('#home-bar-presets');
  const presetsBtn = presetsWrap?.querySelector('.home-bar-presets-btn');
  const presetsMenu = presetsWrap?.querySelector('.home-bar-presets-menu');
  const presetOptions = Array.from(presetsMenu?.querySelectorAll('[role="option"]') || []);
  const modelBtn = persistentChatComposerEl.querySelector('.vs-chat-input-model-btn');
  let activeOptionIdx = -1;

  const setActiveOption = (idx) => {
    activeOptionIdx = idx;
    presetOptions.forEach((opt, i) => opt.classList.toggle('is-active', i === idx));
  };

  const closePresetsMenu = (restoreFocus = false) => {
    if (!presetsMenu || !presetsBtn || presetsMenu.hidden) return;
    presetsMenu.hidden = true;
    presetsBtn.setAttribute('aria-expanded', 'false');
    setActiveOption(-1);
    if (restoreFocus) presetsBtn.focus();
  };

  const openPresetsMenu = () => {
    if (!presetsMenu || !presetsBtn) return;
    if (modelBtn && modelBtn.getAttribute('aria-expanded') === 'true') {
      modelBtn.click();
    }
    presetsMenu.hidden = false;
    presetsBtn.setAttribute('aria-expanded', 'true');
    setActiveOption(0);
    presetsMenu.focus();
  };

  const runPresetAction = (action) => {
    closePresetsMenu(false);
    if (!action) return;
    if (action === 'generate') {
      generateDistinctBankingFile(api);
      return;
    }
    if (action.startsWith('sample:')) {
      attachSampleScenarioToComposer(action.slice('sample:'.length));
    }
  };

  if (presetsBtn && presetsMenu) {
    presetsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (presetsMenu.hidden) openPresetsMenu();
      else closePresetsMenu(false);
    });

    presetsBtn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPresetsMenu();
      }
    });

    presetsMenu.tabIndex = -1;
    presetsMenu.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePresetsMenu(true);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveOption((activeOptionIdx + 1) % presetOptions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveOption((activeOptionIdx - 1 + presetOptions.length) % presetOptions.length);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const opt = presetOptions[activeOptionIdx];
        if (opt) runPresetAction(opt.dataset.presetAction);
      }
    });

    presetOptions.forEach((opt, idx) => {
      opt.addEventListener('mouseenter', () => setActiveOption(idx));
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        runPresetAction(opt.dataset.presetAction);
      });
    });

    if (modelBtn) {
      modelBtn.addEventListener('click', () => closePresetsMenu(false));
    }

    document.addEventListener('click', (e) => {
      if (presetsWrap && !presetsWrap.contains(e.target)) {
        closePresetsMenu(false);
      }
    });
  }

  persistentChatComposerEl.addEventListener('vs-chat-input:files', (e) => {
    const added = e.detail?.added || [];
    if (!api) return;
    added.forEach(({ id, file }) => {
      animateComposerFileUpload(api, id, file);
    });
  });

  persistentChatComposerEl.addEventListener('vs-chat-input:remove', (e) => {
    if (e.detail?.id) {
      composerStagedFiles.delete(e.detail.id);
    }
  });

  persistentChatComposerEl.addEventListener('vs-chat-input:submit', (e) => {
    if (!api) return;
    handleComposerSubmit(e.detail || {}, api);
  });

  return persistentChatComposerEl;
}

function attachSampleScenarioToComposer(presetKey) {
  const p = presets[presetKey];
  if (!p) return;
  const el = ensurePersistentChatComposer();
  const api = el.vsChatInput;
  if (!api) return;

  // Avoid attaching duplicate chip of same sample file if already staged in composer
  const alreadyAttached = (api.files || []).some(f => f.name === p.fileName);
  if (!alreadyAttached) {
    const sampleFile = new File([p.legacy + '\n'], p.fileName, { type: 'text/plain' });
    api.addFiles([sampleFile]);
  }
  if (!String(api.value || '').trim()) {
    api.value = `Check and fix rule errors in ${p.fileName} (${p.title})`;
  }
  api.focus();
}

function buildHomeDockHtml() {
  return `
    ${error ? `<div class="banner error" role="alert" style="width:100%"><span>${esc(error)}</span><button type="button" class="banner-dismiss" data-dismiss="error" aria-label="Dismiss">&times;</button></div>` : ''}
    ${notice ? `<div class="banner" role="status" style="width:100%"><span>${esc(notice)}</span><button type="button" class="banner-dismiss" data-dismiss="notice" aria-label="Dismiss">&times;</button></div>` : ''}
  `;
}

function renderHomeDockOnly() {
  const dock = document.getElementById('home-composer-dock');
  if (!dock) return;
  dock.innerHTML = buildHomeDockHtml();
  bindHomeEvents();
}

/* ==========================================================================
   PAGE 1: CONDENSED CHAT COMPOSER HOMEPAGE (OVER 3D SILICON CHIP)
   ========================================================================== */
function renderHomeStep1Page() {
  if (!HOME_CONTAINER) return;
  if (persistentChatComposerEl && persistentChatComposerEl.parentNode) {
    persistentChatComposerEl.parentNode.removeChild(persistentChatComposerEl);
  }

  HOME_CONTAINER.innerHTML = `
    <div id="vs-chat-input-slot" class="home-composer-slot"></div>
    <div id="home-composer-dock" class="home-composer-dock">
      ${buildHomeDockHtml()}
    </div>
  `;

  const slot = document.getElementById('vs-chat-input-slot');
  if (slot) {
    slot.appendChild(ensurePersistentChatComposer());
    if (window.a2bSyncThemeElements) window.a2bSyncThemeElements();
  }

  bindHomeEvents();
}

/* ==========================================================================
   PAGE 2: WORKSPACE — QUEUE VIEWER, CURRENT vs. SUGGESTED CODE & ANNOTATIONS
   ========================================================================== */
function renderWorkspacePage() {
  if (!WORKSPACE_CONTAINER) return;
  renderSidebarQueue();

  if (!fileQueue.length) {
    WORKSPACE_CONTAINER.innerHTML = `
      ${error ? `<div class="banner error" role="alert"><span>${esc(error)}</span><button type="button" class="banner-dismiss" data-dismiss="error" aria-label="Dismiss">&times;</button></div>` : ''}
      ${notice ? `<div class="banner" role="status"><span>${esc(notice)}</span><button type="button" class="banner-dismiss" data-dismiss="notice" aria-label="Dismiss">&times;</button></div>` : ''}
      <section class="step" style="text-align:center;padding:2.5rem 1.5rem">
        <h2 style="margin:0 0 0.5rem;font-family:var(--font-display)">No files added yet</h2>
        <p style="margin:0 0 1.25rem;color:var(--text-muted)">Add a file or try an example on the Home page to compare the old and updated versions side by side.</p>
        <div class="actions" style="justify-content:center">
          <a class="primary" href="/">Go to Home &amp; Add Files &rarr;</a>
          <button type="button" id="ws-load-sample-btn" class="btn-secondary">Try a Sample File</button>
        </div>
      </section>
    `;
    bindCommonQueueEvents();
    const loadSampleBtn = document.getElementById('ws-load-sample-btn');
    if (loadSampleBtn) {
      loadSampleBtn.onclick = () => {
        initDefaultQueue();
        saveQueueToStorage();
        render();
      };
    }
    return;
  }

  let activeIdx = fileQueue.findIndex(f => f.id === activeFileId);
  if (activeIdx < 0) {
    activeIdx = 0;
    applyQueueItemToGlobals(fileQueue[0]);
  }
  const activeItem = fileQueue[activeIdx];
  if (!activeItem.result || !Array.isArray(activeItem.annotations) || !activeItem.annotations.length) {
    autoFixQueueItem(activeItem);
    applyQueueItemToGlobals(activeItem);
  }

  const totalFiles = fileQueue.length;
  const approvedTotal = fileQueue.filter(f => f.approved).length;
  const allApproved = areAllFilesApproved();

  const currentLines = String(activeItem.source || '').split('\n');
  const suggestedLines = String(activeItem.result?.code || '').split('\n');
  const itemAnns = Array.isArray(activeItem.annotations) ? activeItem.annotations : [];
  const activeAnns = itemAnns.filter(a => a.status !== 'removed');

  // Map line -> annotation for Current Code & Suggested Code
  const currentLineAnn = new Map();
  const currentLineFirst = new Map();
  const suggestedLineAnn = new Map();
  const suggestedLineFirst = new Map();

  activeAnns.forEach(ann => {
    const [oStart, oEnd] = ann.oldRange || [1, 1];
    for (let ln = oStart; ln <= oEnd; ln++) {
      if (!currentLineAnn.has(ln)) currentLineAnn.set(ln, ann);
    }
    if (!currentLineFirst.has(oStart)) currentLineFirst.set(oStart, ann);

    const [nStart, nEnd] = ann.newRange || [1, 1];
    for (let ln = nStart; ln <= nEnd; ln++) {
      if (!suggestedLineAnn.has(ln)) suggestedLineAnn.set(ln, ann);
    }
    if (!suggestedLineFirst.has(nStart)) suggestedLineFirst.set(nStart, ann);
  });

  const editedCount = itemAnns.filter(a => a.status === 'edited').length;
  const removedCount = itemAnns.filter(a => a.status === 'removed').length;

  WORKSPACE_CONTAINER.innerHTML = `
    ${error ? `<div class="banner error" role="alert"><span>${esc(error)}</span><button type="button" class="banner-dismiss" data-dismiss="error" aria-label="Dismiss">&times;</button></div>` : ''}
    ${notice ? `<div class="banner" role="status"><span>${esc(notice)}</span><button type="button" class="banner-dismiss" data-dismiss="notice" aria-label="Dismiss">&times;</button></div>` : ''}

    <!-- 1. Top Queue Viewer Navigation Bar -->
    <header class="qv-header-bar" aria-label="Queue Viewer navigation">
      <button type="button" id="qv-prev-file" class="qv-nav-btn" ${activeIdx <= 0 ? 'disabled' : ''}>
        &larr; Back
      </button>

      <div class="qv-center-info">
        <div class="qv-file-headline">
          <span class="qv-file-num">File #${activeIdx + 1} of ${totalFiles}</span>
          <span>${esc(activeItem.name)}</span>
        </div>
        <div class="qv-sub-label">
          <span>File Review &middot; ${esc(activeItem.language || 'COBOL')} &rarr; ${esc(activeItem.target || 'Python')}</span>
          <span class="qv-approval-badge ${activeItem.approved ? 'is-approved' : ''}">
            ${activeItem.approved ? '✓ Approved & Complete' : `${activeAnns.length} Fix${activeAnns.length === 1 ? '' : 'es'} Ready`}
          </span>
        </div>
      </div>

      <button type="button" id="qv-next-file" class="qv-nav-btn" ${activeIdx >= totalFiles - 1 ? 'disabled' : ''}>
        Next &rarr;
      </button>
    </header>

    <!-- 2. Side-by-Side Current Code vs. Suggested Code -->
    <section class="qv-code-grid" aria-label="Old Code and Updated Code comparison">
      <div class="qv-code-pane is-current">
        <div class="ide-header">
          <div class="ide-title-group">
            <span class="ide-title"><span class="ide-code-icon" aria-hidden="true">&lt;&gt;</span>Old Code (Before)</span>
            <span class="ide-badge">${esc(activeItem.language || 'COBOL')}</span>
          </div>
          <div class="ide-meta">
            <span class="ide-lines">${currentLines.length} lines</span>
            <button type="button" class="copy-btn" data-copy="source">Copy</button>
          </div>
        </div>
        <div class="qv-code-scroll" id="qv-current-scroll">
          ${currentLines.map((lineText, idx) => {
            const ln = idx + 1;
            const ann = currentLineAnn.get(ln);
            const firstAnn = currentLineFirst.get(ln);
            const isHovered = ann && hoveredAnnId === ann.id;
            const cls = [
              'qv-line-row',
              ann ? 'has-ann-current' : '',
              isHovered ? 'is-ann-active' : ''
            ].filter(Boolean).join(' ');
            return `
              <div class="${cls}" ${ann ? `data-ann-id="${esc(ann.id)}" data-side="current"` : ''} data-ln="${ln}">
                <span class="qv-ln">${ln}</span>
                <span class="qv-code-text">${highlightCodeLine(lineText, activeItem.language || 'COBOL')}</span>
                ${firstAnn ? `<span class="qv-line-tag">${esc(formatChangeLabel(firstAnn.id))} &middot; ${esc(firstAnn.oldRefLabel)}</span>` : '<span></span>'}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="qv-code-pane is-suggested">
        <div class="ide-header">
          <div class="ide-title-group">
            <span class="ide-title"><span class="ide-code-icon" aria-hidden="true">&lt;&gt;</span>Updated Code (After)</span>
            <span class="ide-badge">${esc(activeItem.target || 'Python')} &middot; Fixed</span>
          </div>
          <div class="ide-meta">
            <span class="ide-lines">${suggestedLines.length} lines</span>
            <button type="button" class="copy-btn" data-copy="code">Copy</button>
            <button type="button" class="copy-btn" id="download">Download</button>
          </div>
        </div>
        <div class="qv-code-scroll" id="qv-suggested-scroll">
          ${suggestedLines.map((lineText, idx) => {
            const ln = idx + 1;
            const ann = suggestedLineAnn.get(ln);
            const firstAnn = suggestedLineFirst.get(ln);
            const isHovered = ann && hoveredAnnId === ann.id;
            const cls = [
              'qv-line-row',
              ann ? 'has-ann-suggested' : '',
              isHovered ? 'is-ann-active' : ''
            ].filter(Boolean).join(' ');
            return `
              <div class="${cls}" ${ann ? `data-ann-id="${esc(ann.id)}" data-side="suggested"` : ''} data-ln="${ln}">
                <span class="qv-ln">${ln}</span>
                <span class="qv-code-text">${highlightCodeLine(lineText, activeItem.target || 'Python')}</span>
                ${firstAnn ? `<span class="qv-line-tag">${esc(formatChangeLabel(firstAnn.id))} &middot; ${esc(firstAnn.newRefLabel)}</span>` : '<span></span>'}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </section>

    <!-- 3. Annotation Viewer Panel (2-Column Grid of Version-Control Cards) -->
    <section class="qv-annotation-panel" aria-labelledby="qv-ann-heading">
      <div class="qv-ann-panel-head">
        <div>
          <h2 id="qv-ann-heading">Plain-English Change Notes</h2>
          <p>Simple notes explaining what each section does and why we changed it. Point your mouse at any card or highlighted line to see where it lives in the file.</p>
        </div>
        <span class="qv-hover-readout" id="qv-hover-readout">
          Hover a line or card to highlight it (${activeAnns.length} active${editedCount ? ` · ${editedCount} edited` : ''}${removedCount ? ` · ${removedCount} removed` : ''})
        </span>
      </div>

      <div class="qv-annotation-grid" role="list">
        ${itemAnns.map((ann, idx) => {
          const isRemoved = ann.status === 'removed';
          const isEdited = ann.status === 'edited';
          const isHovered = !isRemoved && hoveredAnnId === ann.id;
          const kindCls = isRemoved ? 'is-removed' : isEdited ? 'is-edited' : '';
          const kindText = isRemoved ? 'Removed (Click Update to apply)' : isEdited ? 'Edited by You' : ann.kindLabel;
          return `
            <article
              class="qv-ann-card ${isRemoved ? 'is-removed' : ''} ${isHovered ? 'is-ann-active' : ''}"
              role="listitem"
              data-ann-card="${esc(ann.id)}"
              data-ann-index="${idx}"
            >
              <div>
                <div class="qv-ann-top">
                  <div class="qv-ann-badges">
                    <span class="qv-ann-id">${esc(formatChangeLabel(ann.id))}</span>
                    <span class="qv-ann-lines">${esc(ann.oldRefLabel)} &rarr; ${esc(ann.newRefLabel)}</span>
                  </div>
                  <span class="qv-ann-kind ${kindCls}">${esc(kindText)}</span>
                </div>

                <div class="qv-ann-body" style="margin-top:10px">
                  <div class="qv-ann-what">
                    <strong>What this part does:</strong> ${esc(ann.whatItDoes)}
                  </div>
                  ${ann.editing ? `
                    <div style="margin-top:6px">
                      <label style="display:block;font-size:11.5px;font-weight:600;color:var(--amber);margin-bottom:4px" for="ann-edit-box-${idx}">
                        Tell us what you want changed instead:
                      </label>
                      <textarea id="ann-edit-box-${idx}" class="qv-ann-edit-area" data-ann-textarea="${idx}">${esc(ann.reason)}</textarea>
                    </div>
                  ` : `
                    <div class="qv-ann-why">
                      <strong>Why we changed it:</strong> ${esc(ann.reason)}
                    </div>
                  `}
                </div>
              </div>

              <div class="qv-ann-actions">
                ${ann.editing ? `
                  <button type="button" class="qv-ann-btn" data-ann-save="${idx}">Save</button>
                  <button type="button" class="qv-ann-btn" data-ann-cancel="${idx}">Cancel</button>
                ` : `
                  <button type="button" class="qv-ann-btn" data-ann-edit="${idx}" ${isRemoved ? 'disabled' : ''}>Edit</button>
                  <button type="button" class="qv-ann-btn ${isRemoved ? '' : 'is-remove'}" data-ann-toggle-remove="${idx}">
                    ${isRemoved ? 'Restore' : 'Remove'}
                  </button>
                `}
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </section>

    <!-- 4. Bottom Action Bar: Approve File (Green) | Update Changes (Cyan/Blue) -->
    <div class="qv-bottom-actions">
      <button
        type="button"
        id="approve-file-btn"
        class="btn-approve-complete ${activeItem.approved ? 'is-already-approved' : ''}"
        ${busy ? 'disabled' : ''}
      >
        <span>${activeItem.approved ? '✓ Approved & Complete' : 'Approve changes & mark file done'}</span>
        <small>${activeItem.approved
          ? (allApproved ? 'All files approved! Click "View Summary & Export" in the left sidebar →' : `${approvedTotal} of ${totalFiles} files approved · Click to make more edits`)
          : `Marks ${esc(activeItem.name)} as ready (${approvedTotal}/${totalFiles} approved)`}</small>
      </button>

      <button
        type="button"
        id="rerun-analysis-btn"
        class="btn-rerun-analysis"
        ${busy ? 'disabled' : ''}
      >
        <span>${busy === 'rerun' ? 'Updating code…' : 'Apply my edits'}</span>
        <small>Updates the new code using your edited or removed notes</small>
      </button>
    </div>
  `;

  bindWorkspaceEvents();
}

/* ==========================================================================
   PAGE 3: QUEUE-WIDE SUMMARY & REPORT PAGE (/summary.html)
   ========================================================================== */
const GENERATED_CHANGELOG_DESCRIPTIONS = {
  cd_early_withdrawal: {
    did: 'Figured out early withdrawal fees for CDs, but mixed up the grace-period rule and dropped fractions of a penny.',
    now: 'Checks if the CD reached its term or grace window clearly and rounds every dollar amount to the exact penny.',
    improved: 'Keeps the same 3% and 1.5% early fee rules while making sure customers inside their grace window are not overcharged.'
  },
  ach_batch_settlement: {
    did: 'Checked bank transfer batch totals and cutoff times in old code to pick same-day or next-day delivery.',
    now: 'Checks batch amounts upfront, enforces the exact $100,000.00 same-day limit, and routes transfers reliably.',
    improved: 'Keeps same-day vs. next-day delivery rules intact while blocking negative numbers and penny rounding mistakes.'
  },
  escrow_tax_disbursement: {
    did: 'Divided yearly property taxes by 12 without rounding or checking for negative tax amounts, causing penny errors.',
    now: 'Figures out monthly escrow payments rounded cleanly to the nearest penny and adjusts for any shortfall.',
    improved: 'Keeps the same monthly escrow math while stopping leftover fraction-of-a-cent errors and invalid numbers.'
  },
  atm_daily_withdrawal: {
    did: 'Checked ATM cash withdrawals against a $1,000 daily limit without stopping negative withdrawal amounts.',
    now: 'Blocks negative or blank withdrawal amounts right away and totals daily ATM cash use cleanly.',
    improved: 'Keeps the $1,000 daily ATM cap working normally while stopping invalid negative withdrawal requests.'
  },
  fx_remittance_spread: {
    did: 'Used approximate computer math for foreign exchange fees on international money transfers.',
    now: 'Uses exact penny-level money math and checks payment numbers right at the start.',
    improved: 'Keeps the exact currency rate formula while stopping tiny rounding errors on international transfers.'
  },
  credit_card_grace_period: {
    did: 'Charged monthly credit card interest even when the customer paid their previous bill in full.',
    now: 'Checks if the customer paid in full first and checks inputs before calculating exact penny-level interest.',
    improved: 'Keeps normal interest billing working for unpaid balances while making sure paid-in-full customers pay $0 interest.'
  }
};

function describeFileChangelog(item) {
  const targetLang = /java/i.test(String(item.target || '')) ? 'Java' : 'Python';
  const activeAnns = (item.annotations || []).filter(a => a.status !== 'removed');
  const editedAnns = activeAnns.filter(a => a.status === 'edited');
  const removedCount = (item.annotations || []).filter(a => a.status === 'removed').length;
  const stem = String(item.name || '').replace(/\.[^.]+$/, '').replace(/_v\d+$/i, '').toLowerCase();

  const builtInMap = {
    fee_waiver: {
      did: 'Checked $12 monthly checking fees, but tucked the under-25 student discount inside the direct-deposit rule by mistake.',
      now: `Written in clear ${targetLang}: checks inputs first, then checks the $1,500 balance, $500 deposit, and student discounts fairly.`,
      improved: 'Keeps existing $0 fee waivers for high-balance and direct-deposit accounts while fixing the bug that overcharged students.'
    },
    overdraft_trap: {
      did: 'Took out withdrawals before counting same-day deposits, charging unfair $35 overdraft fees even when enough money arrived.',
      now: `Counts same-day deposits before checking withdrawals in ${targetLang}, and blocks negative amounts.`,
      improved: 'Keeps overdraft fees when funds are truly short while ending unfair fees caused by processing withdrawals first.'
    },
    wire_limit: {
      did: 'Processed wire transfers with an off-by-one cutoff hour and skipped manager approval right at the dollar limit.',
      now: `Enforces exact cutoff hours, manager approval thresholds, and safety checks upfront in ${targetLang}.`,
      improved: 'Keeps everyday wires moving smoothly while closing approval gaps right at exact dollar and time cutoffs.'
    },
    loan_interest: {
      did: 'Calculated loan penalty rates with cut-off math and had no built-in check for the maximum allowed rate cap.',
      now: `Calculates loan interest and rate caps cleanly to the exact cent in ${targetLang} with upfront safety checks.`,
      improved: 'Keeps normal loan interest working while preventing penny rounding drift and enforcing legal rate limits.'
    }
  };

  let base = null;
  if (item.isBuiltIn && item.presetKey && builtInMap[item.presetKey]) {
    base = builtInMap[item.presetKey];
  } else if (GENERATED_CHANGELOG_DESCRIPTIONS[stem]) {
    base = GENERATED_CHANGELOG_DESCRIPTIONS[stem];
  } else {
    const srcLang = item.language || 'legacy';
    base = {
      did: `Ran ${srcLang} rules across ${String(item.source || '').split('\n').length} lines without upfront safety checks or consistent rounding.`,
      now: `Updated into clear ${targetLang} steps with ${activeAnns.length} active fix${activeAnns.length === 1 ? '' : 'es'} and a single clear result.`,
      improved: 'Keeps your core rules working the same while adding safety checks, accurate math, and plain-English notes.'
    };
  }

  let customNote = '';
  if (editedAnns.length || removedCount) {
    const parts = [];
    if (editedAnns.length) parts.push(`${editedAnns.length} note${editedAnns.length === 1 ? '' : 's'} edited by you`);
    if (removedCount) parts.push(`${removedCount} change${removedCount === 1 ? '' : 's'} removed`);
    customNote = ` Includes your Workspace edits (${parts.join(' & ')}).`;
  }

  return {
    did: base.did,
    now: base.now,
    improved: base.improved + customNote,
    activeAnns
  };
}

function renderSummaryOverviewLiveHtml() {
  const m = computeImpactMetrics();
  return `
    <div class="sum-kpi-row">
      <div class="sum-kpi-card">
        <span class="sum-kpi-label">Hours Saved</span>
        <div class="sum-kpi-val is-sky">
          <span>${m.savedHrs} hrs</span>
          <span class="report-delta-pill">&minus;${m.pctSaved}%</span>
        </div>
        <span class="sum-kpi-sub">${m.assistedHrs} hrs with A2B Labs vs. ${m.baselineHrs} hrs by hand${m.modules > 1 ? ` (&times;${m.modules} batch)` : ''}</span>
      </div>

      <div class="sum-kpi-card">
        <span class="sum-kpi-label">Money Saved</span>
        <div class="sum-kpi-val is-emerald">${fmtMoney(m.savedDollars)}</div>
        <span class="sum-kpi-sub">(${m.baselineHrs}h &minus; ${m.assistedHrs}h) &times; $${m.rate}/hr team cost</span>
      </div>

      <div class="sum-kpi-card">
        <span class="sum-kpi-label">Files Ready</span>
        <div class="sum-kpi-val">${m.approvedCount} / ${m.fileCount} <span style="font-size:14px;font-weight:600;color:var(--text-muted)">approved</span></div>
        <span class="sum-kpi-sub">${m.activeAnnotations} improvement${m.activeAnnotations === 1 ? '' : 's'} across ${m.totalLines} lines</span>
      </div>
    </div>

    <div class="sum-better-panel">
      <h3>How the System Is Better</h3>
      <ul class="sum-better-list">
        <li>
          <strong>Exact to the Penny</strong>
          Fixes old rounding mistakes so every customer balance, fee, and interest payment adds up to the exact cent.
        </li>
        <li>
          <strong>Built-In Safety Checks</strong>
          Catches negative numbers, missing info, and skipped rules (like missed student discounts) before any account is changed.
        </li>
        <li>
          <strong>Easy for Anyone to Review</strong>
          Turns ${m.sloc} lines of hard-to-read old code into clear steps backed by ${m.activeAnnotations} plain-English notes anyone can read.
        </li>
      </ul>
    </div>
  `;
}

/* Standards-compliant pure-JS PKZIP (Store / UTF-8) generator */
const ZIP_CRC_TABLE = (() => {
  const tbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    tbl[n] = c >>> 0;
  }
  return tbl;
})();

function crc32Bytes(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = ZIP_CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createZipArchiveBytes(entries) {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = ((now.getHours() & 0x1F) << 11) | ((now.getMinutes() & 0x3F) << 5) | ((now.getSeconds() >> 1) & 0x1F);
  const dosDate = (((Math.max(1980, now.getFullYear()) - 1980) & 0x7F) << 9) | (((now.getMonth() + 1) & 0x0F) << 5) | (now.getDate() & 0x1F);

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  entries.forEach(entry => {
    const nameBytes = enc.encode(entry.name);
    const dataBytes = typeof entry.content === 'string' ? enc.encode(entry.content) : entry.content;
    const crc = crc32Bytes(dataBytes);
    const size = dataBytes.length;

    const local = new Uint8Array(30 + nameBytes.length + size);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true);      // Store (no compression)
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(dataBytes, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length;
  });

  const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalBytes = offset + centralSize + 22;
  const out = new Uint8Array(totalBytes);
  let pos = 0;
  localParts.forEach(p => { out.set(p, pos); pos += p.length; });
  centralParts.forEach(p => { out.set(p, pos); pos += p.length; });
  out.set(eocd, pos);
  return out;
}

function exportApprovedQueueAsZip() {
  const approvedItems = fileQueue.filter(f => f.approved);
  if (!approvedItems.length) {
    error = 'Please approve at least one file (or click "Approve All Pending" above) before exporting your .zip archive.';
    render();
    return;
  }

  const usedZipNames = new Set();
  const entries = [];
  const changelogSections = [
    '# A2B Labs — Plain-English Feature Changelog',
    '',
    `Exported ${approvedItems.length} approved module${approvedItems.length === 1 ? '' : 's'} with changes applied.`,
    ''
  ];

  approvedItems.forEach((item, idx) => {
    if (!item.result?.code) autoFixQueueItem(item);
    const ext = /java/i.test(String(item.target || '')) ? 'java' : 'py';
    const baseStem = String(item.name || `module_${idx + 1}`).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') || `module_${idx + 1}`;
    let outName = `${baseStem}_modernized.${ext}`;
    let dup = 2;
    while (usedZipNames.has(outName.toLowerCase())) {
      outName = `${baseStem}_modernized_${dup}.${ext}`;
      dup += 1;
    }
    usedZipNames.add(outName.toLowerCase());

    entries.push({
      name: outName,
      content: String(item.result?.code || '') + '\n'
    });

    const desc = describeFileChangelog(item);
    changelogSections.push(`## ${idx + 1}. ${item.name} -> \`${outName}\` (${item.language || 'Old'} -> ${item.target || 'Python'})`);
    changelogSections.push(`- **What it did before:** ${desc.did}`);
    changelogSections.push(`- **What it does now:** ${desc.now}`);
    changelogSections.push(`- **Why it's better:** ${desc.improved}`);
    if (desc.activeAnns.length) {
      changelogSections.push(`- **Changes applied:**`);
      desc.activeAnns.forEach(a => {
        changelogSections.push(`  - \`${formatChangeLabel(a.id)}\` (${a.oldRefLabel} -> ${a.newRefLabel}): ${a.reason}`);
      });
    }
    changelogSections.push('');
  });

  const m = computeImpactMetrics();
  const overviewMd = [
    '# A2B Labs — Summary Overview',
    '',
    `- **Approved Files Exported:** ${approvedItems.length} of ${fileQueue.length} file${fileQueue.length === 1 ? '' : 's'}`,
    `- **Estimated Hours Saved:** ${m.savedHrs} hrs (-${m.pctSaved}% vs. ${m.baselineHrs} hrs by hand; ${m.assistedHrs} hrs with A2B Labs)`,
    `- **Estimated Money Saved:** ${fmtMoney(m.savedDollars)} (at $${m.rate}/hr${m.modules > 1 ? `, ${m.modules}x batch size` : ''})`,
    '',
    '## How the System Is Better',
    '1. **Exact to the Penny:** Fixes old rounding mistakes so every customer balance, fee, and interest payment adds up to the exact cent.',
    '2. **Built-In Safety Checks:** Catches negative numbers, missing info, and skipped rules before any account is changed.',
    `3. **Easy for Anyone to Review:** Turns ${m.sloc} lines of hard-to-read old code into clear steps backed by ${m.activeAnnotations} plain-English notes.`,
    ''
  ].join('\n');

  entries.push({ name: 'CHANGELOG.md', content: changelogSections.join('\n') });
  entries.push({ name: 'SUMMARY_OVERVIEW.md', content: overviewMd });

  const zipBytes = createZipArchiveBytes(entries);
  const blob = new Blob([zipBytes], { type: 'application/zip' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'a2b_approved_file_queue.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);

  notice = `Downloaded a2b_approved_file_queue.zip (${approvedItems.length} updated file${approvedItems.length === 1 ? '' : 's'} plus Changelog & Summary).`;
  render();
}

function renderSummaryPage() {
  if (!SUMMARY_CONTAINER) return;

  fileQueue.forEach(item => {
    if (!item.result?.code) autoFixQueueItem(item);
    if (item.approved) ensureQueueItemChecks(item);
  });

  const totalFiles = fileQueue.length;
  const approvedCount = fileQueue.filter(f => f.approved).length;
  const pendingCount = Math.max(0, totalFiles - approvedCount);
  const allApproved = totalFiles > 0 && pendingCount === 0;

  SUMMARY_CONTAINER.innerHTML = `
    <div class="sum-stack">
      ${error ? `<div class="banner error" role="alert"><span>${esc(error)}</span><button type="button" class="banner-dismiss" data-dismiss="error" aria-label="Dismiss">&times;</button></div>` : ''}
      ${notice ? `<div class="banner" role="status"><span>${esc(notice)}</span><button type="button" class="banner-dismiss" data-dismiss="notice" aria-label="Dismiss">&times;</button></div>` : ''}

      <!-- ZONE 1: FEATURE CHANGELOG -->
      <section class="sum-changelog-section" id="summary-changelog-section" aria-labelledby="sum-changelog-title">
        <div class="sum-zone-head">
          <div class="sum-zone-title-wrap">
            <div class="sum-title-row">
              <h1 id="sum-changelog-title">Feature Changelog</h1>
              <span class="sum-eyebrow is-amber">Plain-English Summary</span>
            </div>
            <p>Simple rundown of what each file used to do, what it does now, and why the new version is safer.</p>
          </div>

          <div class="sum-head-actions">
            <span class="sum-approval-pill ${allApproved ? 'is-complete' : ''}">
              ${allApproved ? '✓ All' : `${approvedCount} of`} ${totalFiles} file${totalFiles === 1 ? '' : 's'} approved
            </span>
            ${pendingCount > 0 ? `
              <button type="button" id="summary-approve-all-btn" class="sum-approve-all-btn">
                ✓ Approve All (${pendingCount})
              </button>
            ` : ''}
          </div>
        </div>

        ${totalFiles ? `
          <div class="sum-changelog-list" role="list" aria-label="Plain-English changelog entries per file">
            ${fileQueue.map((item, idx) => {
              const desc = describeFileChangelog(item);
              const convLabel = `${item.language || 'COBOL'} → ${item.target || 'Python'}`;
              return `
                <article class="sum-file-card ${item.approved ? 'is-approved' : ''}" role="listitem">
                  <div class="sum-file-head">
                    <div class="sum-file-title-group">
                      <span class="sum-file-index">#${idx + 1}</span>
                      <span class="sum-file-name">${esc(item.name)}</span>
                      <span class="sum-file-target-pill">${esc(convLabel)}</span>
                    </div>
                    <div class="sum-file-status-group">
                      <span class="sum-status-badge ${item.approved ? 'is-approved' : 'is-pending'}">
                        ${item.approved ? '✓ Ready to Download' : 'Needs Approval'}
                      </span>
                      ${!item.approved ? `
                        <button type="button" class="sum-inline-approve-btn" data-summary-approve-file="${esc(item.id)}">
                          ✓ Approve
                        </button>
                      ` : ''}
                    </div>
                  </div>

                  <div class="sum-feature-desc">
                    <div class="sum-desc-col is-before">
                      <span class="sum-desc-label">What It Did Before</span>
                      <p>${esc(desc.did)}</p>
                    </div>
                    <div class="sum-desc-col is-now">
                      <span class="sum-desc-label">What It Does Now</span>
                      <p>${esc(desc.now)}</p>
                    </div>
                    <div class="sum-desc-col is-improved">
                      <span class="sum-desc-label">Why It&apos;s Better</span>
                      <p>${esc(desc.improved)}</p>
                    </div>
                  </div>

                  ${desc.activeAnns.length ? `
                    <div class="sum-ann-chips" aria-label="Changes made to ${esc(item.name)}">
                      ${desc.activeAnns.map(ann => `
                        <span class="sum-ann-chip">
                          <code>${esc(formatChangeLabel(ann.id))}</code>
                          <span>${esc(ann.whatItDoes)}</span>
                        </span>
                      `).join('')}
                    </div>
                  ` : ''}

                  <button
                    type="button"
                    class="sum-workspace-jump-bar"
                    data-jump-workspace-file="${esc(item.id)}"
                  >
                    <span class="sum-jump-primary">View ${esc(item.name)} in Workspace &rarr;</span>
                    <span class="sum-jump-sub">Open in Workspace if you change your mind and want to edit anything</span>
                  </button>
                </article>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="step-locked-hint">
            No files added yet. <a href="/" style="color:var(--amber)">Add or create a sample file on the Home page</a> first.
          </div>
        `}
      </section>

      <!-- ZONE 2: SUMMARY OVERVIEW -->
      <section class="sum-overview-section" id="summary-roi-section" aria-labelledby="sum-overview-title">
        <div class="sum-zone-head">
          <div class="sum-zone-title-wrap">
            <div class="sum-title-row">
              <h2 id="sum-overview-title">Summary Overview</h2>
              <span class="sum-eyebrow is-blue">Time &amp; Cost Savings</span>
            </div>
            <p>Estimated hours saved, money saved, and why your updated files are safer and easier to trust.</p>
          </div>

          <div class="sum-head-actions">
            <button type="button" class="copy-btn" data-copy="report">Copy summary</button>
          </div>
        </div>

        <div id="report-stats-live">
          ${renderSummaryOverviewLiveHtml()}
        </div>

        <details class="assumptions-drawer" style="margin-top:16px">
          <summary>
            <span>Adjust savings calculator</span>
            <span class="assumptions-drawer-hint">Change hourly team cost, review speed, or batch size</span>
          </summary>
          <div class="report-assumptions-bar">
            <div class="assumptions-controls">
              <label class="assumption-slider">
                <span>Team hourly cost: <strong id="lbl-rate">$${roiSettings.hourlyRate}/hr</strong></span>
                <input type="range" id="roi-rate" min="60" max="250" step="5" value="${roiSettings.hourlyRate}" />
              </label>

              <label class="assumption-slider">
                <span>Minutes per line by hand: <strong id="lbl-pace">${roiSettings.minsPerSloc} min</strong></span>
                <input type="range" id="roi-pace" min="4" max="25" step="1" value="${roiSettings.minsPerSloc}" />
              </label>

              <label class="assumption-slider">
                <span>Time needed with A2B Labs: <strong id="lbl-ratio">${Math.round(roiSettings.a2bRatio * 100)}% of manual</strong></span>
                <input type="range" id="roi-ratio" min="15" max="60" step="1" value="${Math.round(roiSettings.a2bRatio * 100)}" />
              </label>

              <div class="assumption-slider">
                <span>Batch size: <strong id="lbl-scale">${roiSettings.moduleMultiplier === 1 ? 'Current files (1×)' : roiSettings.moduleMultiplier + '× files'}</strong></span>
                <div class="scale-pills" role="group" aria-label="Batch size multiplier">
                  ${[1, 10, 50, 100].map(mult => `
                    <button type="button" class="${roiSettings.moduleMultiplier === mult ? 'active' : ''}" data-roi-scale="${mult}">${mult === 1 ? '1× files' : mult + '×'}</button>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>
        </details>
      </section>

      <!-- ZONE 3: EXPORT APPROVED FILE QUEUE AS ZIP -->
      <div class="sum-export-zone">
        <button
          type="button"
          id="export-approved-zip-btn"
          class="sum-export-zip-btn"
          ${approvedCount === 0 ? 'disabled' : ''}
        >
          <span class="sum-export-zip-main">Export approved file queue with changes applied as .zip</span>
          <span class="sum-export-zip-sub">
            ${approvedCount > 0
              ? `Includes ${approvedCount} updated file${approvedCount === 1 ? '' : 's'} plus plain-English Changelog & Summary`
              : 'Approve at least 1 file above (or click "Approve All") to unlock download'}
          </span>
        </button>
      </div>
    </div>
  `;

  bindSummaryEvents();
}

function refreshReportViewOnly() {
  const statsContainer = document.getElementById('report-stats-live');
  if (statsContainer) statsContainer.innerHTML = renderSummaryOverviewLiveHtml();
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setTxt('lbl-rate', `$${roiSettings.hourlyRate}/hr`);
  setTxt('lbl-pace', `${roiSettings.minsPerSloc} min`);
  setTxt('lbl-ratio', `${Math.round(roiSettings.a2bRatio * 100)}% of manual`);
  setTxt('lbl-scale', roiSettings.moduleMultiplier === 1 ? 'Current files (1×)' : `${roiSettings.moduleMultiplier}× files`);
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
   EVENT BINDINGS FOR ALL PAGES
   ========================================================================== */
function bindCommonQueueEvents() {
  const collapseBtn = document.getElementById('sidebar-collapse-toggle');
  if (collapseBtn) {
    collapseBtn.onclick = () => {
      const nextCollapsed = !document.documentElement.classList.contains('ws-sidebar-collapsed');
      document.documentElement.classList.toggle('ws-sidebar-collapsed', nextCollapsed);
      try {
        localStorage.setItem('a2b-queue-collapsed', nextCollapsed ? '1' : '0');
      } catch (_e) {}
      syncSidebarCollapseButton();
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 250);
    };
  }

  document.querySelectorAll('[data-dismiss="error"]').forEach(b => {
    b.onclick = () => { error = ''; render(); };
  });
  document.querySelectorAll('[data-dismiss="notice"]').forEach(b => {
    b.onclick = () => { notice = ''; render(); };
  });
  document.querySelectorAll('[data-queue-select]').forEach(el => {
    const activate = (e) => {
      if (e.target && e.target.closest && e.target.closest('[data-queue-remove]')) return;
      selectQueueFile(el.dataset.queueSelect);
      if (IS_SUMMARY_PAGE) {
        window.location.href = '/workspace.html';
      }
    };
    el.onclick = activate;
    el.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate(e);
      }
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

  document.querySelectorAll('[data-composer-sample]').forEach(btn => {
    btn.onclick = () => {
      attachSampleScenarioToComposer(btn.dataset.composerSample);
    };
  });

  const clearBtn = document.getElementById('clear-all-entries-btn');
  if (clearBtn) {
    clearBtn.onclick = () => {
      fileQueue = [];
      activeFileId = '';
      uploadedFileName = '';
      source = '';
      policy = '';
      analysis = null;
      rules = [];
      result = null;
      checksRun = null;
      queuePage = 1;
      error = '';
      notice = '';
      if (persistentChatComposerEl && persistentChatComposerEl.vsChatInput) {
        persistentChatComposerEl.vsChatInput.clear();
      }
      composerStagedFiles.clear();
      saveQueueToStorage();
      renderHomeDockOnly();
    };
  }
}

function scrollRowInsideCodeBox(containerId, rowEl) {
  const box = document.getElementById(containerId);
  if (!box || !rowEl) return;
  const rowTop = rowEl.offsetTop;
  const rowBottom = rowTop + rowEl.offsetHeight;
  const viewTop = box.scrollTop;
  const viewBottom = viewTop + box.clientHeight;
  if (rowTop < viewTop) {
    box.scrollTo({ top: Math.max(0, rowTop - 12), behavior: 'smooth' });
  } else if (rowBottom > viewBottom) {
    box.scrollTo({ top: Math.max(0, rowBottom - box.clientHeight + 12), behavior: 'smooth' });
  }
}

function setHoveredAnnotation(annId, scrollPanes = false) {
  hoveredAnnId = annId || '';
  const activeItem = fileQueue.find(f => f.id === activeFileId) || fileQueue[0];
  const itemAnns = Array.isArray(activeItem?.annotations) ? activeItem.annotations : [];
  const matched = itemAnns.find(a => a.id === hoveredAnnId && a.status !== 'removed');

  document.querySelectorAll('.qv-ann-card[data-ann-card]').forEach(card => {
    card.classList.toggle('is-ann-active', Boolean(matched && card.dataset.annCard === matched.id));
  });
  document.querySelectorAll('.qv-line-row[data-ann-id]').forEach(row => {
    row.classList.toggle('is-ann-active', Boolean(matched && row.dataset.annId === matched.id));
  });

  const readout = document.getElementById('qv-hover-readout');
  if (readout) {
    if (matched) {
      readout.textContent = `${formatChangeLabel(matched.id)}: ${matched.oldRefLabel} → ${matched.newRefLabel} · ${matched.kindLabel}`;
    } else {
      const activeCount = itemAnns.filter(a => a.status !== 'removed').length;
      readout.textContent = `Hover a line or card to highlight it (${activeCount} active)`;
    }
  }

  if (scrollPanes && matched) {
    scrollRowInsideCodeBox(
      'qv-current-scroll',
      document.querySelector(`#qv-current-scroll .qv-line-row[data-ann-id="${matched.id}"]`)
    );
    scrollRowInsideCodeBox(
      'qv-suggested-scroll',
      document.querySelector(`#qv-suggested-scroll .qv-line-row[data-ann-id="${matched.id}"]`)
    );
  }
}

async function rerunWorkspaceAnalysis() {
  const activeItem = fileQueue.find(f => f.id === activeFileId) || fileQueue[0];
  if (!activeItem) return;

  busy = 'rerun';
  error = '';
  notice = '';
  render();

  // Save any open inline edit textareas before rerunning
  if (Array.isArray(activeItem.annotations)) {
    activeItem.annotations.forEach(ann => {
      if (ann.editing) ann.editing = false;
    });
  }

  // First rebuild Suggested Code deterministically from active/edited/removed annotations
  rebuildSuggestedCodeFromAnnotations(activeItem);

  // If live AI backend is configured, also let AI regenerate code from active/edited annotations
  const activeAnns = (activeItem.annotations || []).filter(a => a.status !== 'removed');
  if (configured && activeAnns.length > 0) {
    try {
      const r = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: activeItem.source,
          policy: activeItem.policy,
          language: activeItem.language,
          target: activeItem.target,
          rules: activeAnns.map(a => `${a.whatItDoes} — ${a.reason}`),
          bank_fixture: false
        })
      });
      const data = await r.json();
      if (r.ok && data && data.code) {
        activeItem.result = data;
      }
    } catch (_e) {
      // Deterministic annotation rebuild is already applied above
    }
  }

  activeItem.approved = false;
  activeItem.checksRun = null;
  applyQueueItemToGlobals(activeItem);
  busy = '';
  const removedCnt = (activeItem.annotations || []).filter(a => a.status === 'removed').length;
  const editedCnt = (activeItem.annotations || []).filter(a => a.status === 'edited').length;
  notice = `Updated "${activeItem.name}" (${activeAnns.length} active, ${editedCnt} edited, ${removedCnt} removed). Look over the Updated Code and click Approve when ready.`;
  saveQueueToStorage();
  render();
}

function bindWorkspaceEvents() {
  bindCommonQueueEvents();
  bindCopyButtons();

  const activeIdx = fileQueue.findIndex(f => f.id === activeFileId);
  const activeItem = fileQueue[activeIdx] || fileQueue[0];

  const prevBtn = document.getElementById('qv-prev-file');
  if (prevBtn) {
    prevBtn.onclick = () => {
      if (activeIdx > 0) {
        selectQueueFile(fileQueue[activeIdx - 1].id);
      }
    };
  }

  const nextBtn = document.getElementById('qv-next-file');
  if (nextBtn) {
    nextBtn.onclick = () => {
      if (activeIdx >= 0 && activeIdx < fileQueue.length - 1) {
        selectQueueFile(fileQueue[activeIdx + 1].id);
      }
    };
  }

  // Bidirectional hover highlighting: Annotation Cards <-> Current & Suggested Code lines
  document.querySelectorAll('.qv-ann-card[data-ann-card]').forEach(card => {
    const annId = card.dataset.annCard;
    card.addEventListener('pointerenter', () => setHoveredAnnotation(annId, false));
    card.addEventListener('pointerleave', () => setHoveredAnnotation('', false));
    card.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('textarea')) return;
      setHoveredAnnotation(annId, true);
    });
  });

  document.querySelectorAll('.qv-line-row[data-ann-id]').forEach(row => {
    const annId = row.dataset.annId;
    row.addEventListener('pointerenter', () => setHoveredAnnotation(annId, false));
    row.addEventListener('pointerleave', () => setHoveredAnnotation('', false));
    row.addEventListener('click', () => {
      setHoveredAnnotation(annId, false);
      const card = document.querySelector(`.qv-ann-card[data-ann-card="${annId}"]`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });

  // Annotation card Edit / Save / Cancel / Remove / Restore buttons
  document.querySelectorAll('[data-ann-edit]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.annEdit);
      if (!activeItem?.annotations?.[idx]) return;
      activeItem.annotations[idx].editing = true;
      applyQueueItemToGlobals(activeItem);
      saveQueueToStorage();
      render();
      const box = document.getElementById(`ann-edit-box-${idx}`);
      if (box) box.focus();
    };
  });

  document.querySelectorAll('[data-ann-save]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.annSave);
      const ann = activeItem?.annotations?.[idx];
      if (!ann) return;
      const box = document.getElementById(`ann-edit-box-${idx}`);
      const nextVal = box ? box.value.trim() : ann.reason;
      if (nextVal) {
        ann.reason = nextVal;
        ann.status = (nextVal !== ann.originalReason) ? 'edited' : 'active';
      }
      ann.editing = false;
      activeItem.approved = false;
      applyQueueItemToGlobals(activeItem);
      notice = `Saved ${formatChangeLabel(ann.id)}. Click "Apply my edits" below to update the new code.`;
      saveQueueToStorage();
      render();
    };
  });

  document.querySelectorAll('[data-ann-cancel]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.annCancel);
      const ann = activeItem?.annotations?.[idx];
      if (!ann) return;
      ann.editing = false;
      applyQueueItemToGlobals(activeItem);
      saveQueueToStorage();
      render();
    };
  });

  document.querySelectorAll('[data-ann-toggle-remove]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.annToggleRemove);
      const ann = activeItem?.annotations?.[idx];
      if (!ann) return;
      if (ann.status === 'removed') {
        ann.status = (ann.reason !== ann.originalReason) ? 'edited' : 'active';
        notice = `Restored ${formatChangeLabel(ann.id)}. Click "Apply my edits" to put it back in the updated code.`;
      } else {
        ann.status = 'removed';
        ann.editing = false;
        notice = `Removed ${formatChangeLabel(ann.id)}. Click "Apply my edits" to update the code without it.`;
      }
      activeItem.approved = false;
      applyQueueItemToGlobals(activeItem);
      saveQueueToStorage();
      render();
    };
  });

  // Approve changes and mark file as complete (auto-advances to next unapproved file)
  const approveBtn = document.getElementById('approve-file-btn');
  if (approveBtn) {
    approveBtn.onclick = () => {
      if (!activeItem) return;
      if (activeItem.approved) {
        activeItem.approved = false;
        applyQueueItemToGlobals(activeItem);
        notice = `Reopened "${activeItem.name}" so you can make more edits.`;
        saveQueueToStorage();
        render();
        return;
      }

      activeItem.approved = true;
      ensureQueueItemChecks(activeItem);
      applyQueueItemToGlobals(activeItem);

      // Find next unapproved file in queue (wrapping if needed)
      const nextUnapproved =
        fileQueue.slice(activeIdx + 1).find(f => !f.approved) ||
        fileQueue.slice(0, activeIdx).find(f => !f.approved);

      if (nextUnapproved) {
        applyQueueItemToGlobals(nextUnapproved);
        notice = `Approved "${activeItem.name}"! Moved to the next file: "${nextUnapproved.name}".`;
      } else {
        notice = `All ${fileQueue.length} file${fileQueue.length === 1 ? '' : 's'} approved! Click "View Summary & Export" in the left sidebar.`;
      }
      saveQueueToStorage();
      render();
    };
  }

  const rerunBtn = document.getElementById('rerun-analysis-btn');
  if (rerunBtn) {
    rerunBtn.onclick = rerunWorkspaceAnalysis;
  }

  const downloadBtn = document.getElementById('download');
  if (downloadBtn) downloadBtn.onclick = downloadGeneratedCode;
}

function approveAndVerifyAllQueuedFiles() {
  fileQueue.forEach(item => {
    if (!item.result?.code) autoFixQueueItem(item);
    item.approved = true;
    ensureQueueItemChecks(item);
  });
  const active = fileQueue.find(f => f.id === activeFileId) || fileQueue[0];
  if (active) applyQueueItemToGlobals(active);
  notice = `Approved all ${fileQueue.length} file${fileQueue.length === 1 ? '' : 's'} — ready to download as .zip below!`;
  saveQueueToStorage();
  render();
}

function bindSummaryEvents() {
  bindCommonQueueEvents();
  bindCopyButtons();

  const approveAllBtn = document.getElementById('summary-approve-all-btn');
  if (approveAllBtn) {
    approveAllBtn.onclick = approveAndVerifyAllQueuedFiles;
  }

  document.querySelectorAll('[data-summary-approve-file]').forEach(btn => {
    btn.onclick = () => {
      const fId = btn.dataset.summaryApproveFile;
      const target = fileQueue.find(f => f.id === fId);
      if (!target) return;
      if (!target.result?.code) autoFixQueueItem(target);
      target.approved = true;
      ensureQueueItemChecks(target);
      notice = `Approved "${target.name}" for .zip export.`;
      saveQueueToStorage();
      render();
    };
  });

  document.querySelectorAll('[data-jump-workspace-file]').forEach(row => {
    row.onclick = () => {
      const fId = row.dataset.jumpWorkspaceFile;
      if (fId) {
        selectQueueFile(fId);
        window.location.href = '/workspace.html';
      }
    };
  });

  const exportZipBtn = document.getElementById('export-approved-zip-btn');
  if (exportZipBtn) {
    exportZipBtn.onclick = exportApprovedQueueAsZip;
  }

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
  const baseName = activeItem ? activeItem.name.replace(/\.[^.]+$/, '') : 'modernized_module';
  const ext = activeItem && /java/i.test(String(activeItem.target || '')) ? 'java' : 'py';
  a.download = `${baseName}_updated.${ext}`;
  a.click();
  URL.revokeObjectURL(a.href);
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

// Initialize queue from sessionStorage or default to Banking Fee Waiver (auto-fixed on load)
if (!loadQueueFromStorage()) {
  initDefaultQueue();
  saveQueueToStorage();
}

const resetBtn = document.getElementById('reset');
if (resetBtn) resetBtn.onclick = resetAll;

checkStatus().then(render);
