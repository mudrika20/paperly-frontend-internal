import React, { useState, useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import MathPreview from "./MathPreview";

  const parseDiagrams = (raw) => {
    if (!raw) return [];
    let arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (typeof raw === "string") {
      try { const parsed = JSON.parse(raw); arr = Array.isArray(parsed) ? parsed : [parsed]; } catch (e) { arr = [raw]; }
    } else if (typeof raw === "object") arr = [raw];
    
    return [...new Set(arr.flat(Infinity).map(u => {
      if (typeof u === "string") return u;
      if (u && typeof u === "object") return u.secure_url || u.url || u.diagramUrl || "";
      return "";
    }).filter(u => typeof u === "string" && u.trim() !== "" && u !== "[NEEDS_CROP]"))];
  };

// ---------------------------------------------------------------------------
// MethodStepsList
// ---------------------------------------------------------------------------
const MethodStepsList = ({ steps = [] }) => {
  if (!Array.isArray(steps) || steps.length === 0) return null;
  return (
    <ol className="mt-1 space-y-1 pl-1">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <span className="mt-0.5 shrink-0 rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs font-bold text-amber-800">
            {step.type || "—"}
          </span>
          <span className="text-slate-700">
            <MathPreview latex={step.description || ""} />
          </span>
        </li>
      ))}
    </ol>
  );
};

// ---------------------------------------------------------------------------
// MSEntryRow — diagram gallery + Ctrl+V paste support
// ---------------------------------------------------------------------------
const MSEntryRow = ({ entry, index, onChange, onDelete, onRepair = null, repairing = false, isHighlighted = false }) => {
  const questionLabel =
    entry.question_id ||
    entry.question_latex ||
    entry.question_number ||
    `Row ${index + 1}`;

  const finalAnswer = entry.final_answer  || "";
  const totalMarks  = entry.total_marks   ?? 0;
  const methodSteps = Array.isArray(entry.method_steps) ? entry.method_steps : [];

  const cognitiveDemand    = entry.cognitive_demand    || "MEDIUM";
  const difficultyOverride = entry.difficulty_override || null;
  const canonicalId = entry.canonical_question_id || "";

  const pastedSetRef = useRef(new Set());

  const currentDiagrams = parseDiagrams(entry.diagram_urls);

  const appendUserDiagram = (dataUrl) => {
    if (!dataUrl) return;
    pastedSetRef.current.add(dataUrl);
    if (onChange) onChange({ ...entry, diagram_urls: [...currentDiagrams, dataUrl] });
  };

  const removeDiagram = (idx) => {
    const next = currentDiagrams.filter((_, i) => i !== idx);
    if (onChange) onChange({ ...entry, diagram_urls: next });
  };

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Read failed"));
      reader.readAsDataURL(file);
    });


  // Robust paste: .files first (drag-drop), then .items (Snipping Tool / macOS)
  const handlePaste = async (e) => {
    const files   = Array.from(e.clipboardData?.files || []);
    const imgFile = files.find(f => f.type.startsWith("image/"));
    if (imgFile) {
      e.preventDefault(); e.stopPropagation();
      appendUserDiagram(await fileToDataUrl(imgFile));
      return;
    }
    const items   = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find(i => i.kind === "file" && i.type.startsWith("image/"));
    if (imgItem) {
      e.preventDefault(); e.stopPropagation();
      const file = imgItem.getAsFile();
      if (file) appendUserDiagram(await fileToDataUrl(file));
    }
    // No image in clipboard → let text paste proceed normally
  };

  // ── Field handlers ─────────────────────────────────────────────────────────
  const handleFinalAnswerChange = (e) => {
    if (onChange) onChange({ ...entry, final_answer: e.target.value });
  };

  const handleTotalMarksChange = (e) => {
    if (onChange) onChange({ ...entry, total_marks: parseInt(e.target.value, 10) || 0 });
  };

  const handleMethodStepChange = (idx, field, value) => {
    if (onChange) {
      const updatedSteps = [...methodSteps];
      updatedSteps[idx] = { ...updatedSteps[idx], [field]: value };
      onChange({ ...entry, method_steps: updatedSteps });
    }
  };

  const handleDifficultyOverrideChange = (e) => {
    const val = e.target.value === "null" ? null : e.target.value;
    if (onChange) onChange({ ...entry, difficulty_override: val });
  };

  const displayLabelFromCanonical = (value = "") => {
    const parts = String(value || "").trim().toLowerCase().split(".").filter(Boolean);
    if (parts.length === 0) return "";
    return `${parts[0]}${parts.slice(1).map(part => `(${part})`).join("")}`;
  };

  const handleCanonicalIdChange = (e) => {
    const value = e.target.value.trim().toLowerCase();
    const parent = value.split(".")[0] || "";
    const label = displayLabelFromCanonical(value);
    if (onChange) {
      onChange({
        ...entry,
        canonical_question_id: value,
        parent_canonical_id: parent,
        question_id: label || entry.question_id,
        question_latex: label || entry.question_latex,
        needs_review: true,
        validation_warnings: [
          ...new Set([
            ...(Array.isArray(entry.validation_warnings) ? entry.validation_warnings : []),
            "Canonical ID manually edited during human review.",
          ]),
        ],
      });
    }
  };

  const addMethodStep = () => {
    if (onChange) onChange({ ...entry, method_steps: [...methodSteps, { type: "M1", description: "" }] });
  };

  const removeMethodStep = (idx) => {
    if (onChange) {
      const updatedSteps = [...methodSteps];
      updatedSteps.splice(idx, 1);
      onChange({ ...entry, method_steps: updatedSteps });
    }
  };

  const badgeColor =
    cognitiveDemand === "LOW"  ? "bg-green-100 text-green-800"  :
    cognitiveDemand === "HIGH" ? "bg-red-100 text-red-800"      :
                                  "bg-yellow-100 text-yellow-800";

  return (
    <tr
      id={`ms-entry-row-${index}`}
      className={`align-top transition-colors ${
        isHighlighted ? "bg-blue-50 ring-2 ring-inset ring-blue-300" : "hover:bg-slate-50"
      }`}
      onPaste={handlePaste}
      tabIndex={0}
    >
      {/* ── Question No & Badges ─────────────────────────────────────── */}
      <td className="w-28 px-4 py-3 text-sm font-semibold text-slate-800 whitespace-nowrap">
        <div className="flex items-start justify-between gap-2">
          <span>{questionLabel}</span>
          <div className="flex items-center gap-1">
            {onRepair && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRepair(index);
                }}
                disabled={repairing}
                className="rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-1 text-[10px] font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                title="Repair this MS row from the original PDF"
              >
                {repairing ? "..." : "Repair"}
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onDelete) onDelete(index);
              }}
              className="rounded-md border border-red-200 bg-white p-1 text-red-600 shadow-sm hover:bg-red-50"
              title="Delete this MS row from the current review payload"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
        <label className="mt-2 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
          Canonical ID
        </label>
        <input
          value={canonicalId}
          onChange={handleCanonicalIdChange}
          className="mt-1 w-full rounded border border-slate-300 bg-white px-1.5 py-1 font-mono text-xs font-semibold outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
          placeholder="7.c.ii"
        />
        <div className="mt-3 flex flex-col gap-1.5">
          <span className={`inline-flex w-max items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${badgeColor}`}>
            AI: {cognitiveDemand}
          </span>
          <select
            value={difficultyOverride || "null"}
            onChange={handleDifficultyOverrideChange}
            className="w-full cursor-pointer appearance-none rounded border border-slate-200 bg-slate-50 p-1 text-[10px] font-semibold text-slate-700 outline-none hover:bg-white focus:ring-1 focus:ring-blue-300"
          >
            <option value="null">- No Override -</option>
            <option value="Easy">Force: Easy</option>
            <option value="Medium">Force: Medium</option>
            <option value="Hard">Force: Hard</option>
          </select>
        </div>
      </td>

      {/* ── Final Answer + Diagram Gallery ───────────────────────────── */}
      <td className="px-4 py-3 text-sm text-slate-700">
        {currentDiagrams.length > 0 && (
          <div className="mb-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              MS Diagram(s)
            </p>
            <div className="flex flex-col gap-2">
              {currentDiagrams.map((src, i) => {
                const isPasted = pastedSetRef.current.has(src);
                return (
                  <div key={`diag-${i}`} className="group relative">
                    <img
                      src={src}
                      alt={`MS Diagram ${i + 1}`}
                      className={`max-h-44 w-full rounded-lg object-contain p-2 ${
                        isPasted ? "border-2 border-indigo-400 bg-white" : "border border-slate-200 bg-white"
                      }`}
                    />
                    {isPasted && (
                      <span className="absolute left-2 top-2 rounded bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">
                        Pasted
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeDiagram(i); }}
                      className="absolute right-2 top-2 rounded-md bg-red-500 p-1 text-white opacity-0 shadow transition group-hover:opacity-100 hover:bg-red-600"
                      title="Remove diagram"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Paste tip */}
        {currentDiagrams.length === 0 && (
          <p className="mb-2 text-[10px] text-slate-400">
            💡 Ctrl+V anywhere on this row to paste an MS diagram.
          </p>
        )}

        {/* Final Answer */}
        <div className="whitespace-pre-wrap">
          <textarea
            value={finalAnswer}
            onChange={handleFinalAnswerChange}
            className="w-full p-2 border border-slate-300 rounded text-sm min-h-[60px]"
            placeholder="Enter final answer (LaTeX supported)"
          />
          <div className="mt-1 text-xs text-slate-500">
            Preview: <MathPreview latex={finalAnswer} />
          </div>
        </div>
      </td>

      {/* ── Marks ────────────────────────────────────────────────────── */}
      <td className="w-20 px-4 py-3 text-sm text-slate-700">
        <input
          type="number"
          min="0"
          value={totalMarks}
          onChange={handleTotalMarksChange}
          className="w-16 p-1 text-center border border-slate-300 rounded"
        />
      </td>

      {/* ── Method Steps ─────────────────────────────────────────────── */}
      <td className="px-4 py-3 text-sm text-slate-700">
        <div className="space-y-2">
          {methodSteps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <input
                type="text"
                value={step.type || ""}
                onChange={(e) => handleMethodStepChange(idx, "type", e.target.value)}
                className="w-16 p-1 border border-slate-300 rounded text-sm"
                placeholder="Type"
              />
              <input
                type="text"
                value={step.description || ""}
                onChange={(e) => handleMethodStepChange(idx, "description", e.target.value)}
                className="flex-1 p-1 border border-slate-300 rounded text-sm"
                placeholder="Description"
              />
              <button
                onClick={() => removeMethodStep(idx)}
                className="text-red-500 hover:text-red-700"
                title="Remove step"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={addMethodStep}
            className="mt-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            + Add Mark Point
          </button>
        </div>
      </td>
    </tr>
  );
};

// ---------------------------------------------------------------------------
// MarkingSchemeCard — wrapper (structure unchanged)
// ---------------------------------------------------------------------------
const MarkingSchemeCard = ({ markingSchemeData, allEntries = [], onEntryChange, onEntryDelete, onEntryRepair = null, repairing = false, highlightedIndex = null }) => {
  const entries     = allEntries.length > 0 ? allEntries : markingSchemeData ? [markingSchemeData] : [];
  const paperRefKey = entries[0]?.paper_reference_key || "";

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
        No marking scheme entries to display.
      </div>
    );
  }

  return (
    <div className="space-y-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">📋 Marking Scheme Review</h2>
          {paperRefKey && (
            <p className="mt-0.5 font-mono text-xs text-slate-500">
              paper_reference_key: <span className="font-bold">{paperRefKey}</span>
            </p>
          )}
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700 ring-1 ring-blue-100">
          {entries.length} entries · Editable
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 w-28">Question</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Final Answer & Diagrams</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600 w-20">Marks</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Method Steps</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {entries.map((entry, idx) => (
              <MSEntryRow
                key={`ms-${idx}`}
                entry={entry}
                index={idx}
                isHighlighted={idx === highlightedIndex}
                onChange={updatedEntry => onEntryChange && onEntryChange(idx, updatedEntry)}
                onDelete={onEntryDelete}
                onRepair={onEntryRepair}
                repairing={repairing}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-5 pb-4">
        <p className="text-xs text-slate-400 italic">
          ✏️ Editable. Ctrl+V on any row to paste a diagram. Click "Approve All & Save" to persist.
        </p>
      </div>
    </div>
  );
};

export default MarkingSchemeCard;
