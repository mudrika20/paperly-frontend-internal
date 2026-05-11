import React, { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import MathPreview from "./MathPreview";

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
const MSEntryRow = ({ entry, index, onChange }) => {
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

  // ── Diagram state (two-bucket, same pattern as QuestionCard) ─────────────
  // aiDiagrams  : from Gemini extraction — resets only on mount
  // userDiagrams: manually pasted — NEVER reset
  const [aiDiagrams, setAiDiagrams] = useState([]);

  useEffect(() => {
    setAiDiagrams(
      Array.isArray(entry.diagram_urls)
        ? entry.diagram_urls.filter(u => u && u !== "[NEEDS_CROP]")
        : []
    );
  }, [entry.diagram_urls]);

  const [userDiagrams, setUserDiagrams] = useState([]);

  const notifyDiagramChange = (nextAi, nextUser) => {
    if (onChange) onChange({ ...entry, diagram_urls: [...nextAi, ...nextUser] });
  };

  const removeAiDiagram = (idx) => {
    setAiDiagrams(prev => {
      const next = prev.filter((_, i) => i !== idx);
      notifyDiagramChange(next, userDiagrams);
      return next;
    });
  };

  const removeUserDiagram = (idx) => {
    setUserDiagrams(prev => {
      const next = prev.filter((_, i) => i !== idx);
      notifyDiagramChange(aiDiagrams, next);
      return next;
    });
  };

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Read failed"));
      reader.readAsDataURL(file);
    });

  const appendUserDiagram = (dataUrl) => {
    if (!dataUrl) return;
    setUserDiagrams(prev => {
      const next = [...prev, dataUrl];
      notifyDiagramChange(aiDiagrams, next);
      return next;
    });
  };

  // Robust paste: .files first (drag-drop), then .items (Snipping Tool / macOS)
  const handlePaste = async (e) => {
    const files   = Array.from(e.clipboardData?.files || []);
    const imgFile = files.find(f => f.type.startsWith("image/"));
    if (imgFile) {
      e.preventDefault();
      appendUserDiagram(await fileToDataUrl(imgFile));
      return;
    }
    const items   = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find(i => i.kind === "file" && i.type.startsWith("image/"));
    if (imgItem) {
      e.preventDefault();
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

  const hasDiagrams = aiDiagrams.length > 0 || userDiagrams.length > 0;

  return (
    <tr
      className="align-top hover:bg-amber-50 transition-colors"
      onPaste={handlePaste}
      tabIndex={0}
    >
      {/* ── Question No & Badges ─────────────────────────────────────── */}
      <td className="w-28 px-4 py-3 text-sm font-semibold text-slate-800 whitespace-nowrap">
        <div>{questionLabel}</div>
        <div className="mt-3 flex flex-col gap-1.5">
          <span className={`inline-flex w-max items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${badgeColor}`}>
            AI: {cognitiveDemand}
          </span>
          <select
            value={difficultyOverride || "null"}
            onChange={handleDifficultyOverrideChange}
            className="w-full cursor-pointer appearance-none rounded border border-amber-200 bg-amber-50 p-1 text-[10px] font-semibold text-amber-900 outline-none hover:bg-white focus:ring-1 focus:ring-amber-400"
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

        {/* AI-extracted MS diagrams */}
        {aiDiagrams.length > 0 && (
          <div className="mb-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              MS Diagram(s) — AI Extracted
            </p>
            <div className="flex flex-col gap-2">
              {aiDiagrams.map((src, i) => (
                <div key={`ai-${i}`} className="group relative">
                  <img
                    src={src}
                    alt={`MS Diagram ${i + 1}`}
                    className="max-h-44 w-full rounded-lg border border-slate-200 bg-white object-contain p-2"
                  />
                  <button
                    type="button"
                    onClick={() => removeAiDiagram(i)}
                    className="absolute right-2 top-2 rounded-md bg-red-500 p-1 text-white opacity-0 shadow transition group-hover:opacity-100 hover:bg-red-600"
                    title="Remove AI diagram"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User-pasted MS diagrams — blue border to distinguish */}
        {userDiagrams.length > 0 && (
          <div className="mb-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
              MS Diagram(s) — Pasted
            </p>
            <div className="flex flex-col gap-2">
              {userDiagrams.map((src, i) => (
                <div key={`user-${i}`} className="group relative">
                  <img
                    src={src}
                    alt={`Pasted MS Diagram ${i + 1}`}
                    className="max-h-44 w-full rounded-lg border-2 border-indigo-400 bg-white object-contain p-2"
                  />
                  <span className="absolute left-2 top-2 rounded bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    Pasted
                  </span>
                  <button
                    type="button"
                    onClick={() => removeUserDiagram(i)}
                    className="absolute right-2 top-2 rounded-md bg-red-500 p-1 text-white opacity-0 shadow transition group-hover:opacity-100 hover:bg-red-600"
                    title="Remove pasted diagram"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Paste tip — shown only when no diagrams present */}
        {!hasDiagrams && (
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
const MarkingSchemeCard = ({ markingSchemeData, allEntries = [], onEntryChange }) => {
  const entries     = allEntries.length > 0 ? allEntries : markingSchemeData ? [markingSchemeData] : [];
  const paperRefKey = entries[0]?.paper_reference_key || "";

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-slate-500">
        No marking scheme entries to display.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-amber-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between bg-amber-50 px-5 py-4 border-b border-amber-200">
        <div>
          <h2 className="text-lg font-bold text-amber-900">📋 Marking Scheme Review</h2>
          {paperRefKey && (
            <p className="mt-0.5 text-xs text-amber-700 font-mono">
              paper_reference_key: <span className="font-bold">{paperRefKey}</span>
            </p>
          )}
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
          {entries.length} entries · Editable
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 w-28">Question</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Final Answer &amp; Diagrams</th>
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
                onChange={updatedEntry => onEntryChange && onEntryChange(idx, updatedEntry)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-5 pb-4">
        <p className="text-xs text-slate-400 italic">
          ✏️ Editable. Ctrl+V on any row to paste a diagram. Click "Approve All &amp; Save" to persist.
        </p>
      </div>
    </div>
  );
};

export default MarkingSchemeCard;