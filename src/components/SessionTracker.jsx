import React from "react";

const SessionTracker = ({ stats }) => {
  return (
    <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-600 to-violet-600 p-4 text-white shadow">
      <p className="text-sm uppercase tracking-wide text-indigo-100">Session Uploads</p>
      <p className="mt-2 text-sm sm:text-base">
        Question Papers: <span className="font-semibold">{stats.questionPapers}</span> |{" "}
        Marking Schemes: <span className="font-semibold">{stats.markingSchemes}</span>
      </p>
    </div>
  );
};

export default SessionTracker;
