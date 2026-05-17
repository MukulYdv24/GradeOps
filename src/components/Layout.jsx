import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const s = {
    page: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0a0f', fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif" },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: '52px', borderBottom: '1px solid #1e1e2e', background: '#111118', flexShrink: 0 },
    nav: { display: 'flex', gap: '4px' },
    right: { display: 'flex', alignItems: 'center', gap: '12px' },
    main: { flex: 1, overflow: 'auto', background: '#0a0a0f' },
    logo: { fontWeight: 700, fontSize: '17px', color: '#e8e8f0', letterSpacing: '-0.3px' },
    logoAcc: { color: '#818cf8' },
    signout: { padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, background: 'transparent', border: '1px solid #1e1e2e', color: '#5a5a7a', cursor: 'pointer' },
    userTxt: { fontSize: '12px', color: '#5a5a7a' },
    dot: { margin: '0 8px', color: '#1e1e2e' },
};

const navLink = (active) => ({
    padding: '5px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
    textDecoration: 'none', transition: 'all 0.15s',
    background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
    color: active ? '#818cf8' : '#5a5a7a',
});

const roleBadge = (role) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
    background: role === 'instructor' ? 'rgba(99,102,241,0.15)' : 'rgba(245,158,11,0.15)',
    color: role === 'instructor' ? '#818cf8' : '#fbbf24',
});

export default function Layout({ children }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const navItems = user?.role === 'instructor'
        ? [
            { label: 'Dashboard', path: '/instructor' },
            { label: 'Upload Rubric', path: '/instructor/rubric' },
            { label: 'Upload Exams', path: '/instructor/upload' },
            { label: 'Grade', path: '/instructor/grade' },
            { label: 'Plagiarism', path: '/instructor/plagiarism' },
        ]
        : [{ label: 'Review Queue', path: '/ta' }];

    return (
        <div style={s.page}>
            <header style={s.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <span style={s.logo}>Grade<span style={s.logoAcc}>Ops</span></span>
                    <nav style={s.nav}>
                        {navItems.map(item => (
                            <Link key={item.path} to={item.path} style={navLink(location.pathname === item.path)}>
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                </div>
                <div style={s.right}>
                    <span style={s.userTxt}>
                        {user?.name}<span style={s.dot}>·</span>
                        <span style={roleBadge(user?.role)}>{user?.role}</span>
                    </span>
                    <button style={s.signout} onClick={() => { logout(); navigate('/login'); }}>Sign out</button>
                </div>
            </header>
            <main style={s.main}>{children}</main>
        </div>
    );
}