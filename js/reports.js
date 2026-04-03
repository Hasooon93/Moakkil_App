// js/reports.js - محرك التقارير المتقدم (المالية، الإحصائيات، أداء الفريق، دعم المحامين المتعددين، محمي ضد XSS)

let rawData = { cases: [], staff: [], installments: [], expenses: [] };
let charts = { finance: null, cases: null };
let currentUser = null;

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

    currentUser = JSON.parse(userStr);
    
    // الصلاحيات: السكرتاريا ممنوعة من رؤية التقارير
    if (currentUser.role === 'secretary' || currentUser.role === 'سكرتاريا') {
        Swal.fire({
            icon: 'error',
            title: 'وصول مرفوض',
            text: 'ليس لديك الصلاحيات الكافية للوصول إلى لوحة التقارير المالية والإحصائية.',
            confirmButtonText: 'العودة للرئيسية'
        }).then(() => {
            window.location.href = 'app.html';
        });
        return;
    }
    
    // إخفاء جدول أداء الموظفين إذا كان المستخدم محامياً عادياً (ليس مديراً)
    if (currentUser.role === 'lawyer' || currentUser.role === 'محامي') {
        const staffSection = document.getElementById('staff-performance-section');
        if(staffSection) staffSection.style.display = 'none';
    }
    
    document.getElementById('report-date').innerText = new Date().toLocaleDateString('ar-EG');
    await fetchAndRenderInitialData();
};

async function fetchAndRenderInitialData() {
    try {
        // جلب جميع البيانات الأساسية للمكتب
        const [casesRes, staffRes, instRes, expRes] = await Promise.all([
            fetchAPI('/api/cases'),
            fetchAPI('/api/users'),
            fetchAPI('/api/installments'), 
            fetchAPI('/api/expenses')      
        ]);

        if (casesRes.error) throw new Error(casesRes.error);

        const allCases = Array.isArray(casesRes) ? casesRes : [];
        const allInsts = Array.isArray(instRes) ? instRes : [];
        const allExps = Array.isArray(expRes) ? expRes : [];
        const allStaff = Array.isArray(staffRes) ? staffRes : [];

        // تطبيق صلاحية الرؤية (المحامي يرى قضاياه فقط)
        if (currentUser.role === 'lawyer' || currentUser.role === 'محامي') {
            rawData.cases = allCases.filter(c => {
                const assigned = Array.isArray(c.assigned_lawyer_id) ? c.assigned_lawyer_id : (c.assigned_lawyer_id ? [c.assigned_lawyer_id] : []);
                return assigned.includes(currentUser.id) || c.created_by === currentUser.id;
            });
            
            // جلب الـ IDs الخاصة بقضايا المحامي لفلترة مصاريفه ودفعاته فقط
            const allowedCaseIds = rawData.cases.map(c => c.id);
            
            rawData.installments = allInsts.filter(i => allowedCaseIds.includes(i.case_id));
            rawData.expenses = allExps.filter(e => allowedCaseIds.includes(e.case_id));
        } else {
            // المدير يرى كل شيء
            rawData.cases = allCases;
            rawData.installments = allInsts;
            rawData.expenses = allExps;
        }
        
        rawData.staff = allStaff;

        renderAllReports(rawData);

    } catch (error) {
        console.error("Reports Error:", error);
        showAlert('حدث خطأ أثناء جلب وتحليل البيانات للتقرير', 'error');
    }
}

// دالة تطبيق الفلتر الزمني الديناميكي
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
    
    // حساب أداء الموظفين يظهر للمدراء فقط بناءً على الفلتر المطبق
    if (currentUser.role === 'admin' || currentUser.role === 'مدير') {
        calculateStaffPerformance(data.cases, data.staff);
    }
    
    renderCharts(financials, caseStats);
}

function calculateFinancials(cases, installments, expenses) {
    let totalAgreed = 0;
    let totalPaid = 0;
    let totalExpenses = 0;

    // تم التحديث: إضافة رسوم المحاكم المدفوعة من القضية إلى إجمالي مصاريف المكتب
    cases.forEach(c => { 
        totalAgreed += Number(c.total_agreed_fees) || 0; 
        totalExpenses += Number(c.court_fees_paid) || 0; // التحديث المالي الجديد
    });
    
    installments.forEach(i => { if (i.status === 'مدفوعة') totalPaid += Number(i.amount) || 0; });
    expenses.forEach(e => { totalExpenses += Number(e.amount) || 0; });

    const netProfit = totalPaid - totalExpenses;

    document.getElementById('rep-total-agreed').innerText = totalAgreed.toLocaleString();
    document.getElementById('rep-total-paid').innerText = totalPaid.toLocaleString();
    document.getElementById('rep-total-expenses').innerText = totalExpenses.toLocaleString();
    
    const profitEl = document.getElementById('rep-net-profit');
    profitEl.innerText = netProfit.toLocaleString();
    if(netProfit < 0) profitEl.classList.add('text-danger');
    else profitEl.classList.remove('text-danger');

    return { totalAgreed, totalPaid, totalExpenses, netProfit };
}

function calculateCaseStats(cases) {
    let active = 0, closed = 0, appeal = 0;

    cases.forEach(c => {
        if (c.status === 'نشطة') active++;
        else if (c.status === 'مغلقة' || c.status === 'مكتملة' || c.status === 'محفوظة') closed++;
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
            // دعم مصفوفة المحامين المتعددين
            const assignedArray = Array.isArray(c.assigned_lawyer_id) ? c.assigned_lawyer_id : (c.assigned_lawyer_id ? [c.assigned_lawyer_id] : []);
            
            if (assignedArray.includes(member.id) || c.created_by === member.id) {
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
    if (typeof Chart === 'undefined') return;
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
            labels: ['إجمالي الأتعاب', 'المحصل الفعلي', 'المصروفات والرسوم'],
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
            labels: ['نشطة', 'استئناف / تمييز', 'مغلقة'],
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
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: type === 'danger' ? 'error' : (type === 'info' ? 'info' : type),
            title: escapeHTML(message),
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true
        });
    } else {
        alert(message);
    }
}