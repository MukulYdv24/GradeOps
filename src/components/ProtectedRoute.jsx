import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Layout from './Layout';

export default function ProtectedRoute({ children, requiredRole }) {
    const { user } = useAuth();
    if (!user) return <Navigate to="/login" replace />;
    if (requiredRole && user.role !== requiredRole) {
        return <Navigate to={user.role === 'instructor' ? '/instructor' : '/ta'} replace />;
    }
    return <Layout>{children}</Layout>;
}