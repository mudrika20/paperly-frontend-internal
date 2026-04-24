import React from "react";
import MathPreview from "./MathPreview";

const MarkingSchemeTable = ({ data = [], onSave, saving = false, disabled = false }) => {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">Marking Scheme Review Grid</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Question No.
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Answer & Marks (LaTeX Preview)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {data.map((row, index) => {
              const questionNumber =
                row.question_number || row.question || `Row ${index + 1}`;
              const answerLatex =
                row.official_marking_scheme_latex ||
                row.marking_scheme_latex ||
                row.latex ||
                "";
              return (
                <tr key={`ms-row-${index}`}>
                  <td className="px-4 py-3 text-sm font-medium text-slate-700 align-top">
                    {questionNumber}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    <div className="whitespace-pre-wrap">
                      <MathPreview latex={answerLatex} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || saving || data.length === 0}
          className="rounded-xl bg-emerald-600 px-8 py-3 text-base font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? "Saving..." : "Approve & Bulk Save"}
        </button>
      </div>
    </div>
  );
};

export default MarkingSchemeTable;
