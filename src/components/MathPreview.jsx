import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

const LATEX_LIKE_PATTERN = /\\[a-zA-Z]+|[_^{}]/;

const normalizePreviewContent = (value) => {
  const text = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  if (text.startsWith("\\(") && text.endsWith("\\)")) {
    return `$${text.slice(2, -2).trim()}$`;
  }

  if (text.startsWith("\\[") && text.endsWith("\\]")) {
    return `$$${text.slice(2, -2).trim()}$$`;
  }

  const hasDollarDelimiters = /(^|[^\\])\${1,2}/.test(text);
  if (!hasDollarDelimiters && LATEX_LIKE_PATTERN.test(text)) {
    return `$$${text}$$`;
  }

  return text;
};

const MathPreview = ({ latex }) => {
  const previewContent = useMemo(() => normalizePreviewContent(latex), [latex]);

  return (
    <div className="min-h-24 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
      {previewContent ? (
        <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-800">
          <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[
              [
                rehypeKatex,
                {
                  throwOnError: false,
                  strict: "ignore",
                  errorColor: "#6b7280",
                },
              ],
            ]}
          >
            {previewContent}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Live preview appears here.</p>
      )}
    </div>
  );
};

export default MathPreview;