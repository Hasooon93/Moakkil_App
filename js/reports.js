// js/reports.js - العقل المدبر للتقارير والرسوم البيانية وتقييم الأداء العميق
// التحديثات: دعم تنبيهات وضع عدم الاتصال (Offline Mode) للتقارير، وإضافة محرك احتساب أداء المحامين والموظفين مالياً وإدارياً.

let rawCases = [];
let rawInstallments = [];
let rawExpenses = [];
let rawAppointments = [];
let rawClients = [];
let rawStaff = []; // مصفوفة الموظفين الجديدة

let financeChartInstance = null;
let casesChartInstance = null;

const escapeHTML = (str) => {
    if (!str) return '';
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
};

window.onload = async () => {
    applyFirmSettings();
    if (!localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token')) {
        window.location.href = 'login.html';
        return;
    }

    // تعيين التاريخ الافتراضي لـ "هذا الشهر" عند الفتح لأول مرة ليكون التقرير منطقياً
    document.getElementById('filter_period').value = 'this_month';

    await fetchAllData();
    generateReports(); // تطبيق الفلتر وبناء التقرير
};

function applyFirmSettings() {
    const settings = JSON.parse(localStorage.getItem('firm_settings'));
    if (!settings) return;
    const root = document.documentElement;
    if (settings.primary_color) root.style.setProperty('--navy', settings.primary_color);
    if (settings.accent_color) root.style.setProperty('--accent', settings.accent_color);
}

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

// جلب كل البيانات الخام مرة واحدة باستخدام الدوال المخصصة في api.js بما فيها الموظفين
async function fetchAllData() {
    try {
        Swal.fire({ title: 'جاري تحميل السجلات...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        if (!navigator.onLine) {
            Swal.fire({toast: true, position: 'top-end', icon: 'warning', title: 'أنت غير متصل بالإنترنت. تعذر جلب أحدث الإحصائيات.', showConfirmButton: false, timer: 4000});
        }

        // جلب جميع الجداول مع جدول الموظفين (getStaff)
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

        Swal.close();
    } catch (error) {
        Swal.close();
        Swal.fire('تنبيه', 'تعذر تحميل أحدث البيانات من السيرفر. تأكد من اتصالك بالإنترنت.', 'warning');
        console.error(error);
    }
}

// الدالة الرئيسية: تطبيق الفلتر وإعادة بناء الواجهة
window.generateReports = function() {
    const period = document.getElementById('filter_period').value;
    const startStr = document.getElementById('filter_start').value;
    const endStr = document.getElementById('filter_end').value;

    let startDate = null;
    let endDate = null;
    const now = new Date();

    // إعداد التواريخ بناءً على اختيار المستخدم
    if (period === 'today') {
        startDate = new Date(now.setHours(0,0,0,0));
        endDate = new Date(now.setHours(23,59,59,999));
    } else if (period === 'this_month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23,59,59);
    } else if (period === 'this_year') {
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31, 23,59,59);
    } else if (period === 'custom') {
        if(startStr) { startDate = new Date(startStr); startDate.setHours(0,0,0,0); }
        if(endStr) { endDate = new Date(endStr); endDate.setHours(23,59,59,999); }
    }

    // دالة للتحقق من وقوع التاريخ ضمن الفترة
    const isDateInRange = (dateStr) => {
        if(!dateStr) return false;
        const d = new Date(dateStr);
        if(startDate && d < startDate) return false;
        if(endDate && d > endDate) return false;
        return true;
    };

    // فلترة المصفوفات
    const filteredCases = period === 'all' ? rawCases : rawCases.filter(c => isDateInRange(c.created_at));
    const filteredClients = period === 'all' ? rawClients : rawClients.filter(c => isDateInRange(c.created_at));
    const filteredAppts = period === 'all' ? rawAppointments : rawAppointments.filter(a => isDateInRange(a.appt_date));
    const filteredInstallments = period === 'all' ? rawInstallments : rawInstallments.filter(i => isDateInRange(i.paid_date || i.due_date || i.created_at));
    const filteredExpenses = period === 'all' ? rawExpenses : rawExpenses.filter(e => isDateInRange(e.expense_date || e.created_at));

    // تحديث الأرقام والجدول
    calculateKPIs(filteredCases, filteredClients, filteredAppts, filteredInstallments, filteredExpenses);
    updateCharts(filteredCases, filteredInstallments, filteredExpenses);
    updateStaffPerformance(filteredCases, filteredAppts, filteredInstallments); // التقرير الدقيق المضاف
    updateTransactionsTable(filteredInstallments, filteredExpenses);
};

// حساب مؤشرات الأداء بناءً على الداتا المفلترة
function calculateKPIs(cases, clients, appts, installments, expenses) {
    const totalAgreed = cases.reduce((sum, c) => sum + (Number(c.total_agreed_fees) || 0), 0);
    const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalRem = totalAgreed - totalPaid;

    animateValue('kpi-total-agreed', totalAgreed);
    animateValue('kpi-total-paid', totalPaid);
    animateValue('kpi-total-exp', totalExpenses);
    animateValue('kpi-total-rem', totalRem > 0 ? totalRem : 0);
    animateValue('kpi-cases-count', cases.length);
    animateValue('kpi-clients-count', clients.length);
    animateValue('kpi-appts-count', appts.length);
}

// أنيميشن عداد الأرقام
function animateValue(id, end) {
    const obj = document.getElementById(id);
    if(!obj) return;
    const duration = 1000;
    const start = 0;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start).toLocaleString();
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

// تحديث الرسوم البيانية (Chart.js)
function updateCharts(cases, installments, expenses) {
    const rootStyles = getComputedStyle(document.documentElement);
    const primaryColor = rootStyles.getPropertyValue('--navy').trim() || '#0a192f';

    const totalAgreed = cases.reduce((sum, c) => sum + (Number(c.total_agreed_fees) || 0), 0);
    const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const financeCtx = document.getElementById('financeChart');
    if (financeChartInstance) financeChartInstance.destroy();
    
    financeChartInstance = new Chart(financeCtx, {
        type: 'bar',
        data: {
            labels: ['إجمالي الأتعاب (للقضايا الجديدة)', 'التحصيلات الفعلية', 'المصروفات المدفوعة'],
            datasets: [{
                label: 'المبلغ (د.أ)',
                data: [totalAgreed, totalPaid, totalExpenses],
                backgroundColor: [primaryColor, '#10b981', '#ef4444'],
                borderRadius: 8,
                barThickness: 30
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { callback: function(value) { return value.toLocaleString(); } } } }
        }
    });

    const activeCases = cases.filter(c => c.status === 'نشطة').length;
    const completedCases = cases.filter(c => c.status === 'مكتملة').length;
    const appealCases = cases.filter(c => c.status === 'استئناف' || c.status === 'تمييز').length;

    const casesCtx = document.getElementById('casesChart');
    if (casesChartInstance) casesChartInstance.destroy();

    casesChartInstance = new Chart(casesCtx, {
        type: 'doughnut',
        data: {
            labels: ['نشطة', 'مكتملة/مغلقة', 'استئناف/تمييز'],
            datasets: [{
                data: [activeCases, completedCases, appealCases],
                backgroundColor: ['#10b981', '#64748b', '#f59e0b'],
                borderWidth: 2, hoverOffset: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            plugins: { legend: { position: 'bottom', labels: { font: { family: 'inherit', size: 13 } } } }
        }
    });
}

// =================================================================
// 📊 تقييم أداء المحامين والموظفين (الاستعلامات والربط الدقيق)
// =================================================================
function updateStaffPerformance(cases, appts, installments) {
    const tbody = document.getElementById('staff-performance-tbody');
    if (!rawStaff || rawStaff.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-4 text-muted border-0 bg-white fw-bold">لا يوجد موظفين مسجلين.</td></tr>`;
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
        const completedAppts = assignedAppts.filter(a => a.status === 'تم').length;

        // حصر التحصيلات المالية للقضايا التابعة لهذا المحامي (تقييم الإيرادات الفردية)
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

    // الترتيب: الأفضل أداءً مالياً ثم حسب عدد القضايا المنجزة
    performanceData.sort((a, b) => b.collections - a.collections || b.completedCases - a.completedCases);

    tbody.innerHTML = performanceData.map(p => `
        <tr class="bg-white border-bottom">
            <td class="fw-bold text-navy text-start ps-3 text-truncate" style="max-width: 150px;" title="${escapeHTML(p.name)}"><i class="fas fa-user-tie me-2 text-secondary"></i>${escapeHTML(p.name)}</td>
            <td class="fw-bold text-primary">${p.totalCases}</td>
            <td class="text-warning fw-bold">${p.activeCases}</td>
            <td class="text-success fw-bold">${p.completedCases}</td>
            <td class="text-info text-dark fw-bold">${p.completedAppts}</td>
            <td class="fw-bold text-success">${p.collections.toLocaleString()}</td>
        </tr>
    `).join('');
}

// تحديث جدول المعاملات الأحدث (خلال الفترة المفلترة)
function updateTransactionsTable(installments, expenses) {
    const tbody = document.getElementById('recent-transactions-tbody');
    let transactions = [];
    
    installments.forEach(i => {
        const caseObj = rawCases.find(c => c.id === i.case_id);
        transactions.push({
            date: new Date(i.paid_date || i.due_date || i.created_at),
            type: 'مقبوضات (أتعاب)',
            amount: Number(i.amount),
            description: `دفعة لقضية رقم: ${caseObj ? caseObj.case_internal_id : 'غير محدد'}`,
            status: i.status === 'مدفوعة' ? 'مكتمل' : 'مستحق',
            statusColor: i.status === 'مدفوعة' ? 'success' : 'warning',
            typeColor: 'success'
        });
    });

    expenses.forEach(e => {
        const caseObj = rawCases.find(c => c.id === e.case_id);
        transactions.push({
            date: new Date(e.expense_date || e.created_at),
            type: 'مدفوعات (مصروف)',
            amount: Number(e.amount),
            description: e.description + (caseObj ? ` - ملف: ${caseObj.case_internal_id}` : ''),
            status: 'مصروف',
            statusColor: 'danger',
            typeColor: 'danger'
        });
    });

    // ترتيب المعاملات من الأحدث للأقدم
    transactions.sort((a, b) => b.date - a.date);
    
    // أخذ آخر 15 معاملة فقط للعرض
    const recentTx = transactions.slice(0, 15);

    if (recentTx.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-muted border-0 bg-white">لا توجد حركات مالية مسجلة في هذه الفترة.</td></tr>`;
        return;
    }

    tbody.innerHTML = recentTx.map(tx => `
        <tr class="bg-white border-bottom">
            <td class="fw-bold text-muted">${tx.date.toLocaleDateString('ar-EG')}</td>
            <td><span class="badge bg-soft-${tx.typeColor} text-${tx.typeColor} border border-${tx.typeColor}">${tx.type}</span></td>
            <td class="fw-bold text-${tx.typeColor}">${tx.amount.toLocaleString()}</td>
            <td class="text-truncate" style="max-width: 200px;" title="${escapeHTML(tx.description)}">${escapeHTML(tx.description)}</td>
            <td><span class="badge bg-${tx.statusColor}">${tx.status}</span></td>
        </tr>
    `).join('');
}

// دالة طباعة التقرير
window.printReport = function() {
    window.print();
};