import React from 'react';
import { useState, useEffect } from 'react';
import api from '../api/client';

const LEVEL_CONFIG = {
    high: { label: 'HIGH', classes: 'bg-red-500/20 text-red-400 border border-red-500/30', dot: 'bg-red-500' },
    medium: { label: 'MED', classes: 'bg-amber-500/20 text-amber-400 border border-amber-500/30', dot: 'bg-amber-500' },
    low: { label: 'LOW', classes: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30', dot: 'bg-yellow-500' },
};

function getLevel(score) {
    if (score >= 0.8) return 'high';
    if (score >= 0.5) return 'medium';
    return 'low';
}

export default function PlagiarismPage() {
    const storedExamId = localStorage.getItem('gradeops_exam_id') || '';
    const [examId, setExamId] = useState(storedExamId);
    const [inputId, setInputId] = useState(storedExamId);
    const [flags, setFlags] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [filterLevel, setFilterLevel] = useState('all');

    const fetchFlags = async (id) => {
        if (!id) return;
        setLoading(true);
        setError('');
        try {
            const res = await api.get(`/api/plagiarism/${id}`);
            setFlags(res.data.flags || res.data || []);
            setExamId(id);
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Failed to fetch plagiarism data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (storedExamId) fetchFlags(storedExamId);
    }, []);

    const filtered = filterLevel === 'all'
        ? flags
        : flags.filter((f) => getLevel(f.similarity_score) === filterLevel);

    const counts = { high: 0, medium: 0, low: 0 };
    flags.forEach((f) => { counts[getLevel(f.similarity_score)]++; });

    return (
        <div className="p-8 max-w-6xl mx-auto animate-fade-in">
            <div className="mb-8">
                <p className="text-muted text-xs font-mono mb-1">STEP 04</p>
                <h1 className="font-display font-bold text-2xl text-text">Plagiarism Report</h1>
                <p className="text-subtle text-sm mt-1">Review similarity flags between student responses.</p>
            </div>

            {/* Exam ID input */}
            <div className="card mb-6 flex items-end gap-3">
                <div className="flex-1">
                    <label className="label">Exam ID</label>
                    <input className="input font-mono" value={inputId} placeholder="exam_abc123"
                        onChange={(e) => setInputId(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchFlags(inputId)} />
                </div>
                <button onClick={() => fetchFlags(inputId)} disabled={loading} className="btn-primary whitespace-nowrap">
                    {loading ? 'Loading...' : 'Load Report'}
                </button>
            </div>

            {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
            )}

            {flags.length > 0 && (
                <>
                    {/* Summary cards */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        {Object.entries(counts).map(([level, count]) => {
                            const cfg = LEVEL_CONFIG[level];
                            return (
                                <button key={level} onClick={() => setFilterLevel(filterLevel === level ? 'all' : level)}
                                    className={`card text-left transition-all ${filterLevel === level ? 'border-accent' : 'hover:border-accent/40'}`}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                                        <span className={`badge ${cfg.classes}`}>{cfg.label}</span>
                                    </div>
                                    <div className="font-display font-bold text-2xl text-text">{count}</div>
                                    <div className="text-muted text-xs capitalize">{level} similarity flag{count !== 1 ? 's' : ''}</div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Filter bar */}
                    <div className="flex items-center gap-2 mb-4">
                        {['all', 'high', 'medium', 'low'].map((l) => (
                            <button key={l} onClick={() => setFilterLevel(l)}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterLevel === l ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-text border border-border'
                                    }`}>
                                {l === 'all' ? `All (${flags.length})` : l.charAt(0).toUpperCase() + l.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Flags table */}
                    <div className="card overflow-hidden p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border">
                                        <th className="px-4 py-3 text-left label">Student A</th>
                                        <th className="px-4 py-3 text-left label">Student B</th>
                                        <th className="px-4 py-3 text-left label">Question</th>
                                        <th className="px-4 py-3 text-left label">Similarity</th>
                                        <th className="px-4 py-3 text-left label">Level</th>
                                        <th className="px-4 py-3 text-left label">Snippets</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((flag, i) => {
                                        const level = getLevel(flag.similarity_score);
                                        const cfg = LEVEL_CONFIG[level];
                                        const score = flag.similarity_score;
                                        return (
                                            <tr key={i} className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                                                <td className="px-4 py-3 font-mono text-text text-xs">{flag.student_a}</td>
                                                <td className="px-4 py-3 font-mono text-text text-xs">{flag.student_b}</td>
                                                <td className="px-4 py-3 font-mono text-accent-light text-xs">{flag.question_id || flag.question}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                                                            <div className={`h-full rounded-full ${level === 'high' ? 'bg-red-500' : level === 'medium' ? 'bg-amber-500' : 'bg-yellow-500'}`}
                                                                style={{ width: `${score * 100}%` }} />
                                                        </div>
                                                        <span className="font-mono text-xs text-text">{(score * 100).toFixed(0)}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`badge ${cfg.classes} text-xs`}>{cfg.label}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {flag.snippet_a && flag.snippet_b ? (
                                                        <details className="cursor-pointer">
                                                            <summary className="text-xs text-accent-light hover:text-accent cursor-pointer">View snippets</summary>
                                                            <div className="mt-2 grid grid-cols-2 gap-2">
                                                                <div className="bg-surface rounded p-2">
                                                                    <p className="text-xs text-muted mb-1 font-mono">{flag.student_a}:</p>
                                                                    <p className="text-xs text-text italic">{flag.snippet_a}</p>
                                                                </div>
                                                                <div className="bg-surface rounded p-2">
                                                                    <p className="text-xs text-muted mb-1 font-mono">{flag.student_b}:</p>
                                                                    <p className="text-xs text-text italic">{flag.snippet_b}</p>
                                                                </div>
                                                            </div>
                                                        </details>
                                                    ) : (
                                                        <span className="text-muted text-xs">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {!loading && flags.length === 0 && examId && (
                <div className="card text-center py-12">
                    <div className="text-4xl mb-3">✅</div>
                    <p className="text-text font-medium">No plagiarism flags found</p>
                    <p className="text-muted text-sm mt-1">All answers appear to be original.</p>
                </div>
            )}
        </div>
    );
}