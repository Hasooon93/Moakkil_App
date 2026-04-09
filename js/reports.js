// js/reports.js - العقل المدبر للتقارير والرسوم البيانية مع ميزة الفلترة الزمنية الذكية (Date Filtering)
// التحديثات: دعم تنبيهات وضع عدم الاتصال (Offline Mode) للتقارير لمنع تجميد الشاشة.

let rawCases = [];
let rawInstallments = [];
let rawExpenses = [];
let rawAppointments = [];
let rawClients = [];

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

// جلب كل البيانات الخام مرة واحدة باستخدام الدوال المخصصة في api.js
async function fetchAllData() {
    try {
        Swal.fire({ title: 'جاري تحميل السجلات...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        if (!navigator.onLine) {
            Swal.fire({toast: true, position: 'top-end', icon: 'warning', title: 'أنت غير متصل بالإنترنت. تعذر جلب أحدث الإحصائيات.', showConfirmButton: false, timer: 4000});
        }

        // تم استبدال API.get بالدوال المخصصة API.getInstallments() و API.getExpenses()
        const [casesRes, clientsRes, apptsRes, instRes, expRes] = await Promise.all([
            API.getCases(),
            API.getClients(),
            API.getAppointments(),
            API.getInstallments(), 
            API.getExpenses()
        ]);

        // التحقق من أن الاستجابة ليست خطأ اتصال (Offline Error)
        if (casesRes && casesRes.error && !Array.isArray(casesRes)) {
            throw new Error(casesRes.error);
        }

        rawCases = Array.isArray(casesRes) ? casesRes : [];
        rawClients = Array.isArray(clientsRes) ? clientsRes : [];
        rawAppointments = Array.isArray(apptsRes) ? apptsRes : [];
        rawInstallments = Array.isArray(instRes) ? instRes : [];
        rawExpenses = Array.isArray(expRes) ? expRes : [];

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
    
    // المهام نفلترها بناءً على تاريخ الاستحقاق
    const filteredAppts = period === 'all' ? rawAppointments : rawAppointments.filter(a => isDateInRange(a.appt_date));
    
    // الماديات نفلترها بناءً على تاريخ الدفع أو الصرف الفعلي
    const filteredInstallments = period === 'all' ? rawInstallments : rawInstallments.filter(i => isDateInRange(i.paid_date || i.due_date || i.created_at));
    const filteredExpenses = period === 'all' ? rawExpenses : rawExpenses.filter(e => isDateInRange(e.expense_date || e.created_at));

    // تحديث الأرقام والرسوم والجدول
    calculateKPIs(filteredCases, filteredClients, filteredAppts, filteredInstallments, filteredExpenses);
    updateCharts(filteredCases, filteredInstallments, filteredExpenses);
    updateTransactionsTable(filteredInstallments, filteredExpenses);
};

// حساب مؤشرات الأداء بناءً على الداتا المفلترة
function calculateKPIs(cases, clients, appts, installments, expenses) {
    // الأتعاب فقط للقضايا التي فُتحت في هذه الفترة
    const totalAgreed = cases.reduce((sum, c) => sum + (Number(c.total_agreed_fees) || 0), 0);
    
    // التحصيلات التي تمت في هذه الفترة (فقط المقبوضة)
    const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    
    // المصروفات التي صُرفت في هذه الفترة
    const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // المتبقي من القضايا التي فُتحت في هذه الفترة
    const totalRem = totalAgreed - totalPaid;

    // الأنيميشن للأرقام
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
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// تحديث الرسوم البيانية (Chart.js)
function updateCharts(cases, installments, expenses) {
    const rootStyles = getComputedStyle(document.documentElement);
    const primaryColor = rootStyles.getPropertyValue('--navy').trim() || '#0a192f';

    // 1. حسابات التدفق المالي
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
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, ticks: { callback: function(value) { return value.toLocaleString(); } } }
            }
        }
    });

    // 2. حسابات حالة القضايا المفلترة
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
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: 'inherit', size: 13 } } }
            }
        }
    });
}

// تحديث جدول المعاملات الأحدث (خلال الفترة المفلترة)
function updateTransactionsTable(installments, expenses) {
    const tbody = document.getElementById('recent-transactions-tbody');
    
    // دمج الدفعات والمصروفات المفلترة في مصفوفة واحدة
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