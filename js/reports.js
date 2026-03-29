// js/reports.js - محرك التقارير المتقدم (المالية، الإحصائيات، أداء الفريق، المخططات والفلاتر، محمي ضد XSS)

let rawData = { cases: [], staff: [], installments: [], expenses: [] };
let charts = { finance: null, cases: null };

// دالة الحماية من ثغرات الحقن (XSS Sanitizer)
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
};

window.onload = async () => {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);
    const userStr = localStorage.getItem(CONFIG.USER_KEY);
    
    if (!token || !userStr) {
        window.location.href = 'login.html';
        return;
    }

    const user = JSON.parse(userStr);
    
    // حماية إضافية: صفحة التقارير للمدراء فقط
    if (user.role !== 'admin' && user.role !== 'مدير') {
        alert('غير مصرح لك بالوصول لصفحة التقارير');
        window.location.href = 'app.html';
        return;
    }
    
    document.getElementById('report-date').innerText = new Date().toLocaleDateString('ar-EG');
    await fetchAndRenderInitialData();
};

async function fetchAndRenderInitialData() {
    try {
        // جلب جميع البيانات الأساسية للمكتب بالتوازي للسرعة
        const [cases, staff, installments, expenses] = await Promise.all([
            API.getCases(),
            API.getStaff(),
            fetchAPI('/api/installments'), 
            fetchAPI('/api/expenses')      
        ]);

        if (!cases) throw new Error("تعذر جلب البيانات الأساسية");

        // تخزين البيانات الخام لاستخدامها في الفلاتر لاحقاً
        rawData.cases = cases || [];
        rawData.staff = staff || [];
        rawData.installments = installments || [];
        rawData.expenses = expenses || [];

        renderAllReports(rawData);

    } catch (error) {
        console.error("Reports Error:", error);
        showAlert('حدث خطأ أثناء تحليل البيانات للتقرير', 'danger');
    }
}

// دالة تطبيق الفلتر الزمني
function applyFilters() {
    const startDate = document.getElementById('filter-start').value;
    const endDate = document.getElementById('filter-end').value;

    if (!startDate && !endDate) {
        showAlert('يرجى تحديد تاريخ بداية أو نهاية للفلترة', 'warning');
        return;
    }

    const start = startDate ? new Date(startDate) : new Date('1970-01-01');
    const end = endDate ? new Date(endDate) : new Date('2100-01-01');
    
    // نهاية اليوم للـ End Date لضمان شموله
    end.setHours(23, 59, 59, 999);

    const filteredData = {
        staff: rawData.staff, // الموظفين لا يتأثرون بالفلتر الزمني
        cases: rawData.cases.filter(c => {
            const d = new Date(c.created_at);
            return d >= start && d <= end;
        }),
        installments: rawData.installments.filter(i => {
            const d = new Date(i.due_date || i.created_at);
            return d >= start && d <= end;
        }),
        expenses: rawData.expenses.filter(e => {
            const d = new Date(e.expense_date || e.created_at);
            return d >= start && d <= end;
        })
    };

    renderAllReports(filteredData);
    showAlert('تم استخراج التقرير للفترة المحددة', 'success');
}

function resetFilters() {
    document.getElementById('filter-start').value = '';
    document.getElementById('filter-end').value = '';
    renderAllReports(rawData);
}

function renderAllReports(data) {
    const financials = calculateFinancials(data.cases, data.installments, data.expenses);
    const caseStats = calculateCaseStats(data.cases);
    calculateStaffPerformance(data.cases, data.staff);
    renderCharts(financials, caseStats);
}

function calculateFinancials(cases, installments, expenses) {
    let totalAgreed = 0;
    let totalPaid = 0;
    let totalExpenses = 0;

    cases.forEach(c => { totalAgreed += Number(c.total_agreed_fees) || 0; });
    installments.forEach(i => { if (i.status === 'مدفوعة') totalPaid += Number(i.amount) || 0; });
    expenses.forEach(e => { totalExpenses += Number(e.amount) || 0; });

    const netProfit = totalPaid - totalExpenses;

    document.getElementById('rep-total-agreed').innerText = totalAgreed.toLocaleString();
    document.getElementById('rep-total-paid').innerText = totalPaid.toLocaleString();
    document.getElementById('rep-total-expenses').innerText = totalExpenses.toLocaleString();
    document.getElementById('rep-net-profit').innerText = netProfit.toLocaleString();

    return { totalAgreed, totalPaid, totalExpenses, netProfit };
}

function calculateCaseStats(cases) {
    let active = 0, closed = 0, appeal = 0;

    cases.forEach(c => {
        if (c.status === 'نشطة') active++;
        else if (c.status === 'مغلقة' || c.status === 'محفوظة') closed++;
        else if (c.status === 'قيد الاستئناف' || c.litigation_degree === 'استئناف' || c.litigation_degree === 'تمييز') appeal++;
    });

    document.getElementById('rep-cases-total').innerText = cases.length;
    document.getElementById('rep-cases-active').innerText = active;
    document.getElementById('rep-cases-closed').innerText = closed;
    document.getElementById('rep-cases-appeal').innerText = appeal;

    return { active, closed, appeal };
}

function calculateStaffPerformance(cases, staff) {
    const tableBody = document.getElementById('lawyer-performance-body');
    
    if (staff.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-muted p-4">لا يوجد موظفين مسجلين</td></tr>';
        return;
    }

    let rowsHtml = '';

    staff.forEach(member => {
        let assignedCasesCount = 0;
        let associatedFees = 0;

        cases.forEach(c => {
            let isAssigned = false;
            if (Array.isArray(c.assigned_lawyer_id)) isAssigned = c.assigned_lawyer_id.includes(member.id);
            else if (c.assigned_lawyer_id) isAssigned = (c.assigned_lawyer_id === member.id);
            
            if (isAssigned || c.created_by === member.id) {
                assignedCasesCount++;
                associatedFees += Number(c.total_agreed_fees) || 0;
            }
        });

        const statusBadge = member.is_active === false 
            ? '<span class="badge bg-danger">معطل</span>' 
            : '<span class="badge bg-success">فعال</span>';

        const safeName = escapeHTML(member.full_name);
        const safeRole = escapeHTML(getRoleNameInArabic(member.role));

        rowsHtml += `
            <tr class="${member.is_active === false ? 'opacity-50' : ''}">
                <td class="text-start ps-3">
                    <div class="d-flex align-items-center">
                        <div class="bg-light text-navy fw-bold rounded-circle d-flex align-items-center justify-content-center me-2 border" style="width:35px; height:35px;">
                            ${safeName.charAt(0)}
                        </div>
                        <div>
                            <b class="text-navy d-block">${safeName}</b>
                            <small class="text-muted">${safeRole}</small>
                        </div>
                    </div>
                </td>
                <td>${statusBadge}</td>
                <td><span class="badge bg-soft-primary text-primary fs-6">${assignedCasesCount}</span></td>
                <td class="text-success fw-bold">${associatedFees.toLocaleString()}</td>
            </tr>
        `;
    });

    tableBody.innerHTML = rowsHtml;
}

function getRoleNameInArabic(role) {
    if (role === 'admin' || role === 'مدير') return 'مدير';
    if (role === 'secretary' || role === 'سكرتاريا') return 'سكرتاريا';
    if (role === 'lawyer' || role === 'محامي') return 'محامي';
    return role || 'موظف';
}

function renderCharts(finStats, caseStats) {
    Chart.defaults.font.family = "'Cairo', sans-serif";
    
    // جلب ألوان الهوية البصرية من CSS المتصفح لتوحيد ألوان الرسوم البيانية
    const style = getComputedStyle(document.body);
    const colorNavy = style.getPropertyValue('--navy').trim() || '#0a192f';
    const colorSuccess = '#10b981';
    const colorDanger = '#ef4444';
    const colorWarning = '#f59e0b';

    // 1. تدمير المخططات القديمة إذا وجدت (عند التحديث بالفلتر)
    if (charts.finance) charts.finance.destroy();
    if (charts.cases) charts.cases.destroy();

    // 2. إنشاء مخطط التدفق المالي (Bar Chart)
    const ctxFinance = document.getElementById('financeChart').getContext('2d');
    charts.finance = new Chart(ctxFinance, {
        type: 'bar',
        data: {
            labels: ['إجمالي الأتعاب', 'المحصل الفعلي', 'المصروفات'],
            datasets: [{
                label: 'المبالغ (د.أ)',
                data: [finStats.totalAgreed, finStats.totalPaid, finStats.totalExpenses],
                backgroundColor: [colorNavy, colorSuccess, colorDanger],
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });

    // 3. إنشاء مخطط حالات القضايا (Doughnut Chart)
    const ctxCases = document.getElementById('casesChart').getContext('2d');
    charts.cases = new Chart(ctxCases, {
        type: 'doughnut',
        data: {
            labels: ['نشطة', 'قيد الاستئناف', 'مغلقة'],
            datasets: [{
                data: [caseStats.active, caseStats.appeal, caseStats.closed],
                backgroundColor: [colorSuccess, colorWarning, colorDanger],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { padding: 20, font: { family: "'Cairo', sans-serif" } } }
            },
            cutout: '60%'
        }
    });
}

function showAlert(message, type = 'info') {
    const box = document.getElementById('alertBox');
    if(!box) return;
    const alertId = 'alert-' + Date.now();
    let typeClass = type === 'success' ? 'alert-success-custom' : 'alert-danger-custom';
    if(type === 'warning') typeClass = 'bg-warning text-dark border-warning';
    box.insertAdjacentHTML('beforeend', `<div id="${alertId}" class="alert-custom ${typeClass}"><i class="fas ${type === 'success' ? 'fa-check-circle text-success' : 'fa-info-circle text-info'}"></i><span>${escapeHTML(message)}</span></div>`);
    setTimeout(() => { const el = document.getElementById(alertId); if(el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); } }, 3000);
}