import React from 'react';
import { useState } from 'react';
import api from '../api/client';

const defaultRubric = {
    exam_name: '',
    total_points: 100,
    questions: [
        {
            question_id: 'Q1',
            question_text: '',
            max_points: 10,
            criteria: [
                {
                    criterion_id: 'Q1_C1',
                    description: '',
                    max_points: 5,
                    keywords: [],
                    partial_credit_allowed: true,
                },
            ],
        },
    ],
};

export default function RubricPage() {
    const [rubric, setRubric] = useState(defaultRubric);
    const [jsonMode, setJsonMode] = useState(false);
    const [rawJson, setRawJson] = useState('');
    const [jsonError, setJsonError] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const updateField = (path, value) => {
        setRubric((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            const keys = path.split('.');
            let obj = next;
            for (let i = 0; i < keys.length - 1; i++) {
                const k = keys[i];
                if (!isNaN(k)) obj = obj[parseInt(k)]; else obj = obj[k];
            }
            const last = keys[keys.length - 1];
            if (!isNaN(last)) obj[parseInt(last)] = value; else obj[last] = value;
            return next;
        });
    };

    const addQuestion = () => {
        const qNum = rubric.questions.length + 1;
        setRubric((prev) => ({
            ...prev,
            questions: [...prev.questions, {
                question_id: `Q${qNum}`,
                question_text: '',
                max_points: 10,
                criteria: [{
                    criterion_id: `Q${qNum}_C1`,
                    description: '',
                    max_points: 5,
                    keywords: [],
                    partial_credit_allowed: true,
                }],
            }],
        }));
    };

    const removeQuestion = (qi) => {
        setRubric((prev) => ({ ...prev, questions: prev.questions.filter((_, i) => i !== qi) }));
    };

    const addCriterion = (qi) => {
        setRubric((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            const q = next.questions[qi];
            const cNum = q.criteria.length + 1;
            q.criteria.push({
                criterion_id: `${q.question_id}_C${cNum}`,
                description: '',
                max_points: 2,
                keywords: [],
                partial_credit_allowed: true,
            });
            return next;
        });
    };

    const removeCriterion = (qi, ci) => {
        setRubric((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            next.questions[qi].criteria.splice(ci, 1);
            return next;
        });
    };

    const handleSubmit = async () => {
        setLoading(true);
        setError('');
        setResult(null);
        try {
            let payload = rubric;
            if (jsonMode) {
                payload = JSON.parse(rawJson);
            }
            const res = await api.post('/api/rubrics', payload);
            setResult(res.data);
            // Store rubric_id for later use
            localStorage.setItem('gradeops_rubric_id', res.data.rubric_id || res.data.id || '');
            localStorage.setItem('gradeops_rubric_data', JSON.stringify(payload));
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Failed to upload rubric');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto animate-fade-in">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <p className="text-muted text-xs font-mono mb-1">STEP 01</p>
                    <h1 className="font-display font-bold text-2xl text-text">Upload Rubric</h1>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            setJsonMode(!jsonMode);
                            if (!jsonMode) setRawJson(JSON.stringify(rubric, null, 2));
                        }}
                        className="btn-ghost text-xs"
                    >
                        {jsonMode ? 'Form View' : 'JSON View'}
                    </button>
                    <button onClick={handleSubmit} disabled={loading} className="btn-primary">
                        {loading ? 'Uploading...' : 'Upload Rubric →'}
                    </button>
                </div>
            </div>

            {result && (
                <div className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/30 flex items-start gap-3 animate-fade-in">
                    <svg className="w-5 h-5 text-green-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                        <p className="text-green-400 font-medium text-sm">Rubric uploaded successfully!</p>
                        <p className="text-green-400/70 text-xs mt-0.5">
                            Rubric ID: <span className="font-mono">{result.rubric_id || result.id}</span>
                            {' '}— saved for exam upload step.
                        </p>
                    </div>
                </div>
            )}

            {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm animate-fade-in">
                    {error}
                </div>
            )}

            {jsonMode ? (
                <div className="card">
                    <label className="label">Raw Rubric JSON</label>
                    {jsonError && <p className="text-red-400 text-xs mb-2">{jsonError}</p>}
                    <textarea
                        className="input font-mono text-xs h-96 resize-y"
                        value={rawJson}
                        onChange={(e) => { setRawJson(e.target.value); setJsonError(''); }}
                    />
                </div>
            ) : (
                <div className="space-y-5">
                    {/* Exam info */}
                    <div className="card space-y-4">
                        <h3 className="font-display font-semibold text-text text-sm uppercase tracking-wider text-accent-light">Exam Info</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="label">Exam Name</label>
                                <input className="input" placeholder="CS101 Midterm" value={rubric.exam_name}
                                    onChange={(e) => updateField('exam_name', e.target.value)} />
                            </div>
                            <div>
                                <label className="label">Total Points</label>
                                <input className="input" type="number" value={rubric.total_points}
                                    onChange={(e) => updateField('total_points', Number(e.target.value))} />
                            </div>
                        </div>
                    </div>

                    {/* Questions */}
                    {rubric.questions.map((q, qi) => (
                        <div key={qi} className="card space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-display font-semibold text-sm text-text">
                                    Question <span className="text-accent-light font-mono">{q.question_id}</span>
                                </h3>
                                <button onClick={() => removeQuestion(qi)} className="btn-danger text-xs py-1 px-2">Remove Q</button>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2">
                                    <label className="label">Question ID</label>
                                    <input className="input font-mono" value={q.question_id}
                                        onChange={(e) => updateField(`questions.${qi}.question_id`, e.target.value)} />
                                </div>
                                <div>
                                    <label className="label">Max Points</label>
                                    <input className="input" type="number" value={q.max_points}
                                        onChange={(e) => updateField(`questions.${qi}.max_points`, Number(e.target.value))} />
                                </div>
                            </div>

                            <div>
                                <label className="label">Question Text</label>
                                <textarea className="input h-16 resize-none" placeholder="Describe what students need to answer..."
                                    value={q.question_text}
                                    onChange={(e) => updateField(`questions.${qi}.question_text`, e.target.value)} />
                            </div>

                            {/* Criteria */}
                            <div className="space-y-3 pl-4 border-l-2 border-accent-dim">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted uppercase tracking-wider font-medium">Criteria</span>
                                    <button onClick={() => addCriterion(qi)} className="btn-ghost text-xs py-1">+ Add Criterion</button>
                                </div>
                                {q.criteria.map((c, ci) => (
                                    <div key={ci} className="bg-surface rounded-lg p-4 space-y-3 border border-border">
                                        <div className="flex items-center justify-between">
                                            <span className="font-mono text-xs text-accent-light">{c.criterion_id}</span>
                                            <button onClick={() => removeCriterion(qi, ci)} className="text-muted hover:text-red-400 text-xs transition-colors">✕</button>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="col-span-2">
                                                <label className="label">Criterion ID</label>
                                                <input className="input font-mono text-xs" value={c.criterion_id}
                                                    onChange={(e) => updateField(`questions.${qi}.criteria.${ci}.criterion_id`, e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="label">Max Points</label>
                                                <input className="input" type="number" value={c.max_points}
                                                    onChange={(e) => updateField(`questions.${qi}.criteria.${ci}.max_points`, Number(e.target.value))} />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="label">Description</label>
                                            <input className="input text-sm" placeholder="What this criterion evaluates..."
                                                value={c.description}
                                                onChange={(e) => updateField(`questions.${qi}.criteria.${ci}.description`, e.target.value)} />
                                        </div>
                                        <div>
                                            <label className="label">Keywords (comma-separated)</label>
                                            <input className="input text-sm font-mono" placeholder="algorithm, complexity, O(n)"
                                                value={c.keywords.join(', ')}
                                                onChange={(e) => updateField(`questions.${qi}.criteria.${ci}.keywords`,
                                                    e.target.value.split(',').map((k) => k.trim()).filter(Boolean))} />
                                        </div>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={c.partial_credit_allowed}
                                                onChange={(e) => updateField(`questions.${qi}.criteria.${ci}.partial_credit_allowed`, e.target.checked)}
                                                className="rounded border-border" />
                                            <span className="text-xs text-subtle">Allow partial credit</span>
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}

                    <button onClick={addQuestion} className="btn-ghost w-full justify-center border-dashed">
                        + Add Question
                    </button>
                </div>
            )}
        </div>
    );
}