import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom"; // Added Link import
import DualDropZone from "../components/DualDropZone";
import QuestionCard from "../components/QuestionCard";
import MarkingSchemeCard from "../components/MarkingSchemeCard";
import MetadataVerificationCard from "../components/MetadataVerificationCard";
import SessionTracker from "../components/SessionTracker";
import ManualPairingModal from "../components/ManualPairingModal";
import { uploadImage, saveQuestions, fetchQuestionCount, rescueMissingQuestions } from "../services/apiHandler";
import { toast } from "react-toastify";
import { Trash2 } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.includes(",") ? result.split(",", 2)[1] : result);
    };
    reader.onerror = reject;
  });

const chunkArray = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const SESSION_LABEL_BY_CODE = {
  m: "February/March",
  s: "May/June",
  w: "October/November",
};

const sessionCodeFromValue = (value = "") => {
  const s = String(value || "").trim().toLowerCase();
  if (["m", "s", "w"].includes(s)) return s;
  if (/(feb|february|mar|march)/i.test(s)) return "m";
  if (/(may|jun|june|jul|july|summer)/i.test(s)) return "s";
  if (/(oct|october|nov|november|winter)/i.test(s)) return "w";
  return "";
};

const sessionLabelFromValue = (value = "") => {
  const code = sessionCodeFromValue(value);
  return code ? SESSION_LABEL_BY_CODE[code] : String(value || "");
};

const metadataFromPaperKey = (key = "") => {
  const match = String(key || "")
    .trim()
    .toLowerCase()
    .match(/^igcse_(\d{4})_([msw])(\d{2})(?:_(?:qp|ms))?_(\d{1,2})$/);
  if (!match) return {};
  const [, subjectCode, sessionCode, yy, paperCode] = match;
  const paperDigit = paperCode[0];
  return {
    subjectCode,
    session: SESSION_LABEL_BY_CODE[sessionCode] || sessionCode,
    session_code: sessionCode,
    year: 2000 + Number(yy),
    paperNumber: Number(paperCode.length > 1 ? paperDigit : paperCode),
    tier: subjectCode === "0580" && ["2", "4"].includes(paperDigit)
      ? "Extended"
      : subjectCode === "0580" && ["1", "3"].includes(paperDigit)
        ? "Core"
        : "",
  };
};

const normalizeCanonicalForUi = (value = "") => String(value || "").trim().toLowerCase();

const isInvalidCanonicalForSave = (value = "") => {
  const id = normalizeCanonicalForUi(value);
  return !id || ["unknown", "unknown_id", "null", "undefined"].includes(id);
};

const canonicalRoot = (value = "") => normalizeCanonicalForUi(value).split(".").filter(Boolean)[0] || "";

const displayLabelFromCanonical = (value = "") => {
  const parts = normalizeCanonicalForUi(value).split(".").filter(Boolean);
  if (parts.length === 0) return "";
  return `${parts[0]}${parts.slice(1).map((part) => `(${part})`).join("")}`;
};

const getRowCanonical = (item = {}) => normalizeCanonicalForUi(item.canonical_question_id || item.question_id || "");

const isLeafCanonical = (value = "") => normalizeCanonicalForUi(value).includes(".");

const romanOrder = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };

const canonicalSortParts = (value = "") =>
  normalizeCanonicalForUi(value)
    .split(".")
    .filter(Boolean)
    .map((part, index) => {
      if (/^\d+$/.test(part)) return { group: 0, value: Number(part), raw: part };
      if (romanOrder[part]) return { group: 1, value: romanOrder[part], raw: part };
      if (/^[a-z]$/.test(part)) return { group: index === 1 ? 0 : 2, value: part.charCodeAt(0), raw: part };
      return { group: 3, value: part, raw: part };
    });

const compareCanonicalIds = (a = "", b = "") => {
  const left = canonicalSortParts(a);
  const right = canonicalSortParts(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    if (!left[i]) return -1;
    if (!right[i]) return 1;
    if (left[i].group !== right[i].group) return left[i].group - right[i].group;
    if (left[i].value !== right[i].value) {
      return left[i].value > right[i].value ? 1 : -1;
    }
  }
  return 0;
};

const rowHasChildCanonical = (items = [], parentId = "") => {
  const parent = normalizeCanonicalForUi(parentId);
  return Boolean(parent) && items.some((item) => getRowCanonical(item).startsWith(`${parent}.`));
};

const mergeDiagramUrls = (...groups) => {
  const seen = new Set();
  const merged = [];
  groups.flatMap((group) => sanitizeDiagramUrls(group)).forEach((url) => {
    if (!seen.has(url)) {
      seen.add(url);
      merged.push(url);
    }
  });
  return merged;
};

const mergeParentStemText = (parentText = "", childText = "") => {
  const parent = String(parentText || "").trim();
  const child = String(childText || "").trim();
  if (!parent) return child;
  if (!child) return parent;
  const parentSignal = parent.slice(0, 80).trim();
  if (parentSignal && child.includes(parentSignal)) return child;
  return `${parent}\n\n${child}`;
};

const stripMsAnchorPlaceholderText = (value = "") => {
  const text = String(value || "");
  if (!/MS anchor placeholder:/i.test(text)) return text;

  const cleaned = text
    .replace(/(?:^|\n)\s*[\d().a-zivx]*\s*\[MS anchor placeholder:[^\]]*\]\s*/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned || text;
};

const cleanMsAnchorPlaceholderRow = (row = {}) => {
  const cleanedQuestionLatex = stripMsAnchorPlaceholderText(row.question_latex);
  if (cleanedQuestionLatex === row.question_latex) return row;
  const warnings = Array.isArray(row.validation_warnings) ? row.validation_warnings : [];
  return {
    ...row,
    question_latex: cleanedQuestionLatex,
    validation_warnings: warnings.filter(
      (warning) => !String(warning || "").includes("MS anchor added a review-only placeholder")
    ),
  };
};

const parseGroupedSplitRepairHint = (warning = "") => {
  const text = String(warning || "");
  if (!/REPAIR_HINT\s+split_grouped_row/i.test(text)) return null;
  const missing = text.match(/\bmissing_id=([^\s]+)/i)?.[1];
  const source = text.match(/\bsource_id=([^\s]+)/i)?.[1];
  const confidence = text.match(/\bconfidence=([^\s.]+)/i)?.[1] || "";
  const missingId = normalizeCanonicalForUi(missing);
  const sourceId = normalizeCanonicalForUi(source);
  if (!missingId || !sourceId) return null;
  return { missingId, sourceId, confidence, warning: text };
};

const collectGroupedSplitRepairHints = (items = []) => {
  const hints = new Map();
  items.forEach((item, index) => {
    const warnings = Array.isArray(item?.validation_warnings) ? item.validation_warnings : [];
    warnings.forEach((warning) => {
      const parsed = parseGroupedSplitRepairHint(warning);
      if (!parsed) return;
      hints.set(parsed.missingId, {
        ...parsed,
        sourceIndex: index,
        sourceRow: item,
      });
    });
  });
  return hints;
};

const WORKFLOW_STORAGE_KEY = "paperly_ingestion_workflow_v1";

const uniqueCanonicalIds = (items = []) => [
  ...new Set(
    (items || [])
      .map((item) => normalizeCanonicalForUi(item?.canonical_question_id || item?.question_id || item?.question_latex))
      .filter(Boolean)
  ),
].sort(compareCanonicalIds);

const readWorkflowState = () => {
  try {
    const raw = window.localStorage.getItem(WORKFLOW_STORAGE_KEY);
    if (!raw) return { expectedNext: "ms", pendingMsKey: "", pendingMsLabel: "", pendingMsFileName: "", pendingMsCanonicalIds: [] };
    const parsed = JSON.parse(raw);
    return {
      expectedNext: parsed.expectedNext === "qp" ? "qp" : "ms",
      pendingMsKey: String(parsed.pendingMsKey || ""),
      pendingMsLabel: String(parsed.pendingMsLabel || ""),
      pendingMsFileName: String(parsed.pendingMsFileName || ""),
      pendingMsCanonicalIds: Array.isArray(parsed.pendingMsCanonicalIds)
        ? parsed.pendingMsCanonicalIds.map((id) => normalizeCanonicalForUi(id)).filter(Boolean).sort(compareCanonicalIds)
        : [],
    };
  } catch {
    return { expectedNext: "ms", pendingMsKey: "", pendingMsLabel: "", pendingMsFileName: "", pendingMsCanonicalIds: [] };
  }
};

const writeWorkflowState = (nextState) => {
  try {
    window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(nextState));
  } catch {
    // Local guidance only; never block extraction/save.
  }
};

const findLikelyRowIndexForCanonical = (items = [], canonicalId = "") => {
  const target = normalizeCanonicalForUi(canonicalId);
  if (!target) return -1;

  const exact = items.findIndex((item) => getRowCanonical(item) === target);
  if (exact >= 0) return exact;

  const root = canonicalRoot(target);
  if (!root) return -1;

  const parentOrChild = items.findIndex((item) => {
    const id = getRowCanonical(item);
    return id === root || id.startsWith(`${root}.`) || target.startsWith(`${id}.`);
  });
  return parentOrChild;
};

const hasLikelyDiagramNeed = (item = {}) => {
  if (String(item.document_type || "").trim() === "Marking Scheme") return false;
  const text = String(item.question_latex || item.final_answer || item.official_marking_scheme_latex || "").toLowerCase();
  const urls = sanitizeDiagramUrls(item.diagram_urls);
  return urls.length === 0 && /\b(diagram|graph|grid|histogram|curve|axes|axis|sketch|draw|triangle|circle|cuboid|pyramid|sector|net)\b/.test(text);
};

const buildSaveBlockers = (items = []) => {
  const blockers = [];
  const seen = new Map();

  items.forEach((item, index) => {
    const id = normalizeCanonicalForUi(item?.canonical_question_id);
    if (isInvalidCanonicalForSave(id)) {
      blockers.push({
        type: "missing_canonical",
        index,
        title: `Row ${index + 1}: missing or UNKNOWN canonical ID`,
        action: "Open this row and enter the correct Canonical ID, for example 7.c.ii.",
      });
      return;
    }

    if (seen.has(id)) {
      blockers.push({
        type: "duplicate_canonical",
        index,
        title: `Row ${index + 1}: duplicate canonical ID ${id}`,
        action: `This ID already appears at row ${seen.get(id) + 1}. Rename, merge, or remove one row before saving.`,
      });
    } else {
      seen.set(id, index);
    }
  });

  return blockers;
};

const canonicalIsPresentOrCovered = (ids = new Set(), canonicalId = "") => {
  const target = normalizeCanonicalForUi(canonicalId);
  if (!target) return false;
  if (ids.has(target)) return true;
  for (const id of ids) {
    if (id && target.startsWith(`${id}.`)) return true;
  }
  return false;
};

const buildLiveLocalReview = (items = []) => {
  const seen = new Map();
  const duplicateCanonicalIds = [];
  const riskyItems = [];
  const ids = new Set();

  items.forEach((item, index) => {
    const id = normalizeCanonicalForUi(item?.canonical_question_id);
    if (!isInvalidCanonicalForSave(id)) {
      ids.add(id);
      if (seen.has(id)) {
        duplicateCanonicalIds.push({
          canonical_question_id: id,
          first_index: seen.get(id),
          duplicate_index: index,
        });
      } else {
        seen.set(id, index);
      }
    }

    const reasons = [];
    if (isInvalidCanonicalForSave(id)) reasons.push("missing_or_unknown_canonical_id");

    const isMs = String(item?.document_type || "").trim() === "Marking Scheme";
    const textField = isMs ? item?.final_answer : item?.question_latex;
    if (!String(textField || "").trim()) {
      reasons.push(isMs ? "missing_final_answer" : "missing_question_latex");
    }

    if (Array.isArray(item?.validation_warnings)) {
      item.validation_warnings.forEach((warning) => {
        const clean = String(warning || "").trim();
        if (clean) reasons.push(clean);
      });
    }

    if (item?.needs_review) reasons.push("ai_marked_needs_review");

    if (reasons.length > 0) {
      riskyItems.push({
        index,
        canonical_question_id: id,
        reasons: [...new Set(reasons)],
      });
    }
  });

  return {
    extracted_count: items.length,
    unique_canonical_count: ids.size,
    duplicate_canonical_ids: duplicateCanonicalIds,
    risky_items: riskyItems,
  };
};

const buildLiveReviewReport = (report, items = []) => {
  if (!report) return null;

  const currentIds = new Set(
    items
      .map((item) => normalizeCanonicalForUi(item?.canonical_question_id))
      .filter((id) => !isInvalidCanonicalForSave(id))
  );
  const local = buildLiveLocalReview(items);
  const originalParity = report.parity || {};
  const originalAnchor = report.ms_anchor || {};

  const missingInCurrent = (Array.isArray(originalParity.missing_in_current) ? originalParity.missing_in_current : [])
    .map(normalizeCanonicalForUi)
    .filter((id) => id && !canonicalIsPresentOrCovered(currentIds, id));

  const extraInCurrent = (Array.isArray(originalParity.extra_in_current) ? originalParity.extra_in_current : [])
    .map(normalizeCanonicalForUi)
    .filter((id) => id && canonicalIsPresentOrCovered(currentIds, id));

  const anchorMissing = (Array.isArray(originalAnchor.missing_qp_leaf_ids) ? originalAnchor.missing_qp_leaf_ids : [])
    .map(normalizeCanonicalForUi)
    .filter((id) => id && !canonicalIsPresentOrCovered(currentIds, id));

  const hasLiveProblems =
    local.duplicate_canonical_ids.length > 0 ||
    missingInCurrent.length > 0 ||
    extraInCurrent.length > 0 ||
    anchorMissing.length > 0 ||
    local.risky_items.length > 0;

  return {
    ...report,
    status: hasLiveProblems ? (report.status || "warning") : "ok",
    message: hasLiveProblems
      ? report.message || "Local extraction risk detected. Human verification required before final save."
      : "Live review is clean after your edits.",
    local: {
      ...(report.local || {}),
      ...local,
    },
    parity: {
      ...originalParity,
      missing_in_current: missingInCurrent,
      extra_in_current: extraInCurrent,
    },
    ms_anchor: {
      ...originalAnchor,
      missing_qp_leaf_ids: anchorMissing,
    },
  };
};

const humanizeIssueReason = (reason = "", item = {}) => {
  const text = String(reason || "");
  const lower = text.toLowerCase();
  const id = getRowCanonical(item);

  if (lower.includes("repair_hint split_grouped_row")) {
    const hint = parseGroupedSplitRepairHint(text);
    return {
      title: "Grouped Row Needs Split",
      severity: "Medium",
      problem: hint
        ? `${displayLabelFromCanonical(hint.missingId) || hint.missingId} appears to be grouped inside ${displayLabelFromCanonical(hint.sourceId) || hint.sourceId}.`
        : text,
      solution: "Open the source row, create a split-review row for the missing ID, then trim both rows against the PDF.",
      expected: hint
        ? `Expected: separate rows for ${hint.missingId} and ${hint.sourceId}`
        : "Expected: separate rows for each printed subpart",
    };
  }

  if (lower.includes("missing_or_unknown_canonical_id")) {
    return {
      title: "Canonical ID missing",
      severity: "High",
      problem: "This row cannot be saved because the question number is blank or UNKNOWN.",
      solution: "Open the row, check the PDF, then type the correct Canonical ID.",
      expected: "Example expected format: 7.b.ii",
    };
  }

  if (lower.includes("missing_question_latex")) {
    return {
      title: "Question text missing",
      severity: "High",
      problem: "The row has a question number but no question text.",
      solution: "Check the PDF. If the text is visible, paste/type it manually. If many rows are empty, redo extraction.",
      expected: id ? `Expected row around ${displayLabelFromCanonical(id)}` : "Expected: full question text",
    };
  }

  if (lower.includes("missing_final_answer")) {
    return {
      title: "MS answer missing",
      severity: "High",
      problem: "This marking-scheme row has a question number but no final answer.",
      solution: "Check the MS PDF. Fill the answer, or delete the row if it is only a duplicate/placeholder.",
      expected: id ? `Expected row around ${displayLabelFromCanonical(id)}` : "Expected: marking-scheme answer text",
    };
  }

  if (lower.includes("missing_ms_label")) {
    return {
      title: "MS label missing",
      severity: "Medium",
      problem: "The marking-scheme row label was missing or unclear.",
      solution: "Check the MS PDF and confirm the Canonical ID/Question label.",
      expected: id ? `Expected label: ${displayLabelFromCanonical(id)}` : "Expected: a label like 4(b)(ii)",
    };
  }

  if (lower.includes("embedded subpart guard")) {
    return {
      title: "Subpart numbering was repaired",
      severity: "Medium",
      problem: text,
      solution: "Open the row and compare with the PDF. If the visible label agrees, keep it. If not, edit Canonical ID.",
      expected: id ? `Current expected ID: ${id}` : "Expected: correct child ID from the PDF",
    };
  }

  if (lower.includes("sequence guard") || lower.includes("duplicated gemini question label")) {
    return {
      title: "Duplicate numbering was repaired",
      severity: "Medium",
      problem: "Gemini repeated a question number and the pipeline moved this row forward.",
      solution: "Open the row and verify the corrected Canonical ID against the PDF.",
      expected: id ? `Current expected ID: ${id}` : "Expected: next valid subpart",
    };
  }

  if (lower.includes("ms anchor repaired")) {
    return {
      title: "MS anchor repaired QP ID",
      severity: "Medium",
      problem: text,
      solution: "Check QP against the saved MS. Keep it only if the PDF row matches this ID.",
      expected: id ? `Current expected ID: ${id}` : "Expected: MS-matched ID",
    };
  }

  if (lower.includes("ai_marked_needs_review")) {
    return {
      title: "AI asked for review",
      severity: "Low",
      problem: "The extraction looks plausible but was marked for human verification.",
      solution: "Open the row, compare with PDF, then approve if text/numbering/image are correct.",
      expected: id ? `Check row ${displayLabelFromCanonical(id)}` : "Expected: visually correct row",
    };
  }

  return {
    title: "Review warning",
    severity: "Medium",
    problem: text || "This row has an extraction warning.",
    solution: "Open the row and compare it with the PDF before saving.",
    expected: id ? `Current ID: ${id}` : "Expected: correct PDF row",
  };
};

const buildUploadIssueCards = ({ report, blockers = [], items = [] }) => {
  const issues = [];
  const seen = new Set();
  const addIssue = (issue) => {
    const key = `${issue.type}-${issue.index ?? "none"}-${issue.id || issue.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(issue);
  };

  blockers.forEach((blocker) => {
    addIssue({
      type: blocker.type,
      severity: "High",
      index: blocker.index,
      id: getRowCanonical(items[blocker.index]),
      title: blocker.type === "duplicate_canonical" ? "Duplicate Canonical ID" : "Cannot Save This Row",
      problem: blocker.title,
      solution: blocker.action,
      expected: blocker.type === "duplicate_canonical"
        ? "Expected: every row has one unique Canonical ID"
        : "Expected: a real ID like 7.b.ii",
    });
  });

  const local = report?.local || {};
  const parity = report?.parity || {};
  const msAnchor = report?.ms_anchor || {};
  const missingIds = Array.isArray(parity.missing_in_current) ? parity.missing_in_current : [];
  const extraIds = Array.isArray(parity.extra_in_current) ? parity.extra_in_current : [];
  const anchorMissingIds = Array.isArray(msAnchor.missing_qp_leaf_ids) ? msAnchor.missing_qp_leaf_ids : [];
  const duplicateIds = Array.isArray(local.duplicate_canonical_ids) ? local.duplicate_canonical_ids : [];
  const groupedSplitHints = collectGroupedSplitRepairHints(items);
  const hasStructuralIssues =
    blockers.length > 0 ||
    missingIds.length > 0 ||
    extraIds.length > 0 ||
    anchorMissingIds.length > 0 ||
    duplicateIds.length > 0;
  let aiReviewOnlyCount = 0;

  (Array.isArray(local.risky_items) ? local.risky_items : []).forEach((risky) => {
    const item = items[risky.index] || {};
    (Array.isArray(risky.reasons) ? risky.reasons : ["Review warning"]).forEach((reason) => {
      if (String(reason || "").toLowerCase().includes("ai_marked_needs_review") && hasStructuralIssues) {
        aiReviewOnlyCount += 1;
        return;
      }
      const details = humanizeIssueReason(reason, item);
      addIssue({
        type: "risky_row",
        severity: details.severity,
        index: risky.index,
        id: getRowCanonical(item) || risky.canonical_question_id,
        title: details.title,
        problem: details.problem,
        solution: details.solution,
        expected: details.expected,
      });
    });
  });

  if (aiReviewOnlyCount > 0) {
    addIssue({
      type: "ai_review_summary",
      severity: "Low",
      index: -1,
      id: "ai_review_summary",
      title: "Other Rows Need Visual Check",
      problem: `${aiReviewOnlyCount} row${aiReviewOnlyCount === 1 ? "" : "s"} were marked for normal human review.`,
      solution: "Fix the High/Medium numbering problems first. Then skim these rows visually before approval.",
      expected: "Expected: text, numbering, and image look like the PDF.",
    });
  }

  duplicateIds.forEach((dupe) => {
    addIssue({
      type: "duplicate",
      severity: "High",
      index: dupe.duplicate_index,
      id: dupe.canonical_question_id,
      title: "Duplicate Canonical ID",
      problem: `${dupe.canonical_question_id} appears at rows ${dupe.first_index + 1} and ${dupe.duplicate_index + 1}.`,
      solution: "Open the duplicate row. Rename, merge, or remove one duplicate before saving.",
      expected: "Expected: each canonical ID appears once.",
    });
  });

  const counterpartCount = Number(parity.counterpart_count || msAnchor.ms_id_count || 0);
  if (counterpartCount > 0 && items.length > counterpartCount) {
    let parentStemCandidates = 0;
    items.forEach((item, index) => {
      if (parentStemCandidates >= 4) return;
      const id = getRowCanonical(item);
      if (!id || isLeafCanonical(id) || !rowHasChildCanonical(items, id)) return;
      parentStemCandidates += 1;
      addIssue({
        type: "parent_stem_split",
        severity: "Medium",
        index,
        id,
        title: "Parent Stem Split From Children",
        problem: `${displayLabelFromCanonical(id) || id} looks like shared question context, while child rows like ${id}.a carry the actual subparts.`,
        solution: "If this parent row is only shared context, merge it into its child rows and remove the standalone parent row.",
        expected: `Expected: children keep full context; standalone ${id} disappears if MS has only child rows.`,
      });
    });
  }

  missingIds.forEach((id) => {
    const normalizedId = normalizeCanonicalForUi(id);
    const hint = groupedSplitHints.get(normalizedId);
    const index = Number.isInteger(hint?.sourceIndex) ? hint.sourceIndex : findLikelyRowIndexForCanonical(items, id);
    addIssue({
      type: hint ? "split_grouped_row_missing" : "missing_counterpart_id",
      severity: "High",
      index,
      id: normalizedId || id,
      sourceId: hint?.sourceId,
      sourceIndex: hint?.sourceIndex,
      title: "QP/MS ID Missing Here",
      problem: hint
        ? `${displayLabelFromCanonical(id) || id} exists in the paired document and appears grouped inside ${displayLabelFromCanonical(hint.sourceId) || hint.sourceId}.`
        : `${displayLabelFromCanonical(id) || id} exists in the paired document but not in this upload.`,
      solution: hint
        ? "Open the source row, create a split-review row for the missing ID, then trim the copied text against the PDF. Do not run rescue for this case."
        : "Open the nearest matching row, check the PDF, then split/rename the row if the subpart is grouped. If many IDs are missing, redo extraction.",
      expected: hint
        ? `Expected: ${normalizedId} split out from ${hint.sourceId}`
        : `Expected ID: ${id}`,
    });
  });

  extraIds.forEach((id) => {
    const index = findLikelyRowIndexForCanonical(items, id);
    addIssue({
      type: "extra_counterpart_id",
      severity: "Medium",
      index,
      id,
      title: "Extra ID In This Upload",
      problem: `${displayLabelFromCanonical(id) || id} is present here but not found in the paired document.`,
      solution: "Open the row and check the visible PDF number. If it is wrong, edit Canonical ID. If the paired document grouped it differently, it may be okay after manual check.",
      expected: `Current extra ID: ${id}`,
    });
  });

  anchorMissingIds.forEach((id) => {
    const index = findLikelyRowIndexForCanonical(items, id);
    addIssue({
      type: "ms_anchor_missing",
      severity: "Medium",
      index,
      id,
      title: "MS Anchor Wants This QP Leaf",
      problem: `Saved MS has ${displayLabelFromCanonical(id) || id}, but QP does not have an exact matching row.`,
      solution: "Check whether the QP parent row already contains this child text. If yes, no redo. If not, split or edit the QP row.",
      expected: `MS expected ID: ${id}`,
    });
  });

  let possibleImageCount = 0;
  items.forEach((item, index) => {
    if (!hasLikelyDiagramNeed(item)) return;
    if (possibleImageCount >= 8) return;
    possibleImageCount += 1;
    addIssue({
      type: "possible_missing_image",
      severity: "Medium",
      index,
      id: getRowCanonical(item),
      title: "Possible Missing Image",
      problem: "This row mentions a diagram/graph/grid but has no image attached.",
      solution: "Open the PDF. If the diagram is needed, crop/paste it manually. If the text alone is enough, leave it.",
      expected: "Expected: diagram pasted only when the row needs it.",
    });
  });

  const order = { High: 0, Medium: 1, Low: 2 };
  return issues.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
};

const REVIEW_HELP_ITEMS = [
  {
    label: "Missing IDs",
    risk: "High",
    meaning: "The other document has this canonical ID, but this extraction does not.",
    action: "Check the PDF. If several IDs are missing, redo extraction. If one small subpart is grouped inside a parent, manually fix.",
    example: "QP has 18(a), MS does not show 18.a.",
  },
  {
    label: "Extra IDs",
    risk: "Medium",
    meaning: "This extraction created an ID that the paired document does not have.",
    action: "Usually manual fix if one row. Redo if many extras or numbering has drifted.",
    example: "MS has 16.d but QP stops at 16.c.",
  },
  {
    label: "Duplicate IDs",
    risk: "High",
    meaning: "Two rows have the same canonical ID. Saving can overwrite or mis-link.",
    action: "Do not approve until one row is renamed, merged, or removed.",
    example: "Two rows both saved as 22.",
  },
  {
    label: "Risky rows",
    risk: "Low to Medium",
    meaning: "The code repaired or flagged a row during extraction.",
    action: "Open that row and compare with PDF. If text/numbering looks correct, manual approval is fine.",
    example: "Promoted 7 to 7(a) because the text contains part (a).",
  },
  {
    label: "Missing MS label",
    risk: "Medium",
    meaning: "The MS answer exists, but the question label was blank.",
    action: "Now auto-repaired from canonical ID when possible. Review only if the number looks wrong.",
    example: "canonical 1 becomes question_latex 1.",
  },
  {
    label: "Hierarchy-covered",
    risk: "Low",
    meaning: "One side uses a parent block and the other side splits subparts.",
    action: "No redo needed if the grouped text clearly covers the child parts.",
    example: "QP has 9.c, MS has 9.c.i and 9.c.ii.",
  },
  {
    label: "MS anchor",
    risk: "Low to Medium",
    meaning: "When a saved MS exists, QP numbering is compared against MS IDs without changing the extracted text.",
    action: "Use it to decide whether a missing leaf is a real issue or just grouped under a parent QP row.",
    example: "MS has 17.d but QP stops at 17.c, so only Q17 needs human check.",
  },
];

const riskClass = (risk = "") => {
  if (risk.toLowerCase().includes("high")) return "bg-red-100 text-red-800 border-red-200";
  if (risk.toLowerCase().includes("medium")) return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-emerald-100 text-emerald-800 border-emerald-200";
};

const SaveReadinessPanel = ({ blockers = [], onJumpToRow, isMarkingScheme }) => {
  if (blockers.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <b>Save check passed:</b> every row has a usable canonical ID and no duplicate IDs inside this upload.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-bold">Save blocked: fix these rows first</div>
          <p className="mt-1 text-red-800">
            MongoDB cannot save rows with missing/unknown IDs or duplicate IDs. This is the same issue that appears as
            "Failed at batch..." after clicking save.
          </p>
        </div>
        <span className="rounded bg-white px-2 py-1 text-xs font-bold text-red-700">
          {blockers.length} blocker{blockers.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {blockers.slice(0, 6).map((blocker) => (
          <li key={`${blocker.type}-${blocker.index}`} className="rounded border border-red-100 bg-white/80 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{blocker.title}</p>
                <p className="text-xs text-red-700">{blocker.action}</p>
              </div>
              {!isMarkingScheme && (
                <button
                  type="button"
                  onClick={() => onJumpToRow(blocker.index)}
                  className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Open Row
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {isMarkingScheme && (
        <p className="mt-2 text-xs text-red-700">
          For MS, scroll to the listed row and edit the Canonical ID field in the left column.
        </p>
      )}
    </div>
  );
};

const WorkflowGuidancePanel = ({
  workflowState,
  documentMode,
  extractedMeta,
  extractionStep,
  onSelectMode,
  onResetWorkflow,
  disabled,
}) => {
  const hasPendingMs = workflowState.expectedNext === "qp" && workflowState.pendingMsKey;
  const extractedKey = extractedMeta?.paper_reference_key || extractedMeta?.unified_paper_key || "";
  const paperNumber = extractedMeta?.paperNumber || extractedMeta?.paper_number || "";
  const session = extractedMeta?.session || "";
  const year = extractedMeta?.year || "";

  let title = "Start with Marking Scheme";
  let body = "Recommended flow: upload MS first so Paperly can use its clean numbering as the QP anchor.";
  let tone = "border-sky-200 bg-sky-50 text-slate-950";
  let nextLabel = "Expecting MS";

  if (hasPendingMs) {
    title = "Now upload the matching Question Paper";
    body = `Saved MS: ${workflowState.pendingMsFileName || workflowState.pendingMsLabel || workflowState.pendingMsKey}. Upload the QP with the same paper identity${workflowState.pendingMsLabel ? ` (${workflowState.pendingMsLabel})` : ""}.`;
    tone = "border-blue-200 bg-blue-50 text-slate-950";
    nextLabel = "Expecting QP";
  }

  if (extractionStep !== "upload" && extractedKey) {
    title = documentMode === "Marking Scheme" ? "Review MS, then save it" : "Review QP, then save it";
    body = `${extractedKey}${paperNumber ? ` | Paper ${paperNumber}` : ""}${session ? ` | ${session}` : ""}${year ? ` | ${year}` : ""}`;
    tone = documentMode === "Marking Scheme"
      ? "border-blue-200 bg-blue-50 text-slate-950"
      : "border-emerald-200 bg-emerald-50 text-slate-950";
    nextLabel = documentMode === "Marking Scheme" ? "After save: upload QP" : "After save: paired, then next MS";
  }

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ring-1 ring-white/70 ${tone}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide opacity-70">{nextLabel}</div>
          <h2 className="mt-1 text-2xl font-bold">{title}</h2>
          <p className="mt-1 text-sm opacity-90">{body}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {extractionStep === "upload" && (
            <>
              <button
                type="button"
                onClick={() => onSelectMode("Marking Scheme")}
                disabled={disabled}
                className={`rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition ${
                  documentMode === "Marking Scheme" ? "bg-slate-950 text-white" : "bg-white/90 text-slate-700 hover:bg-white"
                } disabled:opacity-50`}
              >
                Upload MS
              </button>
              <button
                type="button"
                onClick={() => onSelectMode("Question Paper")}
                disabled={disabled}
                className={`rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition ${
                  documentMode === "Question Paper" ? "bg-slate-950 text-white" : "bg-white/90 text-slate-700 hover:bg-white"
                } disabled:opacity-50`}
              >
                Upload QP
              </button>
            </>
          )}
          {hasPendingMs && (
            <button
              type="button"
              onClick={onResetWorkflow}
              disabled={disabled}
              title="Clear the saved MS reminder and start a fresh paper pair."
              className="rounded-lg border border-current/20 bg-white/80 px-4 py-2 text-sm font-semibold shadow-sm hover:bg-white disabled:opacity-50"
            >
              Start New Paper
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const severityClass = (severity = "") => {
  if (severity === "High") return "border-red-200 border-l-red-500 bg-white text-slate-950";
  if (severity === "Medium") return "border-amber-200 border-l-amber-500 bg-white text-slate-950";
  return "border-sky-200 border-l-sky-500 bg-white text-slate-950";
};

const severityBadgeClass = (severity = "") => {
  if (severity === "High") return "bg-red-100 text-red-700 ring-1 ring-red-200";
  if (severity === "Medium") return "bg-amber-100 text-amber-800 ring-1 ring-amber-200";
  return "bg-sky-100 text-sky-800 ring-1 ring-sky-200";
};

const UploadIssueCarousel = ({
  issues = [],
  activeIndex = 0,
  onActiveIndexChange,
  onGoToIssue,
  isMarkingScheme,
  actions = [],
}) => {
  if (!issues.length) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-white p-4 text-sm text-emerald-900 shadow-sm">
        <b>No upload problems found:</b> numbering, save IDs, and local checks look clean. Do final visual review before saving.
      </div>
    );
  }

  const safeIndex = Math.min(Math.max(activeIndex, 0), issues.length - 1);
  const issue = issues[safeIndex];
  const canGoToRow = Number.isInteger(issue.index) && issue.index >= 0;

  const move = (delta) => {
    const next = Math.min(Math.max(safeIndex + delta, 0), issues.length - 1);
    onActiveIndexChange(next);
  };

  return (
    <div className={`rounded-xl border border-l-4 p-4 text-sm shadow-sm ${severityClass(issue.severity)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${severityBadgeClass(issue.severity)}`}>
              {issue.severity} risk
            </span>
            <span className="font-bold">{issue.title}</span>
            <span className="text-xs opacity-75">
              Problem {safeIndex + 1} of {issues.length}
            </span>
          </div>
          <p className="mt-2 font-medium">{issue.problem}</p>
          <p className="mt-2">
            <b>Fix:</b> {issue.solution}
          </p>
          <p className="mt-1 text-xs opacity-80">
            <b>Expected:</b> {issue.expected}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => move(-1)}
            disabled={safeIndex === 0}
            className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={safeIndex >= issues.length - 1}
            className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
          <button
            type="button"
            onClick={() => onGoToIssue(issue)}
            disabled={!canGoToRow}
            className="rounded-md bg-slate-950 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isMarkingScheme ? "Scroll To Row" : "Open Row"}
          </button>
        </div>
      </div>

      {actions.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Suggested fix</span>
          {actions.map((action) => (
            <button
              key={action.key || action.label}
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                action.variant === "danger"
                  ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                  : action.variant === "primary"
                    ? "bg-sky-700 text-white hover:bg-sky-800"
                    : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1">
        {issues.map((item, idx) => (
          <button
            key={`${item.type}-${item.id}-${idx}`}
            type="button"
            onClick={() => onActiveIndexChange(idx)}
            className={`h-2.5 rounded-full transition-all ${
              idx === safeIndex ? "w-6 bg-slate-900" : "w-2.5 bg-white/80 ring-1 ring-current/20"
            }`}
            aria-label={`Open upload problem ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

// Sanitizes diagram URLs to ensure they are a flat array of valid strings
const sanitizeDiagramUrls = (diagramUrls) => {
  // Return empty array if null/undefined
  if (!diagramUrls) return [];
  
  // Handle single string value
  if (typeof diagramUrls === 'string') {
    // If it's JSON-like, try to parse it
    if (diagramUrls.trim().startsWith('[') && diagramUrls.trim().endsWith(']')) {
      try {
        const parsed = JSON.parse(diagramUrls);
        return sanitizeDiagramUrls(parsed); // Recursive call with parsed value
      } catch (e) {
        // If parsing fails, treat as a simple string
        return diagramUrls.trim() ? [diagramUrls.trim()] : [];
      }
    }
    return diagramUrls.trim() ? [diagramUrls.trim()] : [];
  }
  
  // Not an array, return empty array
  if (!Array.isArray(diagramUrls)) return [];
  
  // Recursively flatten nested arrays and filter out invalid values
  const flattenDeep = (arr) => {
    return arr.reduce((acc, val) => 
      Array.isArray(val) 
        ? acc.concat(flattenDeep(val)) 
        : acc.concat(typeof val === 'string' && val.trim() !== '' ? val : []), 
      []
    );
  };

  const flatUrls = flattenDeep(diagramUrls);
  
  // Filter out any non-strings, empty strings, or null/undefined
  return flatUrls.filter(url => {
    return typeof url === 'string' && url.trim() !== '';
  });
};

const unpackResponse = (response) => {
  const payload = response?.data?.data ?? response?.data ?? response;

  let questions = [];
  let meta = {};
  let reviewReport = null;

  if (Array.isArray(payload)) {
    questions = payload;
  } else if (payload?.questions_array) {
    questions = Array.isArray(payload.questions_array) ? payload.questions_array : [];
    meta = payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
    reviewReport = payload.review_report || payload.validation_report || null;
  }

  if (questions.length > 0) {
    const q = questions[0];
    const keyMeta = metadataFromPaperKey(
      meta.paper_reference_key
      || meta.unified_paper_key
      || q.paper_reference_key
      || q.unified_paper_key
    );
    meta = {
      ...keyMeta,
      ...meta,
      curriculum:  meta.curriculum  || q.curriculum  || q.board        || "",
      subjectCode: meta.subjectCode || meta.subject_code || q.subjectCode || q.subject_code || keyMeta.subjectCode || "",
      tier:        meta.tier        || q.tier        || q.tier_level   || keyMeta.tier || "",
      paperNumber: meta.paperNumber || meta.paper_number || q.paperNumber || q.paper_number || keyMeta.paperNumber || "",
      session:     meta.session     || q.session     || keyMeta.session || "",
      session_code: meta.session_code || q.session_code || keyMeta.session_code || sessionCodeFromValue(q.session),
      year:        meta.year        || q.year        || keyMeta.year || "",
      program:     meta.program     || q.program     || "",
    };
  }

  if (meta.session) {
    meta.session_code = meta.session_code || sessionCodeFromValue(meta.session);
    meta.session = sessionLabelFromValue(meta.session);
  }

  // Mark Point Validator for Marking Schemes + stale placeholder cleanup for QP
  questions = questions.map(q => {
    q = cleanMsAnchorPlaceholderRow(q);
    // Only process marking scheme entries
    if (q.document_type !== "Marking Scheme") return q;
    
    // If method_steps is empty or not an array, try to extract from other fields
    if (!Array.isArray(q.method_steps) || q.method_steps.length === 0) {
      // Create a default empty array
      q.method_steps = [];
      
      // Try to extract mark points from official_marking_scheme_latex if available
      if (q.official_marking_scheme_latex) {
        const msText = q.official_marking_scheme_latex;
        
        // Look for common mark patterns like M1, A1, B1, etc.
        const markRegex = /\b([MAB][1-9]|SC[1-9]|ft|oe|dep)\b/gi;
        const matches = msText.match(markRegex);
        
        if (matches && matches.length > 0) {
          // Create basic method steps from the matches
          const uniqueMatches = [...new Set(matches.map(m => m.toUpperCase()))];
          uniqueMatches.forEach(markType => {
            q.method_steps.push({
              type: markType,
              description: "Mark point extracted from marking scheme"
            });
          });
        }
        
        // If we still have no method steps but have a final answer, add a generic mark
        if (q.method_steps.length === 0 && q.final_answer) {
          q.method_steps.push({
            type: "mark",
            description: "Mark for correct answer"
          });
        }
      }
      
      // If total_marks is available but no method steps, create generic steps
      if (q.method_steps.length === 0 && q.total_marks && q.total_marks > 0) {
        for (let i = 0; i < q.total_marks; i++) {
          q.method_steps.push({
            type: i === q.total_marks - 1 ? "A1" : "M1",
            description: i === q.total_marks - 1 ? "Accuracy mark" : "Method mark"
          });
        }
      }
    }
    
    return q;
  });

  return { questions, meta, reviewReport };
};

const ReviewReportPanel = ({ report }) => {
  if (!report) return null;

  const status = report.status || "pending";
  const parity = report.parity || {};
  const msAnchor = report.ms_anchor || {};
  const local = report.local || {};
  const riskyItems = Array.isArray(local.risky_items) ? local.risky_items : [];
  const duplicates = Array.isArray(local.duplicate_canonical_ids) ? local.duplicate_canonical_ids : [];
  const missing = Array.isArray(parity.missing_in_current) ? parity.missing_in_current : [];
  const extra = Array.isArray(parity.extra_in_current) ? parity.extra_in_current : [];
  const hierarchyCovered = Array.isArray(parity.hierarchy_covered) ? parity.hierarchy_covered : [];
  const anchorMissing = Array.isArray(msAnchor.missing_qp_leaf_ids) ? msAnchor.missing_qp_leaf_ids : [];
  const anchorCovered = Array.isArray(msAnchor.hierarchy_covered) ? msAnchor.hierarchy_covered : [];
  const isClean = status === "ok";

  return (
    <div className={`rounded-xl border border-l-4 p-4 text-sm shadow-sm ${
      isClean ? "border-emerald-200 border-l-emerald-500 bg-white text-emerald-900" : "border-amber-200 border-l-amber-500 bg-white text-slate-900"
    }`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2 font-semibold">
            <span>Extraction Review: {status.toUpperCase()}</span>
          </div>
          <div className="mt-1">{report.message || "Review the extracted data before saving."}</div>
        </div>
        <div className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
          {local.extracted_count || 0} items / {local.unique_canonical_count || 0} unique IDs
        </div>
      </div>

      {parity.checked && (
        <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
          <div>Counterpart: {parity.counterpart_type || "N/A"} ({parity.counterpart_count || 0})</div>
          <div>Missing here: {missing.length}</div>
          <div>Extra here: {extra.length}</div>
        </div>
      )}

      {msAnchor.checked && (
        <div className={`mt-3 rounded border p-2 text-xs ${
          anchorMissing.length > 0
            ? "border-amber-200 bg-amber-50 text-amber-950"
            : "border-emerald-200 bg-emerald-50 text-emerald-900"
        }`}>
          <b>MS anchor:</b> {msAnchor.message || "Checked against saved marking scheme."}{" "}
          <span>
            Exact matches: {msAnchor.exact_matches || 0}/{msAnchor.ms_id_count || 0}
          </span>
          {anchorMissing.length > 0 && (
            <div className="mt-1">
              <b>Check these QP leaves:</b> {anchorMissing.slice(0, 12).join(", ")}
              {anchorMissing.length > 12 ? " ..." : ""}
            </div>
          )}
          {anchorCovered.length > 0 && (
            <div className="mt-1">
              <b>Grouped but covered:</b>{" "}
              {anchorCovered.slice(0, 5).map((item) => {
                const coveredBy = item.current_parent || item.current_children?.join(", ");
                return `${item.counterpart_id} by ${coveredBy}`;
              }).join(" | ")}
              {anchorCovered.length > 5 ? " ..." : ""}
            </div>
          )}
        </div>
      )}

      {(missing.length > 0 || extra.length > 0 || duplicates.length > 0 || riskyItems.length > 0) && (
        <div className="mt-3 space-y-2">
          {missing.length > 0 && <div><b>Missing IDs:</b> {missing.slice(0, 18).join(", ")}{missing.length > 18 ? " ..." : ""}</div>}
          {extra.length > 0 && <div><b>Extra IDs:</b> {extra.slice(0, 18).join(", ")}{extra.length > 18 ? " ..." : ""}</div>}
          {duplicates.length > 0 && <div><b>Duplicate IDs:</b> {duplicates.map((d) => d.canonical_question_id).slice(0, 12).join(", ")}</div>}
          {riskyItems.length > 0 && (
            <div>
              <b>Risky rows:</b> {riskyItems.slice(0, 8).map((item) => `${item.index + 1}:${item.reasons.join("/")}`).join(" | ")}
            </div>
          )}
        </div>
      )}
      {hierarchyCovered.length > 0 && (
        <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
          <b>Low-risk hierarchy-covered differences:</b>{" "}
          {hierarchyCovered.slice(0, 6).map((item) => {
            const coveredBy = item.current_parent || item.current_children?.join(", ");
            return `${item.counterpart_id} covered by ${coveredBy}`;
          }).join(" | ")}
          {hierarchyCovered.length > 6 ? " ..." : ""}
        </div>
      )}
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

const Dashboard = () => {
  const [extractionStep, setExtractionStep]         = useState("upload");
  const [extractedMeta, setExtractedMeta]           = useState({});
  const [extractedQuestions, setExtractedQuestions] = useState([]);
  const [extractionReviewReport, setExtractionReviewReport] = useState(null);
  const [documentMode, setDocumentMode]             = useState("Question Paper"); // "Question Paper" | "Marking Scheme"
  const [boardMode, setBoardMode]                   = useState("IGCSE"); // "IGCSE" | "IB"
  
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [rescuingMissing, setRescuingMissing] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl]               = useState("");
  const [sourceImageDataUrl, setSourceImageDataUrl] = useState("");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0); // For pagination
  const [activeIssueIndex, setActiveIssueIndex] = useState(0);
  const [highlightedMsRowIndex, setHighlightedMsRowIndex] = useState(null);
  const [workflowState, setWorkflowState] = useState(readWorkflowState);

  // ── Manual pairing modal state ─────────────────────────────────────────────
  const [isManualPairingModalOpen, setIsManualPairingModalOpen] = useState(false);
  const [selectedUnpairedDoc, setSelectedUnpairedDoc] = useState(null);

  // ── DB-synced counters ────────────────────────────────────────────────────
  const [dbCounts, setDbCounts] = useState({ questionPapers: 0, markingSchemes: 0 });

  const refreshDbCounts = async () => {
    try {
      const counts = await fetchQuestionCount();
      setDbCounts(counts);
    } catch {
      // Silently fail — counts are cosmetic
    }
  };

  // Fetch on mount and every 30 s so the counter stays live across tabs
  useEffect(() => {
    refreshDbCounts();
    const id = setInterval(refreshDbCounts, 30_000);
    return () => clearInterval(id);
  }, []);

  const originalFileRef = useRef(null);

  const revokePdfBlobUrl = (url) => { if (url) URL.revokeObjectURL(url); };
  useEffect(() => () => revokePdfBlobUrl(pdfBlobUrl), [pdfBlobUrl]);

  // ── Upload ────────────────────────────────────────────────────────────────

 const handleFileUpload = async (file, bypassCache = false) => {
    if (loading) return;
    originalFileRef.current = file;

    // ✅ FIX: Use the user's manually selected documentMode — do NOT auto-detect from filename.
    // Filename pe rely karna unreliable hai (IB ke liye) aur user ki choice ko overwrite kar deta hai.
    const docType = documentMode;

    let pdfToastId = null;
    try {
      setLoading(true);

      if ((file.type || "").toLowerCase() === "application/pdf") {
        const cacheNote = bypassCache ? " (bypassing cache)" : "";
        pdfToastId = toast.info(
          `PDF detected — extracting via AI (~1 min per 10 pages)${cacheNote}. Don't close the tab.`,
          { autoClose: false, closeOnClick: false }
        );
      } else {
        toast.info("Upload started. AI is extracting…");
      }

      const base64String = await toBase64(file);
      setSourceImageDataUrl(`data:${file.type || "image/png"};base64,${base64String}`);

      if ((file.type || "").toLowerCase() === "application/pdf") {
        const next = URL.createObjectURL(file);
        setPdfBlobUrl((prev) => { revokePdfBlobUrl(prev); return next; });
      } else {
        setPdfBlobUrl((prev) => { revokePdfBlobUrl(prev); return ""; });
      }

      // Metadata uses the manually selected docType and board
      const metadata = { 
        document_type: docType,
        file_name: file.name,
        board: boardMode
      };

      if (docType === "Question Paper" && workflowState.expectedNext === "qp") {
        const expectedIds = Array.isArray(workflowState.pendingMsCanonicalIds)
          ? workflowState.pendingMsCanonicalIds.filter(Boolean)
          : [];
        if (expectedIds.length > 0) {
          metadata.expected_canonical_ids = expectedIds;
          metadata.expected_canonical_id_count = expectedIds.length;
          metadata.ms_anchor_source = "saved_ms_workflow_state";
          metadata.ms_anchor_paper_reference_key = workflowState.pendingMsKey || "";
          console.log("[MSAnchorPreflight][Frontend] Sending saved MS IDs with QP upload", {
            count: expectedIds.length,
            key: workflowState.pendingMsKey,
            first: expectedIds.slice(0, 8),
            last: expectedIds.slice(-5),
          });
        } else {
          console.warn("[MSAnchorPreflight][Frontend] Expected QP after MS, but workflow has no saved MS IDs.");
        }
      }

      // For IB documents, extract first page separately to help with metadata extraction
      let firstPageBase64 = null;
      if (boardMode === 'IB' && (file.type || "").toLowerCase() === "application/pdf") {
        // For now, we're using the same base64 for the full document and first page
        // In a production environment, you'd extract just the first page
        firstPageBase64 = base64String;
      }

      // ── PHASE 1: bypassCache is forwarded all the way to Python engine ──
      const response = await uploadImage(
        base64String,
        metadata,
        file.type || "image/png",
        firstPageBase64,
        bypassCache,   // NEW: tells Node + Python to skip all caches
      );

      const { questions, meta, reviewReport } = unpackResponse(response);

      // Debug: Log the extracted data
      console.log('[Dashboard] Extraction complete:', {
        questionCount: questions.length,
        detectedType: meta?.document_type || questions[0]?.document_type || "Unknown",
        paper_reference_key: meta?.paper_reference_key,
        unified_paper_key: meta?.unified_paper_key,
        bypassCache,
      });

      // Detect document mode from first question or meta
      const detectedType =
        meta?.document_type ||
        questions[0]?.document_type ||
        docType;
      setDocumentMode(detectedType);

      setExtractedMeta(meta);
      setExtractedQuestions(questions);
      setExtractionReviewReport(reviewReport);
      
      if (detectedType === 'Marking Scheme') {
        setExtractionStep("reviewMarkingScheme");
      } else {
        setExtractionStep("verifyMeta");
      }

      if (pdfToastId) toast.dismiss(pdfToastId);

      questions.length === 0
        ? toast.error("Extracted 0 questions — check the console.")
        : toast.success(`Extracted ${questions.length} ${detectedType === "Marking Scheme" ? "marking scheme entries" : "questions"}!`);

    } catch (err) {
      console.error(err);
      if (pdfToastId) toast.dismiss(pdfToastId);
      const label = err?.stage ? `${String(err.stage).toUpperCase()} Failed` : "Network Error";
      toast.error(`${label}: ${err?.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Redo ──────────────────────────────────────────────────────────────────
  // PHASE 1: "Redo Extraction" sends bypassCache=true so Node and Python both
  // skip their respective caches and run a fresh end-to-end extraction pass.

  const handleRedoExtraction = async () => {
    const file = originalFileRef.current;
    if (!file) { toast.warn("No file stored — please upload again."); return; }
    setExtractedQuestions([]);
    setExtractedMeta({});
    setExtractionReviewReport(null);
    setExtractionStep("upload");
    // bypassCache = true → forces fresh extraction, skips NodeCache + Python EXTRACTION_CACHE
    await handleFileUpload(file, true);
  };

  // ── Manual pairing handlers ────────────────────────────────────────────────
  
  const openManualPairingModal = (document) => {
    setSelectedUnpairedDoc(document);
    setIsManualPairingModalOpen(true);
  };
  
  const closeManualPairingModal = () => {
    setIsManualPairingModalOpen(false);
    setSelectedUnpairedDoc(null);
  };
  
  // ── Question edit ─────────────────────────────────────────────────────────

  const handleQuestionChange = (index, updatedData) => {
    setExtractedQuestions((prev) => {
      const next = [...prev];
      next[index] = cleanMsAnchorPlaceholderRow({ ...next[index], ...updatedData });
      return next;
    });
  };

  const handleDeleteExtractedRow = (index) => {
    if (!Number.isInteger(index) || index < 0 || index >= extractedQuestions.length) return;

    const row = extractedQuestions[index] || {};
    const id = getRowCanonical(row);
    const label = id ? displayLabelFromCanonical(id) || id : `row ${index + 1}`;
    const ok = window.confirm(`Delete ${label} from this extracted upload? This only changes the current review screen until you save.`);
    if (!ok) return;

    const nextLength = Math.max(0, extractedQuestions.length - 1);
    setExtractedQuestions((prev) => prev.filter((_, idx) => idx !== index));
    setCurrentQuestionIndex((prev) => Math.min(prev, Math.max(0, nextLength - 1)));
    setHighlightedMsRowIndex(null);
    toast.info(`Deleted ${label}. Counts and QA checks updated.`);
  };

  const handleMergeParentStemIntoChildren = (index) => {
    if (!Number.isInteger(index) || index < 0 || index >= extractedQuestions.length) return;
    const parentRow = extractedQuestions[index] || {};
    const parentId = getRowCanonical(parentRow);
    if (!parentId || isLeafCanonical(parentId)) {
      toast.warn("This repair only applies to parent stem rows like 24 with children like 24.a.");
      return;
    }

    const childRows = extractedQuestions
      .map((row, rowIndex) => ({ row, rowIndex, id: getRowCanonical(row) }))
      .filter(({ id }) => id.startsWith(`${parentId}.`));

    if (childRows.length === 0) {
      toast.warn(`No child rows found for ${parentId}.`);
      return;
    }

    const ok = window.confirm(
      `Merge ${displayLabelFromCanonical(parentId) || parentId} stem into ${childRows.length} child row(s), then remove the parent stem row?`
    );
    if (!ok) return;

    setExtractedQuestions((prev) => {
      const parent = prev[index] || {};
      const parentText = parent.question_latex || "";
      const parentDiagrams = parent.diagram_urls || [];
      const next = prev
        .filter((_, rowIndex) => rowIndex !== index)
        .map((row) => {
          const id = getRowCanonical(row);
          if (!id.startsWith(`${parentId}.`)) return row;

          const warnings = Array.isArray(row.validation_warnings) ? [...row.validation_warnings] : [];
          warnings.push(`Review repair merged parent stem ${parentId} into this child row.`);
          return {
            ...row,
            question_latex: mergeParentStemText(parentText, row.question_latex),
            diagram_urls: mergeDiagramUrls(parentDiagrams, row.diagram_urls),
            validation_warnings: [...new Set(warnings)],
            needs_review: true,
          };
        })
        .sort((a, b) => compareCanonicalIds(getRowCanonical(a), getRowCanonical(b)));
      return next;
    });
    setCurrentQuestionIndex((prev) => Math.min(prev, Math.max(0, extractedQuestions.length - 2)));
    toast.success(`Merged ${parentId} stem into ${childRows.length} child row(s).`);
  };

  // ── Metadata approved ─────────────────────────────────────────────────────

  const handleCreateSplitReviewRow = (issue) => {
    const missingId = normalizeCanonicalForUi(issue?.id);
    const sourceIndex = Number.isInteger(issue?.sourceIndex) ? issue.sourceIndex : issue?.index;
    if (!missingId || !Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= extractedQuestions.length) {
      toast.warn("No source row found for this grouped-row repair.");
      return;
    }
    if (extractedQuestions.some((row) => getRowCanonical(row) === missingId)) {
      toast.info(`${missingId} already exists. Open that row and verify it.`);
      return;
    }

    const sourceRow = extractedQuestions[sourceIndex] || {};
    const sourceId = getRowCanonical(sourceRow) || issue?.sourceId || "source row";
    const missingLabel = displayLabelFromCanonical(missingId) || missingId;
    const sourceText = String(sourceRow.question_latex || "").trim();
    const copiedText = sourceText.startsWith(missingLabel)
      ? sourceText
      : `${missingLabel} [SPLIT REVIEW: copied from ${sourceId}. Trim this row to only the printed ${missingLabel} subpart before saving.]\n\n${sourceText}`;
    const warnings = [
      ...(Array.isArray(sourceRow.validation_warnings) ? sourceRow.validation_warnings : []),
      `Review repair created split row ${missingId} from grouped source row ${sourceId}. Trim copied text against the PDF before saving.`,
    ];
    const newRow = cleanMsAnchorPlaceholderRow({
      ...sourceRow,
      canonical_question_id: missingId,
      question_id: missingLabel,
      parent_canonical_id: canonicalRoot(missingId) || missingId,
      question_latex: copiedText,
      needs_review: true,
      validation_warnings: [...new Set(warnings)],
    });

    setExtractedQuestions((prev) => {
      const next = [...prev, newRow].sort((a, b) => compareCanonicalIds(getRowCanonical(a), getRowCanonical(b)));
      const nextIndex = next.findIndex((row) => getRowCanonical(row) === missingId);
      setTimeout(() => setCurrentQuestionIndex(Math.max(0, nextIndex)), 0);
      return next;
    });
    toast.success(`Created editable split row ${missingId}. Trim it against the PDF before saving.`);
  };

  const handleMetadataApprove = (approvedMeta) => {
    setExtractedMeta(approvedMeta);
    setExtractionStep("reviewQuestions");
    toast.success("Metadata approved — reviewing questions.");
  };

  // ── Bulk save ─────────────────────────────────────────────────────────────

  const handleBulkSave = async () => {
    if (!extractedQuestions.length) return;

    try {
      setSaving(true);

      const questionsToSave = extractedQuestions.map((q) => {
        // Properly format diagram_urls to ensure it's an array of strings and not a stringified array
        let formatted = {
          ...q,
          // Overlay verified metadata onto every question
          curriculum:  extractedMeta.curriculum  ?? q.curriculum,
          program:     extractedMeta.program     ?? q.program,
          subjectCode: extractedMeta.subjectCode ?? q.subjectCode,
          tier:        extractedMeta.tier        ?? q.tier,
          paperNumber: extractedMeta.paperNumber ?? q.paperNumber,
          session:     sessionLabelFromValue(extractedMeta.session ?? q.session),
          session_code: extractedMeta.session_code || sessionCodeFromValue(extractedMeta.session ?? q.session),
          year:        extractedMeta.year        ?? q.year,
          diagram_images_base64: undefined, // stripped — uploaded separately
        };

          // Fix the diagram_urls formatting if it exists
          if (formatted.diagram_urls) {
            // Deep sanitize to handle nested arrays
            formatted.diagram_urls = sanitizeDiagramUrls(formatted.diagram_urls);
          }
        
        return cleanMsAnchorPlaceholderRow(formatted);
      });

      const blockers = buildSaveBlockers(questionsToSave);
      if (blockers.length > 0) {
        const first = blockers[0];
        if (documentMode !== "Marking Scheme") {
          setCurrentQuestionIndex(first.index);
        }
        toast.error(`${first.title}. ${first.action}`, { autoClose: 9000 });
        return;
      }

      const chunks     = chunkArray(questionsToSave, 5);
      const progressId = toast.loading(`Saving batch 1 of ${chunks.length}…`);
      let saved = 0;

      for (let i = 0; i < chunks.length; i++) {
        toast.update(progressId, { render: `Saving batch ${i + 1} of ${chunks.length}…`, isLoading: true });
        try {
          await saveQuestions(chunks[i]);
        } catch (err) {
          toast.update(progressId, {
            render: `Failed at batch ${i + 1}: ${err?.message || "Save failed"}`,
            type: "error",
            isLoading: false,
            autoClose: 6500,
          });
          throw err;
        }
        saved += chunks[i].length;
      }

      toast.update(progressId, {
        render: `${saved} ${documentMode === "Marking Scheme" ? "MS entries" : "questions"} saved!`,
        type: "success", isLoading: false, autoClose: 2500,
      });

      // Refresh DB counts immediately after save
      await refreshDbCounts();

      const savedKey =
        extractedMeta.paper_reference_key ||
        extractedMeta.unified_paper_key ||
        questionsToSave[0]?.paper_reference_key ||
        questionsToSave[0]?.unified_paper_key ||
        "";
      const savedLabel = [
        savedKey,
        extractedMeta.paperNumber || extractedMeta.paper_number ? `Paper ${extractedMeta.paperNumber || extractedMeta.paper_number}` : "",
        extractedMeta.session || "",
        extractedMeta.year || "",
      ].filter(Boolean).join(" | ");

      if (documentMode === "Marking Scheme") {
        const pendingMsCanonicalIds = uniqueCanonicalIds(questionsToSave);
        updateWorkflowState({
          expectedNext: "qp",
          pendingMsKey: savedKey,
          pendingMsLabel: savedLabel || savedKey,
          pendingMsFileName: originalFileRef.current?.name || "",
          pendingMsCanonicalIds,
        });
        setDocumentMode("Question Paper");
        toast.info(
          `MS saved with ${pendingMsCanonicalIds.length} anchor ID(s). Next: upload matching QP${savedKey ? ` for ${savedKey}` : ""}.`,
          { autoClose: 5000 }
        );
      } else {
        updateWorkflowState({ expectedNext: "ms", pendingMsKey: "", pendingMsLabel: "", pendingMsFileName: "", pendingMsCanonicalIds: [] });
        setDocumentMode("Marking Scheme");
        toast.info("QP saved. Pairing step complete for this paper. Next: upload another MS.", { autoClose: 5000 });
      }

      // Reset for next upload
      setExtractedQuestions([]);
      setExtractedMeta({});
      setExtractionReviewReport(null);
      setSourceImageDataUrl("");
      setPdfBlobUrl((prev) => { revokePdfBlobUrl(prev); return ""; });
      setExtractionStep("upload");
      originalFileRef.current = null;

    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const isMarkingScheme = documentMode === "Marking Scheme";
  const saveBlockers = buildSaveBlockers(extractedQuestions);
  const liveExtractionReviewReport = buildLiveReviewReport(extractionReviewReport, extractedQuestions);
  const uploadIssues = buildUploadIssueCards({
    report: liveExtractionReviewReport,
    blockers: saveBlockers,
    items: extractedQuestions,
  });
  const visibleUploadIssues = uploadIssues;
  const rescueCandidateIds = [
    ...new Set(
      visibleUploadIssues
        .filter((issue) => ["missing_counterpart_id", "ms_anchor_missing"].includes(issue.type))
        .map((issue) => normalizeCanonicalForUi(issue.id))
        .filter(Boolean)
    ),
  ];

  useEffect(() => {
    setActiveIssueIndex(0);
    setHighlightedMsRowIndex(null);
  }, [extractionReviewReport, extractedQuestions.length]);

  useEffect(() => {
    if (activeIssueIndex >= visibleUploadIssues.length) {
      setActiveIssueIndex(Math.max(0, visibleUploadIssues.length - 1));
    }
  }, [activeIssueIndex, visibleUploadIssues.length]);

  useEffect(() => {
    if (!extractedQuestions.some((row) => /MS anchor placeholder:/i.test(String(row?.question_latex || "")))) {
      return;
    }
    setExtractedQuestions((prev) => {
      const next = prev.map(cleanMsAnchorPlaceholderRow);
      const changed = next.some((row, index) => row.question_latex !== prev[index]?.question_latex);
      return changed ? next : prev;
    });
  }, [extractedQuestions]);

  const handleGoToIssue = (issue) => {
    if (!Number.isInteger(issue?.index) || issue.index < 0) {
      toast.info("No exact row exists for this issue. Check the nearest matching ID in the PDF.");
      return;
    }

    if (isMarkingScheme) {
      setHighlightedMsRowIndex(issue.index);
      setTimeout(() => {
        const row = document.getElementById(`ms-entry-row-${issue.index}`);
        row?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }

    setCurrentQuestionIndex(Math.min(issue.index, Math.max(0, extractedQuestions.length - 1)));
  };

  const handleRescueMissingIds = async () => {
    const file = originalFileRef.current;
    if (!file) {
      toast.warn("Original PDF is not available in this tab. Upload the file again to run targeted rescue.");
      return;
    }
    if (isMarkingScheme || rescueCandidateIds.length === 0) return;

    try {
      setRescuingMissing(true);
      const base64String = await toBase64(file);
      const existingIds = new Set(extractedQuestions.map(getRowCanonical).filter(Boolean));
      const expectedIds = [
        ...new Set([
          ...extractedQuestions.map(getRowCanonical).filter(Boolean),
          ...rescueCandidateIds,
        ]),
      ].sort(compareCanonicalIds);

      const result = await rescueMissingQuestions({
        imageBase64: base64String,
        missingIds: rescueCandidateIds,
        metadata: {
          ...extractedMeta,
          expected_canonical_ids: expectedIds,
          current_canonical_ids: [...existingIds],
        },
        mimeType: file.type || "application/pdf",
        fileName: file.name || "",
        board: boardMode,
      });

      const recovered = Array.isArray(result?.questions_array) ? result.questions_array : [];
      const exactRecovered = recovered.filter((row) => {
        const id = getRowCanonical(row);
        return id && rescueCandidateIds.includes(id) && !existingIds.has(id);
      });

      if (exactRecovered.length === 0) {
        const pages = result?.rescue_report?.pages_attempted || [];
        const groupedHints = collectGroupedSplitRepairHints(extractedQuestions);
        const groupedIds = rescueCandidateIds.filter((id) => groupedHints.has(id));
        if (groupedIds.length > 0) {
          toast.warn(
            `Rescue recovered 0 because ${groupedIds.join(", ")} appears grouped inside existing row(s). Use Create Split Row instead.`
          );
          return;
        }
        toast.warn(
          `Targeted rescue ran ${pages.length ? `page(s) ${pages.join(", ")}` : "the likely pages"} but recovered 0 exact missing rows.`
        );
        return;
      }

      setExtractedQuestions((prev) => {
        const byId = new Map();
        prev.forEach((row) => {
          const id = getRowCanonical(row);
          if (id && !byId.has(id)) byId.set(id, row);
          else byId.set(`__row_${byId.size}`, row);
        });
        exactRecovered.forEach((row) => {
          const id = getRowCanonical(row);
          if (id && !byId.has(id)) byId.set(id, row);
        });
        return Array.from(byId.values()).sort((a, b) => compareCanonicalIds(getRowCanonical(a), getRowCanonical(b)));
      });

      const recoveredIds = exactRecovered.map(getRowCanonical).sort(compareCanonicalIds);
      toast.success(`Recovered ${recoveredIds.length} missing row(s): ${recoveredIds.join(", ")}`);
    } catch (err) {
      console.error(err);
      toast.error(`Targeted rescue failed: ${err?.message || "Unknown error"}`);
    } finally {
      setRescuingMissing(false);
    }
  };

  const activeUploadIssue = visibleUploadIssues[Math.min(activeIssueIndex, Math.max(0, visibleUploadIssues.length - 1))];
  const activeIssueActions = [];
  if (activeUploadIssue) {
    const activeRow = Number.isInteger(activeUploadIssue.index) ? extractedQuestions[activeUploadIssue.index] : null;
    const activeId = getRowCanonical(activeRow || {});
    const canMergeParentStem =
      !isMarkingScheme &&
      activeRow &&
      activeId &&
      !isLeafCanonical(activeId) &&
      rowHasChildCanonical(extractedQuestions, activeId);

    if (activeUploadIssue.type === "split_grouped_row_missing" && !isMarkingScheme) {
      activeIssueActions.push({
        key: "open-source-row",
        label: "Open Source Row",
        disabled: loading || saving,
        onClick: () => handleGoToIssue(activeUploadIssue),
      });
      activeIssueActions.push({
        key: "create-split-row",
        label: "Create Split Row",
        variant: "primary",
        disabled: loading || saving,
        onClick: () => handleCreateSplitReviewRow(activeUploadIssue),
      });
    }

    if (["missing_counterpart_id", "ms_anchor_missing"].includes(activeUploadIssue.type) && !isMarkingScheme) {
      activeIssueActions.push({
        key: "rescue-missing",
        label: rescuingMissing ? "Rescuing..." : "Run Targeted Rescue",
        variant: "primary",
        disabled: loading || saving || rescuingMissing || !originalFileRef.current,
        onClick: handleRescueMissingIds,
      });
    }

    if (canMergeParentStem && ["parent_stem_split", "extra_counterpart_id", "risky_row"].includes(activeUploadIssue.type)) {
      activeIssueActions.push({
        key: "merge-parent-stem",
        label: "Merge Stem Into Children",
        variant: "primary",
        disabled: loading || saving,
        onClick: () => handleMergeParentStemIntoChildren(activeUploadIssue.index),
      });
    }

    if (activeUploadIssue.type === "possible_missing_image") {
      activeIssueActions.push({
        key: "open-for-diagram",
        label: "Open Row & Paste Diagram",
        disabled: loading || saving,
        onClick: () => handleGoToIssue(activeUploadIssue),
      });
    }

    if (
      activeRow &&
      ["duplicate", "duplicate_canonical", "extra_counterpart_id", "parent_stem_split"].includes(activeUploadIssue.type)
    ) {
      activeIssueActions.push({
        key: "delete-row",
        label: "Delete This Row",
        variant: "danger",
        disabled: loading || saving,
        onClick: () => handleDeleteExtractedRow(activeUploadIssue.index),
      });
    }
  }

  const updateWorkflowState = (nextState) => {
    setWorkflowState(nextState);
    writeWorkflowState(nextState);
  };

  const resetWorkflowState = () => {
    updateWorkflowState({ expectedNext: "ms", pendingMsKey: "", pendingMsLabel: "", pendingMsFileName: "", pendingMsCanonicalIds: [] });
    setDocumentMode("Marking Scheme");
  };

  return (
    <div className="min-h-screen bg-[#f6f8fb] p-3 sm:p-6">
      <div className={`mx-auto max-w-7xl space-y-4 ${saving ? "pointer-events-none select-none opacity-75" : ""}`}>

        {/* ── Header — no dropdowns ── */}
        <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm ring-1 ring-white">
          <h1 className="text-xl font-bold text-slate-800 sm:text-2xl">
            📚 Paperly Ingestion Dashboard
          </h1>
          <Link 
            to="/qa"
            className="mt-2 inline-flex items-center rounded-lg border border-transparent bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400"
          >
            🛡️ Go to QA Dashboard
          </Link>
          <p className="mt-1 text-sm text-slate-500">
            Upload a Question Paper or Marking Scheme PDF. The AI will extract and structure everything automatically.
          </p>
        </div>

        <WorkflowGuidancePanel
          workflowState={workflowState}
          documentMode={documentMode}
          extractedMeta={extractedMeta}
          extractionStep={extractionStep}
          onSelectMode={setDocumentMode}
          onResetWorkflow={resetWorkflowState}
          disabled={loading || saving}
        />

        {/* ── Live DB counters ── */}
        <SessionTracker stats={dbCounts} />

        {/* ── Step 1: Upload ── */}
        {extractionStep === "upload" && (
          <>
            {/* Document Type & Board Selectors */}
            <div className="space-y-4">
              <div className="hidden">
                <button 
                  className={`px-4 py-2 rounded-lg font-semibold transition ${documentMode === 'Question Paper' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
                  onClick={() => setDocumentMode('Question Paper')}
                  disabled={loading || saving}
                >
                  📝 Question Paper
                </button>
                <button 
                  className={`px-4 py-2 rounded-lg font-semibold transition ${documentMode === 'Marking Scheme' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
                  onClick={() => setDocumentMode('Marking Scheme')}
                  disabled={loading || saving}
                >
                  📋 Marking Scheme
                </button>
              </div>
              
              {/* IMPORTANT: Board Selector */}
              <div className="flex flex-col">
                <label className="mb-2 font-semibold text-gray-700">Select Board:</label>
                <div className="flex gap-4">
                  <button 
                    className={`px-4 py-2 rounded-lg font-semibold transition ${boardMode === 'IGCSE' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
                    onClick={() => setBoardMode('IGCSE')}
                    disabled={loading || saving}
                  >
                    IGCSE
                  </button>
                  <button 
                    className={`px-4 py-2 rounded-lg font-semibold transition ${boardMode === 'IB' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
                    onClick={() => setBoardMode('IB')}
                    disabled={loading || saving}
                  >
                    IB
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Must be selected BEFORE uploading. This determines how the document will be processed.
                </p>
              </div>
            </div>

            <DualDropZone
              onFileUpload={handleFileUpload}
              disabled={loading || saving}
              loading={loading}
            />
            {!loading && (
              <p className="mt-4 text-center text-sm text-slate-400">
                Select QP or MS first, then drop the matching PDF. MS-first is recommended for cleaner numbering.
              </p>
            )}
          </>
        )}

        {/* ── Step 2: Verify metadata ── */}
        {extractionStep === "verifyMeta" && (
          <div className="space-y-4">
            <ReviewReportPanel report={liveExtractionReviewReport} />
            <MetadataVerificationCard
            extractedMeta={extractedMeta}
            extractedQuestions={extractedQuestions}
            onApprove={handleMetadataApprove}
            onRedo={handleRedoExtraction}
            loading={loading}
            saving={saving}
            />
          </div>
        )}

        {/* ── Step 3: Review & save ── */}
        {(extractionStep === "reviewQuestions" || extractionStep === "reviewMarkingScheme") && (
          <div className="space-y-4">
            <ReviewReportPanel report={liveExtractionReviewReport} />
            <UploadIssueCarousel
              issues={visibleUploadIssues}
              activeIndex={activeIssueIndex}
              onActiveIndexChange={setActiveIssueIndex}
              onGoToIssue={handleGoToIssue}
              isMarkingScheme={isMarkingScheme}
              actions={activeIssueActions}
            />

            {/* Mode badge */}
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${
                isMarkingScheme
                  ? "bg-amber-100 text-amber-800"
                  : "bg-indigo-100 text-indigo-800"
              }`}>
                {isMarkingScheme ? "📋 Marking Scheme" : "📝 Question Paper"} — {extractedQuestions.length} items
              </span>
            </div>

            {/* Marking Scheme → read-only table (full array) */}
              {isMarkingScheme ? (
                <>
                  <MarkingSchemeCard 
                    allEntries={extractedQuestions} 
                    highlightedIndex={highlightedMsRowIndex}
                    onEntryChange={(index, updatedEntry) => handleQuestionChange(index, updatedEntry)}
                    onEntryDelete={handleDeleteExtractedRow}
                  />
                  {extractedQuestions.length > 0 && (
                    <div className="mt-6 flex flex-col items-center gap-3">
                      <button
                        onClick={handleBulkSave}
                        disabled={loading || saving || saveBlockers.length > 0}
                        className="rounded-xl bg-emerald-600 px-8 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {saving ? "Saving…" : `Approve All & Save ${extractedQuestions.length} MS Entries`}
                      </button>
                      
                      {/* Redo extraction button — bypasses all caches */}
                      <button
                        onClick={handleRedoExtraction}
                        disabled={loading || saving}
                        className="text-sm text-orange-600 hover:text-orange-800 hover:underline disabled:opacity-50"
                      >
                        🔄 Redo Extraction (bypass cache)
                      </button>
                      
                      {/* Manual override button */}
                      <button
                        onClick={() => openManualPairingModal({
                          id: extractedQuestions[0]?._id,
                          documentType: "Marking Scheme",
                          paper_reference_key: extractedMeta.paper_reference_key || extractedQuestions[0]?.paper_reference_key
                        })}
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        Need to manually pair? Click here
                      </button>
                    </div>
                  )}
              </>
            ) : (
              /* Question Paper → stepper/pagination with editable cards */
              <>
                {extractedQuestions.length === 0 && (
                  <p className="text-center text-slate-500">No questions to display.</p>
                )}
                
                {extractedQuestions.length > 0 && (
                  <>
                    {/* Pagination Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
                      <button
                        onClick={() => setCurrentQuestionIndex(prevIndex => Math.max(0, prevIndex - 1))}
                        disabled={currentQuestionIndex <= 0 || loading || saving}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        ← Previous
                      </button>
                      
                      <div className="text-sm font-medium">
                        Question {currentQuestionIndex + 1} of {extractedQuestions.length}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteExtractedRow(currentQuestionIndex)}
                        disabled={loading || saving}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1 text-sm font-semibold text-red-600 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Delete this extracted row from the current review payload"
                      >
                        <Trash2 size={14} />
                        Delete Row
                      </button>
                      
                      <button
                        onClick={() => setCurrentQuestionIndex(prevIndex => Math.min(extractedQuestions.length - 1, prevIndex + 1))}
                        disabled={currentQuestionIndex >= extractedQuestions.length - 1 || loading || saving}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next →
                      </button>
                    </div>
                    
                    {/* Current Question Card */}
                    <div className="my-4">
                      <QuestionCard
                        key={currentQuestionIndex}
                        data={extractedQuestions[currentQuestionIndex]}
                        onChange={(updated) => handleQuestionChange(currentQuestionIndex, updated)}
                        sourceImageDataUrl={sourceImageDataUrl}
                        pdfBlobUrl={pdfBlobUrl}
                      />
                    </div>
                    
                    {/* Progress Indicator */}
                    <div className="flex items-center justify-center gap-1 my-4">
                      {extractedQuestions.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentQuestionIndex(idx)}
                          className={`w-2.5 h-2.5 rounded-full transition-all ${
                            idx === currentQuestionIndex 
                              ? 'bg-blue-600 w-4' 
                              : 'bg-gray-300 hover:bg-gray-400'
                          }`}
                          aria-label={`Go to question ${idx + 1}`}
                        />
                      ))}
                    </div>
                    
                    {/* Save Button and Manual Override */}
                    <div className="mt-6 flex flex-col items-center gap-3">
                      <button
                        onClick={handleBulkSave}
                        disabled={loading || saving || saveBlockers.length > 0}
                        className="rounded-xl bg-emerald-600 px-8 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {saving ? "Saving…" : `Approve All & Save ${extractedQuestions.length} Questions`}
                      </button>

                      {/* Redo extraction button — bypasses all caches */}
                      <button
                        onClick={handleRedoExtraction}
                        disabled={loading || saving}
                        className="text-sm text-orange-600 hover:text-orange-800 hover:underline disabled:opacity-50"
                      >
                        🔄 Redo Extraction (bypass cache)
                      </button>
                      
                      {/* Manual override button */}
                      <button
                        onClick={() => openManualPairingModal({
                          id: extractedQuestions[0]?._id,
                          documentType: "Question Paper",
                          paper_reference_key: extractedMeta.paper_reference_key || extractedQuestions[0]?.paper_reference_key
                        })}
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        Need to manually pair? Click here
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Manual Pairing Modal */}
        <ManualPairingModal 
          isOpen={isManualPairingModalOpen}
          onClose={closeManualPairingModal}
          unpaired={selectedUnpairedDoc}
          refreshDbCounts={refreshDbCounts}
        />
      </div>
    </div>
  );
};

export default Dashboard;
