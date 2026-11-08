/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/router/AppRouter.tsx
 * الوصف: موجه المسارات المركزي مع حارس الجلسة (ProtectedRoute) ودعم كامل
 *        للمسارات النظيفة (/app) والمسارات التقليدية (/app.html) لضمان توافق
 *        روابط الـ QR وإشعارات الـ Service Worker بنسبة 100%.
 * ============================================================================
 */

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LandingPage } from '../features/public/LandingPage';
import { PrivacyPage } from '../features/public/PrivacyPage';
import { TermsPage } from '../features/public/TermsPage';
import { VerifyPage } from '../features/public/VerifyPage';
import { LoginPage } from '../features/auth/LoginPage';
import { SuperAdminPage } from '../features/super-admin/SuperAdminPage';
import { ClientPortalPage } from '../features/portal/ClientPortalPage';
import { CalculatorsPage } from '../features/calculators/CalculatorsPage';
import { MainAppPage } from '../features/dashboard/MainAppPage';
import { CaseDetailsPage } from '../features/cases/CaseDetailsPage';
import { ClientDetailsPage } from '../features/clients/ClientDetailsPage';
import { StaffPage } from '../features/staff/StaffPage';
import { LibraryPage } from '../features/library/LibraryPage';
import { AiChatPage } from '../features/ai-assistant/AiChatPage';
import { ReportsPage } from '../features/reports/ReportsPage';

const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
    const { isAuthenticated } = useAuth();
    if (!isAuthenticated) {
        return <Navigate to="/login.html" replace />;
    }
    return children;
};

export const AppRouter: React.FC = () => {
    return (
        <Routes>
            {/* المسارات العامة وبوابة الموكل والـ Super Admin */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/index.html" element={<LandingPage />} />

            <Route path="/login" element={<LoginPage />} />
            <Route path="/login.html" element={<LoginPage />} />

            <Route path="/register" element={<SuperAdminPage />} />
            <Route path="/register.html" element={<SuperAdminPage />} />

            <Route path="/client" element={<ClientPortalPage />} />
            <Route path="/client.html" element={<ClientPortalPage />} />

            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/verify.html" element={<VerifyPage />} />

            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/privacy.html" element={<PrivacyPage />} />

            <Route path="/terms" element={<TermsPage />} />
            <Route path="/terms.html" element={<TermsPage />} />

            <Route path="/calculators" element={<CalculatorsPage />} />
            <Route path="/calculators.html" element={<CalculatorsPage />} />

            {/* المسارات المحمية للمحامين والكوادر */}
            <Route
                path="/app"
                element={
                    <ProtectedRoute>
                        <MainAppPage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/app.html"
                element={
                    <ProtectedRoute>
                        <MainAppPage />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/case-details"
                element={
                    <ProtectedRoute>
                        <CaseDetailsPage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/case-details.html"
                element={
                    <ProtectedRoute>
                        <CaseDetailsPage />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/client-details"
                element={
                    <ProtectedRoute>
                        <ClientDetailsPage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/client-details.html"
                element={
                    <ProtectedRoute>
                        <ClientDetailsPage />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/staff"
                element={
                    <ProtectedRoute>
                        <StaffPage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/staff.html"
                element={
                    <ProtectedRoute>
                        <StaffPage />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/library"
                element={
                    <ProtectedRoute>
                        <LibraryPage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/library.html"
                element={
                    <ProtectedRoute>
                        <LibraryPage />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/ai-chat"
                element={
                    <ProtectedRoute>
                        <AiChatPage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/ai-chat.html"
                element={
                    <ProtectedRoute>
                        <AiChatPage />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/reports"
                element={
                    <ProtectedRoute>
                        <ReportsPage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/reports.html"
                element={
                    <ProtectedRoute>
                        <ReportsPage />
                    </ProtectedRoute>
                }
            />

            {/* fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};
