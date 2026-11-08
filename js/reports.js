/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/reports.js
 * الوصف: العقل المدبر للتقارير، الرسوم البيانية، وتقييم الأداء المالي والإداري.
 * التصميم: متوافق 100% مع الهوية الناعمة والمدمجة (Soft & Compact UI).
 * الميزات:
 * 1. دعم كامل لوضع عدم الاتصال (Offline Mode).
 * 2. فلترة زمنية ديناميكية ودقيقة للبيانات (يومي، شهري، سنوي، مخصص).
 * 3. تحليل مالي متقدم (أتعاب، مقبوضات، عجز، ومصروفات).
 * 4. تقييم أداء المحامين آلياً بناءً على الإنجاز المالي والإجرائي.
 * 5. رسوم بيانية (Chart.js) متوافقة ديناميكياً مع الوضع الليلي (Dark Mode).
 * ============================================================================
 */

// ============================================================================
// [1] المتغيرات العامة (Globals)
// ============================================================================
let rawCases = [];
let rawInstallments = [];
let rawExpenses = [];
let rawAppointments = [];
let rawClients = [];
let rawStaff = [];

// مراجع الرسوم البيانية (لتدميرها قبل إعادة رسمها)
let financeChartInstance = null;
let casesChartInstance = null;

// ============================================================================
// [2] دوال التهيئة والمساعدة (Init & Helpers)
// ============================================================================

// تعقيم النصوص لمنع ثغرات XSS في الجداول
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
};

// تطبيق ألوان هوية المكتب
function applyFirmSettings() {
    const settings = JSON.parse(localStorage.getItem('firm_settings') || '{}');
    if (!settings) return;
    const root = document.documentElement;
    if (settings.primary_color) root.style.setProperty('--navy', settings.primary_color);
    if (settings.accent_color) root.style.setProperty('--accent', settings.accent_color);
}

// أنيميشن عداد الأرقام (تصاعدي ناعم للـ KPIs)
function animateValue(id, end) {
    const obj = document.getElementById(id);
    if(!obj) return;
    const duration = 1000;
    const start = 0;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        // التنسيق ليتضمن الفواصل لآلاف (مثال: 1,500)
        obj.innerHTML = Math.floor(progress * (end - start) + start).toLocaleString('en-US');
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

// بدء التشغيل
window.onload = async () => {
    applyFirmSettings();
    if (!localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token')) {
        window.location.href = 'login.html';
        return;
    }

    // تعيين "هذا الشهر" كفلتر افتراضي عند الفتح ليكون التقرير منطقياً للمدير
    const periodSelect = document.getElementById('filter_period');
    if(periodSelect) periodSelect.value = 'this_month';

    await fetchAllData();
    window.generateReports(); // تطبيق الفلتر وبناء التقرير الأول
};

// ============================================================================
// [3] جلب البيانات المركزية (Data Fetching)
// ============================================================================
async function fetchAllData() {
    try {
        Swal.fire({ title: 'جاري تحميل السجلات والتحليل...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        if (!navigator.onLine) {
            Swal.fire({toast: true, position: 'top-end', icon: 'warning', title: 'أنت غير متصل بالإنترنت. سيتم عرض البيانات المخزنة محلياً.', showConfirmButton: false, timer: 4000});
        }

        // جلب جميع الجداول بشكل متوازٍ لتسريع الأداء (Parallel Fetch)
        const [casesRes, clientsRes, apptsRes, instRes, expRes, staffRes] = await Promise.all([
            API.getCases(),
            API.getClients(),
            API.getAppointments(),
            API.getInstallments(), 
            API.getExpenses(),
            API.getStaff()
        ]);

        if (casesRes && casesRes.error && !Array.isArray(casesRes)) throw new Error(casesRes.error);

        // تخزين البيانات الخام بشكل آمن
        rawCases = Array.isArray(casesRes) ? casesRes : [];
        rawClients = Array.isArray(clientsRes) ? clientsRes : [];
        rawAppointments = Array.isArray(apptsRes) ? apptsRes : [];
        rawInstallments = Array.isArray(instRes) ? instRes : [];
        rawExpenses = Array.isArray(expRes) ? expRes : [];
        rawStaff = Array.isArray(staffRes) ? staffRes : [];

        Swal.close();
    } catch (error) {
        Swal.close();
        Swal.fire('تنبيه', 'تعذر تحميل أحدث البيانات من السيرفر. تأكد من اتصالك بالشبكة.', 'error');
        console.error("Error fetching report data:", error);
    }
}

// ============================================================================
// [4] خوارزمية الفلترة الزمنية (Time Filters)
// ============================================================================

// التحكم في إظهار وإخفاء حقول التاريخ المخصص
window.handlePeriodChange = function() {
    const period = document.getElementById('filter_period').value;
    const customElements = document.querySelectorAll('.custom-date');
    
    if (period === 'custom') {
        customElements.forEach(el => el.classList.remove('d-none'));
    } else {
        customElements.forEach(el => el.classList.add('d-none'));
    }
};

// الدالة الرئيسية: تطبيق الفلتر وتوزيع البيانات على باقي الدوال
window.generateReports = function() {
    const period = document.getElementById('filter_period').value;
    const startStr = document.getElementById('filter_start').value;
    const endStr = document.getElementById('filter_end').value;

    let startDate = null;
    let endDate = null;
    const now = new Date();

    // إعداد النطاق الزمني (Date Boundaries) بدقة لمنع تسرب البيانات
    if (period === 'today') {
        startDate = new Date(now.setHours(0,0,0,0));
        endDate = new Date(now.setHours(23,59,59,999));
    } else if (period === 'this_month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0,0,0);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23,59,59,999);
    } else if (period === 'this_year') {
        startDate = new Date(now.getFullYear(), 0, 1, 0,0,0);
        endDate = new Date(now.getFullYear(), 11, 31, 23,59,59,999);
    } else if (period === 'custom') {
        if(startStr) { startDate = new Date(startStr); startDate.setHours(0,0,0,0); }
        if(endStr) { endDate = new Date(endStr); endDate.setHours(23,59,59,999); }
    }

    // دالة فحص الوقوع ضمن النطاق الزمني
    const isDateInRange = (dateStr) => {
        if(!dateStr) return false;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false; // تجاهل التواريخ غير الصالحة
        if(startDate && d < startDate) return false;
        if(endDate && d > endDate) return false;
        return true;
    };

    // فلترة المصفوفات الخام
    const filteredCases = period === 'all' ? rawCases : rawCases.filter(c => isDateInRange(c.created_at));
    const filteredClients = period === 'all' ? rawClients : rawClients.filter(c => isDateInRange(c.created_at));
    const filteredAppts = period === 'all' ? rawAppointments : rawAppointments.filter(a => isDateInRange(a.appt_date));
    
    // الأقساط والمصاريف لها تواريخ محددة (الدفع أو الاستحقاق) نعتمد عليها قبل تاريخ الإنشاء
    const filteredInstallments = period === 'all' ? rawInstallments : rawInstallments.filter(i => isDateInRange(i.paid_date || i.due_date || i.created_at));
    const filteredExpenses = period === 'all' ? rawExpenses : rawExpenses.filter(e => isDateInRange(e.expense_date || e.created_at));

    // توزيع الداتا المفلترة على وحدات العرض
    calculateKPIs(filteredCases, filteredClients, filteredAppts, filteredInstallments, filteredExpenses);
    updateCharts(filteredCases, filteredInstallments, filteredExpenses);
    updateStaffPerformance(filteredCases, filteredAppts, filteredInstallments);
    updateTransactionsTable(filteredInstallments, filteredExpenses);
};

// ============================================================================
// [5] حساب مؤشرات الأداء والعدادات (KPIs & Metrics)
// ============================================================================
function calculateKPIs(cases, clients, appts, installments, expenses) {
    // إجمالي الأتعاب للقضايا
    const totalAgreed = cases.reduce((sum, c) => sum + (Number(c.total_agreed_fees) || 0), 0);
    // إجمالي التحصيلات (المقبوضات الفعلية)
    const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    // إجمالي المصروفات
    const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    // العجز (المتبقي للتحصيل)
    const totalRem = totalAgreed - totalPaid;

    // حقن الأرقام مع الأنيميشن
    animateValue('kpi-total-agreed', totalAgreed);
    animateValue('kpi-total-paid', totalPaid);
    animateValue('kpi-total-exp', totalExpenses);
    animateValue('kpi-total-rem', totalRem > 0 ? totalRem : 0);
    
    animateValue('kpi-cases-count', cases.length);
    animateValue('kpi-clients-count', clients.length);
    animateValue('kpi-appts-count', appts.length);
}

// ============================================================================
// [6] الرسوم البيانية الذكية (Chart.js Renderers - Soft UI Colors)
// ============================================================================
function updateCharts(cases, installments, expenses) {
    const rootStyles = getComputedStyle(document.documentElement);
    const primaryColor = rootStyles.getPropertyValue('--navy').trim() || '#0a192f';
    const accentColor = rootStyles.getPropertyValue('--accent').trim() || '#D4AF37';

    // التوافقية مع الوضع الليلي (Dark Mode Adjustments)
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDarkMode ? '#94a3b8' : '#6C757D'; // لون النصوص للرسم البياني
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(163, 174, 208, 0.1)'; // لون الشبكة

    // الألوان المتوافقة مع الهوية المشرقة (Soft UI)
    const successColor = '#01B574';
    const dangerColor = '#EE5D50';
    const warningColor = '#FFCE20';
    const mutedColor = '#A3AED0';

    const totalAgreed = cases.reduce((sum, c) => sum + (Number(c.total_agreed_fees) || 0), 0);
    const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // 1. المخطط المالي (Bar Chart)
    const financeCtx = document.getElementById('financeChart');
    if (financeChartInstance) financeChartInstance.destroy();
    
    financeChartInstance = new Chart(financeCtx, {
        type: 'bar',
        data: {
            labels: ['إجمالي الأتعاب', 'التحصيلات الفعلية', 'المصروفات المدفوعة'],
            datasets: [{
                label: 'المبلغ (د.أ)',
                data: [totalAgreed, totalPaid, totalExpenses],
                backgroundColor: [primaryColor, successColor, dangerColor],
                borderRadius: 8,
                barThickness: window.innerWidth < 768 ? 20 : 40 // تحجيم ذكي للموبايل
            }]
        },
        options: {
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false } 
            },
            scales: { 
                y: { 
                    beginAtZero: true, 
                    ticks: { color: textColor, callback: function(value) { return value.toLocaleString('en-US'); }, font: { family: 'Cairo' } },
                    grid: { color: gridColor }
                },
                x: {
                    ticks: { color: textColor, font: { family: 'Cairo', weight: 'bold' } },
                    grid: { display: false }
                }
            }
        }
    });

    // 2. مخطط حالة القضايا (Doughnut Chart)
    const activeCases = cases.filter(c => c.status === 'نشطة').length;
    const completedCases = cases.filter(c => c.status === 'مكتملة' || c.status === 'مغلقة').length;
    const appealCases = cases.filter(c => c.status === 'استئناف' || c.status === 'تمييز').length;

    const casesCtx = document.getElementById('casesChart');
    if (casesChartInstance) casesChartInstance.destroy();

    casesChartInstance = new Chart(casesCtx, {
        type: 'doughnut',
        data: {
            labels: ['نشطة', 'مكتملة/مغلقة', 'استئناف/تمييز'],
            datasets: [{
                data: [activeCases, completedCases, appealCases],
                backgroundColor: [successColor, mutedColor, warningColor],
                borderWidth: 0, // إزالة الحدود لمظهر Soft
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true, 
            maintainAspectRatio: false, 
            cutout: '68%',
            plugins: { 
                legend: { 
                    position: 'bottom', 
                    labels: { color: textColor, font: { family: 'Cairo', size: 13, weight: 'bold' }, usePointStyle: true, padding: 20 } 
                } 
            }
        }
    });
}

// ============================================================================
// [7] الجداول التفصيلية (Staff Performance & Transactions - Soft UI)
// ============================================================================

// 1. تقييم أداء المحامين (HR Performance Matrix)
function updateStaffPerformance(cases, appts, installments) {
    const tbody = document.getElementById('staff-performance-tbody');
    if (!rawStaff || rawStaff.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-5 text-muted border-0 bg-white fw-bold text-center rounded-4">لا يوجد موظفين مسجلين في النظام.</td></tr>`;
        return;
    }

    let performanceData = [];

    rawStaff.forEach(staff => {
        // حصر القضايا المسندة لهذا المحامي ضمن الفترة المحددة
        const assignedCases = cases.filter(c => c.assigned_lawyer_id && Array.isArray(c.assigned_lawyer_id) && c.assigned_lawyer_id.includes(staff.id));
        const activeCases = assignedCases.filter(c => c.status === 'نشطة').length;
        const completedCases = assignedCases.filter(c => c.status === 'مكتملة' || c.status === 'مغلقة').length;

        // حصر المهام والمواعيد التي أُسندت إليه
        const assignedAppts = appts.filter(a => a.assigned_to && Array.isArray(a.assigned_to) && a.assigned_to.includes(staff.id));
        const completedAppts = assignedAppts.filter(a => a.status === 'تم' || a.status === 'منجزة').length;

        // حصر التحصيلات المالية للقضايا التابعة لهذا المحامي (لغايات العمولات)
        const caseIds = assignedCases.map(c => c.id);
        const collections = installments.filter(i => i.status === 'مدفوعة' && caseIds.includes(i.case_id)).reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

        performanceData.push({
            name: staff.full_name,
            totalCases: assignedCases.length,
            activeCases: activeCases,
            completedCases: completedCases,
            completedAppts: completedAppts,
            collections: collections
        });
    });

    // الترتيب: الأفضل أداءً مالياً، ثم حسب عدد القضايا المنجزة
    performanceData.sort((a, b) => b.collections - a.collections || b.completedCases - a.completedCases);

    tbody.innerHTML = performanceData.map(p => `
        <tr class="bg-white border-bottom transition-hover align-middle">
            <td class="fw-bold text-navy text-start ps-3 text-truncate" style="max-width: 150px;" title="${escapeHTML(p.name)}">
                <div class="d-flex align-items-center gap-2">
                    <div class="icon-box bg-light text-accent rounded-circle d-flex justify-content-center align-items-center shadow-sm" style="width: 32px; height: 32px;"><i class="fas fa-user-tie"></i></div>
                    <span>${escapeHTML(p.name)}</span>
                </div>
            </td>
            <td class="fw-bold text-navy font-monospace">${p.totalCases}</td>
            <td class="text-warning fw-bold font-monospace">${p.activeCases}</td>
            <td class="text-success fw-bold font-monospace">${p.completedCases}</td>
            <td class="text-info fw-bold font-monospace">${p.completedAppts}</td>
            <td class="fw-bold text-success font-monospace fs-6">${p.collections.toLocaleString('en-US')} <small class="text-muted fs-6">د.أ</small></td>
        </tr>
    `).join('');
}

// 2. الحركات المالية التفصيلية المدمجة (Expenses + Incomes Timeline)
function updateTransactionsTable(installments, expenses) {
    const tbody = document.getElementById('recent-transactions-tbody');
    let transactions = [];
    
    // دمج المقبوضات
    installments.forEach(i => {
        const caseObj = rawCases.find(c => c.id === i.case_id);
        transactions.push({
            date: new Date(i.paid_date || i.due_date || i.created_at),
            type: 'مقبوضات (أتعاب)',
            amount: Number(i.amount),
            description: `دفعة مالية لملف رقم: ${caseObj ? caseObj.case_internal_id : 'غير محدد'}`,
            status: i.status === 'مدفوعة' ? 'مكتمل' : 'مستحق',
            statusColor: i.status === 'مدفوعة' ? 'success' : 'warning',
            typeColor: 'success'
        });
    });

    // دمج المصروفات
    expenses.forEach(e => {
        const caseObj = rawCases.find(c => c.id === e.case_id);
        transactions.push({
            date: new Date(e.expense_date || e.created_at),
            type: 'مدفوعات (مصروف)',
            amount: Number(e.amount),
            description: e.description + (caseObj ? ` - ملف رقم: ${caseObj.case_internal_id}` : ''),
            status: 'مصروف رسمي',
            statusColor: 'danger',
            typeColor: 'danger'
        });
    });

    // ترتيب المعاملات زمنياً من الأحدث للأقدم
    transactions.sort((a, b) => b.date - a.date);
    
    // أخذ آخر 20 معاملة فقط للعرض في الجدول لتجنب بطء التصفح
    const recentTx = transactions.slice(0, 20);

    if (recentTx.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-5 text-muted border-0 bg-white fw-bold text-center rounded-4">لا توجد حركات مالية (قبض/صرف) مسجلة في هذه الفترة.</td></tr>`;
        return;
    }

    tbody.innerHTML = recentTx.map(tx => `
        <tr class="bg-white border-bottom transition-hover align-middle">
            <td class="fw-bold text-muted font-monospace" style="font-size: 0.85rem;">${tx.date.toLocaleDateString('ar-EG')}</td>
            <td><span class="badge bg-${tx.typeColor} bg-opacity-10 text-${tx.typeColor} border border-${tx.typeColor} border-opacity-25 px-3 py-1 rounded-pill">${tx.type}</span></td>
            <td class="fw-bold text-${tx.typeColor} font-monospace fs-6">${tx.amount.toLocaleString('en-US')}</td>
            <td class="text-truncate text-start fw-bold text-navy" style="max-width: 250px; font-size: 0.85rem;" title="${escapeHTML(tx.description)}">${escapeHTML(tx.description)}</td>
            <td><span class="badge bg-${tx.statusColor} bg-opacity-10 text-${tx.statusColor} border border-${tx.statusColor} border-opacity-25 px-3 py-1 shadow-sm rounded-pill">${tx.status}</span></td>
        </tr>
    `).join('');
}

// دالة طباعة التقرير الشاملة
window.printReport = function() {
    window.print();
};