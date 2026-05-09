import React, { useEffect, useRef, useState } from "react";
import MathPreview from "./MathPreview";

/**
 * Normalises a raw question object from the backend into a consistent shape.
 * Reads diagram_urls (backend field) as well as legacy diagram_images_base64.
 */
const normaliseQuestion = (data) => {
  if (!data || typeof data !== "object") {
    return {
      questionLatex: "",
      questionType: "SUBJECTIVE",
      options: [],
      aiDiagrams: [],          // ← from backend (diagram_urls)
      cognitiveDemand: "MEDIUM",
      difficultyOverride: null,
    };
  }

  const questionLatex =
    data.question_latex || data.latex || data.question || data.text || data.content || "";

  const questionType   = data.question_type || data.questionType || "SUBJECTIVE";
  const options        = Array.isArray(data.options) ? data.options : [];
  const cognitiveDemand    = data.cognitive_demand || "MEDIUM";
  const difficultyOverride = data.difficulty_override || null;

  // Read from diagram_urls (backend) first, then legacy fields.
  // Filter out the placeholder sentinel "[NEEDS_CROP]".
  const rawUrls =
    Array.isArray(data.diagram_urls)
      ? data.diagram_urls.filter((u) => u && u !== "[NEEDS_CROP]")
      : [];

  const legacyImages = Array.isArray(data.diagram_images_base64)
    ? data.diagram_images_base64
    : data.diagram_image_base64
    ? [data.diagram_image_base64]
    : [];

  // Merge, deduplicate by value (keeps order)
  const seen = new Set();
  const aiDiagrams = [...rawUrls, ...legacyImages].filter((u) => {
    if (!u || seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  return { questionLatex, questionType, options, aiDiagrams, cognitiveDemand, difficultyOverride };
};

// ---------------------------------------------------------------------------

const QuestionCard = ({ data, onChange, sourceImageDataUrl = "", pdfBlobUrl = "" }) => {
  const norm = normaliseQuestion(data);

  const [questionLatex,     setQuestionLatex]     = useState(norm.questionLatex);
  const [questionType,      setQuestionType]       = useState(norm.questionType);
  const [options,           setOptions]            = useState(norm.options);
  const [difficultyOverride, setDifficultyOverride] = useState(norm.difficultyOverride);

  // ── TWO SEPARATE DIAGRAM STATES ──────────────────────────────────────────
  // aiDiagrams   : extracted by Gemini, resets when backend data changes.
  // userDiagrams : pasted by the user manually, NEVER reset by useEffect.
  const [aiDiagrams,   setAiDiagrams]   = useState(norm.aiDiagrams);
  const [userDiagrams, setUserDiagrams] = useState([]);

  // Sync from backend when data prop changes — only AI diagrams reset.
  // User-pasted diagrams survive every parent re-render.
  useEffect(() => {
    const n = normaliseQuestion(data);
    setQuestionLatex(n.questionLatex);
    setQuestionType(n.questionType);
    setOptions(n.options);
    setDifficultyOverride(n.difficultyOverride);
    setAiDiagrams(n.aiDiagrams);
    // ← userDiagrams intentionally NOT touched here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // ── Notify parent with merged diagram list ────────────────────────────────
  const notifyDiagramChange = (nextAi, nextUser) => {
    onChange({ diagram_urls: [...nextAi, ...nextUser] });
  };

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

  // ── Diagram helpers ───────────────────────────────────────────────────────

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("Failed to read image."));
      reader.readAsDataURL(file);
    });

  // Appends a user-pasted/uploaded diagram WITHOUT touching aiDiagrams.
  const appendUserDiagram = (dataUrl) => {
    if (!dataUrl) return;
    setUserDiagrams((prev) => {
      const next = [...prev, dataUrl];
      notifyDiagramChange(aiDiagrams, next);
      return next;
    });
  };

  // Remove an AI diagram by its index within aiDiagrams.
  const removeAiDiagram = (idx) => {
    setAiDiagrams((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      notifyDiagramChange(next, userDiagrams);
      return next;
    });
  };

  // Remove a user diagram by its index within userDiagrams.
  const removeUserDiagram = (idx) => {
    setUserDiagrams((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      notifyDiagramChange(aiDiagrams, next);
      return next;
    });
  };

  const handleDiagramFile = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      appendUserDiagram(await fileToDataUrl(file));
    } catch (e) {
      console.error("Diagram read error:", e);
    }
  };

  /**
   * Robust paste handler — accepts images from:
   *  • clipboardData.files  (drag-and-drop style, some tools)
   *  • clipboardData.items  (Snipping Tool, macOS screenshot, most browsers)
   * Never blocks non-image paste (text editing still works normally).
   */
  const handlePaste = async (e) => {
    const files = Array.from(e.clipboardData?.files || []);
    const imgFile = files.find((f) => f.type.startsWith("image/"));

    if (imgFile) {
      e.preventDefault();
      await handleDiagramFile(imgFile);
      return;
    }

    // Fallback: read from items (covers Snipping Tool, macOS CMD+CTRL+SHIFT+4, etc.)
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find((item) => item.kind === "file" && item.type.startsWith("image/"));

    if (imgItem) {
      e.preventDefault();
      const file = imgItem.getAsFile();
      if (file) await handleDiagramFile(file);
    }
    // If no image in clipboard → do nothing, let text paste proceed normally.
  };

  // ── UI ────────────────────────────────────────────────────────────────────

  const normalizedOptions =
    questionType === "MCQ" ? [...options, "", "", "", ""].slice(0, 4) : options;

  const badgeColor =
    norm.cognitiveDemand === "LOW"  ? "bg-green-100 text-green-800"  :
    norm.cognitiveDemand === "HIGH" ? "bg-red-100 text-red-800"      :
                                      "bg-yellow-100 text-yellow-800";

  /**
   * DiagramStrip — renders AI diagrams and user diagrams separately
   * so each has its own correct remove handler. User diagrams get a
   * distinct border so it's visually clear they were manually added.
   */
  const DiagramStrip = () => (
    <div className="space-y-2">
      {/* AI-extracted diagrams */}
      {aiDiagrams.map((src, i) => (
        <div key={`ai-${i}`} className="relative">
          <img
            src={src}
            alt={`AI Diagram ${i + 1}`}
            className="max-h-44 w-full rounded-lg border border-slate-200 bg-white object-contain p-2"
          />
          <button
            type="button"
            onClick={() => removeAiDiagram(i)}
            className="absolute right-2 top-2 rounded-full bg-red-600 px-2 py-1 text-xs font-semibold text-white shadow hover:bg-red-700"
            title="Remove AI diagram"
          >
            ✕
          </button>
        </div>
      ))}

      {/* User-pasted diagrams — blue border to distinguish */}
      {userDiagrams.map((src, i) => (
        <div key={`user-${i}`} className="relative">
          <img
            src={src}
            alt={`Pasted Diagram ${i + 1}`}
            className="max-h-44 w-full rounded-lg border-2 border-indigo-400 bg-white object-contain p-2"
          />
          {/* Label so reviewer knows this was manually pasted */}
          <span className="absolute left-2 top-2 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            Pasted
          </span>
          <button
            type="button"
            onClick={() => removeUserDiagram(i)}
            className="absolute right-2 top-2 rounded-full bg-red-600 px-2 py-1 text-xs font-semibold text-white shadow hover:bg-red-700"
            title="Remove pasted diagram"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );

  const tip = (
    <p className="text-xs text-slate-500">
      💡 Snip from PDF and press Ctrl+V anywhere on this card to attach a diagram.
    </p>
  );

  return (
    <div
      className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      onPaste={handlePaste}
      tabIndex={0}
    >
      {/* Header: Badges & Override */}
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

      {/* Main content */}
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