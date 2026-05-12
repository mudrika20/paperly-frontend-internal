import React, { useState } from "react";
import MathPreview from "./MathPreview";

// ---------------------------------------------------------------------------
// DiagramGallery
// Renders all Cloudinary (or any valid HTTP/data-URI) URLs from diagram_urls.
// Handles: loading skeleton, broken-image fallback, lightbox-style click-to-zoom.
// ---------------------------------------------------------------------------
const DiagramGallery = ({ urls = [] }) => {
  const [errored, setErrored]   = useState({});   // tracks broken images by index
  const [zoomed,  setZoomed]    = useState(null);  // index of the zoomed image

  // Normalise: guarantee we always work with a flat array of non-empty strings
  const validUrls = Array.isArray(urls)
    ? urls.filter(
        (u) =>
          typeof u === "string" &&
          u.trim() !== "" &&
          u !== "[NEEDS_CROP]" &&
          (u.startsWith("http") || u.startsWith("data:image"))
      )
    : [];

  if (validUrls.length === 0) return null;

  return (
    <>
      {/* ── Lightbox overlay ─────────────────────────────────────────────── */}
      {zoomed !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setZoomed(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Diagram zoom view"
        >
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-auto rounded-2xl bg-white p-2 shadow-2xl">
            <img
              src={validUrls[zoomed]}
              alt={`MS Diagram ${zoomed + 1} — zoomed`}
              className="max-h-[85vh] w-auto rounded-xl object-contain"
            />
            <button
              onClick={() => setZoomed(null)}
              className="absolute right-3 top-3 rounded-full bg-slate-800/80 px-2.5 py-1 text-xs font-bold text-white hover:bg-slate-900"
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}

      {/* ── Gallery label ────────────────────────────────────────────────── */}
      <div className="mb-2 flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
        <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-700">
          MS Diagram{validUrls.length > 1 ? `s (${validUrls.length})` : ""}
        </p>
      </div>

      {/* ── Image grid ───────────────────────────────────────────────────── */}
      <div className="mb-3 flex flex-col gap-3">
        {validUrls.map((src, i) =>
          errored[i] ? (
            /* Broken-image fallback */
            <div
              key={`diag-err-${i}`}
              className="flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-red-300 bg-red-50 text-xs text-red-500"
              role="img"
              aria-label={`MS Diagram ${i + 1} failed to load`}
            >
              ⚠️ Diagram {i + 1} failed to load
            </div>
          ) : (
            /* Loaded image */
            <div
              key={`diag-${i}`}
              className="group relative overflow-hidden rounded-lg border border-amber-200 bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              <img
                src={src}
                alt={`MS Diagram ${i + 1}`}
                className="max-h-56 max-w-full cursor-zoom-in rounded-lg object-contain p-2 transition-transform duration-200 group-hover:scale-[1.01]"
                loading="lazy"
                onError={() => setErrored((prev) => ({ ...prev, [i]: true }))}
                onClick={() => setZoomed(i)}
                title="Click to zoom"
              />
              {/* Zoom hint badge — visible on hover */}
              <span className="absolute bottom-2 right-2 rounded bg-slate-700/70 px-1.5 py-0.5 text-[9px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                🔍 Zoom
              </span>
            </div>
          )
        )}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// MarkingSchemeTable
// ---------------------------------------------------------------------------
const MarkingSchemeTable = ({ data = [], onSave, saving = false, disabled = false }) => {
  // Debug: log the data being received
  console.log("[MarkingSchemeTable] Received data:", data);

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
                Answer &amp; Marks (LaTeX Preview)
              </th>
              {/* ── NEW: Diagrams column ── */}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Diagrams
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {data && data.length > 0 ? (
              data.map((row, index) => {
                // Resolve question label — try every known field name
                const questionNumber =
                  row.question_number ||
                  row.question_id     ||
                  row.question_latex  ||
                  row.question        ||
                  `Row ${index + 1}`;

                // Resolve marking-scheme answer latex
                const answerLatex =
                  row.official_marking_scheme_latex ||
                  row.marking_scheme_latex          ||
                  row.answer                        ||
                  row.latex                         ||
                  "(No answer content)";

                // ── Resolve diagram_urls ────────────────────────────────────
                // Normalise to a clean flat array regardless of shape returned
                // by the API (flat array, nested array, or absent).
                const rawUrls = row.diagram_urls;
                const diagramUrls = Array.isArray(rawUrls)
                  ? rawUrls.flat(Infinity).filter(
                      (u) =>
                        typeof u === "string" &&
                        u.trim() !== "" &&
                        u !== "[NEEDS_CROP]" &&
                        (u.startsWith("http") || u.startsWith("data:image"))
                    )
                  : [];

                console.log(`[MarkingSchemeTable] Row ${index}:`, {
                  questionNumber,
                  hasAnswer:   !!answerLatex,
                  diagramCount: diagramUrls.length,
                });

                return (
                  <tr key={`ms-row-${index}`} className="align-top">
                    {/* Question label */}
                    <td className="px-4 py-3 text-sm font-medium text-slate-700 align-top whitespace-nowrap">
                      {questionNumber}
                    </td>

                    {/* LaTeX answer */}
                    <td className="px-4 py-3 text-sm text-slate-700 align-top">
                      <div className="whitespace-pre-wrap">
                        <MathPreview latex={answerLatex} />
                      </div>
                    </td>

                    {/* ── Diagram gallery cell ──────────────────────────────── */}
                    <td className="px-4 py-3 align-top">
                      {diagramUrls.length > 0 ? (
                        <DiagramGallery urls={diagramUrls} />
                      ) : (
                        <span className="text-xs text-slate-400 italic">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan="3"
                  className="px-4 py-6 text-center text-slate-500"
                >
                  No marking scheme entries to display. Data received:{" "}
                  {data?.length || 0} rows
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