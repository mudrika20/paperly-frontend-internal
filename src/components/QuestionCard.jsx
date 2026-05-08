import React, { useEffect, useState } from "react";
import MathPreview from "./MathPreview";

/**
 * Normalises a raw question object from the backend into a single
 * consistent shape regardless of which schema version was returned.
 */
const normaliseQuestion = (data) => {
  if (!data || typeof data !== "object") return { questionLatex: "", questionType: "SUBJECTIVE", options: [], diagramImages: [], cognitiveDemand: "MEDIUM", difficultyOverride: null };

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

  // New fields
  const cognitiveDemand = data.cognitive_demand || "MEDIUM";
  const difficultyOverride = data.difficulty_override || null;

  return { questionLatex, questionType, options, diagramImages, cognitiveDemand, difficultyOverride };
};

const QuestionCard = ({ data, onChange, sourceImageDataUrl = "", pdfBlobUrl = "" }) => {
  const norm = normaliseQuestion(data);

  const [questionLatex, setQuestionLatex] = useState(norm.questionLatex);
  const [questionType, setQuestionType]   = useState(norm.questionType);
  const [options, setOptions]             = useState(norm.options);
  const [diagramImages, setDiagramImages] = useState(norm.diagramImages);
  const [difficultyOverride, setDifficultyOverride] = useState(norm.difficultyOverride);

  useEffect(() => {
    const n = normaliseQuestion(data);
    setQuestionLatex(n.questionLatex);
    setQuestionType(n.questionType);
    setOptions(n.options);
    setDiagramImages(n.diagramImages);
    setDifficultyOverride(n.difficultyOverride);
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

  const handleDifficultyOverrideChange = (e) => {
    const val = e.target.value === "null" ? null : e.target.value;
    setDifficultyOverride(val);
    onChange({ difficulty_override: val });
  };

  const normalizedOptions =
    questionType === "MCQ" ? [...options, "", "", "", ""].slice(0, 4) : options;

  // ── Diagram helpers ───────────────────────────────────────────────────────
  const appendDiagram = (dataUrl) => {
    if (!dataUrl) return;
    setDiagramImages((prev) => {
      const updated = [...prev, dataUrl];
      onChange({ diagram_images_base64: updated });
      return updated;
    });
  };

  const removeDiagram = (idx) => {
    setDiagramImages((prev) => {
      const updated = prev.filter((_, i) => i !== idx);
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

  // ── UI Helpers ────────────────────────────────────────────────────────────
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

  const badgeColor = 
    norm.cognitiveDemand === "LOW" ? "bg-green-100 text-green-800" : 
    norm.cognitiveDemand === "HIGH" ? "bg-red-100 text-red-800" : 
    "bg-yellow-100 text-yellow-800";

  return (
    <div
      className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      onPaste={handlePaste}
      tabIndex={0}
    >
      {/* Header row with Badges & Override */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {data.isTemplatizable && (
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-800">
              ✨ Templatizable
            </span>
          )}
          
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1">
            <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-bold uppercase tracking-wider ${badgeColor}`}>
              AI: {norm.cognitiveDemand}
            </span>
            <span className="text-gray-300">|</span>
            <select
              value={difficultyOverride || "null"}
              onChange={handleDifficultyOverrideChange}
              className="cursor-pointer appearance-none rounded bg-transparent px-2 py-1 text-xs font-semibold text-gray-700 outline-none hover:bg-gray-200 focus:bg-white focus:ring-2 focus:ring-indigo-500"
            >
              <option value="null">-- No Override --</option>
              <option value="Easy">Force: Easy</option>
              <option value="Medium">Force: Medium</option>
              <option value="Hard">Force: Hard</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={() => pdfBlobUrl && window.open(pdfBlobUrl, "_blank", "noopener,noreferrer")}
          disabled={!pdfBlobUrl}
          className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          📄 View PDF
        </button>
      </div>

      {/* Main Form Fields */}
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