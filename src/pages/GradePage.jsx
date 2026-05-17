import React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

// ─── Bounding Box Canvas ───────────────────────────────────────────────────
function BBoxCanvas({ imageUrl, boxes, onAddBox }) {
    const imgRef = useRef(null);
    const canvasRef = useRef(null);
    const [drawing, setDrawing] = useState(false);
    const [startPt, setStartPt] = useState(null);
    const [currentRect, setCurrentRect] = useState(null);

    const redraw = useCallback(() => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw finalized boxes
        boxes.forEach((b, i) => {
            const sx = img.clientWidth / img.naturalWidth;
            const sy = img.clientHeight / img.naturalHeight;
            const x = b.bbox[0] * sx, y = b.bbox[1] * sy;
            const w = b.bbox[2] * sx, h = b.bbox[3] * sy;
            ctx.strokeStyle = '#818CF8';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = 'rgba(99,102,241,0.15)';
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = '#818CF8';
            ctx.font = 'bold 12px JetBrains Mono, monospace';
            ctx.fillText(b.question_id, x + 4, y + 14);
        });

        // Draw live rect
        if (currentRect) {
            ctx.strokeStyle = '#F59E0B';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 3]);
            ctx.strokeRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h);
            ctx.fillStyle = 'rgba(245,158,11,0.1)';
            ctx.fillRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h);
        }
    }, [boxes, currentRect]);

    useEffect(() => { redraw(); }, [redraw]);

    const getPos = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const syncCanvasSize = () => {
        const img = imgRef.current;
        const canvas = canvasRef.current;
        if (!img || !canvas) return;
        canvas.width = img.clientWidth;
        canvas.height = img.clientHeight;
    };

    const onMouseDown = (e) => {
        syncCanvasSize();
        const p = getPos(e);
        setDrawing(true);
        setStartPt(p);
        setCurrentRect({ x: p.x, y: p.y, w: 0, h: 0 });
    };

    const onMouseMove = (e) => {
        if (!drawing || !startPt) return;
        const p = getPos(e);
        setCurrentRect({
            x: Math.min(startPt.x, p.x),
            y: Math.min(startPt.y, p.y),
            w: Math.abs(p.x - startPt.x),
            h: Math.abs(p.y - startPt.y),
        });
    };

    const onMouseUp = () => {
        if (!drawing || !currentRect || currentRect.w < 10 || currentRect.h < 10) {
            setDrawing(false); setCurrentRect(null); return;
        }
        const img = imgRef.current;
        const scaleX = img.naturalWidth / img.clientWidth;
        const scaleY = img.naturalHeight / img.clientHeight;
        const bbox = [
            currentRect.x * scaleX,
            currentRect.y * scaleY,
            currentRect.w * scaleX,
            currentRect.h * scaleY,
        ];
        setDrawing(false);
        setCurrentRect(null);
        onAddBox(bbox);
    };

    return (
        <div className="relative inline-block w-full">
            <img
                ref={imgRef}
                src={imageUrl}
                alt="Exam preview"
                className="w-full rounded-lg"
                onLoad={syncCanvasSize}
            />
            <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 cursor-crosshair rounded-lg"
                style={{ width: '100%', height: '100%' }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
            />
        </div>
    );
}

// ─── Job Poller ────────────────────────────────────────────────────────────
function JobPoller({ jobId, onDone }) {
    const [status, setStatus] = useState('pending');
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        if (!jobId) return;
        const interval = setInterval(async () => {
            try {
                const res = await api.get(`/api/jobs/${jobId}`);
                setStatus(res.data.status);
                if (res.data.progress != null) setProgress(res.data.progress);
                if (res.data.status === 'done' || res.data.status === 'completed') {
                    clearInterval(interval);
                    onDone();
                }
            } catch {
                // keep polling
            }
        }, 4000);
        return () => clearInterval(interval);
    }, [jobId, onDone]);

    return (
        <div className="card text-center py-10 animate-fade-in">
            <div className="relative inline-flex items-center justify-center w-16 h-16 mb-4">
                <svg className="animate-spin w-16 h-16 text-accent/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                </svg>
                <svg className="animate-spin w-12 h-12 text-accent absolute" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }}>
                    <path d="M12 2C6.48 2 2 6.48 2 12" strokeLinecap="round" />
                </svg>
            </div>
            <h3 className="font-display font-semibold text-text text-lg mb-1">AI Grading in Progress</h3>
            <p className="text-muted text-sm mb-4">
                Job <span className="font-mono text-accent-light">{jobId}</span> · Status: <span className="font-mono text-warning">{status}</span>
            </p>
            {progress > 0 && (
                <div className="max-w-xs mx-auto">
                    <div className="h-1.5 bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-xs text-muted mt-1">{progress}% complete</p>
                </div>
            )}
            <p className="text-muted text-xs mt-4">Checking every 4 seconds...</p>
        </div>
    );
}

// ─── Main GradePage ────────────────────────────────────────────────────────
export default function GradePage() {
    const navigate = useNavigate();
    const storedExamId = localStorage.getItem('gradeops_exam_id') || '';
    const storedRubricId = localStorage.getItem('gradeops_rubric_id') || '';

    const [examId, setExamId] = useState(storedExamId);
    const [rubricId, setRubricId] = useState(storedRubricId);
    const [previewUrl, setPreviewUrl] = useState('');
    const [boxes, setBoxes] = useState([]);
    const [pendingBbox, setPendingBbox] = useState(null);
    const [pendingQId, setPendingQId] = useState('');
    const [jobId, setJobId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleAddBox = (bbox) => {
        setPendingBbox(bbox);
        setPendingQId('');
    };

    const confirmBox = () => {
        if (!pendingQId.trim()) return;
        setBoxes((prev) => [...prev, { question_id: pendingQId.trim(), bbox: pendingBbox }]);
        setPendingBbox(null);
        setPendingQId('');
    };

    const removeBox = (i) => setBoxes((prev) => prev.filter((_, idx) => idx !== i));

    const handleStartGrading = async () => {
        if (!examId || !rubricId || boxes.length === 0) {
            setError('Exam ID, Rubric ID, and at least one bounding box are required.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/api/grade', {
                exam_id: examId,
                rubric_id: rubricId,
                answer_regions: boxes.map((b) => ({ question_id: b.question_id, bbox: b.bbox })),
            });
            setJobId(res.data.job_id || res.data.id);
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Failed to start grading job');
        } finally {
            setLoading(false);
        }
    };

    const handleJobDone = useCallback(() => {
        setTimeout(() => navigate('/instructor/plagiarism'), 1500);
    }, [navigate]);

    if (jobId) {
        return (
            <div className="p-8 max-w-2xl mx-auto animate-fade-in">
                <div className="mb-8">
                    <p className="text-muted text-xs font-mono mb-1">STEP 03 → GRADING</p>
                    <h1 className="font-display font-bold text-2xl text-text">Grading Job Running</h1>
                </div>
                <JobPoller jobId={jobId} onDone={handleJobDone} />
            </div>
        );
    }

    return (
        <div className="p-8 max-w-5xl mx-auto animate-fade-in">
            <div className="mb-8">
                <p className="text-muted text-xs font-mono mb-1">STEP 03</p>
                <h1 className="font-display font-bold text-2xl text-text">Define Answer Regions & Grade</h1>
                <p className="text-subtle text-sm mt-1">Draw bounding boxes over each question's answer area, then start grading.</p>
            </div>

            {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
            )}

            <div className="grid grid-cols-5 gap-6">
                {/* Left: canvas */}
                <div className="col-span-3 space-y-4">
                    <div className="card space-y-4">
                        <h3 className="font-display font-semibold text-sm text-accent-light uppercase tracking-wider">Exam Preview</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="label">Exam ID</label>
                                <input className="input font-mono text-xs" value={examId} placeholder="exam_abc123"
                                    onChange={(e) => setExamId(e.target.value)} />
                            </div>
                            <div>
                                <label className="label">Preview Image URL</label>
                                <input className="input font-mono text-xs" value={previewUrl} placeholder="http://...page1.jpg"
                                    onChange={(e) => setPreviewUrl(e.target.value)} />
                            </div>
                        </div>

                        {previewUrl ? (
                            <div className="relative">
                                <BBoxCanvas imageUrl={previewUrl} boxes={boxes} onAddBox={handleAddBox} />
                                <p className="text-xs text-muted mt-2">Click and drag to draw a bounding box over an answer area.</p>
                            </div>
                        ) : (
                            <div className="h-64 rounded-xl border-2 border-dashed border-border flex items-center justify-center">
                                <div className="text-center">
                                    <div className="text-4xl mb-2 opacity-30">🖼</div>
                                    <p className="text-muted text-sm">Enter a preview image URL above</p>
                                    <p className="text-muted text-xs mt-1">This is the first page of the exam PDF</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Pending label prompt */}
                    {pendingBbox && (
                        <div className="card border-warning/40 bg-warning/5 animate-fade-in">
                            <h4 className="font-semibold text-warning text-sm mb-3">Label this region</h4>
                            <p className="text-xs text-muted mb-3">
                                Box: [{pendingBbox.map((v) => Math.round(v)).join(', ')}]
                            </p>
                            <div className="flex gap-2">
                                <input className="input flex-1 font-mono" placeholder="Question ID (e.g. Q1)"
                                    value={pendingQId} onChange={(e) => setPendingQId(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && confirmBox()} autoFocus />
                                <button onClick={confirmBox} disabled={!pendingQId.trim()} className="btn-primary">Save</button>
                                <button onClick={() => setPendingBbox(null)} className="btn-ghost">Cancel</button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: config + boxes */}
                <div className="col-span-2 space-y-4">
                    <div className="card space-y-4">
                        <h3 className="font-display font-semibold text-sm text-accent-light uppercase tracking-wider">Grading Config</h3>
                        <div>
                            <label className="label">Rubric ID</label>
                            <input className="input font-mono text-xs" value={rubricId} placeholder="rubric_abc123"
                                onChange={(e) => setRubricId(e.target.value)} />
                        </div>
                    </div>

                    {/* Boxes list */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-display font-semibold text-sm text-text">Answer Regions</h3>
                            <span className="badge bg-accent/15 text-accent-light">{boxes.length}</span>
                        </div>
                        {boxes.length === 0 ? (
                            <p className="text-muted text-xs text-center py-4">No regions defined yet.<br />Draw boxes on the preview image.</p>
                        ) : (
                            <ul className="space-y-2">
                                {boxes.map((b, i) => (
                                    <li key={i} className="flex items-center justify-between bg-surface rounded-lg px-3 py-2 text-xs">
                                        <span className="font-mono text-accent-light font-medium">{b.question_id}</span>
                                        <span className="text-muted">[{b.bbox.map((v) => Math.round(v)).join(', ')}]</span>
                                        <button onClick={() => removeBox(i)} className="text-muted hover:text-red-400 transition-colors ml-2">✕</button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <button
                        onClick={handleStartGrading}
                        disabled={loading || boxes.length === 0}
                        className="btn-primary w-full justify-center py-3 font-display font-semibold"
                    >
                        {loading ? 'Starting...' : '🚀 Start Grading Job'}
                    </button>
                </div>
            </div>
        </div>
    );
}