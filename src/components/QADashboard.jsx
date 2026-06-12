/**
 * QADashboard.jsx
 * ===============
 * Evidence-only ingestion QA dashboard.
 *
 * This view intentionally avoids speculative warnings. It renders only issues
 * proven by saved database state: pair mismatches, duplicate canonical IDs,
 * unknown IDs, invalid saved diagram URLs, orphaned keys, metadata conflicts,
 * empty text rows, and unresolved human-review rows.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchQADashboardReport, runQARepairAction } from '../services/apiHandler';

const IdPill = ({ id, variant = 'orange' }) => {
    const styles = {
        orange: 'bg-orange-950/50 text-orange-300 border border-orange-700/60',
        blue: 'bg-blue-950/50 text-blue-300 border border-blue-700/60',
        yellow: 'bg-yellow-950/50 text-yellow-300 border border-yellow-700/60',
        red: 'bg-red-950/50 text-red-300 border border-red-700/60',
        green: 'bg-green-950/50 text-green-300 border border-green-700/60',
        purple: 'bg-purple-950/50 text-purple-300 border border-purple-700/60',
    };

    return (
        <span className={`inline-block rounded px-2 py-0.5 text-xs font-mono font-semibold ${styles[variant] ?? styles.orange}`}>
            {id}
        </span>
    );
};

const Card = ({ children, className = '' }) => (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-5 ${className}`}>
        {children}
    </div>
);

const CardHeader = ({ label, count, colorClass }) => (
    <h3 className={`text-lg font-semibold ${colorClass} mb-3 border-b border-gray-800 pb-2 flex items-center justify-between gap-3`}>
        <span>{label}</span>
        <span className="text-sm font-bold bg-gray-800 text-gray-300 rounded-full px-2.5 py-0.5">
            {count ?? 0}
        </span>
    </h3>
);

const AllClear = ({ message }) => (
    <p className="text-green-500/75 text-sm">{message}</p>
);

const SectionNote = ({ children }) => (
    <p className="text-xs text-gray-500 mb-3 leading-relaxed">{children}</p>
);

const groupIdsByRoot = (ids = []) => {
    const groups = new Map();
    ids.forEach((id) => {
        const root = String(id || '').split('.')[0] || 'unknown';
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(id);
    });
    return [...groups.entries()].map(([root, values]) => ({ root, values }));
};

const InspectionGuide = ({ mismatch }) => {
    const qpOnlyGroups = groupIdsByRoot(mismatch.missing_in_ms ?? []);
    const msOnlyGroups = groupIdsByRoot(mismatch.missing_in_qp ?? []);
    const firstRoots = [...new Set([...qpOnlyGroups, ...msOnlyGroups].map(group => group.root))]
        .filter(root => root !== 'unknown')
        .slice(0, 4);
    const rootsLabel = firstRoots.length ? firstRoots.map(root => `Q${root}`).join(', ') : 'the IDs listed below';

    return (
        <div className="bg-gray-950/60 border border-gray-700 rounded-lg p-3 mb-3 text-xs text-gray-400 leading-relaxed">
            <p className="text-gray-200 font-semibold mb-1">What this means and where to look</p>
            <p>
                The QP and MS belong to the same paper, but some saved question numbers do not match exactly.
                Start with {rootsLabel} in both PDFs, then compare that full question block side-by-side.
            </p>
            <p className="mt-2">
                If the same printed question exists on both sides but one saved ID is wrong, fix
                <span className="font-mono text-gray-300"> canonical_question_id </span>
                and
                <span className="font-mono text-gray-300"> parent_canonical_id</span>.
                If many nearby rows are shifted, do not approve it; redo extraction for that paper.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 mt-3">
                <div className="bg-gray-900/70 border border-orange-900/50 rounded p-2">
                    <p className="text-orange-300 font-semibold">Orange QP-only IDs</p>
                    <p>Look in the QP first. The MS may have the same question saved as a child ID, parent ID, or wrong number.</p>
                </div>
                <div className="bg-gray-900/70 border border-blue-900/50 rounded p-2">
                    <p className="text-blue-300 font-semibold">Blue MS-only IDs</p>
                    <p>Look in the MS first. The QP may have grouped that subpart inside a larger parent question.</p>
                </div>
            </div>
        </div>
    );
};

const targetFromItem = (item) => ({
    collection: item.collection,
    document_id: item.document_id,
    key: item.key,
    canonical_question_id: item.canonical_question_id,
});

const RepairButton = ({ label, action, payload, onRepair, variant = 'yellow' }) => {
    const styles = {
        yellow: 'border-yellow-700/60 text-yellow-300 hover:bg-yellow-950/40',
        red: 'border-red-700/60 text-red-300 hover:bg-red-950/40',
        green: 'border-green-700/60 text-green-300 hover:bg-green-950/40',
        blue: 'border-blue-700/60 text-blue-300 hover:bg-blue-950/40',
    };

    return (
        <button
            type="button"
            onClick={() => onRepair(action, payload)}
            className={`text-xs border rounded px-2.5 py-1 transition-colors ${styles[variant] ?? styles.yellow}`}
        >
            {label}
        </button>
    );
};

const HealthScoreCard = ({ score = 0, penalties = {}, summary = {} }) => {
    const isHealthy = score > 90;
    const isWarning = score > 70;
    const borderColor = isHealthy ? 'border-green-500' : isWarning ? 'border-yellow-500' : 'border-red-500';
    const textColor = isHealthy ? 'text-green-400' : isWarning ? 'text-yellow-400' : 'text-red-400';
    const bgColor = isHealthy ? 'bg-green-900/20' : isWarning ? 'bg-yellow-900/20' : 'bg-red-900/20';

    const labels = {
        fromUnpairedPapers: 'Unpaired papers',
        fromMissingIDs: 'QP/MS ID mismatches',
        fromDuplicateIDs: 'Duplicate canonical IDs',
        fromUnknownIDs: 'Unknown IDs',
        fromOrphanedKeys: 'Orphaned keys',
        fromInvalidDiagramUrls: 'Invalid saved diagram URLs',
        fromMetadataConflicts: 'Metadata conflicts',
        fromRegistryReferenceConflicts: 'Registry pointer conflicts',
        fromNeedsReview: 'Needs-review rows',
    };

    return (
        <div className={`p-6 rounded-xl mb-8 border-l-4 shadow-lg ${bgColor} ${borderColor}`}>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-gray-300">Database QA Health</h2>
                    <div className="text-5xl font-bold mt-2 flex items-baseline gap-2">
                        <span className={textColor}>{score}</span>
                        <span className="text-2xl text-gray-500">/ 100</span>
                    </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-400">
                    <span className="bg-gray-950/50 border border-gray-800 rounded px-2 py-1">Pairs: {summary.pairedPapers ?? 0}</span>
                    <span className="bg-gray-950/50 border border-gray-800 rounded px-2 py-1">Mismatches: {summary.mismatchedPairs ?? 0}</span>
                    <span className="bg-gray-950/50 border border-gray-800 rounded px-2 py-1">Duplicates: {summary.duplicateCanonicalGroups ?? 0}</span>
                    <span className="bg-gray-950/50 border border-gray-800 rounded px-2 py-1">Review: {summary.needsReviewCount ?? 0}</span>
                </div>
            </div>

            {Object.values(penalties).some(Boolean) && (
                <div className="mt-4 flex flex-wrap gap-3">
                    {Object.entries(penalties).map(([key, val]) => (
                        val > 0 ? (
                            <span
                                key={key}
                                className="text-xs bg-gray-800 border border-gray-700 text-gray-400 rounded px-2 py-1"
                            >
                                {labels[key] ?? key}: <span className="text-red-400 font-bold">-{val}</span>
                            </span>
                        ) : null
                    ))}
                </div>
            )}
        </div>
    );
};

const FixPriorityCard = ({ plan = {} }) => {
    const actions = plan.actions ?? [];
    const severityStyles = {
        CRITICAL: 'bg-red-950/50 text-red-300 border-red-800/70',
        HIGH: 'bg-orange-950/50 text-orange-300 border-orange-800/70',
        MEDIUM: 'bg-yellow-950/50 text-yellow-300 border-yellow-800/70',
        LOW: 'bg-blue-950/50 text-blue-300 border-blue-800/70',
    };

    return (
        <Card className="mb-8">
            <CardHeader label="Fix Priority" count={actions.length} colorClass="text-green-400" />
            {actions.length === 0 ? (
                <AllClear message="No remediation needed. Current saved DB state is clean." />
            ) : (
                <div className="space-y-4">
                    <div className="bg-gray-950/50 border border-gray-800 rounded-lg p-4">
                        <p className="text-sm text-gray-300 font-semibold">
                            Status: <span className={plan.status === 'blocked' ? 'text-red-400' : 'text-yellow-400'}>{plan.status}</span>
                        </p>
                        {plan.topPriority && (
                            <p className="text-xs text-gray-500 mt-1">
                                First fix: {plan.topPriority.title}
                            </p>
                        )}
                    </div>

                    <ul className="space-y-3">
                        {actions.map((item, idx) => (
                            <li key={`${item.type}-${idx}`} className="bg-gray-800/50 rounded-lg p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <p className="text-sm font-semibold text-gray-200">{item.title}</p>
                                    <span className={`text-xs font-bold border rounded px-2 py-0.5 ${severityStyles[item.severity] ?? severityStyles.MEDIUM}`}>
                                        {item.severity} | {item.count}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mb-2">{item.impact}</p>
                                <p className="text-xs text-gray-300 leading-relaxed">{item.action}</p>
                                {item.samples?.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-3">
                                        {item.samples.map(sample => (
                                            <IdPill key={sample} id={sample} variant={item.severity === 'CRITICAL' ? 'red' : 'yellow'} />
                                        ))}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Card>
    );
};

const RepairResultCard = ({ result, error, applying, onApply, onDismiss }) => {
    if (!result && !error && !applying) return null;

    return (
        <Card className="mb-8 border-blue-900/70">
            <CardHeader label="QA Repair Simulation" count={result?.matched ?? 0} colorClass="text-blue-400" />
            {applying && <p className="text-sm text-gray-400">Running QA repair action...</p>}
            {error && <p className="text-sm text-red-400">{error}</p>}
            {result && (
                <div className="space-y-4">
                    <div className="bg-gray-950/50 border border-gray-800 rounded-lg p-4">
                        <p className="text-sm text-gray-300">
                            Action: <span className="font-mono text-blue-300">{result.action}</span>
                            <span className="mx-2 text-gray-600">|</span>
                            Mode: <span className={result.dryRun ? 'text-yellow-300' : 'text-green-300'}>
                                {result.dryRun ? 'dry run, no DB write' : 'applied to DB'}
                            </span>
                        </p>
                    </div>

                    {result.preview?.length > 0 && (
                        <ul className="space-y-2">
                            {result.preview.slice(0, 10).map((item) => (
                                <li key={`${item.collection}-${item.document_id}`} className="bg-gray-800/50 rounded px-3 py-2 text-xs text-gray-400">
                                    <div className="flex flex-wrap gap-2 items-center">
                                        <IdPill id={item.collection} variant="purple" />
                                        <IdPill id={item.key} variant="blue" />
                                        <IdPill id={item.canonical_question_id} variant="yellow" />
                                        <span className="text-gray-500">{item.validation_status}</span>
                                    </div>
                                    <p className="text-gray-500 mt-1 truncate">{item.question_latex_preview}</p>
                                </li>
                            ))}
                        </ul>
                    )}

                    {result.registry && (
                        <div className="bg-gray-800/50 rounded px-3 py-2 text-xs text-gray-400">
                            <p className="font-mono text-gray-300">{result.registry.key}</p>
                            <p className="mt-1">
                                {result.registry.before.status} -&gt; {result.registry.after.status}
                            </p>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {result.dryRun && (
                            <button
                                type="button"
                                onClick={onApply}
                                className="text-xs border border-green-700/60 text-green-300 hover:bg-green-950/40 rounded px-3 py-1.5 transition-colors"
                            >
                                Apply This Repair
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onDismiss}
                            className="text-xs border border-gray-700 text-gray-300 hover:bg-gray-800 rounded px-3 py-1.5 transition-colors"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}
        </Card>
    );
};

const HierarchyCoverageCard = ({ items = [], count = 0 }) => (
    <Card>
        <CardHeader label="Grouped Parent / Split Subpart Checks" count={count} colorClass="text-green-400" />
        {count === 0 ? (
            <AllClear message="No parent/child QP-MS granularity differences found." />
        ) : (
            <>
                <SectionNote>
                    Low risk. This usually means the data is present, but one side saved a parent question and the other side saved child subparts.
                    Open the parent row and confirm it contains every child part shown here.
                </SectionNote>
                <ul className="space-y-3">
                    {items.slice(0, 10).map((item, idx) => (
                        <li key={`${item.paper}-${idx}`} className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-400">
                            <p className="font-mono text-gray-300 mb-2">{item.paper}</p>
                            {item.covered_by_qp_parent?.map((entry) => (
                                <div key={`qp-${entry.qp_parent}`} className="mb-2">
                                    <span className="text-green-300">QP parent row should contain these MS child rows:</span>
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                        <IdPill id={entry.qp_parent} variant="green" />
                                        {entry.ms_children.map(id => <IdPill key={id} id={id} variant="blue" />)}
                                    </div>
                                </div>
                            ))}
                            {item.covered_by_ms_children?.map((entry) => (
                                <div key={`ms-${entry.qp_id}`} className="mb-2">
                                    <span className="text-green-300">MS child rows should belong under this QP parent row:</span>
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                        <IdPill id={entry.qp_id} variant="orange" />
                                        {entry.ms_children.map(id => <IdPill key={id} id={id} variant="blue" />)}
                                    </div>
                                </div>
                            ))}
                        </li>
                    ))}
                </ul>
            </>
        )}
    </Card>
);

const UnpairedPapersCard = ({ papers = [] }) => (
    <Card>
        <CardHeader label="Unpaired Papers" count={papers.length} colorClass="text-orange-400" />
        {papers.length === 0 ? (
            <AllClear message="No unpaired PaperRegistry rows found." />
        ) : (
            <ul className="space-y-2 text-sm text-gray-400">
                {papers.map((p, idx) => (
                    <li key={`${p.key}-${idx}`} className="flex justify-between items-center bg-gray-800/50 px-3 py-2 rounded gap-3">
                        <span className="font-mono text-gray-300 text-xs truncate">{p.key}</span>
                        <span className="uppercase text-xs font-bold text-orange-500 tracking-wide">{p.status}</span>
                    </li>
                ))}
            </ul>
        )}
    </Card>
);

const MismatchCard = ({ mismatches = [] }) => {
    const totalIssues = mismatches.reduce((acc, item) => (
        acc
        + (item.missing_in_ms?.length ?? 0)
        + (item.missing_in_qp?.length ?? 0)
        + (item.duplicate_qp_ids?.length ?? 0)
        + (item.duplicate_ms_ids?.length ?? 0)
    ), 0);

    return (
        <Card>
            <CardHeader label="QP/MS Canonical Alignment" count={mismatches.length} colorClass="text-red-400" />
            {mismatches.length === 0 ? (
                <AllClear message="Saved QP and MS canonical ID sets match for paired papers." />
            ) : (
                <>
                    <SectionNote>
                        Exact saved-ID comparison only. This section does not guess from diagrams or keywords.
                        Treat it as a numbering/alignment checklist, not a content-quality judgement.
                    </SectionNote>
                    {totalIssues > 0 && (
                        <p className="text-xs text-gray-500 mb-3">{totalIssues} proven canonical issue(s) across {mismatches.length} paper(s).</p>
                    )}
                    <ul className="space-y-4">
                        {mismatches.map((m, idx) => (
                            <li key={`${m.paper}-${idx}`} className="bg-gray-800/50 rounded-lg p-4 shadow-md">
                                <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                                    <span className="font-mono text-gray-200 font-bold text-sm">{m.paper}</span>
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-950/40 text-red-300 border border-red-800/50">
                                        QP: {m.qp_total} | MS: {m.ms_total}
                                        {m.delta !== undefined && (
                                            <span className={`ml-1.5 ${m.delta > 0 ? 'text-orange-400' : 'text-blue-400'}`}>
                                                delta {m.delta > 0 ? '+' : ''}{m.delta}
                                            </span>
                                        )}
                                    </span>
                                </div>

                                <InspectionGuide mismatch={m} />

                                {m.missing_in_ms?.length > 0 && (
                                    <div className="mt-2">
                                        <p className="text-orange-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">
                                            QP-only saved IDs: present in QP, not exact in MS ({m.missing_in_ms.length})
                                        </p>
                                        <p className="text-xs text-gray-500 mb-2">
                                            Where to look: open these question numbers in the QP PDF first, then find the matching printed question in the MS.
                                            If the MS row exists but uses a different saved ID, the MS ID needs repair.
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {m.missing_in_ms.map(id => <IdPill key={id} id={id} variant="orange" />)}
                                        </div>
                                    </div>
                                )}

                                {m.missing_in_qp?.length > 0 && (
                                    <div className="mt-3">
                                        <p className="text-blue-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">
                                            MS-only saved IDs: present in MS, not exact in QP ({m.missing_in_qp.length})
                                        </p>
                                        <p className="text-xs text-gray-500 mb-2">
                                            Where to look: open these rows in the MS first, then check whether the QP has the same subpart grouped inside a parent question or saved under another ID.
                                            If yes, it is probably a hierarchy/granularity issue; if no, the QP extraction missed or misnumbered it.
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {m.missing_in_qp.map(id => <IdPill key={id} id={id} variant="blue" />)}
                                        </div>
                                    </div>
                                )}

                                {m.duplicate_qp_ids?.length > 0 && (
                                    <div className="mt-3">
                                        <p className="text-red-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">
                                            Duplicate QP canonical IDs ({m.duplicate_qp_ids.length})
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {m.duplicate_qp_ids.map(entry => (
                                                <IdPill key={`qp-${entry.canonical_question_id}`} id={`${entry.canonical_question_id} x${entry.count}`} variant="red" />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {m.duplicate_ms_ids?.length > 0 && (
                                    <div className="mt-3">
                                        <p className="text-red-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">
                                            Duplicate MS canonical IDs ({m.duplicate_ms_ids.length})
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {m.duplicate_ms_ids.map(entry => (
                                                <IdPill key={`ms-${entry.canonical_question_id}`} id={`${entry.canonical_question_id} x${entry.count}`} variant="red" />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </Card>
    );
};

const DuplicateCanonicalCard = ({ items = [] }) => (
    <Card>
        <CardHeader label="Duplicate Canonical IDs" count={items.length} colorClass="text-red-400" />
        {items.length === 0 ? (
            <AllClear message="No duplicate canonical IDs found inside saved collections." />
        ) : (
            <ul className="space-y-2">
                {items.slice(0, 25).map((item, idx) => (
                    <li key={idx} className="bg-gray-800/50 rounded px-3 py-2 text-xs text-gray-400">
                        <div className="flex flex-wrap gap-2 items-center">
                            <span className="font-mono text-gray-300">{item.key}</span>
                            <IdPill id={item.collection} variant="purple" />
                            <IdPill id={`${item.canonical_question_id} x${item.count}`} variant="red" />
                        </div>
                    </li>
                ))}
            </ul>
        )}
    </Card>
);

const SavedPayloadIssuesCard = ({
    invalidDiagramUrls = [],
    invalidDiagramUrlCount = 0,
    emptyTextItems = [],
    emptyTextCount = 0,
    metadataConflicts = [],
    metadataConflictCount = 0,
    registryReferenceConflicts = [],
    registryReferenceConflictCount = 0,
    onRepair,
}) => {
    const count = invalidDiagramUrlCount + emptyTextCount + metadataConflictCount + registryReferenceConflictCount;

    return (
        <Card>
            <CardHeader label="Saved Payload Integrity" count={count} colorClass="text-yellow-400" />
            {count === 0 ? (
                <AllClear message="No invalid diagram URLs, empty text rows, metadata conflicts, or registry pointer conflicts found." />
            ) : (
                <div className="space-y-4">
                    {registryReferenceConflicts.length > 0 && (
                        <div>
                            <p className="text-red-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">
                                Registry pointer conflicts ({registryReferenceConflictCount})
                            </p>
                            <ul className="space-y-1.5">
                                {registryReferenceConflicts.slice(0, 10).map((item, idx) => (
                                    <li key={idx} className="bg-gray-800/50 rounded px-3 py-2 text-xs text-gray-400">
                                        <div className="flex flex-wrap gap-2 items-center justify-between">
                                            <div>
                                                <span className="font-mono text-gray-300">{item.key}</span>
                                                <span className="mx-2 text-gray-600">/</span>
                                                <span>{item.field}</span>
                                                <span className="mx-2 text-gray-600">/</span>
                                                <span>{item.issue}</span>
                                            </div>
                                            {onRepair && (
                                                <RepairButton
                                                    label="Simulate Pointer Repair"
                                                    action="rebuild_registry_pointers"
                                                    payload={{ key: item.key, reason: item.issue }}
                                                    onRepair={onRepair}
                                                    variant="blue"
                                                />
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {invalidDiagramUrls.length > 0 && (
                        <div>
                            <p className="text-yellow-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">
                                Invalid saved diagram URLs ({invalidDiagramUrlCount})
                            </p>
                            <ul className="space-y-1.5">
                                {invalidDiagramUrls.slice(0, 10).map((item, idx) => (
                                    <li key={idx} className="bg-gray-800/50 rounded px-3 py-2 text-xs text-gray-400">
                                        <div className="flex flex-wrap gap-2 items-center justify-between">
                                            <div>
                                                <span className="font-mono text-gray-300">{item.key}</span>
                                                <span className="mx-2 text-gray-600">/</span>
                                                <span>{item.collection}</span>
                                                <span className="mx-2 text-gray-600">/</span>
                                                <span>{item.canonical_question_id}</span>
                                            </div>
                                            {onRepair && (
                                                <RepairButton
                                                    label="Simulate Quarantine"
                                                    action="quarantine_rows"
                                                    payload={{
                                                        targets: [targetFromItem(item)],
                                                        reason: 'Invalid saved diagram URL',
                                                    }}
                                                    onRepair={onRepair}
                                                    variant="red"
                                                />
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {emptyTextItems.length > 0 && (
                        <div>
                            <p className="text-red-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">
                                Empty question_latex rows ({emptyTextCount})
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {emptyTextItems.slice(0, 20).map((item, idx) => (
                                    <span key={idx} className="inline-flex items-center gap-1.5">
                                        <IdPill id={`${item.key}:${item.canonical_question_id}`} variant="red" />
                                        {onRepair && (
                                            <RepairButton
                                                label="Quarantine"
                                                action="quarantine_rows"
                                                payload={{
                                                    targets: [targetFromItem(item)],
                                                    reason: 'Empty question_latex row',
                                                }}
                                                onRepair={onRepair}
                                                variant="red"
                                            />
                                        )}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {metadataConflicts.length > 0 && (
                        <div>
                            <p className="text-yellow-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">
                                Metadata conflicts ({metadataConflictCount})
                            </p>
                            <ul className="space-y-1.5">
                                {metadataConflicts.slice(0, 10).map((item, idx) => (
                                    <li key={idx} className="bg-gray-800/50 rounded px-3 py-2 text-xs text-gray-400">
                                        <span className="font-mono text-gray-300">{item.key ?? item.document_id ?? 'unknown'}</span>
                                        <span className="mx-2 text-gray-600">/</span>
                                        <span>{item.collection}</span>
                                        <span className="mx-2 text-gray-600">/</span>
                                        <span>{item.issue}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
};

const GhostDataCard = ({ unknownIDs = 0, unknownIdSamples = [], orphanedKeys = [] }) => (
    <Card>
        <CardHeader label="Unknown IDs and Orphaned Keys" count={unknownIDs + orphanedKeys.length} colorClass="text-purple-400" />
        <div className="space-y-5">
            <div className="flex justify-between items-center">
                <div>
                    <p className="text-gray-300 text-sm font-medium">Unknown canonical IDs</p>
                    <p className="text-gray-500 text-xs mt-0.5">Rows saved without a usable canonical_question_id.</p>
                </div>
                <span className={`text-xl font-bold ${unknownIDs > 0 ? 'text-red-400' : 'text-green-400'}`}>{unknownIDs}</span>
            </div>

            {unknownIdSamples.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {unknownIdSamples.slice(0, 10).map((item, idx) => (
                        <IdPill key={idx} id={`${item.collection}:${item.key}`} variant="red" />
                    ))}
                </div>
            )}

            <div>
                <div className="flex justify-between items-center mb-2">
                    <div>
                        <p className="text-gray-300 text-sm font-medium">Orphaned document keys</p>
                        <p className="text-gray-500 text-xs mt-0.5">Saved rows whose key has no matching PaperRegistry row.</p>
                    </div>
                    <span className={`text-xl font-bold ${orphanedKeys.length > 0 ? 'text-red-400' : 'text-green-400'}`}>{orphanedKeys.length}</span>
                </div>
                {orphanedKeys.length > 0 && (
                    <ul className="space-y-1.5">
                        {orphanedKeys.slice(0, 20).map((o, idx) => (
                            <li key={idx} className="flex justify-between items-center bg-gray-800/50 px-3 py-2 rounded text-xs gap-3">
                                <span className="font-mono text-gray-300 truncate">{o.key}</span>
                                <span className="text-gray-500">{o.collection}</span>
                                <IdPill id={`${o.count} rows`} variant="red" />
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    </Card>
);

const NeedsReviewCard = ({ count = 0, items = [], onRepair }) => (
    <Card>
        <CardHeader label="Human Review Queue" count={count} colorClass="text-blue-400" />
        {count === 0 ? (
            <AllClear message="No saved rows are currently marked needs_review." />
        ) : (
            <>
                <SectionNote>
                    These are not automatic extraction failures. They are rows the pipeline explicitly marked for human verification.
                </SectionNote>
                <ul className="space-y-2">
                    {items.slice(0, 20).map((item, idx) => (
                        <li key={idx} className="bg-gray-800/50 rounded px-3 py-2 text-xs text-gray-400">
                            <div className="flex flex-wrap gap-2 items-center justify-between">
                                <div className="flex flex-wrap gap-2 items-center">
                                    <span className="font-mono text-gray-300">{item.key}</span>
                                    <IdPill id={item.collection} variant="blue" />
                                    <IdPill id={item.canonical_question_id} variant="yellow" />
                                </div>
                                {onRepair && (
                                    <RepairButton
                                        label="Mark Human Approved"
                                        action="clear_review_rows"
                                        payload={{
                                            targets: [targetFromItem(item)],
                                            reason: 'Verified against PDF by human reviewer',
                                        }}
                                        onRepair={onRepair}
                                        variant="green"
                                    />
                                )}
                            </div>
                            {item.warnings?.length > 0 && (
                                <p className="text-gray-500 mt-1 truncate">{item.warnings.join(' | ')}</p>
                            )}
                        </li>
                    ))}
                </ul>
            </>
        )}
    </Card>
);

const SimpleDecisionCard = ({ report = {} }) => {
    const actions = report.remediationPlan?.actions ?? [];
    const criticalActions = actions.filter(item => item.severity === 'CRITICAL' || item.severity === 'HIGH');
    const reviewActions = actions.filter(item => item.severity === 'MEDIUM');
    const lowActions = actions.filter(item => item.severity === 'LOW');
    const isBlocked = criticalActions.length > 0 || report.remediationPlan?.status === 'blocked';
    const isReview = !isBlocked && reviewActions.length > 0;
    const title = isBlocked ? 'Do Not Approve Yet' : isReview ? 'Human Review Needed' : 'Looks Clean';
    const tone = isBlocked
        ? 'border-red-800/70 bg-red-950/25 text-red-200'
        : isReview
            ? 'border-yellow-800/70 bg-yellow-950/25 text-yellow-200'
            : 'border-green-800/70 bg-green-950/25 text-green-200';
    const nextStep = isBlocked
        ? 'Fix the first blocking item in the action queue before trusting this data.'
        : isReview
            ? 'Open the listed rows, compare with the PDF, then mark approved only after checking.'
            : 'No blocking DB issue found. Continue normal visual review before final use.';

    const statItems = [
        ['Paired papers', report.summary?.pairedPapers ?? 0],
        ['Number mismatches', report.summary?.mismatchedPairs ?? 0],
        ['Duplicate IDs', report.summary?.duplicateCanonicalGroups ?? 0],
        ['Review rows', report.summary?.needsReviewCount ?? 0],
    ];

    const severityStyles = {
        CRITICAL: 'border-red-800/70 bg-red-950/35 text-red-200',
        HIGH: 'border-orange-800/70 bg-orange-950/35 text-orange-200',
        MEDIUM: 'border-yellow-800/70 bg-yellow-950/35 text-yellow-200',
        LOW: 'border-green-800/70 bg-green-950/35 text-green-200',
    };

    const actionCta = {
        manual_pairing_required: 'Open Manual Pairing and connect the matching QP/MS for each key.',
        duplicate_canonical_ids: 'Open the duplicate rows, keep the correct one, then rename, merge, or delete the duplicate.',
        qp_ms_alignment_mismatch: 'Open the first listed root question in both QP and MS. Split/rename if grouped; redo if many rows shifted.',
        hierarchy_granularity_difference: 'Open the parent row. If it contains all listed child text, this is low risk after visual check.',
        unknown_canonical_ids: 'Open sampled rows and enter the visible PDF question number in Canonical ID.',
        empty_text_rows: 'Reject or re-extract affected rows; empty saved text is not production-safe.',
        invalid_diagram_urls: 'Re-crop, paste, or remove invalid diagram payloads.',
        metadata_conflicts: 'Fix the metadata fields or re-save with verified metadata.',
        registry_reference_conflicts: 'Use pointer repair from detailed evidence, then run QA scan again.',
        orphaned_keys: 'Attach the rows to PaperRegistry or remove stale rejected-upload rows.',
        human_review_pending: 'Open sampled rows, compare with PDF, then clear review only after checking.',
    };

    return (
        <Card className={`mb-8 border ${tone}`}>
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
                <div className="max-w-2xl">
                    <p className="text-xs uppercase tracking-wide font-bold opacity-75">Today&apos;s QA Decision</p>
                    <h2 className="text-2xl font-bold mt-1">{title}</h2>
                    <p className="text-sm mt-2 text-gray-300">{nextStep}</p>
                    <p className="text-xs text-gray-500 mt-3">
                        Simple flow: fix top action, run scan again, then approve only when this card is clean.
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-2 min-w-full lg:min-w-[360px]">
                    {statItems.map(([label, value]) => (
                        <div key={label} className="bg-gray-950/60 border border-gray-800 rounded-lg px-3 py-2">
                            <p className="text-xs text-gray-500">{label}</p>
                            <p className="text-xl font-bold text-gray-100">{value}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3 mt-5 text-sm">
                <div className="bg-gray-950/50 border border-red-900/50 rounded-lg p-3">
                    <p className="font-semibold text-red-300">{criticalActions.length} blocking</p>
                    <p className="text-xs text-gray-500 mt-1">Must be fixed before production use.</p>
                </div>
                <div className="bg-gray-950/50 border border-yellow-900/50 rounded-lg p-3">
                    <p className="font-semibold text-yellow-300">{reviewActions.length} needs review</p>
                    <p className="text-xs text-gray-500 mt-1">May be correct after PDF check.</p>
                </div>
                <div className="bg-gray-950/50 border border-green-900/50 rounded-lg p-3">
                    <p className="font-semibold text-green-300">{lowActions.length} low-risk grouping</p>
                    <p className="text-xs text-gray-500 mt-1">Usually parent/child grouping.</p>
                </div>
            </div>

            <div className="mt-5">
                <p className="text-sm font-semibold text-gray-100 mb-2">Action Queue</p>
                {actions.length === 0 ? (
                    <div className="bg-gray-950/60 border border-green-900/50 rounded-lg px-3 py-3">
                        <p className="text-sm text-green-300 font-semibold">No QA action required.</p>
                        <p className="text-xs text-gray-500 mt-1">Do final visual review, then continue normal workflow.</p>
                    </div>
                ) : (
                    <ul className="space-y-2">
                        {actions.slice(0, 6).map((item, idx) => (
                            <li key={`${item.type}-${idx}`} className={`rounded-lg border px-3 py-3 ${severityStyles[item.severity] ?? severityStyles.MEDIUM}`}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-semibold">{idx + 1}. {item.title}</p>
                                    <span className="text-xs font-bold">{item.severity} | {item.count}</span>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">{item.impact}</p>
                                <p className="text-xs text-gray-200 mt-2">
                                    <span className="font-semibold">Do this:</span> {actionCta[item.type] ?? item.action}
                                </p>
                                {item.samples?.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-3">
                                        {item.samples.slice(0, 5).map(sample => (
                                            <IdPill key={sample} id={sample} variant={item.severity === 'CRITICAL' ? 'red' : 'yellow'} />
                                        ))}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </Card>
    );
};

const SituationGuideCard = () => {
    const situations = [
        {
            title: 'QP/MS Number Mismatch',
            risk: 'Blocking',
            meaning: 'The paper is paired, but one side has question IDs the other side does not have.',
            action: 'Open the listed root question in both PDFs. If one row is grouped, split/rename it. If many nearby rows are shifted, redo extraction.',
        },
        {
            title: 'Duplicate Canonical ID',
            risk: 'Blocking',
            meaning: 'Two saved rows use the same canonical_question_id, so joins and saves can point to the wrong row.',
            action: 'Keep the correct row, then rename, merge, or delete the duplicate before approving.',
        },
        {
            title: 'Grouped Parent / Split Child',
            risk: 'Low',
            meaning: 'One side saved a parent row like 7, while the other side saved children like 7.a and 7.b.',
            action: 'No redo needed if the parent row contains all child text. Mark approved after visual PDF check.',
        },
        {
            title: 'Needs Review Row',
            risk: 'Medium',
            meaning: 'The extractor repaired or flagged a row. It may still be correct.',
            action: 'Open the row, compare number/text/diagram with the PDF, then clear review only after checking.',
        },
        {
            title: 'Registry / Orphan Issue',
            risk: 'High',
            meaning: 'Rows exist but the PaperRegistry pointer or key is missing/wrong.',
            action: 'Use pointer repair when offered, or manually pair the correct QP/MS documents with the same unified_paper_key.',
        },
    ];

    const riskClass = {
        Blocking: 'bg-red-950/40 text-red-300 border-red-800/60',
        High: 'bg-orange-950/40 text-orange-300 border-orange-800/60',
        Medium: 'bg-yellow-950/40 text-yellow-300 border-yellow-800/60',
        Low: 'bg-green-950/40 text-green-300 border-green-800/60',
    };

    return (
        <Card className="mb-8">
            <CardHeader label="What To Do By Situation" count={situations.length} colorClass="text-blue-400" />
            <div className="grid gap-3 md:grid-cols-2">
                {situations.map((item) => (
                    <div key={item.title} className="bg-gray-950/50 border border-gray-800 rounded-lg p-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-gray-100">{item.title}</p>
                            <span className={`text-[11px] font-bold border rounded px-2 py-0.5 ${riskClass[item.risk] ?? riskClass.Medium}`}>
                                {item.risk}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">{item.meaning}</p>
                        <p className="text-xs text-gray-300 mt-2">
                            <span className="font-semibold text-gray-100">Recommended action:</span> {item.action}
                        </p>
                    </div>
                ))}
            </div>
        </Card>
    );
};

const QADashboard = () => {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [repairResult, setRepairResult] = useState(null);
    const [repairPayload, setRepairPayload] = useState(null);
    const [repairError, setRepairError] = useState(null);
    const [repairApplying, setRepairApplying] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [showDetails, setShowDetails] = useState(false);

    const fetchReport = useCallback(async (force = false) => {
        setLoading(true);
        setError(null);
        try {
            const json = await fetchQADashboardReport(force);
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
        fetchReport(true);
    }, [fetchReport]);

    const handleRepair = useCallback(async (action, payload = {}) => {
        const nextPayload = { ...payload, action, dryRun: true };
        setRepairApplying(true);
        setRepairError(null);
        setRepairResult(null);
        setRepairPayload(nextPayload);
        try {
            const json = await runQARepairAction(nextPayload);
            setRepairResult(json.data.result);
        } catch (err) {
            setRepairError(err.message ?? 'QA repair simulation failed');
        } finally {
            setRepairApplying(false);
        }
    }, []);

    const applyLastRepair = useCallback(async () => {
        if (!repairPayload) return;
        setRepairApplying(true);
        setRepairError(null);
        try {
            const json = await runQARepairAction({ ...repairPayload, dryRun: false });
            setRepairResult(json.data.result);
            if (json.data.report) setReport(json.data.report);
        } catch (err) {
            setRepairError(err.message ?? 'QA repair apply failed');
        } finally {
            setRepairApplying(false);
        }
    }, [repairPayload]);

    if (!report && loading) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-gray-300 font-semibold text-lg">Running database integrity scan...</p>
                    <p className="text-gray-500 text-sm mt-2">The first scan can take a few seconds.</p>
                </div>
            </div>
        );
    }

    if (!report && error) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <div className="text-center max-w-md">
                    <p className="text-red-400 font-semibold text-lg mb-2">Failed to load QA report</p>
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

    return (
        <div className="min-h-screen bg-gray-950 text-gray-200 p-6 md:p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8">
                    <div>
                        <Link to="/" className="text-gray-400 hover:text-white flex items-center gap-2 mb-4 transition-colors text-sm font-medium">
                            Back to Main Dashboard
                        </Link>
                        <h1 className="text-2xl md:text-3xl font-bold text-white">
                            Data Ingestion QA Dashboard
                        </h1>
                        <p className="text-xs text-gray-400 mt-1.5">
                            Last scanned: {new Date(report.timestamp).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                            Evidence-only audit. Speculative diagram-keyword warnings are intentionally excluded.
                        </p>
                        {report.database && (
                            <p className="text-xs text-gray-400 mt-1 font-mono">
                                DB: {report.database.source} | {report.database.host} | {report.database.databaseName}
                            </p>
                        )}
                        {report.error && (
                            <p className="text-xs text-red-400 mt-1">
                                Last audit error: {report.error}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={() => fetchReport(true)}
                        disabled={loading}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                        {loading ? 'Scanning DB...' : 'Force Deep Scan'}
                    </button>
                </div>

                <SimpleDecisionCard report={report} />

                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div>
                        <p className="text-sm font-semibold text-gray-200">Need help deciding what to do?</p>
                        <p className="text-xs text-gray-500">Open this only when a QA term is unclear.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowGuide(value => !value)}
                        className="bg-gray-800 hover:bg-gray-700 text-gray-100 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                        {showGuide ? 'Hide Help Guide' : 'Show Help Guide'}
                    </button>
                </div>

                {showGuide && <SituationGuideCard />}

                <RepairResultCard
                    result={repairResult}
                    error={repairError}
                    applying={repairApplying}
                    onApply={applyLastRepair}
                    onDismiss={() => {
                        setRepairResult(null);
                        setRepairError(null);
                        setRepairPayload(null);
                    }}
                />

                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div>
                        <p className="text-sm font-semibold text-gray-200">Detailed evidence</p>
                        <p className="text-xs text-gray-500">Use this only when you need exact IDs, duplicate rows, or repair buttons.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowDetails(value => !value)}
                        className="bg-gray-800 hover:bg-gray-700 text-gray-100 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                        {showDetails ? 'Hide Detailed Evidence' : 'Show Detailed Evidence'}
                    </button>
                </div>

                {showDetails && (
                    <>
                        <HealthScoreCard
                            score={report.healthScore ?? 0}
                            penalties={report.healthPenalties ?? {}}
                            summary={report.summary ?? {}}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <UnpairedPapersCard papers={report.unpairedPapers ?? []} />
                            <MismatchCard mismatches={report.mismatchedCounts ?? []} />
                            <HierarchyCoverageCard
                                items={report.hierarchyCoveredMismatches ?? []}
                                count={report.hierarchyCoveredMismatchCount ?? 0}
                            />
                            <DuplicateCanonicalCard items={report.duplicateCanonicalIds ?? []} />
                            <SavedPayloadIssuesCard
                                invalidDiagramUrls={report.invalidDiagramUrls ?? []}
                                invalidDiagramUrlCount={report.invalidDiagramUrlCount ?? report.invalidDiagramUrls?.length ?? 0}
                                emptyTextItems={report.emptyTextItems ?? []}
                                emptyTextCount={report.emptyTextCount ?? report.emptyTextItems?.length ?? 0}
                                metadataConflicts={report.metadataConflicts ?? []}
                                metadataConflictCount={report.metadataConflictCount ?? report.metadataConflicts?.length ?? 0}
                                registryReferenceConflicts={report.registryReferenceConflicts ?? []}
                                registryReferenceConflictCount={report.registryReferenceConflictCount ?? report.registryReferenceConflicts?.length ?? 0}
                                onRepair={handleRepair}
                            />
                            <GhostDataCard
                                unknownIDs={report.unknownIDs ?? 0}
                                unknownIdSamples={report.unknownIdSamples ?? []}
                                orphanedKeys={report.orphanedKeys ?? []}
                            />
                            <NeedsReviewCard
                                count={report.needsReviewCount ?? 0}
                                items={report.needsReviewItems ?? []}
                                onRepair={handleRepair}
                            />
                        </div>
                    </>
                )}

                <p className="text-center text-gray-700 text-xs mt-10">
                    Paperly QA Agent v4 | evidence-only DB audit | dry-run repair controls | daily midnight scan plus manual force scan
                </p>
            </div>
        </div>
    );
};

export default QADashboard;
