import React, { useEffect, useState } from "react";

// Canonical fields we always display, in this order.
const FIELDS = [
  { key: "curriculum",   label: "Curriculum" },
  { key: "subjectCode",  label: "Subject Code" },
  { key: "tier",         label: "Tier" },
  { key: "paperNumber",  label: "Paper Number" },
  { key: "session",      label: "Session" },
  { key: "year",         label: "Year" },
  { key: "program",      label: "Program" },
];

const sessionCodeFromValue = (value = "") => {
  const s = String(value || "").trim().toLowerCase();
  if (["m", "s", "w"].includes(s)) return s;
  if (/(feb|february|mar|march)/i.test(s)) return "m";
  if (/(may|jun|june|jul|july|summer)/i.test(s)) return "s";
  if (/(oct|october|nov|november|winter)/i.test(s)) return "w";
  return "";
};

const MetadataVerificationCard = ({
  extractedMeta,
  extractedQuestions,
  onApprove,
  onRedo,
  loading,
  saving,
}) => {
  const [localMeta, setLocalMeta] = useState({});

  // Sync whenever parent passes fresh data
  useEffect(() => {
    setLocalMeta(extractedMeta && typeof extractedMeta === "object" ? { ...extractedMeta } : {});
  }, [extractedMeta]);

  if (!extractedQuestions || extractedQuestions.length === 0) return null;

  const handleChange = (key, value) => {
    setLocalMeta((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "session" ? { session_code: sessionCodeFromValue(value) || prev.session_code } : {}),
    }));
  };

  const busy = loading || saving;

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-blue-900">✅ Review &amp; Edit Metadata</h2>
        <p className="mt-1 text-sm text-blue-700">
          AI extracted{" "}
          <span className="font-semibold text-blue-900">{extractedQuestions.length} questions</span>.
          Values below were read directly from the paper — edit any that look wrong, then approve.
        </p>
      </div>

      {/* Plain text inputs — one per metadata field */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {FIELDS.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-1">
            <label
              htmlFor={`meta-${key}`}
              className="text-xs font-semibold uppercase tracking-wide text-blue-800"
            >
              {label}
            </label>
            <input
              id={`meta-${key}`}
              type="text"
              value={localMeta[key] ?? ""}
              onChange={(e) => handleChange(key, e.target.value)}
              disabled={busy}
              className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm shadow-sm
                         focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500
                         disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap justify-end gap-3 border-t border-blue-200 pt-4">
        <button
          onClick={onRedo}
          disabled={busy}
          className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700
                     hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          🔄 Redo AI Extraction
        </button>
        <button
          onClick={() => onApprove(localMeta)}
          disabled={busy || extractedQuestions.length === 0}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow
                     hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Approve &amp; Review Questions →
        </button>
      </div>
    </div>
  );
};

export default MetadataVerificationCard;
