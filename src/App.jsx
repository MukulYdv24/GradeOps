import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import LoginPage from './pages/LoginPage';
import InstructorDashboard from './pages/InstructorDashboard';
import RubricPage from './pages/RubricPage';
import ExamUploadPage from './pages/ExamUploadPage';
import GradePage from './pages/GradePage';
import PlagiarismPage from './pages/PlagiarismPage';
import TADashboard from './pages/TADashboard';

function RootRedirect() {
    const { user } = useAuth();
    if (!user) return <Navigate to="/login" replace />;
    return <Navigate to={user.role === 'instructor' ? '/instructor' : '/ta'} replace />;
}

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/" element={<RootRedirect />} />
                    <Route path="/instructor" element={<ProtectedRoute requiredRole="instructor"><InstructorDashboard /></ProtectedRoute>} />
                    <Route path="/instructor/rubric" element={<ProtectedRoute requiredRole="instructor"><RubricPage /></ProtectedRoute>} />
                    <Route path="/instructor/upload" element={<ProtectedRoute requiredRole="instructor"><ExamUploadPage /></ProtectedRoute>} />
                    <Route path="/instructor/grade" element={<ProtectedRoute requiredRole="instructor"><GradePage /></ProtectedRoute>} />
                    <Route path="/instructor/plagiarism" element={<ProtectedRoute requiredRole="instructor"><PlagiarismPage /></ProtectedRoute>} />
                    <Route path="/ta" element={<ProtectedRoute requiredRole="ta"><TADashboard /></ProtectedRoute>} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}