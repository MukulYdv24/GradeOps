import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const steps = [
    {
        num: '01',
        title: 'Upload Rubric',
        desc: 'Define questions, criteria, max points, and keywords for AI grading.',
        path: '/instructor/rubric',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
            </svg>
        ),
    },
    {
        num: '02',
        title: 'Upload Exam PDFs',
        desc: 'Upload scanned exam PDFs with student ID mappings and page layout.',
        path: '/instructor/upload',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
                <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
            </svg>
        ),
    },
    {
        num: '03',
        title: 'Define Answer Regions',
        desc: 'Draw bounding boxes on exam pages to locate each question\'s answer area.',
        path: '/instructor/grade',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
            </svg>
        ),
    },
    {
        num: '04',
        title: 'Plagiarism Report',
        desc: 'Review similarity flags between student responses after grading completes.',
        path: '/instructor/plagiarism',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
        ),
    },
];

export default function InstructorDashboard() {
    const { user } = useAuth();

    return (
        <div className="p-8 max-w-5xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="mb-10">
                <p className="text-muted text-sm mb-1">Welcome back, <span className="text-accent-light">{user?.name}</span></p>
                <h1 className="font-display font-bold text-3xl text-text tracking-tight">Instructor Dashboard</h1>
                <p className="text-subtle text-sm mt-2">Follow the workflow below to set up and launch AI-assisted grading.</p>
            </div>

            {/* Workflow steps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {steps.map((step, i) => (
                    <Link key={step.num} to={step.path} className="group card hover:border-accent/50 transition-all duration-200 hover:-translate-y-0.5">
                        <div className="flex items-start gap-4">
                            <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 text-accent-light group-hover:bg-accent/20 transition-colors">
                                {step.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-mono text-xs text-accent/60">{step.num}</span>
                                    <h3 className="font-display font-semibold text-text text-base">{step.title}</h3>
                                </div>
                                <p className="text-muted text-sm leading-relaxed">{step.desc}</p>
                            </div>
                            <svg className="shrink-0 w-4 h-4 text-border group-hover:text-accent transition-colors mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                        </div>
                    </Link>
                ))}
            </div>

            {/* Info box */}
            <div className="mt-8 p-4 rounded-xl bg-accent/5 border border-accent/20 flex gap-3">
                <svg className="shrink-0 w-5 h-5 text-accent-light mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div className="text-sm text-subtle">
                    <strong className="text-text">Tip:</strong> Complete steps in order — rubric first, then upload, then define answer regions and start grading. TAs will review AI-graded answers in their queue.
                </div>
            </div>
        </div>
    );
}