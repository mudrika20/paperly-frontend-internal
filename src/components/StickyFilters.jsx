import React, { useContext } from "react";
import { IngestionContext } from "../context/IngestionContext";
import {
  BOARDS,
  CODES,
  TIER_LEVELS,
  PAPER_NUMBERS,
  VARIANTS,
  DOCUMENT_TYPES,
  YEARS,
} from "../utils/constants";

const StickyFilters = () => {
  const {
    board,
    setBoard,
    code,
    setCode,
    tier,
    setTier,
    paper,
    setPaper,
    variant,
    setVariant,
    year,
    setYear,
    documentType,
    setDocumentType,
  } = useContext(IngestionContext);

  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:grid-cols-3 lg:grid-cols-7">
      <select value={board} onChange={(e) => setBoard(e.target.value)} className="rounded-lg border p-2 text-sm outline-none cursor-pointer">
        <option value="">Select Board</option>
        {BOARDS.map((b) => <option key={b} value={b}>{b}</option>)}
      </select>

      <select value={code} onChange={(e) => setCode(e.target.value)} className="rounded-lg border p-2 text-sm outline-none cursor-pointer">
        {CODES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      <select value={tier} onChange={(e) => setTier(e.target.value)} className="rounded-lg border p-2 text-sm outline-none cursor-pointer">
        <option value="">Select Tier</option>
        {TIER_LEVELS.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>

      <select value={paper} onChange={(e) => setPaper(e.target.value)} className="rounded-lg border p-2 text-sm outline-none cursor-pointer">
        {PAPER_NUMBERS.map((p) => <option key={p} value={p}>P{p}</option>)}
      </select>

      <select value={variant} onChange={(e) => setVariant(e.target.value)} className="rounded-lg border p-2 text-sm outline-none cursor-pointer">
        {VARIANTS.map((v) => <option key={v} value={v}>V{v}</option>)}
      </select>

      <select value={year} onChange={(e) => setYear(e.target.value)} className="rounded-lg border p-2 text-sm outline-none cursor-pointer">
        <option value="">Year</option>
        {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>

      <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="rounded-lg border p-2 text-sm outline-none cursor-pointer">
        <option value="">Document Type</option>
        {DOCUMENT_TYPES.map((doc) => <option key={doc} value={doc}>{doc}</option>)}
      </select>
    </div>
  );
};

export default StickyFilters;