import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/client';

const C = {
    ink: '#0a0a0f',
    panel: '#111118',
    surface: '#16161f',
    border: '#1e1e2e',
    text: '#e8e8f0',
    subtle: '#a0a0b8',
    muted: '#5a5a7a',
    accent: '#6366f1',
    accentL: '#818cf8',
};

const card = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '20px' };
const input = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: C.text, outline: 'none', fontFamily: 'inherit' };
const btnPrimary = { padding: '8px 18px', borderRadius: '8px', background: C.accent, color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const btnGhost = { padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: C.subtle, border: `1px solid ${C.border}`, fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' };
const btnSuccess = { padding: '8px 24px', borderRadius: '8px', background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const btnPurple = { padding: '8px 16px', borderRadius: '8px', background: 'rgba(168,85,247,0.1)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.3)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' };
const kbd = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '2px 6px', fontFamily: 'monospace', fontSize: '11px', color: C.subtle };

const STATUS_CFG = {
    pending: { label: 'Pending', bg: 'rgba(107,114,128,0.2)', color: '#9ca3af' },
    graded: { label: 'Graded', bg: 'rgba(59,130,246,0.2)', color: '#60a5fa' },
    approved: { label: 'Approved', bg: 'rgba(34,197,94,0.2)', color: '#4ade80' },
    overridden: { label: 'Overridden', bg: 'rgba(168,85,247,0.2)', color: '#c084fc' },
};

function StatusBadge({ status }) {
    const cfg = STATUS_CFG[status] || { label: status, bg: 'rgba(107,114,128,0.2)', color: '#9ca3af' };
    return (
        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: cfg.bg, color: cfg.color }}>
            {cfg.label}
        </span>
    );
}

function OverrideModal({ answer, onClose, onSubmit }) {
    const [points, setPoints] = useState(answer?.ai_score ?? '');
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (points === '' || isNaN(Number(points))) return;
        setLoading(true);
        await onSubmit({ answer_id: answer.id, new_points: Number(points), comment });
        setLoading(false);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(4px)' }}>
            <div style={{ ...card, width: '100%', maxWidth: '420px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: C.text }}>Override Grade</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
                </div>
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '12px', color: C.muted }}>Student: <span style={{ fontFamily: 'monospace', color: C.accentL }}>{answer?.student_id}</span></p>
                    <p style={{ margin: '0 0 4px', fontSize: '12px', color: C.muted }}>Question: <span style={{ fontFamily: 'monospace', color: C.text }}>{answer?.question_id}</span></p>
                    <p style={{ margin: 0, fontSize: '12px', color: C.muted }}>AI Score: <span style={{ fontFamily: 'monospace', color: C.text }}>{answer?.ai_score} / {answer?.max_points}</span></p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>New Points</label>
                        <input style={{ ...input, width: '100%', boxSizing: 'border-box' }} type="number" min={0} max={answer?.max_points}
                            placeholder={`0 – ${answer?.max_points}`} value={points} onChange={e => setPoints(e.target.value)} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Comment</label>
                        <textarea style={{ ...input, width: '100%', boxSizing: 'border-box', height: '80px', resize: 'none' }}
                            placeholder="Reason for override..." value={comment} onChange={e => setComment(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                        <button onClick={onClose} style={{ ...btnGhost, flex: 1 }}>Cancel</button>
                        <button onClick={handleSubmit} disabled={loading || points === ''} style={{ ...btnPrimary, flex: 1, opacity: (loading || points === '') ? 0.5 : 1 }}>
                            {loading ? 'Saving...' : 'Submit Override'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function TADashboard() {
    const storedExamId = localStorage.getItem('gradeops_exam_id') || '';
    const [examId, setExamId] = useState(storedExamId);
    const [inputId, setInputId] = useState(storedExamId);
    const [queue, setQueue] = useState([]);
    const [idx, setIdx] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [overrideTarget, setOverrideTarget] = useState(null);

    const current = queue[idx] || null;

    const loadExam = async (id) => {
        if (!id) return;
        setLoading(true); setError('');
        try {
            const res = await api.get(`/api/results/${id}`);
            const data = Array.isArray(res.data) ? res.data : res.data.results || [];
            setQueue(data.filter(a => a.status === 'graded'));
            setIdx(0); setExamId(id);
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Failed to load results');
        } finally { setLoading(false); }
    };

    useEffect(() => { if (storedExamId) loadExam(storedExamId); }, []);

    const handleApprove = useCallback(async () => {
        if (!current) return;
        try {
            await api.patch(`/api/results/approve/${current.id}`);
            setQueue(prev => prev.map(a => a.id === current.id ? { ...a, status: 'approved' } : a));
            setIdx(i => Math.min(i + 1, queue.length - 1));
        } catch (err) { setError(err.message); }
    }, [current, queue.length]);

    const openOverride = useCallback(() => { if (current) setOverrideTarget(current); }, [current]);
    const handlePrev = useCallback(() => setIdx(i => Math.max(0, i - 1)), []);
    const handleNext = useCallback(() => setIdx(i => Math.min(i + 1, queue.length - 1)), [queue.length]);

    const handleOverrideSubmit = async ({ answer_id, new_points, comment }) => {
        try {
            await api.patch('/api/results/override', { answer_id, new_points, comment });
            setQueue(prev => prev.map(a => a.id === answer_id ? { ...a, status: 'overridden', ai_score: new_points } : a));
            setOverrideTarget(null);
            setIdx(i => Math.min(i + 1, queue.length - 1));
        } catch (err) { setError(err.message); }
    };

    useEffect(() => {
        const onKey = (e) => {
            if (overrideTarget) return;
            if (e.key === 'a' || e.key === 'A') handleApprove();
            if (e.key === 'o' || e.key === 'O') openOverride();
            if (e.key === 'ArrowLeft') handlePrev();
            if (e.key === 'ArrowRight') handleNext();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [current, overrideTarget, handleApprove, openOverride, handlePrev, handleNext]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif" }}>
            {overrideTarget && <OverrideModal answer={overrideTarget} onClose={() => setOverrideTarget(null)} onSubmit={handleOverrideSubmit} />}

            {/* Top strip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 24px', borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
                <input style={{ ...input, width: '200px', fontFamily: 'monospace', fontSize: '12px' }}
                    value={inputId} placeholder="Exam ID"
                    onChange={e => setInputId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && loadExam(inputId)} />
                <button onClick={() => loadExam(inputId)} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }}>
                    {loading ? 'Loading…' : 'Load'}
                </button>
                {queue.length > 0 && (
                    <span style={{ fontSize: '12px', color: C.muted, marginLeft: '8px' }}>
                        <span style={{ color: C.accentL, fontFamily: 'monospace' }}>{idx + 1}</span>
                        <span style={{ color: C.muted }}> / </span>
                        <span style={{ color: C.accentL, fontFamily: 'monospace' }}>{queue.length}</span>
                        <span style={{ color: C.muted }}> in queue</span>
                    </span>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: C.muted }}>
                    <span><span style={kbd}>A</span> approve</span>
                    <span><span style={kbd}>O</span> override</span>
                    <span><span style={kbd}>← →</span> navigate</span>
                </div>
            </div>

            {error && (
                <div style={{ margin: '16px 24px 0', padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: '13px' }}>
                    {error}
                </div>
            )}

            {/* Main area */}
            {current ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* Split pane */}
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' }}>
                        {/* Left — answer image */}
                        <div style={{ borderRight: `1px solid ${C.border}`, overflow: 'auto', padding: '24px', background: C.ink }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                                <div>
                                    <p style={{ margin: '0 0 4px', fontSize: '12px', color: C.muted, fontFamily: 'monospace' }}>
                                        Student: <span style={{ color: C.text }}>{current.student_id}</span>
                                    </p>
                                    <p style={{ margin: 0, fontSize: '12px', color: C.muted, fontFamily: 'monospace' }}>
                                        Question: <span style={{ color: C.accentL }}>{current.question_id}</span>
                                    </p>
                                </div>
                                <StatusBadge status={current.status} />
                            </div>
                            {current.image_url ? (
                                <img src={current.image_url} alt="Answer" style={{ width: '100%', borderRadius: '10px', border: `1px solid ${C.border}` }} />
                            ) : (
                                <div style={{ height: '240px', borderRadius: '10px', border: `2px dashed ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <p style={{ color: C.muted, fontSize: '13px' }}>No image available</p>
                                </div>
                            )}
                        </div>

                        {/* Right — AI grade */}
                        <div style={{ overflow: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', background: C.surface }}>
                            {/* Score */}
                            <div style={card}>
                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px' }}>
                                    <span style={{ fontSize: '28px', fontWeight: 700, color: C.text }}>
                                        {current.ai_score}
                                        <span style={{ fontSize: '18px', fontWeight: 400, color: C.muted }}> / {current.max_points}</span>
                                    </span>
                                    <span style={{ fontSize: '22px', fontWeight: 700, color: C.accentL, fontFamily: 'monospace' }}>
                                        {current.max_points > 0 ? Math.round((current.ai_score / current.max_points) * 100) : 0}%
                                    </span>
                                </div>
                                <div style={{ height: '6px', background: C.border, borderRadius: '99px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', borderRadius: '99px', background: 'linear-gradient(90deg, #6366f1, #818cf8)', transition: 'width 0.5s', width: `${current.max_points > 0 ? (current.ai_score / current.max_points) * 100 : 0}%` }} />
                                </div>
                            </div>

                            {/* Justification */}
                            {current.justification && (
                                <div style={card}>
                                    <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>AI Justification</p>
                                    <p style={{ margin: 0, fontSize: '13px', color: C.subtle, lineHeight: 1.6 }}>{current.justification}</p>
                                </div>
                            )}

                            {/* Criteria */}
                            {current.criteria_scores && Object.keys(current.criteria_scores).length > 0 && (
                                <div style={card}>
                                    <p style={{ margin: '0 0 12px', fontSize: '11px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Criteria Breakdown</p>
                                    {Object.entries(current.criteria_scores).map(([id, score]) => {
                                        const earned = score.earned ?? score;
                                        const max = score.max ?? current.max_points;
                                        const pct = max > 0 ? earned / max : 0;
                                        const icon = pct === 1 ? '✅' : pct >= 0.5 ? '⚠️' : '❌';
                                        return (
                                            <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                                                    <span>{icon}</span>
                                                    <span style={{ fontFamily: 'monospace', color: C.accentL }}>{id}</span>
                                                </span>
                                                <span style={{ fontFamily: 'monospace', fontSize: '12px', color: C.text }}>{earned}/{max}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Action bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 24px', borderTop: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
                        <button onClick={handlePrev} disabled={idx === 0} style={{ ...btnGhost, opacity: idx === 0 ? 0.4 : 1 }}>← Prev</button>
                        <button onClick={handleNext} disabled={idx === queue.length - 1} style={{ ...btnGhost, opacity: idx === queue.length - 1 ? 0.4 : 1 }}>Next →</button>
                        <div style={{ flex: 1 }} />
                        <button onClick={openOverride} style={btnPurple}><span style={{ fontFamily: 'monospace', fontSize: '11px' }}>[O]</span> Override</button>
                        <button onClick={handleApprove} style={btnSuccess}><span style={{ fontFamily: 'monospace', fontSize: '11px' }}>[A]</span> Approve</button>
                    </div>
                </div>
            ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
                            <p style={{ color: C.muted, fontSize: '14px' }}>Loading answers…</p>
                        </div>
                    ) : examId && queue.length === 0 ? (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
                            <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700, color: C.text }}>Queue Complete!</h2>
                            <p style={{ color: C.muted, fontSize: '14px' }}>All answers reviewed for <span style={{ fontFamily: 'monospace', color: C.accentL }}>{examId}</span>.</p>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', maxWidth: '360px' }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
                            <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700, color: C.text }}>Review Queue</h2>
                            <p style={{ color: C.muted, fontSize: '14px', marginBottom: '16px' }}>Enter an Exam ID above to load AI-graded answers for review.</p>
                            <p style={{ color: C.muted, fontSize: '12px' }}>
                                <span style={kbd}>A</span> approve &nbsp; <span style={kbd}>O</span> override &nbsp; <span style={kbd}>← →</span> navigate
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}