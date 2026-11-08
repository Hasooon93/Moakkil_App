/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/features/reports/ReportsPage.tsx
 * الوصف: العقل المدبر للتقارير، الرسوم البيانية (Chart.js)، وتقييم الأداء المالي والإداري
 * مطابق 100% لملف reports.html + js/reports.js
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { MoakkilAPI } from '../../services/moakkilApi.service';
import { useTheme } from '../../context/ThemeContext';
import { BottomNav } from '../../components/layout/BottomNav';

export const ReportsPage: React.FC = () => {
    const navigate = useNavigate();
    const { isDark, toggleDarkMode } = useTheme();

    const [rawCases, setRawCases] = useState<any[]>([]);
    const [rawClients, setRawClients] = useState<any[]>([]);
    const [rawAppointments, setRawAppointments] = useState<any[]>([]);
    const [rawInstallments, setRawInstallments] = useState<any[]>([]);
    const [rawExpenses, setRawExpenses] = useState<any[]>([]);
    const [rawStaff, setRawStaff] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // الفلتر الزمني
    const [period, setPeriod] = useState<'all' | 'today' | 'this_month' | 'this_year' | 'custom'>('this_month');
    const [startDateStr, setStartDateStr] = useState('');
    const [endDateStr, setEndDateStr] = useState('');

    // مراجع الرسوم البيانية (Chart.js)
    const financeCanvasRef = useRef<HTMLCanvasElement>(null);
    const casesCanvasRef = useRef<HTMLCanvasElement>(null);
    const financeChartRef = useRef<any>(null);
    const casesChartRef = useRef<any>(null);

    const fetchAllData = useCallback(async () => {
        setLoading(true);
        try {
            const [casesRes, clientsRes, apptsRes, instRes, expRes, staffRes] = await Promise.all([
                MoakkilAPI.getCases(),
                MoakkilAPI.getClients(),
                MoakkilAPI.getAppointments(),
                MoakkilAPI.getInstallments(),
                MoakkilAPI.getExpenses(),
                MoakkilAPI.getStaff(),
            ]);

            setRawCases(Array.isArray(casesRes) ? casesRes : []);
            setRawClients(Array.isArray(clientsRes) ? clientsRes : []);
            setRawAppointments(Array.isArray(apptsRes) ? apptsRes : []);
            setRawInstallments(Array.isArray(instRes) ? instRes : []);
            setRawExpenses(Array.isArray(expRes) ? expRes : []);
            setRawStaff(Array.isArray(staffRes) ? staffRes : []);
        } catch (err) {
            console.error('Error fetching report data:', err);
            Swal.fire('تنبيه', 'تعذر تحميل أحدث البيانات من السيرفر.', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    // حساب النطاق الزمني
    const getFilteredData = useCallback(() => {
        let startDate: Date | null = null;
        let endDate: Date | null = null;
        const now = new Date();

        if (period === 'today') {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        } else if (period === 'this_month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        } else if (period === 'this_year') {
            startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
            endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        } else if (period === 'custom') {
            if (startDateStr) {
                startDate = new Date(startDateStr);
                startDate.setHours(0, 0, 0, 0);
            }
            if (endDateStr) {
                endDate = new Date(endDateStr);
                endDate.setHours(23, 59, 59, 999);
            }
        }

        const isDateInRange = (dateStr?: string) => {
            if (period === 'all') return true;
            if (!dateStr) return false;
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return false;
            if (startDate && d < startDate) return false;
            if (endDate && d > endDate) return false;
            return true;
        };

        return {
            cases: rawCases.filter((c) => isDateInRange(c.created_at)),
            clients: rawClients.filter((c) => isDateInRange(c.created_at)),
            appts: rawAppointments.filter((a) => isDateInRange(a.appt_date)),
            installments: rawInstallments.filter((i) =>
                isDateInRange(i.paid_date || i.due_date || i.created_at)
            ),
            expenses: rawExpenses.filter((e) => isDateInRange(e.expense_date || e.created_at)),
        };
    }, [period, startDateStr, endDateStr, rawCases, rawClients, rawAppointments, rawInstallments, rawExpenses]);

    const filtered = getFilteredData();

    const totalAgreed = filtered.cases.reduce((sum, c) => sum + (Number(c.total_agreed_fees) || 0), 0);
    const totalPaid = filtered.installments
        .filter((i) => i.status === 'مدفوعة')
        .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const totalExpenses = filtered.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalRem = Math.max(0, totalAgreed - totalPaid);

    // تحديث الرسوم البيانية (Chart.js)
    useEffect(() => {
        const Chart = (window as any).Chart;
        if (!Chart) return;

        const textColor = isDark ? '#94a3b8' : '#6C757D';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(163, 174, 208, 0.1)';
        const primaryColor = '#0B132B';
        const successColor = '#01B574';
        const dangerColor = '#EE5D50';
        const warningColor = '#FFCE20';
        const mutedColor = '#A3AED0';

        if (financeCanvasRef.current) {
            if (financeChartRef.current) financeChartRef.current.destroy();
            financeChartRef.current = new Chart(financeCanvasRef.current, {
                type: 'bar',
                data: {
                    labels: ['إجمالي الأتعاب', 'التحصيلات الفعلية', 'المصروفات المدفوعة'],
                    datasets: [
                        {
                            label: 'المبلغ (د.أ)',
                            data: [totalAgreed, totalPaid, totalExpenses],
                            backgroundColor: [primaryColor, successColor, dangerColor],
                            borderRadius: 8,
                            barThickness: window.innerWidth < 768 ? 24 : 42,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { color: textColor, font: { family: 'Cairo' } },
                            grid: { color: gridColor },
                        },
                        x: {
                            ticks: { color: textColor, font: { family: 'Cairo', weight: 'bold' } },
                            grid: { display: false },
                        },
                    },
                },
            });
        }

        if (casesCanvasRef.current) {
            if (casesChartRef.current) casesChartRef.current.destroy();
            const activeCases = filtered.cases.filter((c) => c.status === 'نشطة').length;
            const completedCases = filtered.cases.filter(
                (c) => c.status === 'مكتملة' || c.status === 'مغلقة'
            ).length;
            const appealCases = filtered.cases.filter(
                (c) => c.status === 'استئناف' || c.status === 'تمييز'
            ).length;

            casesChartRef.current = new Chart(casesCanvasRef.current, {
                type: 'doughnut',
                data: {
                    labels: ['نشطة', 'مكتملة/مغلقة', 'استئناف/تمييز'],
                    datasets: [
                        {
                            data: [activeCases, completedCases, appealCases],
                            backgroundColor: [successColor, mutedColor, warningColor],
                            borderWidth: 0,
                            hoverOffset: 6,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '68%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: textColor,
                                font: { family: 'Cairo', size: 13, weight: 'bold' },
                                usePointStyle: true,
                                padding: 20,
                            },
                        },
                    },
                },
            });
        }

        return () => {
            if (financeChartRef.current) financeChartRef.current.destroy();
            if (casesChartRef.current) casesChartRef.current.destroy();
        };
    }, [filtered.cases, totalAgreed, totalPaid, totalExpenses, isDark]);

    // مصفوفة تقييم أداء المحامين
    const staffPerformance = rawStaff
        .map((staff) => {
            const assignedCases = filtered.cases.filter(
                (c) => Array.isArray(c.assigned_lawyer_id) && c.assigned_lawyer_id.includes(staff.id)
            );
            const activeCases = assignedCases.filter((c) => c.status === 'نشطة').length;
            const completedCases = assignedCases.filter(
                (c) => c.status === 'مكتملة' || c.status === 'مغلقة'
            ).length;
            const assignedAppts = filtered.appts.filter(
                (a) => Array.isArray(a.assigned_to) && a.assigned_to.includes(staff.id)
            );
            const completedAppts = assignedAppts.filter(
                (a) => a.status === 'تم' || a.status === 'منجزة' || a.status === 'منجز'
            ).length;
            const caseIds = assignedCases.map((c) => c.id);
            const collections = filtered.installments
                .filter((i) => i.status === 'مدفوعة' && caseIds.includes(i.case_id))
                .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

            return {
                id: staff.id,
                name: staff.full_name,
                totalCases: assignedCases.length,
                activeCases,
                completedCases,
                completedAppts,
                collections,
            };
        })
        .sort((a, b) => b.collections - a.collections || b.completedCases - a.completedCases);

    // جدول الحركات المالية التفصيلية
    const recentTransactions = [
        ...filtered.installments.map((i) => {
            const caseObj = rawCases.find((c) => c.id === i.case_id);
            return {
                id: 'inst_' + i.id,
                date: new Date(i.paid_date || i.due_date || i.created_at),
                type: 'مقبوضات (أتعاب)',
                amount: Number(i.amount) || 0,
                description: `دفعة مالية لملف رقم: ${caseObj ? caseObj.case_internal_id : 'غير محدد'}`,
                status: i.status === 'مدفوعة' ? 'مكتمل' : 'مستحق',
                statusColor: i.status === 'مدفوعة' ? 'success' : 'warning',
                typeColor: 'success',
            };
        }),
        ...filtered.expenses.map((e) => {
            const caseObj = rawCases.find((c) => c.id === e.case_id);
            return {
                id: 'exp_' + e.id,
                date: new Date(e.expense_date || e.created_at),
                type: 'مدفوعات (مصروف)',
                amount: Number(e.amount) || 0,
                description: (e.description || '') + (caseObj ? ` - ملف رقم: ${caseObj.case_internal_id}` : ''),
                status: 'مصروف رسمي',
                statusColor: 'danger',
                typeColor: 'danger',
            };
        }),
    ]
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 20);

    return (
        <div className="min-vh-100 pb-5 mb-5">
            <header className="top-nav px-3 py-3 d-flex align-items-center justify-content-between d-print-none">
                <button
                    className="btn btn-link text-white p-0 text-decoration-none me-3"
                    onClick={() => navigate('/app.html')}
                >
                    <i className="fas fa-arrow-right fs-4"></i>
                </button>
                <h5 className="mb-0 fw-bold text-white">
                    <i className="fas fa-chart-line me-2" style={{ color: '#D4AF37' }}></i> التقارير والمالية
                </h5>
                <div className="d-flex align-items-center gap-2">
                    <button
                        className="btn btn-sm btn-outline-light text-white fw-bold rounded-3 px-3 shadow-sm"
                        onClick={toggleDarkMode}
                        title="تبديل الوضع الليلي"
                    >
                        <i className={`fas ${isDark ? 'fa-sun text-warning' : 'fa-moon'}`}></i>
                    </button>
                    <button
                        className="btn btn-sm text-white fw-bold shadow-sm"
                        style={{
                            background: 'rgba(255,255,255,0.15)',
                            borderRadius: 10,
                            border: '1px solid rgba(255,255,255,0.2)',
                        }}
                        onClick={() => window.print()}
                        title="طباعة التقرير"
                    >
                        <i className="fas fa-print me-1"></i> طباعة
                    </button>
                </div>
            </header>

            <main className="container mt-4 fade-in">
                {/* قسم الفلترة الزمنية */}
                <section
                    className="card border-0 shadow-sm rounded-4 mb-4 border-top border-4 d-print-none p-4"
                    style={{ borderTopColor: '#D4AF37' }}
                >
                    <h6 className="fw-bold mb-3 text-navy">
                        <i className="fas fa-filter me-2" style={{ color: '#D4AF37' }}></i> تصفية البيانات حسب التاريخ
                    </h6>
                    <div className="row g-3 align-items-end">
                        <div className="col-md-3 col-12">
                            <label className="form-label fw-bold small">الفترة الزمنية</label>
                            <select
                                className="form-select fw-bold"
                                value={period}
                                onChange={(e) => setPeriod(e.target.value as any)}
                            >
                                <option value="all">كل الأوقات (شامل)</option>
                                <option value="today">اليوم</option>
                                <option value="this_month">هذا الشهر</option>
                                <option value="this_year">هذا العام</option>
                                <option value="custom">تحديد فترة (مخصص)</option>
                            </select>
                        </div>
                        {period === 'custom' && (
                            <>
                                <div className="col-md-3 col-6">
                                    <label className="form-label fw-bold small">من تاريخ</label>
                                    <input
                                        type="date"
                                        className="form-control"
                                        value={startDateStr}
                                        onChange={(e) => setStartDateStr(e.target.value)}
                                    />
                                </div>
                                <div className="col-md-3 col-6">
                                    <label className="form-label fw-bold small">إلى تاريخ</label>
                                    <input
                                        type="date"
                                        className="form-control"
                                        value={endDateStr}
                                        onChange={(e) => setEndDateStr(e.target.value)}
                                    />
                                </div>
                            </>
                        )}
                        <div className="col-md-3 col-12 ms-auto">
                            <button className="btn btn-gold w-100 fw-bold py-2" onClick={fetchAllData}>
                                <i className={`fas fa-sync-alt me-2 ${loading ? 'fa-spin' : ''}`}></i> تحديث البيانات
                            </button>
                        </div>
                    </div>
                </section>

                {/* بطاقات المؤشرات المالية (KPIs) */}
                <section className="row g-3 mb-4">
                    <div className="col-6 col-md-3">
                        <div
                            className="p-4 rounded-4 text-white h-100 position-relative overflow-hidden shadow-sm"
                            style={{ background: 'linear-gradient(135deg, #1C2541, #0B132B)' }}
                        >
                            <p className="mb-2 small fw-bold text-white-50">الأتعاب (القضايا الجديدة)</p>
                            <h3 className="fw-bold mb-0 font-monospace">
                                {totalAgreed.toLocaleString('en-US')}{' '}
                                <small className="fs-6 fw-normal opacity-75">د.أ</small>
                            </h3>
                        </div>
                    </div>
                    <div className="col-6 col-md-3">
                        <div
                            className="p-4 rounded-4 text-white h-100 position-relative overflow-hidden shadow-sm"
                            style={{ background: 'linear-gradient(135deg, #059669, #064e3b)' }}
                        >
                            <p className="mb-2 small fw-bold text-white-50">المقبوضات (التحصيلات)</p>
                            <h3 className="fw-bold mb-0 font-monospace">
                                {totalPaid.toLocaleString('en-US')}{' '}
                                <small className="fs-6 fw-normal opacity-75">د.أ</small>
                            </h3>
                        </div>
                    </div>
                    <div className="col-6 col-md-3">
                        <div
                            className="p-4 rounded-4 text-white h-100 position-relative overflow-hidden shadow-sm"
                            style={{ background: 'linear-gradient(135deg, #d97706, #78350f)' }}
                        >
                            <p className="mb-2 small fw-bold text-white-50">عجز التحصيل (المتبقي)</p>
                            <h3 className="fw-bold mb-0 font-monospace">
                                {totalRem.toLocaleString('en-US')}{' '}
                                <small className="fs-6 fw-normal opacity-75">د.أ</small>
                            </h3>
                        </div>
                    </div>
                    <div className="col-6 col-md-3">
                        <div
                            className="p-4 rounded-4 text-white h-100 position-relative overflow-hidden shadow-sm"
                            style={{ background: 'linear-gradient(135deg, #dc2626, #7f1d1d)' }}
                        >
                            <p className="mb-2 small fw-bold text-white-50">المدفوعات (المصروفات)</p>
                            <h3 className="fw-bold mb-0 font-monospace">
                                {totalExpenses.toLocaleString('en-US')}{' '}
                                <small className="fs-6 fw-normal opacity-75">د.أ</small>
                            </h3>
                        </div>
                    </div>
                </section>

                {/* بطاقات الإحصائيات المصغرة */}
                <section className="row g-3 mb-4">
                    <div className="col-4">
                        <div className="card border-0 shadow-sm rounded-4 p-3 text-center h-100">
                            <h2 className="fw-bold mb-1 text-navy font-monospace">{filtered.cases.length}</h2>
                            <small className="text-muted fw-bold">
                                <i className="fas fa-gavel me-1" style={{ color: '#D4AF37' }}></i> قضايا مسجلة
                            </small>
                        </div>
                    </div>
                    <div className="col-4">
                        <div className="card border-0 shadow-sm rounded-4 p-3 text-center h-100">
                            <h2 className="text-success fw-bold mb-1 font-monospace">{filtered.clients.length}</h2>
                            <small className="text-muted fw-bold">
                                <i className="fas fa-users me-1 text-success"></i> موكلين جدد
                            </small>
                        </div>
                    </div>
                    <div className="col-4">
                        <div className="card border-0 shadow-sm rounded-4 p-3 text-center h-100">
                            <h2 className="text-warning fw-bold mb-1 font-monospace">{filtered.appts.length}</h2>
                            <small className="text-muted fw-bold">
                                <i className="fas fa-calendar-check me-1 text-warning"></i> مهام وجلسات
                            </small>
                        </div>
                    </div>
                </section>

                {/* الرسوم البيانية */}
                <section className="row mb-4">
                    <div className="col-md-8">
                        <div className="card border-0 shadow-sm rounded-4 p-4 h-100">
                            <h6 className="fw-bold mb-4 text-navy">
                                <i className="fas fa-chart-bar me-2" style={{ color: '#D4AF37' }}></i> التدفق المالي للفترة المحددة
                            </h6>
                            <div style={{ height: 300, width: '100%', position: 'relative' }}>
                                <canvas ref={financeCanvasRef}></canvas>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4 mt-4 mt-md-0">
                        <div className="card border-0 shadow-sm rounded-4 p-4 h-100">
                            <h6 className="fw-bold mb-4 text-navy">
                                <i className="fas fa-chart-pie me-2 text-primary"></i> حالة القضايا (ضمن الفترة)
                            </h6>
                            <div style={{ height: 300, width: '100%', position: 'relative' }}>
                                <canvas ref={casesCanvasRef}></canvas>
                            </div>
                        </div>
                    </div>
                </section>

                {/* جدول أداء المحامين */}
                <section className="mb-5">
                    <h5 className="fw-bold mb-3 text-navy">
                        <i className="fas fa-user-tie text-success me-2"></i> تقرير أداء المحامين والموظفين
                    </h5>
                    <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
                        <div className="table-responsive">
                            <table className="table table-hover mb-0 text-center align-middle">
                                <thead className="table-dark">
                                    <tr>
                                        <th className="text-start ps-4">المحامي / الموظف</th>
                                        <th>قضايا مسندة</th>
                                        <th>قضايا نشطة</th>
                                        <th>قضايا منجزة</th>
                                        <th>مهام أُنجزت</th>
                                        <th>تحصيلات ماليّة (د.أ)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {staffPerformance.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="py-4 text-muted fw-bold">
                                                لا يوجد موظفين مسجلين في النظام.
                                            </td>
                                        </tr>
                                    ) : (
                                        staffPerformance.map((p) => (
                                            <tr key={p.id}>
                                                <td className="fw-bold text-navy text-start ps-4">{p.name}</td>
                                                <td className="fw-bold font-monospace">{p.totalCases}</td>
                                                <td className="text-warning fw-bold font-monospace">{p.activeCases}</td>
                                                <td className="text-success fw-bold font-monospace">
                                                    {p.completedCases}
                                                </td>
                                                <td className="text-info fw-bold font-monospace">{p.completedAppts}</td>
                                                <td className="fw-bold text-success font-monospace">
                                                    {p.collections.toLocaleString('en-US')} د.أ
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                {/* جدول الحركات المالية التفصيلية */}
                <section className="mb-5">
                    <h5 className="fw-bold mb-3 text-navy">
                        <i className="fas fa-history text-danger me-2"></i> الحركات المالية التفصيلية (ضمن الفترة)
                    </h5>
                    <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
                        <div className="table-responsive">
                            <table className="table table-hover mb-0 text-center align-middle">
                                <thead className="table-dark">
                                    <tr>
                                        <th className="ps-4">التاريخ</th>
                                        <th>نوع الحركة</th>
                                        <th>المبلغ (د.أ)</th>
                                        <th className="text-start">البيان / القضية</th>
                                        <th>الحالة</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentTransactions.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="py-4 text-muted fw-bold">
                                                لا توجد حركات مالية (قبض/صرف) مسجلة في هذه الفترة.
                                            </td>
                                        </tr>
                                    ) : (
                                        recentTransactions.map((tx) => (
                                            <tr key={tx.id}>
                                                <td className="fw-bold text-muted font-monospace small">
                                                    {tx.date.toLocaleDateString('ar-EG')}
                                                </td>
                                                <td>
                                                    <span
                                                        className={`badge bg-${tx.typeColor} bg-opacity-10 text-${tx.typeColor} border border-${tx.typeColor} border-opacity-25 px-3 py-1 rounded-pill`}
                                                    >
                                                        {tx.type}
                                                    </span>
                                                </td>
                                                <td className={`fw-bold text-${tx.typeColor} font-monospace`}>
                                                    {tx.amount.toLocaleString('en-US')}
                                                </td>
                                                <td className="text-start fw-bold text-navy small">
                                                    {tx.description}
                                                </td>
                                                <td>
                                                    <span
                                                        className={`badge bg-${tx.statusColor} bg-opacity-10 text-${tx.statusColor} border border-${tx.statusColor} border-opacity-25 px-3 py-1 rounded-pill`}
                                                    >
                                                        {tx.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            </main>

            <BottomNav activeTab="tools" />
        </div>
    );
};
