import React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const S = {
    page: {
        minHeight: '100vh',
        background: '#0a0a0f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
        padding: '24px',
        position: 'relative',
        overflow: 'hidden',
    },
    gridBg: {
        position: 'absolute',
        inset: 0,
        backgroundImage:
            'linear-gradient(rgba(99,102,241,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.07) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
        pointerEvents: 'none',
    },
    glow1: {
        position: 'absolute',
        top: '-5%',
        left: '25%',
        width: '500px',
        height: '420px',
        background: 'radial-gradient(ellipse, rgba(99,102,241,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
    },
    glow2: {
        position: 'absolute',
        bottom: '-10%',
        right: '20%',
        width: '360px',
        height: '320px',
        background: 'radial-gradient(ellipse, rgba(129,140,248,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
    },
    wrapper: {
        position: 'relative',
        width: '100%',
        maxWidth: '420px',
        display: 'flex',
        flexDirection: 'column',
        gap: '0',
    },
    logoArea: {
        textAlign: 'center',
        marginBottom: '32px',
    },
    logoBox: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '52px',
        height: '52px',
        borderRadius: '14px',
        background: 'rgba(99,102,241,0.12)',
        border: '1px solid rgba(99,102,241,0.3)',
        marginBottom: '16px',
    },
    appTitle: {
        margin: 0,
        fontSize: '30px',
        fontWeight: 700,
        color: '#e8e8f0',
        letterSpacing: '-0.5px',
        lineHeight: 1.1,
    },
    appTitleAccent: {
        color: '#818cf8',
    },
    appSubtitle: {
        margin: '6px 0 0',
        fontSize: '14px',
        color: '#5a5a7a',
    },
    card: {
        background: '#111118',
        border: '1px solid #1e1e2e',
        borderRadius: '16px',
        padding: '28px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
    },
    fieldGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
    },
    label: {
        fontSize: '11px',
        fontWeight: 600,
        color: '#5a5a7a',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
    },
    input: {
        width: '100%',
        background: '#16161f',
        border: '1px solid #1e1e2e',
        borderRadius: '10px',
        padding: '10px 14px',
        fontSize: '14px',
        color: '#e8e8f0',
        outline: 'none',
        transition: 'border-color 0.15s',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
    },
    roleGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '10px',
    },
    roleBtn: (selected) => ({
        padding: '14px 12px',
        borderRadius: '10px',
        border: selected ? '1px solid rgba(99,102,241,0.6)' : '1px solid #1e1e2e',
        background: selected ? 'rgba(99,102,241,0.12)' : '#16161f',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
    }),
    roleIcon: {
        fontSize: '20px',
        marginBottom: '2px',
        lineHeight: 1,
    },
    roleLabel: (selected) => ({
        fontSize: '13px',
        fontWeight: 600,
        color: selected ? '#e8e8f0' : '#a0a0b8',
        margin: 0,
    }),
    roleDesc: {
        fontSize: '11px',
        color: '#5a5a7a',
        margin: 0,
    },
    errorBox: {
        background: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.2)',
        borderRadius: '8px',
        padding: '10px 14px',
        fontSize: '13px',
        color: '#f87171',
    },
    submitBtn: {
        width: '100%',
        padding: '12px',
        background: '#6366f1',
        color: '#fff',
        border: 'none',
        borderRadius: '10px',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'background 0.15s',
        fontFamily: 'inherit',
        letterSpacing: '0.01em',
    },
    demoNote: {
        textAlign: 'center',
        fontSize: '12px',
        color: '#3a3a5a',
        marginTop: '16px',
    },
};

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [role, setRole] = useState('instructor');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [inputFocused, setInputFocused] = useState(false);
    const [hovering, setHovering] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!name.trim()) { setError('Please enter your name.'); return; }
        login(role, name.trim());
        navigate(role === 'instructor' ? '/instructor' : '/ta');
    };

    const roles = [
        { value: 'instructor', label: 'Instructor', icon: '🎓', desc: 'Upload & manage exams' },
        { value: 'ta', label: 'Teaching Assistant', icon: '✏️', desc: 'Review & approve grades' },
    ];

    return (
        <div style={S.page}>
            {/* Background decorations */}
            <div style={S.gridBg} />
            <div style={S.glow1} />
            <div style={S.glow2} />

            <div style={S.wrapper}>
                {/* Logo */}
                <div style={S.logoArea}>
                    <div style={S.logoBox}>
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 11l3 3L22 4" />
                            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                        </svg>
                    </div>
                    <h1 style={S.appTitle}>
                        Grade<span style={S.appTitleAccent}>Ops</span>
                    </h1>
                    <p style={S.appSubtitle}>AI-powered exam grading platform</p>
                </div>

                {/* Card */}
                <form onSubmit={handleSubmit} style={S.card}>
                    {/* Name field */}
                    <div style={S.fieldGroup}>
                        <label style={S.label}>Your Name</label>
                        <input
                            style={{
                                ...S.input,
                                borderColor: inputFocused ? '#6366f1' : '#1e1e2e',
                            }}
                            type="text"
                            placeholder="e.g. Prof. Sharma"
                            value={name}
                            onChange={(e) => { setName(e.target.value); setError(''); }}
                            onFocus={() => setInputFocused(true)}
                            onBlur={() => setInputFocused(false)}
                        />
                    </div>

                    {/* Role selection */}
                    <div style={S.fieldGroup}>
                        <label style={S.label}>Role</label>
                        <div style={S.roleGrid}>
                            {roles.map((r) => (
                                <button
                                    key={r.value}
                                    type="button"
                                    onClick={() => setRole(r.value)}
                                    style={S.roleBtn(role === r.value)}
                                >
                                    <span style={S.roleIcon}>{r.icon}</span>
                                    <span style={S.roleLabel(role === r.value)}>{r.label}</span>
                                    <span style={S.roleDesc}>{r.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Error */}
                    {error && <div style={S.errorBox}>{error}</div>}

                    {/* Submit */}
                    <button
                        type="submit"
                        style={{
                            ...S.submitBtn,
                            background: hovering ? '#818cf8' : '#6366f1',
                        }}
                        onMouseEnter={() => setHovering(true)}
                        onMouseLeave={() => setHovering(false)}
                    >
                        Enter GradeOps →
                    </button>
                </form>

                <p style={S.demoNote}>Demo mode — no password required</p>
            </div>
        </div>
    );
}