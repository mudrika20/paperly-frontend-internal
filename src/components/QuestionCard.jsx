import React, { useState } from "react";
import MathPreview from "./MathPreview";

const QuestionCard = ({ data, onChange }) => {
  const [latex, setLatex] = useState(data.latex || "");
  const [question, setQuestion] = useState(data.question || "");

  const handleLatexChange = (e) => {
    setLatex(e.target.value);
    onChange({ latex: e.target.value });
  };

  const handleQuestionChange = (e) => {
    setQuestion(e.target.value);
    onChange({ question: e.target.value });
  };

  return (
    <div className="bg-white p-4 rounded-xl shadow space-y-3">
      <input
        value={question}
        onChange={handleQuestionChange}
        className="w-full border p-2 rounded"
        placeholder="Question text"
      />

      <MathPreview latex={latex} />

      <textarea
        value={latex}
        onChange={handleLatexChange}
        className="w-full border p-2 rounded"
        placeholder="Edit LaTeX here"
      />
    </div>
  );
};

export default QuestionCard;