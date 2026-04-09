// moakkil-finance.js
// الدستور المطبق: حوكمة مالية، توليد فواتير (Tax Compliance)، إحصائيات دقيقة.

document.addEventListener('DOMContentLoaded', () => {

    // عناصر الواجهة
    const installmentsTableBody = document.getElementById('installmentsTableBody');
    const expensesTableBody = document.getElementById('expensesTableBody');
    const payCaseSelect = document.getElementById('pay_case_id');
    const expCaseSelect = document.getElementById('exp_case_id');
    
    // الإحصائيات
    const totalIncomeText = document.getElementById('totalIncomeText');
    const totalExpenseText = document.getElementById('totalExpenseText');
    const netBalanceText = document.getElementById('netBalanceText');

    let currentInvoiceNumber = '';

    // ==========================================
    // 1. التبويبات وفتح النوافذ
    // ==========================================
    window.switchTab = (tabName) => {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        event.currentTarget.classList.add('active');
        document.getElementById(`tab-${tabName}`).classList.add('active');
    };

    window.openModal = (modalId) => {
        document.getElementById(modalId).classList.add('active');
        if(modalId === 'paymentModal') {
            generateInvoiceNumber();
            document.getElementById('pay_date').valueAsDate = new Date();
        } else if(modalId === 'expenseModal') {
            document.getElementById('exp_date').valueAsDate = new Date();
        }
    };

    window.closeModal = (modalId) => {
        document.getElementById(modalId).classList.remove('active');
        document.getElementById(modalId === 'paymentModal' ? 'paymentForm' : 'expenseForm').reset();
    };

    // ==========================================
    // 2. الميزة المكتشفة: توليد رقم فاتورة رسمي
    // ==========================================
    function generateInvoiceNumber() {
        const year = new Date().getFullYear();
        // إنشاء رقم عشوائي سداسي أو استخدام Timestamp
        const randomNum = Math.floor(100000 + Math.random() * 900000);
        currentInvoiceNumber = `INV-${year}-${randomNum}`;
        document.getElementById('generatedInvoiceNumber').innerText = `رقم الفاتورة المعتمد: ${currentInvoiceNumber}`;
    }

    // ==========================================
    // 3. جلب البيانات المالية وعرضها
    // ==========================================
    async function loadFinancialData() {
        try {
            // جلب القضايا (لتعبئة الـ Dropdowns)
            const cases = await api.get('/api/cases?select=id,case_internal_id');
            payCaseSelect.innerHTML = '<option value="">-- اختر القضية --</option>';
            expCaseSelect.innerHTML = '<option value="">-- اختر القضية --</option>';
            
            cases.forEach(c => {
                const optStr = `<option value="${c.id}">${c.case_internal_id}</option>`;
                payCaseSelect.innerHTML += optStr;
                expCaseSelect.innerHTML += optStr;
            });

            // جلب الدفعات والمصاريف
            const [installments, expenses] = await Promise.all([
                api.get('/api/installments?select=*,mo_cases(case_internal_id)'),
                api.get('/api/expenses?select=*,mo_cases(case_internal_id)')
            ]);

            renderInstallments(installments || []);
            renderExpenses(expenses || []);
            calculateStats(installments || [], expenses || []);

        } catch (error) {
            console.error("Financial Data Error:", error);
            installmentsTableBody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">خطأ: ${error.message}</td></tr>`;
        }
    }

    function renderInstallments(data) {
        installmentsTableBody.innerHTML = '';
        if(data.length === 0) {
            installmentsTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:gray;">لا توجد دفعات مسجلة</td></tr>';
            return;
        }

        data.forEach(inst => {
            const statusClass = inst.status === 'مدفوعة' ? 'status-paid' : 'status-pending';
            // إذا لم يكن هنالك رقم فاتورة (بيانات قديمة)، نضع علامة --
            const invNum = inst.invoice_number || '<span style="color:#ccc;">غير مرقمة</span>'; 
            const caseIdStr = inst.mo_cases?.case_internal_id || 'غير محدد';
            
            installmentsTableBody.innerHTML += `
                <tr>
                    <td style="font-family: monospace; font-weight: bold; color: #6f42c1;">${invNum}</td>
                    <td>${caseIdStr}</td>
                    <td>${inst.due_date ? inst.due_date.split('T')[0] : '--'}</td>
                    <td style="font-weight: bold; color: #198754;">${parseFloat(inst.amount).toFixed(2)}</td>
                    <td><span class="status-badge ${statusClass}">${inst.status || 'مدفوعة'}</span></td>
                </tr>
            `;
        });
    }

    function renderExpenses(data) {
        expensesTableBody.innerHTML = '';
        if(data.length === 0) {
            expensesTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:gray;">لا توجد مصاريف مسجلة</td></tr>';
            return;
        }

        data.forEach(exp => {
            const caseIdStr = exp.mo_cases?.case_internal_id || 'مكتب عام';
            expensesTableBody.innerHTML += `
                <tr>
                    <td>${caseIdStr}</td>
                    <td>${exp.expense_date ? exp.expense_date.split('T')[0] : '--'}</td>
                    <td>${exp.description || '--'}</td>
                    <td style="font-weight: bold; color: #dc3545;">${parseFloat(exp.amount).toFixed(2)}</td>
                </tr>
            `;
        });
    }

    function calculateStats(installments, expenses) {
        // حساب المقبوضات (نحسب فقط الدفعات المدفوعة فعلياً)
        const totalIncome = installments
            .filter(i => i.status === 'مدفوعة')
            .reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);

        // حساب المصروفات
        const totalExpense = expenses
            .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

        const netBalance = totalIncome - totalExpense;

        totalIncomeText.innerText = `${totalIncome.toFixed(2)} د.أ`;
        totalExpenseText.innerText = `${totalExpense.toFixed(2)} د.أ`;
        netBalanceText.innerText = `${netBalance.toFixed(2)} د.أ`;
        
        netBalanceText.style.color = netBalance >= 0 ? '#0d6efd' : '#dc3545';
    }

    // ==========================================
    // 4. إرسال البيانات للباك إند
    // ==========================================
    document.getElementById('paymentForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإصدار...';
        btn.disabled = true;

        try {
            const payload = {
                case_id: document.getElementById('pay_case_id').value,
                amount: parseFloat(document.getElementById('pay_amount').value),
                due_date: document.getElementById('pay_date').value,
                status: document.getElementById('pay_status').value,
                invoice_number: currentInvoiceNumber // حقل הפاتورة الذي اكتشفناه
            };

            await api.post('/api/installments', payload);
            // ملاحظة هامة: الـ Worker مبرمج لتحديث total_paid في mo_cases تلقائياً عند إضافة installment!
            
            alert(`تم حفظ الدفعة وإصدار الفاتورة رقم: ${currentInvoiceNumber}`);
            closeModal('paymentModal');
            loadFinancialData();
        } catch (error) {
            alert('فشل حفظ الدفعة: ' + error.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });

    document.getElementById('expenseForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
        btn.disabled = true;

        try {
            const payload = {
                case_id: document.getElementById('exp_case_id').value,
                amount: parseFloat(document.getElementById('exp_amount').value),
                expense_date: document.getElementById('exp_date').value,
                description: document.getElementById('exp_desc').value
            };

            await api.post('/api/expenses', payload);
            
            alert('تم تسجيل المصروف وخصمه من صندوق القضية.');
            closeModal('expenseModal');
            loadFinancialData();
        } catch (error) {
            alert('فشل حفظ المصروف: ' + error.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });

    // بدء التشغيل
    loadFinancialData();
});