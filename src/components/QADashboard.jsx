/**
 * QADashboard.jsx
 * ===============
 * Real-time data-ingestion quality dashboard for Paperly.
 *
 * Renders the granular QA report produced by qaAgent.js:
 *  - System health score with colour-coded severity
 *  - Unpaired papers
 *  - QP/MS count mismatches with EXACT missing canonical IDs as pill-tags
 *    (orange = missing in MS, blue = missing in QP)
 *  - Papers with suspected missing diagrams + their specific question IDs
 *  - Ghost data: UNKNOWN IDs + orphaned floating questions
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const API_BASE = import.meta.env?.VITE_API_BASE ?? 'http://localhost:5000';
const QA_ENDPOINT = `${API_BASE}/api/v1/internal/qa-dashboard`;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Coloured pill tag used for canonical question IDs. */
const IdPill = ({ id, variant = 'orange' }) => {
    const styles = {
        orange: 'bg-orange-950/50 text-orange-300 border border-orange-700/60',
        blue:   'bg-blue-950/50   text-blue-300   border border-blue-700/60',
        yellow: 'bg-yellow-950/50 text-yellow-300 border border-yellow-700/60',
        red:    'bg-red-950/50    text-red-300     border border-red-700/60',
    };
    return (
        <span className={`inline-block rounded px-2 py-0.5 text-xs font-mono font-semibold ${styles[variant] ?? styles.orange}`}>
            {id}
        </span>
    );
};

/** Section card wrapper. */
const Card = ({ children, className = '' }) => (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-5 ${className}`}>
        {children}
    </div>
);

/** Section heading row. */
const CardHeader = ({ label, count, colorClass }) => (
    <h3 className={`text-lg font-semibold ${colorClass} mb-3 border-b border-gray-800 pb-2 flex items-center justify-between`}>
        <span>{label}</span>
        <span className="text-sm font-bold bg-gray-800 text-gray-300 rounded-full px-2.5 py-0.5">
            {count}
        </span>
    </h3>
);

/** Empty-state message. */
const AllClear = ({ message }) => (
    <p className="text-green-500/70 text-sm">{message}</p>
);

// ---------------------------------------------------------------------------
// Health Score
// ---------------------------------------------------------------------------
const HealthScoreCard = ({ score, penalties }) => {
    const isHealthy = score > 90;
    const borderColor = isHealthy ? 'border-green-500' : score > 70 ? 'border-yellow-500' : 'border-red-500';
    const textColor   = isHealthy ? 'text-green-400'  : score > 70 ? 'text-yellow-400'  : 'text-red-400';
    const bgColor     = isHealthy ? 'bg-green-900/20' : score > 70 ? 'bg-yellow-900/20' : 'bg-red-900/20';

    return (
        <div className={`p-6 rounded-xl mb-8 border-l-4 shadow-lg ${bgColor} ${borderColor}`}>
            <h2 className="text-xl font-semibold text-gray-300">System Health Score</h2>
            <div className="text-5xl font-bold mt-2 flex items-baseline gap-2">
                <span className={textColor}>{score}</span>
                <span className="text-2xl text-gray-500">/ 100</span>
            </div>

            {penalties && Object.keys(penalties).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3">
                    {Object.entries(penalties).map(([key, val]) =>
                        val > 0 ? (
                            <span key={key}
                                className="text-xs bg-gray-800 border border-gray-700 text-gray-400 rounded px-2 py-1">
                                {key.replace('from', '').replace(/([A-Z])/g, ' $1').trim()}: <span className="text-red-400 font-bold">-{val}</span>
                            </span>
                        ) : null
                    )}
                </div>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Unpaired Papers Card
// ---------------------------------------------------------------------------
const UnpairedPapersCard = ({ papers = [] }) => (
    <Card>
        <CardHeader label="⚠️ Unpaired Papers" count={papers.length} colorClass="text-orange-400" />
        {papers.length === 0
            ? <AllClear message="All good! No unpaired papers." />
            : (
                <ul className="space-y-2 text-sm text-gray-400">
                    {papers.map((p, idx) => (
                        <li key={idx} className="flex justify-between items-center bg-gray-800/50 px-3 py-2 rounded">
                            <span className="font-mono text-gray-300 text-xs">{p.key}</span>
                            <span className="uppercase text-xs font-bold text-orange-500 tracking-wide">{p.status}</span>
                        </li>
                    ))}
                </ul>
            )
        }
    </Card>
);

// ---------------------------------------------------------------------------
// QP/MS Mismatch Card  — granular pill rendering
// ---------------------------------------------------------------------------
const MismatchCard = ({ mismatches = [] }) => (
    <Card>
        <CardHeader label="⚠️ QP / MS ID Mismatches" count={mismatches.length} colorClass="text-red-400" />
        {mismatches.length === 0
            ? <AllClear message="Perfect pairing! All IDs match." />
            : (
                <ul className="space-y-4">
                    {mismatches.map((m, idx) => (
                        <li key={idx} className="bg-gray-800/50 rounded-lg p-4 shadow-md">
                            {/* Paper key + delta badge */}
                            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                                <span className="font-mono text-gray-200 font-bold text-sm">{m.paper}</span>
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-950/40 text-red-300 border border-red-800/50">
                                    QP: {m.qp_total} &nbsp;|&nbsp; MS: {m.ms_total}
                                    &nbsp;
                                    {m.delta !== undefined && (
                                        <span className={m.delta > 0 ? 'text-orange-400' : 'text-blue-400'}>
                                            (Δ {m.delta > 0 ? '+' : ''}{m.delta})
                                        </span>
                                    )}
                                </span>
                            </div>

                            {/* IDs missing in MS — these are QP questions with no matching MS entry */}
                            {m.missing_in_ms?.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-orange-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">
                                        Missing in MS — check MS regex / extraction ({m.missing_in_ms.length})
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {m.missing_in_ms.map((id, i) => (
                                            <IdPill key={i} id={id} variant="orange" />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* IDs missing in QP — MS has answers with no corresponding question */}
                            {m.missing_in_qp?.length > 0 && (
                                <div className="mt-3">
                                    <p className="text-blue-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">
                                        Missing in QP — check QP regex / extraction ({m.missing_in_qp.length})
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {m.missing_in_qp.map((id, i) => (
                                            <IdPill key={i} id={id} variant="blue" />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )
        }
    </Card>
);

// ---------------------------------------------------------------------------
// Missing Diagrams Card — shows paper + suspicious canonical IDs as pills
// ---------------------------------------------------------------------------
const MissingDiagramsCard = ({ papersMissingDiagrams = [] }) => (
    <Card>
        <CardHeader
            label="🖼️ Papers With Suspected Missing Diagrams"
            count={papersMissingDiagrams.length}
            colorClass="text-yellow-400"
        />
        {papersMissingDiagrams.length === 0
            ? <AllClear message="All diagrams extracted successfully." />
            : (
                <ul className="space-y-4">
                    {papersMissingDiagrams.map((d, idx) => (
                        <li key={idx} className="bg-gray-800/50 rounded-lg p-4">
                            {/* Paper key */}
                            <p className="font-mono text-gray-200 font-bold text-sm mb-2">{d.key}</p>
                            <p className="text-yellow-500/80 text-xs font-semibold mb-1.5 uppercase tracking-wide">
                                Suspicious question IDs ({d.suspicious_questions?.length ?? 0})
                            </p>
                            {/* Specific canonical IDs whose LaTeX mentions a diagram but diagram_urls is empty */}
                            <div className="flex flex-wrap gap-1.5">
                                {(d.suspicious_questions ?? []).map((qId, i) => (
                                    <IdPill key={i} id={qId} variant="yellow" />
                                ))}
                            </div>
                        </li>
                    ))}
                </ul>
            )
        }
    </Card>
);

// ---------------------------------------------------------------------------
// Ghost Data Card
// ---------------------------------------------------------------------------
const GhostDataCard = ({ unknownIDs = 0, orphanedKeys = [] }) => (
    <Card>
        <CardHeader label="👻 Ghost Data" count={unknownIDs + orphanedKeys.length} colorClass="text-purple-400" />
        <div className="space-y-5">
            {/* UNKNOWN IDs */}
            <div className="flex justify-between items-center">
                <div>
                    <p className="text-gray-300 text-sm font-medium">"UNKNOWN" Canonical IDs</p>
                    <p className="text-gray-500 text-xs mt-0.5">Questions where the ID could not be parsed</p>
                </div>
                <span className={`text-xl font-bold ${unknownIDs > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {unknownIDs}
                </span>
            </div>

            {/* Orphaned keys */}
            <div>
                <div className="flex justify-between items-center mb-2">
                    <div>
                        <p className="text-gray-300 text-sm font-medium">Orphaned Keys</p>
                        <p className="text-gray-500 text-xs mt-0.5">Questions with no matching PaperRegistry entry</p>
                    </div>
                    <span className={`text-xl font-bold ${orphanedKeys.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {orphanedKeys.length}
                    </span>
                </div>
                {orphanedKeys.length > 0 && (
                    <ul className="space-y-1.5">
                        {orphanedKeys.map((o, idx) => (
                            <li key={idx} className="flex justify-between items-center bg-gray-800/50 px-3 py-2 rounded text-xs">
                                <span className="font-mono text-gray-300">{o.key}</span>
                                <IdPill id={`${o.count} Qs`} variant="red" />
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    </Card>
);

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------
const QADashboard = () => {
    const [report,  setReport]  = useState(null);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState(null);

    const fetchReport = useCallback(async (force = false) => {
        setLoading(true);
        setError(null);
        try {
            const url = force ? `${QA_ENDPOINT}?force=true` : QA_ENDPOINT;
            const res = await fetch(url);

            if (!res.ok) {
                throw new Error(`API returned ${res.status} ${res.statusText}`);
            }

            const json = await res.json();

            if (json.success) {
                setReport(json.data);
            } else {
                throw new Error(json.message ?? 'Unknown API error');
            }
        } catch (err) {
            console.error('[QA Dashboard] Fetch failed:', err);
            setError(err.message ?? 'Failed to load QA report');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    // ── Loading / error states ────────────────────────────────────────────────
    if (!report && loading) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-4xl mb-4 animate-pulse">🔍</div>
                    <p className="text-gray-300 font-semibold text-lg">Running Database Integrity Scan…</p>
                    <p className="text-gray-500 text-sm mt-2">This may take a few seconds on first load.</p>
                </div>
            </div>
        );
    }

    if (!report && error) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <div className="text-center max-w-md">
                    <div className="text-4xl mb-4">❌</div>
                    <p className="text-red-400 font-semibold text-lg mb-2">Failed to load QA Report</p>
                    <p className="text-gray-500 text-sm mb-6">{error}</p>
                    <button
                        onClick={() => fetchReport()}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg font-medium transition-all"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (!report) return null;

    // ── Main render ───────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-gray-950 text-gray-200 p-6 md:p-8">
            <div className="max-w-6xl mx-auto">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8">
                    <div>
                        <Link to="/" className="text-gray-400 hover:text-white flex items-center gap-2 mb-4 transition-colors text-sm font-medium">
                            ← Back to Main Dashboard
                        </Link>
                        <h1 className="text-2xl md:text-3xl font-bold text-white">
                            🛡️ Data Ingestion QA Dashboard
                        </h1>
                        <p className="text-xs text-gray-400 mt-1.5">
                            Last scanned: {new Date(report.timestamp).toLocaleString()}
                        </p>
                        {report.error && (
                            <p className="text-xs text-red-400 mt-1">
                                ⚠️ Last audit encountered an error: {report.error}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={() => fetchReport(true)}
                        disabled={loading}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700
                                   text-white px-5 py-2.5 rounded-lg font-medium transition-all
                                   disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                        {loading
                            ? <><span className="animate-spin">⟳</span> Scanning DB…</>
                            : '⚡ Force Deep Scan'
                        }
                    </button>
                </div>

                {/* Health Score */}
                <HealthScoreCard score={report.healthScore ?? 0} penalties={report.healthPenalties ?? {}} />

                {/* Issue Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <UnpairedPapersCard papers={report.unpairedPapers} />
                    <MismatchCard       mismatches={report.mismatchedCounts} />
                    <MissingDiagramsCard papersMissingDiagrams={report.papersMissingDiagrams} />
                    <GhostDataCard      unknownIDs={report.unknownIDs} orphanedKeys={report.orphanedKeys} />
                </div>

                {/* Footer */}
                <p className="text-center text-gray-700 text-xs mt-10">
                    Paperly QA Agent · Audits run daily at midnight · Use "Force Deep Scan" for on-demand analysis
                </p>
            </div>
        </div>
    );
};

export default QADashboard;