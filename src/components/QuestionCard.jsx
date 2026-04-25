import React, { useEffect, useState } from "react";
import MathPreview from "./MathPreview";

const QuestionCard = ({ data, onChange, sourceImageDataUrl = "", pdfBlobUrl = "" }) => {
  const [latex, setLatex] = useState(data.latex || "");
  const [question, setQuestion] = useState(data.question || "");
  const [questionType, setQuestionType] = useState(data.question_type || "SUBJECTIVE");
  const [options, setOptions] = useState(
    Array.isArray(data.options) ? data.options : []
  );
  const [diagramImages, setDiagramImages] = useState(
    Array.isArray(data.diagram_images_base64)
      ? data.diagram_images_base64
      : (data.diagram_image_base64 ? [data.diagram_image_base64] : [])
  );

  useEffect(() => {
    setDiagramImages(
      Array.isArray(data.diagram_images_base64)
        ? data.diagram_images_base64
        : (data.diagram_image_base64 ? [data.diagram_image_base64] : [])
    );
  }, [data.diagram_images_base64, data.diagram_image_base64]);

  useEffect(() => {
    setLatex(data.latex || "");
  }, [data.latex]);

  useEffect(() => {
    setQuestion(data.question || "");
  }, [data.question]);

  useEffect(() => {
    setQuestionType(data.question_type || "SUBJECTIVE");
  }, [data.question_type]);

  useEffect(() => {
    setOptions(Array.isArray(data.options) ? data.options : []);
  }, [data.options]);

  const handleLatexChange = (e) => {
    setLatex(e.target.value);
    onChange({ latex: e.target.value });
  };

  const handleQuestionChange = (e) => {
    setQuestion(e.target.value);
    onChange({ question: e.target.value });
  };

  const handleOptionChange = (index, value) => {
    const nextOptions = [...options];
    nextOptions[index] = value;
    setOptions(nextOptions);
    onChange({ options: nextOptions });
  };

  const normalizedOptions =
    questionType === "MCQ"
      ? [...options, "", "", "", ""].slice(0, 4)
      : options;

  const appendDiagramFromDataUrl = (nextDataUrl) => {
    if (!nextDataUrl) return;
    setDiagramImages((prev) => {
      const next = [...prev, nextDataUrl];
      onChange({ diagram_images_base64: next });
      return next;
    });
  };

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("Failed to read selected image."));
      reader.readAsDataURL(file);
    });

  const handleDiagramFile = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      appendDiagramFromDataUrl(dataUrl);
    } catch (error) {
      console.error("Failed to process diagram image:", error);
    }
  };

  const handlePaste = async (event) => {
    const clipboardFiles = Array.from(event.clipboardData?.files || []);
    const pastedImage = clipboardFiles.find((file) => file.type.startsWith("image/"));
    if (!pastedImage) return;
    event.preventDefault();
    await handleDiagramFile(pastedImage);
  };

  const handleRemoveDiagram = (indexToRemove) => {
    setDiagramImages((prev) => {
      const next = prev.filter((_, index) => index !== indexToRemove);
      onChange({ diagram_images_base64: next });
      return next;
    });
  };

  return (
    <div
      className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      onPaste={handlePaste}
      tabIndex={0}
    >
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => {
            if (pdfBlobUrl) window.open(pdfBlobUrl, "_blank", "noopener,noreferrer");
          }}
          disabled={!pdfBlobUrl}
          className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          📄 View PDF
        </button>
      </div>
      {questionType === "MCQ" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-700">Main Question (LaTeX/Text)</p>
              <textarea
                value={question}
                onChange={handleQuestionChange}
                rows={6}
                className="min-h-28 w-full rounded-lg border p-2 font-mono text-sm"
                placeholder="Edit main question here"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-700">Live Math Preview</p>
              <p className="text-xs text-slate-500">
                💡 Tip: Snip from PDF and press Ctrl+V anywhere on this card to attach diagram.
              </p>
              {diagramImages.map((diagramImage, index) => (
                <div key={`diagram-mcq-${index}`} className="relative">
                  <img
                    src={diagramImage}
                    alt={`Attached diagram preview ${index + 1}`}
                    className="max-h-44 w-full rounded-lg border border-slate-200 object-contain bg-white p-2"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveDiagram(index)}
                    className="absolute right-2 top-2 rounded-full bg-red-600 px-2 py-1 text-xs font-semibold text-white shadow hover:bg-red-700"
                  >
                    X
                  </button>
                </div>
              ))}
              <MathPreview latex={question} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {normalizedOptions.map((optionText, index) => {
              const optionLabel = String.fromCharCode(65 + index);
              return (
                <div
                  key={`option-${optionLabel}`}
                  className="space-y-2 rounded-xl border border-gray-200 p-3"
                >
                  <p className="text-sm font-semibold text-gray-700">Option {optionLabel}</p>
                  <textarea
                    value={optionText}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border p-2 font-mono text-sm"
                    placeholder={`Edit option ${optionLabel}`}
                  />
                  <MathPreview latex={optionText} />
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
              value={question}
              onChange={handleQuestionChange}
              rows={8}
              className="min-h-32 w-full whitespace-pre-wrap rounded-lg border p-2 font-mono text-sm"
              placeholder="Edit full multiline question here"
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">Live Math Preview</p>
            <p className="text-xs text-slate-500">
              💡 Tip: Snip from PDF and press Ctrl+V anywhere on this card to attach diagram.
            </p>
            {diagramImages.map((diagramImage, index) => (
              <div key={`diagram-subjective-${index}`} className="relative">
                <img
                  src={diagramImage}
                  alt={`Attached diagram preview ${index + 1}`}
                  className="max-h-44 w-full rounded-lg border border-slate-200 object-contain bg-white p-2"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveDiagram(index)}
                  className="absolute right-2 top-2 rounded-full bg-red-600 px-2 py-1 text-xs font-semibold text-white shadow hover:bg-red-700"
                >
                  X
                </button>
              </div>
            ))}
            <div className="whitespace-pre-wrap">
              <MathPreview latex={question} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionCard;