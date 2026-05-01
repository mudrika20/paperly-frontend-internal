import React from "react";

const SessionTracker = ({ stats }) => {
  const qp = stats?.questionPapers ?? 0;
  const ms = stats?.markingSchemes ?? 0;
  const total = qp + ms;

  return (
    <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 p-4 text-white shadow">
      <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200">
        Database — Total Questions Stored
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-6">
        <div>
          <p className="text-2xl font-bold">{total.toLocaleString()}</p>
          <p className="text-xs text-indigo-200">Total records</p>
        </div>
        <div className="h-8 w-px bg-indigo-400" />
        <div>
          <p className="text-lg font-semibold">{qp.toLocaleString()}</p>
          <p className="text-xs text-indigo-200">Question Papers</p>
        </div>
        <div className="h-8 w-px bg-indigo-400" />
        <div>
          <p className="text-lg font-semibold">{ms.toLocaleString()}</p>
          <p className="text-xs text-indigo-200">Marking Schemes</p>
        </div>
      </div>
    </div>
  );
};

export default SessionTracker;
