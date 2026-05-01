import React from "react";
import MathPreview from "./MathPreview";

const MarkingSchemeTable = ({ data = [], onSave, saving = false, disabled = false }) => {
  // Debug: log the data being received
  console.log('[MarkingSchemeTable] Received data:', data);
  
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
            {data && data.length > 0 ? (
              data.map((row, index) => {
                // Try multiple field names for question number
                const questionNumber =
                  row.question_number ||    // Added by backend
                  row.question_latex ||     // From Python engine (marking schemes)
                  row.question ||           // Fallback
                  `Row ${index + 1}`;
                
                // Try multiple field names for marking scheme answer
                const answerLatex =
                  row.official_marking_scheme_latex ||
                  row.marking_scheme_latex ||
                  row.answer ||
                  row.latex ||
                  "(No answer content)";
                
                console.log(`[MarkingSchemeTable] Row ${index}:`, { questionNumber, hasAnswer: !!answerLatex });
                
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
              })
            ) : (
              <tr>
                <td colSpan="2" className="px-4 py-6 text-center text-slate-500">
                  No marking scheme entries to display. Data received: {data?.length || 0} rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || saving || !data || data.length === 0}
          className="rounded-xl bg-emerald-600 px-8 py-3 text-base font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? "Saving..." : `Approve & Bulk Save ${data?.length || 0} Items`}
        </button>
      </div>
    </div>
  );
};

export default MarkingSchemeTable;
