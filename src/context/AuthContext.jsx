import React from 'react';
import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        try {
            const stored = localStorage.getItem('gradeops_user');
            return stored ? JSON.parse(stored) : null;
        } catch { return null; }
    });

    const login = (role, name) => {
        const userData = { role, name, token: `demo_${role}_${Date.now()}` };
        setUser(userData);
        localStorage.setItem('gradeops_user', JSON.stringify(userData));
        localStorage.setItem('gradeops_token', userData.token);
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('gradeops_user');
        localStorage.removeItem('gradeops_token');
    };

    return (
        <AuthContext.Provider value={{ user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);