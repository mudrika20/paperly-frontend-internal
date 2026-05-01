import React, { useEffect, useState } from "react";
import MathPreview from "./MathPreview";

/**
 * Normalises a raw question object from the backend into a single
 * consistent shape regardless of which schema version was returned.
 *
 * Old schema:  { question, latex, question_type, options, ... }
 * New schema:  { question_latex, question_type, options, ... }
 */
const normaliseQuestion = (data) => {
  if (!data || typeof data !== "object") return { questionLatex: "", questionType: "SUBJECTIVE", options: [], diagramImages: [] };

  // question text — try every known field name, newest first
  const questionLatex =
    data.question_latex ||
    data.latex ||
    data.question ||
    data.text ||
    data.content ||
    "";

  const questionType = data.question_type || data.questionType || "SUBJECTIVE";

  const options = Array.isArray(data.options) ? data.options : [];

  const diagramImages = Array.isArray(data.diagram_images_base64)
    ? data.diagram_images_base64
    : data.diagram_image_base64
    ? [data.diagram_image_base64]
    : [];

  return { questionLatex, questionType, options, diagramImages };
};

const QuestionCard = ({ data, onChange, sourceImageDataUrl = "", pdfBlobUrl = "" }) => {
  const norm = normaliseQuestion(data);

  const [questionLatex, setQuestionLatex] = useState(norm.questionLatex);
  const [questionType, setQuestionType]   = useState(norm.questionType);
  const [options, setOptions]             = useState(norm.options);
  const [diagramImages, setDiagramImages] = useState(norm.diagramImages);

  // Re-sync if the parent swaps the data object entirely (e.g. after redo)
  useEffect(() => {
    const n = normaliseQuestion(data);
    setQuestionLatex(n.questionLatex);
    setQuestionType(n.questionType);
    setOptions(n.options);
    setDiagramImages(n.diagramImages);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleQuestionLatexChange = (e) => {
    setQuestionLatex(e.target.value);
    onChange({ question_latex: e.target.value });
  };

  const handleOptionChange = (index, value) => {
    const next = [...options];
    next[index] = value;
    setOptions(next);
    onChange({ options: next });
  };

  const normalizedOptions =
    questionType === "MCQ" ? [...options, "", "", "", ""].slice(0, 4) : options;

  // ── Diagram helpers ───────────────────────────────────────────────────────

  const appendDiagram = (dataUrl) => {
    if (!dataUrl) return;
    // Update local state with functional callback to get fresh value
    setDiagramImages((prev) => {
      const updated = [...prev, dataUrl];
      // Call onChange immediately with the updated array (not in setTimeout)
      onChange({ diagram_images_base64: updated });
      return updated;
    });
  };

  const removeDiagram = (idx) => {
    // Update local state with functional callback to get fresh value
    setDiagramImages((prev) => {
      const updated = prev.filter((_, i) => i !== idx);
      // Call onChange immediately with the updated array (not in setTimeout)
      onChange({ diagram_images_base64: updated });
      return updated;
    });
  };

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("Failed to read image."));
      reader.readAsDataURL(file);
    });

  const handleDiagramFile = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    try { appendDiagram(await fileToDataUrl(file)); }
    catch (e) { console.error("Diagram error:", e); }
  };

  const handlePaste = async (e) => {
    const img = Array.from(e.clipboardData?.files || []).find((f) => f.type.startsWith("image/"));
    if (!img) return;
    e.preventDefault();
    await handleDiagramFile(img);
  };

  // ── Diagram strip (shared) ────────────────────────────────────────────────

  const DiagramStrip = () => (
    <>
      {diagramImages.map((src, i) => (
        <div key={i} className="relative">
          <img
            src={src}
            alt={`Diagram ${i + 1}`}
            className="max-h-44 w-full rounded-lg border border-slate-200 bg-white object-contain p-2"
          />
          <button
            type="button"
            onClick={() => removeDiagram(i)}
            className="absolute right-2 top-2 rounded-full bg-red-600 px-2 py-1 text-xs font-semibold text-white shadow hover:bg-red-700"
          >
            ✕
          </button>
        </div>
      ))}
    </>
  );

  const tip = (
    <p className="text-xs text-slate-500">
      💡 Snip from PDF and press Ctrl+V anywhere on this card to attach a diagram.
    </p>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      onPaste={handlePaste}
      tabIndex={0}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        {data.isTemplatizable ? (
          <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-0.5 text-sm font-medium text-indigo-800">
            ✨ Templatizable
          </span>
        ) : <span />}

        <button
          type="button"
          onClick={() => pdfBlobUrl && window.open(pdfBlobUrl, "_blank", "noopener,noreferrer")}
          disabled={!pdfBlobUrl}
          className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          📄 View PDF
        </button>
      </div>

      {/* MCQ layout */}
      {questionType === "MCQ" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-700">Main Question (LaTeX / Text)</p>
              <textarea
                value={questionLatex}
                onChange={handleQuestionLatexChange}
                rows={6}
                className="min-h-28 w-full rounded-lg border p-2 font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-700">Live Math Preview</p>
              {tip}
              <DiagramStrip />
              <MathPreview latex={questionLatex} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {normalizedOptions.map((optText, idx) => {
              const label = String.fromCharCode(65 + idx);
              return (
                <div key={label} className="space-y-2 rounded-xl border border-gray-200 p-3">
                  <p className="text-sm font-semibold text-gray-700">Option {label}</p>
                  <textarea
                    value={optText}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border p-2 font-mono text-sm"
                    placeholder={`Option ${label}`}
                  />
                  <MathPreview latex={optText} />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Subjective layout */
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">Edit Question (Subjective)</p>
            <textarea
              value={questionLatex}
              onChange={handleQuestionLatexChange}
              rows={8}
              className="min-h-32 w-full whitespace-pre-wrap rounded-lg border p-2 font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">Live Math Preview</p>
            {tip}
            <DiagramStrip />
            <div className="whitespace-pre-wrap">
              <MathPreview latex={questionLatex} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionCard;
