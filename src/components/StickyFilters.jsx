import React, { useContext, useEffect } from "react";
import { IngestionContext } from "../context/IngestionContext";
import { BOARDS, CODES } from "../utils/constants";

const StickyFilters = () => {
  const { board, setBoard, code, setCode } =
    useContext(IngestionContext);

  useEffect(() => {
    const savedBoard = localStorage.getItem("board");
    const savedCode = localStorage.getItem("code");

    if (savedBoard) setBoard(savedBoard);
    if (savedCode) setCode(savedCode);
  }, []);

  const handleBoardChange = (e) => {
    setBoard(e.target.value);
    localStorage.setItem("board", e.target.value);
  };

  const handleCodeChange = (e) => {
    setCode(e.target.value);
    localStorage.setItem("code", e.target.value);
  };

  return (
    <div className="flex gap-2">
      <select
        value={board}
        onChange={handleBoardChange}
        className="border p-2 rounded"
      >
        {BOARDS.map((b) => (
          <option key={b}>{b}</option>
        ))}
      </select>

      <select
        value={code}
        onChange={handleCodeChange}
        className="border p-2 rounded"
      >
        {CODES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </div>
  );
};

export default StickyFilters;