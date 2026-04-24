import React, { createContext, useEffect, useState } from "react";

export const IngestionContext = createContext();

const getPersistedValue = (key, fallback) => {
  const saved = localStorage.getItem(key);
  return saved ?? fallback;
};

export const IngestionProvider = ({ children }) => {
  const [board, setBoard] = useState(() => getPersistedValue("board", ""));
  const [code, setCode] = useState(() => getPersistedValue("code", "0580"));
  const [tier, setTier] = useState(() => getPersistedValue("tier", ""));
  const [paper, setPaper] = useState(() => getPersistedValue("paper", "2"));
  const [variant, setVariant] = useState(() => getPersistedValue("variant", "1"));
  const [year, setYear] = useState(() => getPersistedValue("year", ""));
  const [documentType, setDocumentType] = useState(() =>
    getPersistedValue("documentType", "")
  );

  useEffect(() => localStorage.setItem("board", board), [board]);
  useEffect(() => localStorage.setItem("code", code), [code]);
  useEffect(() => localStorage.setItem("tier", tier), [tier]);
  useEffect(() => localStorage.setItem("paper", paper), [paper]);
  useEffect(() => localStorage.setItem("variant", variant), [variant]);
  useEffect(() => localStorage.setItem("year", year), [year]);
  useEffect(() => localStorage.setItem("documentType", documentType), [documentType]);

  return (
    <IngestionContext.Provider 
      value={{ 
        board, setBoard, 
        code, setCode, 
        tier, setTier, 
        paper, setPaper, 
        variant, setVariant,
        year, setYear,
        documentType, setDocumentType
      }}
    >
      {children}
    </IngestionContext.Provider>
  );
};