/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/reports.js
 * الإصدار: V5.6 Enterprise Edition (Financial Analytics & HR Reporting Engine)
 * ============================================================================
 * الميزات والمهام:
 * 1. دعم كامل لوضع عدم الاتصال بالإنترنت (Offline Mode) واسترجاع البيانات المخزنة.
 * 2. فلترة زمنية دقيقة وديناميكية (اليوم، هذا الشهر، هذا العام، فترة مخصصة، شامل).
 * 3. تحليل مالي قطعي (إجمالي الأتعاب، المقبوضات الفعلية، عجز التحصيل، المصروفات).
 * 4. ربط العملة المعتمدة للمكتب ديناميكياً بجميع الرسوم البيانية والجداول (firm_settings).
 * 5. رسوم بيانية تفاعلية (Chart.js) متزامنة لحظياً مع الوضع الليلي فائق التباين (WCAG AAA).
 * 6. مصفوفة تقييم أداء المحامين والموظفين (HR Matrix) الذكية لفرز الكفاءة المالية والإجرائية.
 * 7. تصدير كشوف الحركات المالية التفصيلية مباشرة إلى ملفات CSV قياسية بترميز UTF-8.
 * ============================================================================
 */

// ============================================================================
// [1] المتغيرات العامة (State Management & Globals)
// ============================================================================
let rawCases = [];
let rawInstallments = [];
let rawExpenses = [];
let rawAppointments = [];
let rawClients = [];
let rawStaff = [];

// المتغيرات المفلترة الحالية (تُستخدم لغايات التصدير والتحليل)
let currentFilteredInstallments = [];
let currentFilteredExpenses = [];

// مراجع كائنات المخططات البيانية (Chart Instances)
let financeChartInstance = null;
let casesChartInstance = null;

// ============================================================================
// [2] دوال المساعدة والأمان (Security & Utility Helpers)
// ============================================================================

/**
 * تعقيم النصوص لمنع ثغرات الحقن (XSS Sanitization)
 */
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
};

/**
 * جلب العملة المعتمدة للمكتب ديناميكياً
 */
function getFirmCurrency() {
    try {
        const settings = JSON.parse(localStorage.getItem('firm_settings') || '{}');
        return settings.currency || settings.currency_code || 'د.أ';
    } catch (e) {
        return 'د.أ';
    }
}

/**
 * تحديث تسميات العملة في كامل الصفحة
 */
function updateCurrencyLabels() {
    const cur = getFirmCurrency();
    document.querySelectorAll('.currency-label').forEach(el => {
        el.textContent = cur;
    });
}

/**
 * تطبيق متغيرات هوية المكتب إن وجدت
 */
function applyFirmSettings() {
    const settings = JSON.parse(localStorage.getItem('firm_settings') || '{}');
    if (!settings) return;
    const root = document.documentElement;
    const isDark = root.getAttribute('data-theme') === 'dark';
    
    if (settings.primary_color && !isDark) {
        root.style.setProperty('--primary-navy', settings.primary_color);
        root.style.setProperty('--navy', settings.primary_color);
    }
    if (settings.accent_color) {
        root.style.setProperty('--gold-luxury', settings.accent_color);
        root.style.setProperty('--accent', settings.accent_color);
    }
    updateCurrencyLabels();
}

/**
 * حركة عداد تصاعدية للأرقام المالية (Smooth Counter Animation)
 */
function animateValue(id, end) {
    const obj = document.getElementById(id);
    if (!obj) return;
    const duration = 800;
    const start = 0;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start).toLocaleString('en-US');
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

/**
 * فحص مرن لإسناد المهام أو القضايا للموظف (سواء كان المخزن مصفوفة أو نصاً فردياً)
 */
function isEntityAssignedTo(field, staffId) {
    if (!field || !staffId) return false;
    if (Array.isArray(field)) {
        return field.some(val => val && val.toString() === staffId.toString());
    }
    return field.toString() === staffId.toString();
}

// ============================================================================
// [3] دورة حياة الصفحة والتهيئة (Lifecycle & Init)
// ============================================================================
window.onload = async () => {
    applyFirmSettings();

    // التحقق من صلاحية الجلسة
    const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // تعيين "هذا الشهر" كفلتر افتراضي عند الدخول
    const periodSelect = document.getElementById('filter_period');
    if (periodSelect) {
        periodSelect.value = 'this_month';
    }

    await fetchAllData();
    window.generateReports();
};

// ============================================================================
// [4] استدعاء البيانات المركزية عبر واجهة API (Data Fetching)
// ============================================================================
async function fetchAllData() {
    try {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'جاري تحميل السجلات والتحليلات...',
                html: '<div class="text-muted small">يرجى الانتظار بينما نقوم بمزامنة السجلات وتدقيق الأرقام المالية.</div>',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });
        }

        if (!navigator.onLine && typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'warning',
                title: 'وضع عدم الاتصال: يتم استخدام السجلات المحفوظة محلياً.',
                showConfirmButton: false,
                timer: 3500
            });
        }

        // جلب جميع الجداول بشكل متوازٍ لتقليص زمن الاستجابة (Parallel Network Request)
        const [casesRes, clientsRes, apptsRes, instRes, expRes, staffRes] = await Promise.all([
            API.getCases(),
            API.getClients(),
            API.getAppointments(),
            API.getInstallments(),
            API.getExpenses(),
            API.getStaff()
        ]);

        if (casesRes && casesRes.error && !Array.isArray(casesRes)) {
            throw new Error(casesRes.error);
        }

        rawCases = Array.isArray(casesRes) ? casesRes : [];
        rawClients = Array.isArray(clientsRes) ? clientsRes : [];
        rawAppointments = Array.isArray(apptsRes) ? apptsRes : [];
        rawInstallments = Array.isArray(instRes) ? instRes : [];
        rawExpenses = Array.isArray(expRes) ? expRes : [];
        rawStaff = Array.isArray(staffRes) ? staffRes : [];

        if (typeof Swal !== 'undefined') {
            Swal.close();
        }
    } catch (error) {
        if (typeof Swal !== 'undefined') {
            Swal.close();
            Swal.fire({
                icon: 'error',
                title: 'تعذر تحميل السجلات',
                text: 'حدث خطأ أثناء مزامنة البيانات المالية من السيرفر. تأكد من جودة الاتصال بالإنترنت.',
                confirmButtonText: 'حسناً'
            });
        }
        console.error("Error fetching report data:", error);
    }
}

// ============================================================================
// [5] محرك الفلترة الزمنية والحدود المنطقية (Time Filter Engine)
// ============================================================================

/**
 * إظهار أو إخفاء حقول التاريخ المخصص
 */
window.handlePeriodChange = function() {
    const periodInput = document.getElementById('filter_period');
    if (!periodInput) return;
    const period = periodInput.value;
    const customElements = document.querySelectorAll('.custom-date');
    
    if (period === 'custom') {
        customElements.forEach(el => el.classList.remove('d-none'));
    } else {
        customElements.forEach(el => el.classList.add('d-none'));
    }
};

/**
 * الدالة المركزية لتوليد وتحديث التقارير والإحصائيات
 */
window.generateReports = function() {
    const periodElem = document.getElementById('filter_period');
    const startElem = document.getElementById('filter_start');
    const endElem = document.getElementById('filter_end');

    const period = periodElem ? periodElem.value : 'all';
    const startStr = startElem ? startElem.value : '';
    const endStr = endElem ? endElem.value : '';

    let startDate = null;
    let endDate = null;
    const now = new Date();

    // ضبط الحدود الزمنية الدقيقة
    if (period === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (period === 'this_month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (period === 'this_year') {
        startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    } else if (period === 'custom') {
        if (startStr) {
            startDate = new Date(startStr);
            startDate.setHours(0, 0, 0, 0);
        }
        if (endStr) {
            endDate = new Date(endStr);
            endDate.setHours(23, 59, 59, 999);
        }
    }

    // دالة التحقق من نطاق التاريخ
    const isDateInRange = (dateStr) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
        return true;
    };

    // تطبيق الفلتر على المصفوفات
    const filteredCases = period === 'all' ? rawCases : rawCases.filter(c => isDateInRange(c.created_at));
    const filteredClients = period === 'all' ? rawClients : rawClients.filter(c => isDateInRange(c.created_at));
    const filteredAppts = period === 'all' ? rawAppointments : rawAppointments.filter(a => isDateInRange(a.appt_date || a.created_at));
    
    // الأقساط والمصروفات تعتمد على تاريخ الدفع الفعلي أو الاستحقاق
    currentFilteredInstallments = period === 'all' ? rawInstallments : rawInstallments.filter(i => isDateInRange(i.paid_date || i.due_date || i.created_at));
    currentFilteredExpenses = period === 'all' ? rawExpenses : rawExpenses.filter(e => isDateInRange(e.expense_date || e.created_at));

    // تحديث كافة مكونات الواجهة
    updateCurrencyLabels();
    calculateKPIs(filteredCases, filteredClients, filteredAppts, currentFilteredInstallments, currentFilteredExpenses);
    updateCharts(filteredCases, currentFilteredInstallments, currentFilteredExpenses);
    updateStaffPerformance(filteredCases, filteredAppts, currentFilteredInstallments);
    updateTransactionsTable(currentFilteredInstallments, currentFilteredExpenses);
};

// ============================================================================
// [6] احتساب مؤشرات الأداء والعدادات (KPIs Calculation)
// ============================================================================
function calculateKPIs(cases, clients, appts, installments, expenses) {
    // إجمالي الأتعاب المقدرة في القضايا الجديدة ضمن الفترة
    const totalAgreed = cases.reduce((sum, c) => sum + (Number(c.total_agreed_fees) || 0), 0);
    
    // إجمالي المقبوضات الفعلية (التحصيلات)
    const totalPaid = installments
        .filter(i => i.status === 'مدفوعة' || i.status === 'paid')
        .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
        
    // إجمالي المصروفات التشغيلية والقضائية
    const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    
    // عجز التحصيل أو الرصيد المتبقي بذمة الموكلين
    const totalRem = Math.max(0, totalAgreed - totalPaid);

    // تفعيل العدادات
    animateValue('kpi-total-agreed', totalAgreed);
    animateValue('kpi-total-paid', totalPaid);
    animateValue('kpi-total-exp', totalExpenses);
    animateValue('kpi-total-rem', totalRem);
    
    animateValue('kpi-cases-count', cases.length);
    animateValue('kpi-clients-count', clients.length);
    animateValue('kpi-appts-count', appts.length);
}

// ============================================================================
// [7] المخططات البيانية الذكية (Chart.js V5.6 Integration)
// ============================================================================
function updateCharts(cases, installments, expenses) {
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const currency = getFirmCurrency();

    // ألوان الهوية الملكية V5.6
    const primaryColor = isDarkMode ? '#1C2541' : '#0B132B';
    const accentGold = '#D4AF37';
    const successColor = isDarkMode ? '#22C55E' : '#1F7A5C';
    const dangerColor = isDarkMode ? '#EF4444' : '#B3372F';
    const warningColor = '#D97706';
    const mutedColor = isDarkMode ? '#64748B' : '#94A3B8';
    const textColor = isDarkMode ? '#F8FAFC' : '#1E293B';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(11, 19, 43, 0.06)';

    const totalAgreed = cases.reduce((sum, c) => sum + (Number(c.total_agreed_fees) || 0), 0);
    const totalPaid = installments
        .filter(i => i.status === 'مدفوعة' || i.status === 'paid')
        .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // 1. مخطط التدفق المالي (Financial Flow Bar Chart)
    const financeCtx = document.getElementById('financeChart');
    if (financeCtx) {
        if (financeChartInstance) {
            financeChartInstance.destroy();
        }

        financeChartInstance = new Chart(financeCtx, {
            type: 'bar',
            data: {
                labels: ['إجمالي الأتعاب', 'التحصيلات الفعلية', 'المصروفات المدفوعة'],
                datasets: [{
                    label: `المبلغ (${currency})`,
                    data: [totalAgreed, totalPaid, totalExpenses],
                    backgroundColor: [primaryColor, successColor, dangerColor],
                    borderColor: [accentGold, successColor, dangerColor],
                    borderWidth: 1,
                    borderRadius: 10,
                    barThickness: window.innerWidth < 768 ? 22 : 44
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        rtl: true,
                        callbacks: {
                            label: function(context) {
                                return ` ${context.parsed.y.toLocaleString('en-US')} ${currency}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: textColor,
                            callback: function(val) {
                                return val.toLocaleString('en-US');
                            },
                            font: { family: 'Cairo', weight: 'bold' }
                        },
                        grid: { color: gridColor }
                    },
                    x: {
                        ticks: {
                            color: textColor,
                            font: { family: 'Cairo', weight: 'bold', size: 12 }
                        },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // 2. مخطط توزيع حالات القضايا (Cases Status Doughnut Chart)
    const activeCases = cases.filter(c => c.status === 'نشطة' || c.status === 'active').length;
    const completedCases = cases.filter(c => c.status === 'مكتملة' || c.status === 'مغلقة' || c.status === 'closed').length;
    const appealCases = cases.filter(c => c.status === 'استئناف' || c.status === 'تمييز' || c.status === 'pending').length;

    const casesCtx = document.getElementById('casesChart');
    if (casesCtx) {
        if (casesChartInstance) {
            casesChartInstance.destroy();
        }

        casesChartInstance = new Chart(casesCtx, {
            type: 'doughnut',
            data: {
                labels: ['قضايا نشطة', 'مكتملة / مغلقة', 'استئناف / أخرى'],
                datasets: [{
                    data: [activeCases, completedCases, appealCases],
                    backgroundColor: [successColor, mutedColor, warningColor],
                    borderColor: isDarkMode ? '#111A33' : '#FFFFFF',
                    borderWidth: 2,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: textColor,
                            font: { family: 'Cairo', size: 12, weight: 'bold' },
                            usePointStyle: true,
                            padding: 16
                        }
                    }
                }
            }
        });
    }
}

// ============================================================================
// [8] مصفوفة تقييم أداء المحامين والموظفين (HR Performance Matrix)
// ============================================================================
function updateStaffPerformance(cases, appts, installments) {
    const tbody = document.getElementById('staff-performance-tbody');
    if (!tbody) return;

    if (!rawStaff || rawStaff.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-5 text-muted fw-bold text-center">لا توجد بيانات موظفين مسجلة في النظام.</td></tr>`;
        return;
    }

    const currency = getFirmCurrency();
    let performanceData = [];

    rawStaff.forEach(staff => {
        // حصر القضايا المسندة للمحامي
        const assignedCases = cases.filter(c => isEntityAssignedTo(c.assigned_lawyer_id, staff.id));
        const activeCases = assignedCases.filter(c => c.status === 'نشطة' || c.status === 'active').length;
        const completedCases = assignedCases.filter(c => c.status === 'مكتملة' || c.status === 'مغلقة' || c.status === 'closed').length;

        // حصر المهام والجلسات المنفذة
        const assignedAppts = appts.filter(a => isEntityAssignedTo(a.assigned_to, staff.id));
        const completedAppts = assignedAppts.filter(a => a.status === 'تم' || a.status === 'منجزة' || a.status === 'completed').length;

        // حصر التحصيلات المالية للمحامي
        const caseIds = assignedCases.map(c => c.id);
        const collections = installments
            .filter(i => (i.status === 'مدفوعة' || i.status === 'paid') && caseIds.includes(i.case_id))
            .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

        performanceData.push({
            name: staff.full_name || staff.name || 'موظف غير محدد',
            totalCases: assignedCases.length,
            activeCases: activeCases,
            completedCases: completedCases,
            completedAppts: completedAppts,
            collections: collections
        });
    });

    // الترتيب: الأفضل أداءً في التحصيل المالي، ثم بعدد القضايا المنجزة
    performanceData.sort((a, b) => b.collections - a.collections || b.completedCases - a.completedCases);

    if (performanceData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-5 text-muted fw-bold text-center">لا توجد نشاطات مسندة خلال هذه الفترة.</td></tr>`;
        return;
    }

    tbody.innerHTML = performanceData.map(p => `
        <tr class="align-middle">
            <td class="fw-bold text-navy text-start ps-3 text-truncate" style="max-width: 160px;" title="${escapeHTML(p.name)}">
                <div class="d-flex align-items-center gap-2">
                    <div class="rounded-circle d-flex justify-content-center align-items-center bg-warning bg-opacity-10 text-warning shadow-sm" style="width: 32px; height: 32px;">
                        <i class="fas fa-user-tie"></i>
                    </div>
                    <span class="fw-bold">${escapeHTML(p.name)}</span>
                </div>
            </td>
            <td class="fw-bold font-monospace">${p.totalCases}</td>
            <td class="text-warning fw-bold font-monospace">${p.activeCases}</td>
            <td class="text-success fw-bold font-monospace">${p.completedCases}</td>
            <td class="text-info fw-bold font-monospace">${p.completedAppts}</td>
            <td class="fw-bold text-success font-monospace fs-6">
                ${p.collections.toLocaleString('en-US')} 
                <small class="text-muted fw-normal" style="font-size: 0.75rem;">${currency}</small>
            </td>
        </tr>
    `).join('');
}

// ============================================================================
// [9] جدول الحركات المالية وتصدير البيانات (Transactions Table & CSV)
// ============================================================================
function updateTransactionsTable(installments, expenses) {
    const tbody = document.getElementById('recent-transactions-tbody');
    if (!tbody) return;

    let transactions = [];
    const currency = getFirmCurrency();

    // 1. معالجة المقبوضات
    installments.forEach(i => {
        const caseObj = rawCases.find(c => c.id === i.case_id);
        const caseIdStr = caseObj ? (caseObj.case_internal_id || caseObj.case_number || 'ملف رقم ' + caseObj.id) : 'عام';
        transactions.push({
            date: new Date(i.paid_date || i.due_date || i.created_at),
            type: 'مقبوضات (أتعاب)',
            amount: Number(i.amount) || 0,
            description: `دفعة مالية للقضية: ${caseIdStr}`,
            status: (i.status === 'مدفوعة' || i.status === 'paid') ? 'مقبوضة' : 'مستحقة',
            statusColor: (i.status === 'مدفوعة' || i.status === 'paid') ? 'success' : 'warning',
            typeColor: 'success'
        });
    });

    // 2. معالجة المصروفات
    expenses.forEach(e => {
        const caseObj = rawCases.find(c => c.id === e.case_id);
        const caseIdStr = caseObj ? ` [ملف: ${caseObj.case_internal_id || caseObj.case_number}]` : '';
        transactions.push({
            date: new Date(e.expense_date || e.created_at),
            type: 'مدفوعات (مصروف)',
            amount: Number(e.amount) || 0,
            description: (e.description || 'مصروف قضائي أو إداري') + caseIdStr,
            status: 'مصروف معتمد',
            statusColor: 'danger',
            typeColor: 'danger'
        });
    });

    // ترتيب الحركات زمنياً من الأحدث إلى الأقدم
    transactions.sort((a, b) => b.date - a.date);

    // عرض أحدث 25 حركة فقط لتسريع التصفح
    const recentTx = transactions.slice(0, 25);

    if (recentTx.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-5 text-muted fw-bold text-center">لا توجد حركات مالية (قبض أو صرف) مسجلة في هذا النطاق الزمني.</td></tr>`;
        return;
    }

    tbody.innerHTML = recentTx.map(tx => {
        const dateStr = !isNaN(tx.date.getTime()) ? tx.date.toLocaleDateString('ar-EG') : 'غير محدد';
        return `
            <tr class="align-middle">
                <td class="fw-bold text-muted font-monospace" style="font-size: 0.85rem;">${dateStr}</td>
                <td><span class="badge bg-${tx.typeColor} bg-opacity-10 text-${tx.typeColor} border border-${tx.typeColor} border-opacity-25 px-3 py-1 rounded-pill">${tx.type}</span></td>
                <td class="fw-bold text-${tx.typeColor} font-monospace fs-6">${tx.amount.toLocaleString('en-US')} <small class="text-muted" style="font-size: 0.75rem;">${currency}</small></td>
                <td class="text-truncate text-start fw-bold" style="max-width: 260px; font-size: 0.85rem;" title="${escapeHTML(tx.description)}">${escapeHTML(tx.description)}</td>
                <td><span class="badge bg-${tx.statusColor} bg-opacity-10 text-${tx.statusColor} border border-${tx.statusColor} border-opacity-25 px-3 py-1 rounded-pill">${tx.status}</span></td>
            </tr>
        `;
    }).join('');
}

/**
 * تصدير كافة الحركات المالية المفلترة إلى ملف CSV قياسي بترميز UTF-8
 */
window.downloadTransactionsCSV = function() {
    let allFiltered = [];
    const currency = getFirmCurrency();

    // دمج كافة المقبوضات المفلترة
    currentFilteredInstallments.forEach(i => {
        const caseObj = rawCases.find(c => c.id === i.case_id);
        const caseIdStr = caseObj ? (caseObj.case_internal_id || caseObj.case_number || 'ملف رقم ' + caseObj.id) : 'عام';
        allFiltered.push({
            date: new Date(i.paid_date || i.due_date || i.created_at),
            type: 'مقبوضات أتعاب',
            amount: Number(i.amount) || 0,
            desc: `دفعة مالية للقضية: ${caseIdStr}`,
            status: (i.status === 'مدفوعة' || i.status === 'paid') ? 'مقبوضة' : 'مستحقة'
        });
    });

    // دمج كافة المصروفات المفلترة
    currentFilteredExpenses.forEach(e => {
        const caseObj = rawCases.find(c => c.id === e.case_id);
        const caseIdStr = caseObj ? ` [ملف: ${caseObj.case_internal_id || caseObj.case_number}]` : '';
        allFiltered.push({
            date: new Date(e.expense_date || e.created_at),
            type: 'مدفوعات ومصروفات',
            amount: Number(e.amount) || 0,
            desc: (e.description || 'مصروف') + caseIdStr,
            status: 'مصروف معتمد'
        });
    });

    if (allFiltered.length === 0) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'info',
                title: 'لا توجد حركات مالية متاحة للتصدير ضمن الفترة المحددة.',
                showConfirmButton: false,
                timer: 3000
            });
        }
        return;
    }

    // ترتيب السجلات زمنياً
    allFiltered.sort((a, b) => b.date - a.date);

    // بناء محتوى CSV بترميز UTF-8 مع BOM لدعم Excel العربي
    let csv = "\uFEFFالتاريخ,نوع الحركة,المبلغ,العملة,البيان / تفاصيل الحركة,الحالة\n";
    allFiltered.forEach(row => {
        const dStr = !isNaN(row.date.getTime()) ? row.date.toISOString().slice(0, 10) : '';
        const cleanDesc = (row.desc || '').replace(/"/g, '""');
        csv += `"${dStr}","${row.type}","${row.amount}","${currency}","${cleanDesc}","${row.status}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `كشف_حركات_مالية_موكّل_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (typeof Swal !== 'undefined') {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'تم تصدير كشف الحسابات المالية (CSV) بنجاح!',
            showConfirmButton: false,
            timer: 2500
        });
    }
};

/**
 * طباعة التقرير الشامل
 */
window.printReport = function() {
    window.print();
};
