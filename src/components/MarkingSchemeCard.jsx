import React from "react";
import MathPreview from "./MathPreview";

// ---------------------------------------------------------------------------
// MethodStepsList — renders the [{ type, description }] training array
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
// Single MS row card (with editing capabilities)
// ---------------------------------------------------------------------------
const MSEntryRow = ({ entry, index, onChange }) => {
  // question_latex holds the question number/label for MS entries
  const questionLabel =
    entry.question_id ||
    entry.question_latex ||
    entry.question_number ||
    `Row ${index + 1}`;

  // Use final_answer directly for editing
  const finalAnswer = entry.final_answer || "";
  const totalMarks = entry.total_marks ?? 0;
  const methodSteps = Array.isArray(entry.method_steps) ? entry.method_steps : [];

  // Event handlers for editable fields
  const handleFinalAnswerChange = (e) => {
    if (onChange) {
      onChange({
        ...entry,
        final_answer: e.target.value
      });
    }
  };

  const handleTotalMarksChange = (e) => {
    if (onChange) {
      const value = parseInt(e.target.value, 10) || 0;
      onChange({
        ...entry,
        total_marks: value
      });
    }
  };

  const handleMethodStepChange = (idx, field, value) => {
    if (onChange) {
      const updatedSteps = [...methodSteps];
      updatedSteps[idx] = { 
        ...updatedSteps[idx],
        [field]: value 
      };
      onChange({
        ...entry,
        method_steps: updatedSteps
      });
    }
  };

  const addMethodStep = () => {
    if (onChange) {
      onChange({
        ...entry,
        method_steps: [...methodSteps, { type: "M1", description: "" }]
      });
    }
  };

  const removeMethodStep = (idx) => {
    if (onChange) {
      const updatedSteps = [...methodSteps];
      updatedSteps.splice(idx, 1);
      onChange({
        ...entry,
        method_steps: updatedSteps
      });
    }
  };

  return (
    <tr className="align-top hover:bg-amber-50 transition-colors">
      {/* Question No. */}
      <td className="w-28 px-4 py-3 text-sm font-semibold text-slate-800 whitespace-nowrap">
        {questionLabel}
      </td>

      {/* Final Answer - Editable */}
      <td className="px-4 py-3 text-sm text-slate-700">
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

      {/* Total Marks - Editable */}
      <td className="w-20 px-4 py-3 text-sm text-slate-700">
        <input
          type="number"
          min="0"
          value={totalMarks}
          onChange={handleTotalMarksChange}
          className="w-16 p-1 text-center border border-slate-300 rounded"
        />
      </td>

      {/* Method Steps - Editable */}
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
// MarkingSchemeCard — editable table for the full MS questions_array
// ---------------------------------------------------------------------------
const MarkingSchemeCard = ({ markingSchemeData, allEntries = [], onEntryChange }) => {
  // Support two calling conventions:
  //   1. <MarkingSchemeCard allEntries={extractedQuestions} />   ← preferred (full array)
  //   2. <MarkingSchemeCard markingSchemeData={singleEntry} />   ← legacy (single object)
  const entries = allEntries.length > 0
    ? allEntries
    : markingSchemeData
      ? [markingSchemeData]
      : [];

  // Derive paper_reference_key from the first entry (all rows share the same key)
  const paperRefKey =
    entries[0]?.paper_reference_key ||
    entries[0]?.paper_reference_key ||
    "";

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-slate-500">
        No marking scheme entries to display.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-amber-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-amber-50 px-5 py-4 border-b border-amber-200">
        <div>
          <h2 className="text-lg font-bold text-amber-900">
            📋 Marking Scheme Review
          </h2>
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

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 w-28">
                Question
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Final Answer
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600 w-20">
                Marks
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Method Steps
              </th>
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

      {/* Editable notice */}
      <div className="px-5 pb-4">
        <p className="text-xs text-slate-400 italic">
          ✏️ Marking Scheme entries are now editable. Make changes as needed, then click "Approve All &amp; Save" to persist.
        </p>
      </div>
    </div>
  );
};

export default MarkingSchemeCard;
