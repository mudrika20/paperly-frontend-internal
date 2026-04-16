import React, { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

const MathPreview = ({ latex }) => {
  const ref = useRef();

  useEffect(() => {
    try {
      katex.render(latex || "", ref.current, {
        throwOnError: false,
      });
    } catch (err) {
      ref.current.innerHTML = "Invalid LaTeX";
    }
  }, [latex]);

  return (
    <div className="bg-gray-50 p-3 rounded border">
      <div ref={ref}></div>
    </div>
  );
};

export default MathPreview;