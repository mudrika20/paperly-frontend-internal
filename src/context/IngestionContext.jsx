import React, { createContext, useState } from "react";

export const IngestionContext = createContext();

export const IngestionProvider = ({ children }) => {
  const [board, setBoard] = useState("IGCSE");
  const [code, setCode] = useState("0580");

  return (
    <IngestionContext.Provider
      value={{ board, setBoard, code, setCode }}
    >
      {children}
    </IngestionContext.Provider>
  );
};