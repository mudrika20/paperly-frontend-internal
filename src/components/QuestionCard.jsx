import React, { useEffect, useRef, useState } from "react";
import MathPreview from "./MathPreview";

  const parseDiagrams = (raw) => {
    if (!raw) return [];
    let arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (typeof raw === 'string') {
      try { const parsed = JSON.parse(raw); arr = Array.isArray(parsed) ? parsed : [parsed]; } catch (e) { arr = [raw]; }
    } else if (typeof raw === 'object') arr = [raw];
    
    return [...new Set(arr.flat(Infinity).map(u => {
      if (typeof u === 'string') return u;
      if (u && typeof u === 'object') return u.secure_url || u.url || u.diagramUrl || '';
      return '';
    }).filter(u => typeof u === 'string' && u.trim() !== '' && u !== '[NEEDS_CROP]'))];
  };

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

const canonicalIdToDisplayLabel = (canonicalId = "") => {
  const parts = String(canonicalId || "")
    .trim()
    .toLowerCase()
    .split(".")
    .filter(Boolean);
  if (!parts.length) return "";
  const [root, ...rest] = parts;
  return `${root}${rest.map((part) => `(${part})`).join("")}`;
};

const replaceLeadingQuestionLabel = (text = "", canonicalId = "") => {
  const label = canonicalIdToDisplayLabel(canonicalId);
  if (!label) return text;
  const source = String(text || "").trimStart();
  const leadingLabelPattern = /^\d+\s*(?:\([a-z]+\)|\([ivxlcdm]+\))*/i;
  if (leadingLabelPattern.test(source)) {
    return source.replace(leadingLabelPattern, label);
  }
  return `${label} ${source}`.trim();
};

const QuestionCard = ({ data, onChange, sourceImageDataUrl = "", pdfBlobUrl = "" }) => {
  const norm = normaliseQuestion(data);

  const [questionLatex,     setQuestionLatex]     = useState(norm.questionLatex);
  const [questionType,      setQuestionType]       = useState(norm.questionType);
  const [options,           setOptions]            = useState(norm.options);
  const [difficultyOverride, setDifficultyOverride] = useState(norm.difficultyOverride);
  const [canonicalId, setCanonicalId] = useState(data?.canonical_question_id || "");

  const pastedSetRef = useRef(new Set());

  // Single Source of Truth: Derive from props, flatten deeply, and deduplicate
  const legacyImages = Array.isArray(data.diagram_images_base64) ? data.diagram_images_base64 : (data.diagram_image_base64 ? [data.diagram_image_base64] : []);
  const currentDiagrams = [...new Set([...parseDiagrams(data.diagram_urls), ...legacyImages])];

  const appendUserDiagram = (dataUrl) => {
    if (!dataUrl) return;
    pastedSetRef.current.add(dataUrl);
    onChange({ diagram_urls: [...currentDiagrams, dataUrl] });
  };

  const removeDiagram = (idx) => {
    const next = currentDiagrams.filter((_, i) => i !== idx);
    onChange({ diagram_urls: next });
  };

  // Sync from backend when data prop changes — only AI diagrams reset.
  // User-pasted diagrams survive every parent re-render.
  useEffect(() => {
    const n = normaliseQuestion(data);
    setQuestionLatex(n.questionLatex);
    setQuestionType(n.questionType);
    setOptions(n.options);
    setDifficultyOverride(n.difficultyOverride);
    setCanonicalId(data?.canonical_question_id || "");
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

  const handleCanonicalIdChange = (e) => {
    const value = e.target.value.trim().toLowerCase();
    const parent = value.split(".")[0] || "";
    const nextQuestionLatex = replaceLeadingQuestionLabel(questionLatex, value);
    setCanonicalId(value);
    setQuestionLatex(nextQuestionLatex);
    onChange({
      canonical_question_id: value,
      parent_canonical_id: parent,
      question_id: canonicalIdToDisplayLabel(value),
      question_latex: nextQuestionLatex,
      needs_review: true,
      validation_warnings: [
        ...new Set([
          ...(Array.isArray(data.validation_warnings) ? data.validation_warnings : []),
          "Canonical ID manually edited during human review.",
        ]),
      ],
    });
  };

  // ── Diagram helpers ───────────────────────────────────────────────────────

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("Failed to read image."));
      reader.readAsDataURL(file);
    });


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
      e.preventDefault(); e.stopPropagation();
      await handleDiagramFile(imgFile);
      return;
    }

    // Fallback: read from items (covers Snipping Tool, macOS CMD+CTRL+SHIFT+4, etc.)
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find((item) => item.kind === "file" && item.type.startsWith("image/"));

    if (imgItem) {
      e.preventDefault(); e.stopPropagation();
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

  const DiagramStrip = () => (
    <div className="space-y-2">
      {currentDiagrams.map((src, i) => {
        const isPasted = pastedSetRef.current.has(src);
        return (
          <div key={`diag-${i}`} className="relative group">
            <img
              src={src}
              alt={`Diagram ${i + 1}`}
              className={`max-h-44 w-full rounded-lg object-contain p-2 ${
                isPasted ? "border-2 border-indigo-400 bg-white" : "border border-slate-200 bg-white"
              }`}
            />
            {isPasted && (
              <span className="absolute left-2 top-2 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                Pasted
              </span>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeDiagram(i); }}
              className="absolute right-2 top-2 rounded-full bg-red-600 px-2 py-1 text-xs font-semibold text-white shadow opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
              title="Remove diagram"
            >
              ✕
            </button>
          </div>
        );
      })}
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

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Canonical ID
        </label>
        <input
          value={canonicalId}
          onChange={handleCanonicalIdChange}
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          placeholder="Example: 7.c.ii"
        />
        <p className="mt-1 text-xs text-slate-500">
          Edit only when QA says the saved question number is wrong. Use dot format, for example 7.c.ii.
        </p>
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
