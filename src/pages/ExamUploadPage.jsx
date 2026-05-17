import React from 'react';
import { useState } from 'react';
import api from '../api/client';

export default function ExamUploadPage() {
    const storedRubricId = localStorage.getItem('gradeops_rubric_id') || '';

    const [form, setForm] = useState({
        exam_name: '',
        rubric_id: storedRubricId,
        pages_per_student: 2,
        student_ids: '',
    });
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        if (!files.length) { setError('Please select at least one PDF.'); return; }
        if (!form.exam_name) { setError('Exam name is required.'); return; }
        if (!form.rubric_id) { setError('Rubric ID is required.'); return; }

        setLoading(true);
        setError('');
        setResult(null);

        try {
            const fd = new FormData();
            fd.append('exam_name', form.exam_name);
            fd.append('rubric_id', form.rubric_id);
            fd.append('pages_per_student', form.pages_per_student);
            if (form.student_ids.trim()) {
                form.student_ids.split(',').map((s) => s.trim()).filter(Boolean)
                    .forEach((sid) => fd.append('student_ids', sid));
            }
            files.forEach((f) => fd.append('files', f));

            const res = await api.post('/api/exams/upload', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setResult(res.data);
            localStorage.setItem('gradeops_exam_id', res.data.exam_id || res.data.id || '');
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Upload failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-3xl mx-auto animate-fade-in">
            <div className="mb-8">
                <p className="text-muted text-xs font-mono mb-1">STEP 02</p>
                <h1 className="font-display font-bold text-2xl text-text">Upload Exam PDFs</h1>
                <p className="text-subtle text-sm mt-1">Upload scanned exam PDFs and configure student mapping.</p>
            </div>

            {result && (
                <div className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/30 animate-fade-in">
                    <p className="text-green-400 font-medium text-sm">✓ Exam uploaded successfully!</p>
                    <p className="text-green-400/70 text-xs mt-0.5">
                        Exam ID: <span className="font-mono">{result.exam_id || result.id}</span> — saved for grading step.
                    </p>
                </div>
            )}

            {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                    {error}
                </div>
            )}

            <div className="card space-y-5">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="label">Exam Name</label>
                        <input className="input" placeholder="CS101 Midterm Fall 2025"
                            value={form.exam_name} onChange={(e) => setForm({ ...form, exam_name: e.target.value })} />
                    </div>
                    <div>
                        <label className="label">Rubric ID</label>
                        <input className="input font-mono" placeholder="rubric_abc123"
                            value={form.rubric_id} onChange={(e) => setForm({ ...form, rubric_id: e.target.value })} />
                        {storedRubricId && (
                            <p className="text-xs text-accent-light mt-1">← Auto-filled from Step 01</p>
                        )}
                    </div>
                </div>

                <div>
                    <label className="label">Pages Per Student</label>
                    <input className="input w-32" type="number" min={1} value={form.pages_per_student}
                        onChange={(e) => setForm({ ...form, pages_per_student: Number(e.target.value) })} />
                </div>

                <div>
                    <label className="label">Student IDs (optional, comma-separated)</label>
                    <input className="input" placeholder="STU001, STU002, STU003"
                        value={form.student_ids} onChange={(e) => setForm({ ...form, student_ids: e.target.value })} />
                    <p className="text-muted text-xs mt-1">Leave blank to auto-assign based on page order.</p>
                </div>

                {/* File drop zone */}
                <div>
                    <label className="label">Exam PDF Files</label>
                    <label className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${files.length ? 'border-accent/50 bg-accent/5' : 'border-border hover:border-accent/50 hover:bg-accent/5'
                        }`}>
                        <input type="file" accept=".pdf" multiple className="hidden"
                            onChange={(e) => setFiles(Array.from(e.target.files))} />
                        {files.length > 0 ? (
                            <div>
                                <div className="text-2xl mb-2">📄</div>
                                <p className="text-text font-medium text-sm">{files.length} PDF{files.length !== 1 ? 's' : ''} selected</p>
                                <ul className="mt-2 space-y-0.5">
                                    {files.map((f, i) => (
                                        <li key={i} className="text-xs text-muted font-mono">{f.name}</li>
                                    ))}
                                </ul>
                                <p className="text-accent-light text-xs mt-2">Click to change selection</p>
                            </div>
                        ) : (
                            <div>
                                <div className="text-4xl mb-3 opacity-50">☁</div>
                                <p className="text-text font-medium text-sm">Drop PDFs here or click to browse</p>
                                <p className="text-muted text-xs mt-1">Multiple files supported</p>
                            </div>
                        )}
                    </label>
                </div>

                <button onClick={handleSubmit} disabled={loading} className="btn-primary w-full justify-center py-2.5">
                    {loading ? (
                        <span className="flex items-center gap-2">
                            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                            </svg>
                            Uploading...
                        </span>
                    ) : 'Upload Exams →'}
                </button>
            </div>
        </div>
    );
}