/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/features/public/LandingPage.tsx
 * الوصف: الصفحة الترحيبية وبوابة النظام (مطابقة 100% لملف index.html)
 * ============================================================================
 */

import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { STORAGE_KEYS } from '../../config/constants';
import { useTheme } from '../../context/ThemeContext';

export const LandingPage: React.FC = () => {
    const navigate = useNavigate();
    const { isDark, toggleDarkMode } = useTheme();

    useEffect(() => {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        if (token) {
            navigate('/app.html', { replace: true });
        }
    }, [navigate]);

    return (
        <div
            className="min-vh-100 d-flex flex-column justify-content-center align-items-center p-3 position-relative"
            style={{
                background: isDark
                    ? 'radial-gradient(circle at top right, #1e293b 0%, #020617 100%)'
                    : 'radial-gradient(circle at top right, #1C2541 0%, #0B132B 100%)',
                color: '#fff',
            }}
        >
            <button
                onClick={toggleDarkMode}
                className="btn btn-outline-light position-fixed top-0 start-0 m-3 rounded-circle shadow-sm d-flex align-items-center justify-content-center"
                style={{ width: 44, height: 44, zIndex: 1050, borderColor: 'rgba(212,175,55,0.4)' }}
                title="تبديل الوضع الليلي"
            >
                <i className={`fas ${isDark ? 'fa-sun text-warning' : 'fa-moon text-warning'}`}></i>
            </button>

            <div
                className="card border-0 shadow-lg text-center p-4 p-md-5 rounded-4 fade-in"
                style={{
                    maxWidth: 480,
                    width: '100%',
                    background: isDark ? 'rgba(30, 41, 59, 0.92)' : 'rgba(255, 255, 255, 0.98)',
                    color: isDark ? '#f8fafc' : '#0B132B',
                    borderTop: '5px solid #D4AF37',
                }}
            >
                <div
                    className="mx-auto mb-3 d-flex align-items-center justify-content-center rounded-circle shadow"
                    style={{
                        width: 90,
                        height: 90,
                        background: 'linear-gradient(135deg, #0B132B, #1C2541)',
                        border: '3px solid #D4AF37',
                    }}
                >
                    <i className="fas fa-balance-scale fa-2x" style={{ color: '#D4AF37' }}></i>
                </div>

                <h2 className="fw-black mb-1" style={{ fontWeight: 900 }}>
                    نظام موكّل <span style={{ color: '#D4AF37' }}>ERP</span>
                </h2>
                <p className="text-muted fw-bold small mb-4">
                    المنصة السحابية الذكية لإدارة مكاتب وشركات المحاماة (V5.4 Zero-Trust)
                </p>

                <div className="d-grid gap-3 mb-4">
                    <Link
                        to="/login.html"
                        className="btn btn-lg fw-bold py-3 rounded-4 shadow-sm d-flex align-items-center justify-content-center gap-2"
                        style={{
                            background: 'linear-gradient(135deg, #0B132B, #1C2541)',
                            color: '#D4AF37',
                            border: '2px solid #D4AF37',
                        }}
                    >
                        <i className="fas fa-user-shield fs-5"></i>
                        <span>بوابة المحامين والكوادر</span>
                    </Link>

                    <Link
                        to="/client.html"
                        className="btn btn-lg fw-bold py-3 rounded-4 shadow-sm d-flex align-items-center justify-content-center gap-2"
                        style={{
                            background: 'linear-gradient(135deg, #D4AF37, #b5952f)',
                            color: '#0B132B',
                        }}
                    >
                        <i className="fas fa-user-tie fs-5"></i>
                        <span>بوابة الموكلين (متابعة القضايا)</span>
                    </Link>

                    <Link
                        to="/verify.html"
                        className="btn btn-outline-secondary fw-bold py-2 rounded-4 d-flex align-items-center justify-content-center gap-2"
                    >
                        <i className="fas fa-qrcode text-success"></i>
                        <span>التحقق من صحة الوثائق الرقمية</span>
                    </Link>
                </div>

                <div className="border-top pt-3 d-flex justify-content-center gap-3 small fw-bold">
                    <Link to="/privacy.html" className="text-decoration-none text-muted">
                        <i className="fas fa-shield-alt me-1"></i> سياسة الخصوصية
                    </Link>
                    <span className="text-muted">|</span>
                    <Link to="/terms.html" className="text-decoration-none text-muted">
                        <i className="fas fa-file-contract me-1"></i> شروط الاستخدام
                    </Link>
                    <span className="text-muted">|</span>
                    <Link to="/calculators.html" className="text-decoration-none text-muted">
                        <i className="fas fa-calculator me-1"></i> الحاسبات
                    </Link>
                </div>
            </div>
        </div>
    );
};
