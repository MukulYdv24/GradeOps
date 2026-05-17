/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                ink: '#0A0A0F',
                surface: '#111118',
                panel: '#1A1A24',
                border: '#2A2A3A',
                accent: '#6366F1',
                'accent-light': '#818CF8',
                'accent-dim': '#312E81',
                success: '#22C55E',
                warning: '#F59E0B',
                danger: '#EF4444',
                muted: '#6B7280',
                subtle: '#9CA3AF',
                text: '#E2E8F0',
            },
            fontFamily: {
                mono: ['"JetBrains Mono"', 'monospace'],
                display: ['"Syne"', 'sans-serif'],
                body: ['"DM Sans"', 'sans-serif'],
            },
            animation: {
                'fade-in': 'fadeIn 0.3s ease-out',
                'slide-up': 'slideUp 0.4s ease-out',
            },
            keyframes: {
                fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
                slideUp: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
            }
        },
    },
    plugins: [],
}