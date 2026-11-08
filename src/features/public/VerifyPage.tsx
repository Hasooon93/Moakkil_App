/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/features/public/VerifyPage.tsx
 * الوصف: بوابة التحقق الرقمي من صحة الوثائق والتواقيع (مطابقة 100% لملف verify.html)
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { MoakkilAPI } from '../../services/moakkilApi.service';
import { useTheme } from '../../context/ThemeContext';

export const VerifyPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { isDark, toggleDarkMode } = useTheme();

    const [hashInput, setHashInput] = useState(searchParams.get('hash') || '');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleVerify = async (hashToVerify?: string) => {
        const targetHash = (hashToVerify ?? hashInput).trim();
        if (!targetHash) return;

        setLoading(true);
        setResult(null);
        setErrorMsg(null);

        try {
            const res = await MoakkilAPI.verifyDocumentPublic(targetHash);
            if (res && res.valid && res.document) {
                setResult(res.document);
            } else {
                setErrorMsg(res?.error || 'لم يتم العثور على وثيقة رسمية مطابقة لهذه البصمة الرقمية.');
            }
        } catch {
            setErrorMsg('تعذر الاتصال بخادم التحقق الرقمي. يرجى المحاولة لاحقاً.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const urlHash = searchParams.get('hash');
        if (urlHash) {
            setHashInput(urlHash);
            handleVerify(urlHash);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    return (
        <div className="min-vh-100 pb-5">
            <div className="top-nav d-flex justify-content-between align-items-center px-3 py-3">
                <div className="d-flex align-items-center gap-2">
                    <button
                        className="btn btn-link text-white p-0 text-decoration-none"
                        onClick={() => navigate('/')}
                    >
                        <i className="fas fa-arrow-right fs-4"></i>
                    </button>
                    <h5 className="mb-0 fw-bold text-white">
                        <i className="fas fa-shield-check me-2 text-warning"></i> التحقق الرقمي من الوثائق (SHA-256)
                    </h5>
                </div>
                <button
                    className="btn btn-sm btn-outline-light rounded-3 px-3"
                    onClick={toggleDarkMode}
                    title="تبديل الوضع الليلي"
                >
                    <i className={`fas ${isDark ? 'fa-sun text-warning' : 'fa-moon'}`}></i>
                </button>
            </div>

            <div className="container mt-4" style={{ maxWidth: 680 }}>
                <div className="card border-0 shadow-sm rounded-4 p-4">
                    <div className="text-center mb-4">
                        <div
                            className="mx-auto mb-3 rounded-circle d-flex align-items-center justify-content-center shadow-sm"
                            style={{
                                width: 76,
                                height: 76,
                                background: 'rgba(212, 175, 55, 0.12)',
                                border: '2px solid #D4AF37',
                            }}
                        >
                            <i className="fas fa-fingerprint fa-2x" style={{ color: '#D4AF37' }}></i>
                        </div>
                        <h4 className="fw-bold text-navy">فحص الموثوقية والتوقيع الرقمي</h4>
                        <p className="text-muted small fw-bold mb-0">
                            أدخل البصمة الرقمية للوثيقة (SHA-256 Hash) أو امسح رمز الـ QR المطبوع عليها للتأكد من صحتها
                        </p>
                    </div>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleVerify();
                        }}
                        className="mb-4"
                    >
                        <div className="input-group input-group-lg shadow-sm rounded-4 overflow-hidden">
                            <input
                                type="text"
                                className="form-control font-monospace text-start border-end-0"
                                dir="ltr"
                                placeholder="SHA-256 Hash (64 hex chars)..."
                                value={hashInput}
                                onChange={(e) => setHashInput(e.target.value)}
                                required
                            />
                            <button
                                type="submit"
                                className="btn fw-bold px-4"
                                style={{ background: '#0B132B', color: '#D4AF37' }}
                                disabled={loading}
                            >
                                {loading ? (
                                    <i className="fas fa-spinner fa-spin"></i>
                                ) : (
                                    <>
                                        <i className="fas fa-search me-1"></i> فحص
                                    </>
                                )}
                            </button>
                        </div>
                    </form>

                    {result && (
                        <div className="alert alert-success border-success border-2 rounded-4 p-4 fade-in">
                            <div className="d-flex align-items-center mb-3">
                                <i className="fas fa-check-circle fa-2x text-success me-3"></i>
                                <div>
                                    <h5 className="fw-bold text-success mb-0">وثيقة أصلية ومعتمدة رسمياً</h5>
                                    <small className="fw-bold text-muted">تم التحقق من التوقيع الرقمي وسلامة المستند</small>
                                </div>
                            </div>
                            <hr />
                            <div className="row g-3 small fw-bold">
                                <div className="col-sm-6">
                                    <span className="text-muted d-block">اسم الوثيقة:</span>
                                    <span className="text-dark fs-6">{result.file_name || '--'}</span>
                                </div>
                                <div className="col-sm-6">
                                    <span className="text-muted d-block">التصنيف:</span>
                                    <span className="text-dark fs-6">{result.file_category || 'مستند قانوني'}</span>
                                </div>
                                <div className="col-sm-6">
                                    <span className="text-muted d-block">المكتب المصدر:</span>
                                    <span className="text-dark">{result.firm_name || 'مكتب محاماة معتمد'}</span>
                                </div>
                                <div className="col-sm-6">
                                    <span className="text-muted d-block">تاريخ التوثيق:</span>
                                    <span className="text-dark font-monospace">
                                        {result.created_at
                                            ? new Date(result.created_at).toLocaleString('ar-JO')
                                            : '--'}
                                    </span>
                                </div>
                                <div className="col-12">
                                    <span className="text-muted d-block">البصمة الرقمية (SHA-256):</span>
                                    <code className="d-block p-2 bg-white rounded border text-break mt-1" dir="ltr">
                                        {result.signature_hash || hashInput}
                                    </code>
                                </div>
                            </div>
                        </div>
                    )}

                    {errorMsg && (
                        <div className="alert alert-danger border-danger border-2 rounded-4 p-4 text-center fade-in">
                            <i className="fas fa-times-circle fa-3x text-danger mb-2"></i>
                            <h5 className="fw-bold text-danger">تحذير: وثيقة غير موثقة</h5>
                            <p className="mb-0 fw-bold">{errorMsg}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
