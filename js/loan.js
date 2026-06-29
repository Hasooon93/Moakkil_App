/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/loan.js
 * الوصف: محرك حاسبة القروض المصرفية (Bank Loan & Amortization Calculator)
 * المهام:
 * 1. حساب القسط الشهري الثابت بناءً على الفائدة المتناقصة (Amortization Formula).
 * 2. احتساب إجمالي الفوائد والمبلغ النهائي المسدد للبنك.
 * 3. عرض النتيجة في لوحة معلومات (Dashboard) مصغرة واحترافية.
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
    // ========================================================================
    // [1] ربط العناصر (DOM Elements)
    // ========================================================================
    const btnCalc = document.getElementById("calcLoanBtn");
    
    if (btnCalc) {
        btnCalc.addEventListener("click", (e) => {
            e.preventDefault(); // منع تحديث الصفحة عند الضغط

            // ========================================================================
            // [2] جلب القيم من واجهة المستخدم والتحقق من وجود الحقول
            // ========================================================================
            const amountInput = document.getElementById("loanAmount");
            const rateInput = document.getElementById("loanRate");
            const yearsInput = document.getElementById("loanYears");
            const resDiv = document.getElementById("loanResult");

            if (!amountInput || !rateInput || !yearsInput || !resDiv) {
                if (typeof showAlert === 'function') showAlert("خطأ في الواجهة: الحقول المطلوبة غير موجودة.", "error");
                return;
            }

            const amount = parseFloat(amountInput.value);
            const rate = parseFloat(rateInput.value);
            const years = parseFloat(yearsInput.value);

            // ========================================================================
            // [3] جدار الحماية والتحقق المنطقي (Validation Firewall)
            // ========================================================================
            if (isNaN(amount) || isNaN(rate) || isNaN(years) || amount <= 0 || rate < 0 || years <= 0) {
                if (typeof showAlert === 'function') showAlert("يرجى إدخال قيم رقمية صحيحة وموجبة للقرض.", "warning");
                resDiv.classList.add("d-none");
                return;
            }

            // إعطاء تأثير حركي للزر للإيحاء بالمعالجة
            const originalBtnText = btnCalc.innerHTML;
            btnCalc.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري التحليل المالي...';
            btnCalc.disabled = true;

            // ========================================================================
            // [4] تنفيذ العمليات الحسابية (Amortization Math Logic)
            // ========================================================================
            setTimeout(() => {
                const monthlyRate = (rate / 100) / 12; // نسبة الفائدة الشهرية
                const totalPayments = years * 12;      // إجمالي عدد الأقساط

                let monthlyPayment = 0;
                let totalAmount = 0;
                let totalInterest = 0;

                if (rate === 0) {
                    // القرض الحسن (بدون فائدة)
                    monthlyPayment = amount / totalPayments;
                    totalAmount = amount;
                    totalInterest = 0;
                } else {
                    // معادلة القسط الثابت المعتمدة في البنوك
                    monthlyPayment = amount * (monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / (Math.pow(1 + monthlyRate, totalPayments) - 1);
                    totalAmount = monthlyPayment * totalPayments;
                    totalInterest = totalAmount - amount;
                }

                // ========================================================================
                // [5] عرض النتيجة النهائية (Rendering Dashboard)
                // ========================================================================
                
                // دالة مساعدة لتنسيق الأرقام بأسلوب مالي
                const fmt = (num) => num.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

                resDiv.innerHTML = `
                    <h5 class="fw-bold mb-4 text-success border-bottom border-success border-opacity-25 pb-3 text-start">
                        <i class="fas fa-file-invoice-dollar me-2"></i> التقرير المالي المفصل للقرض:
                    </h5>
                    <div class="row g-3">
                        <div class="col-6">
                            <div class="p-3 bg-white border border-success border-opacity-25 rounded-4 shadow-sm text-center h-100 transition-hover">
                                <span class="d-block text-muted small fw-bold mb-2">القسط الشهري المتوقع</span>
                                <b class="text-success fs-4 font-monospace">${fmt(monthlyPayment)} <small class="fs-6 text-muted fw-normal">د.أ</small></b>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="p-3 bg-white border border-danger border-opacity-25 rounded-4 shadow-sm text-center h-100 transition-hover">
                                <span class="d-block text-muted small fw-bold mb-2">إجمالي الفوائد البنكية</span>
                                <b class="text-danger fs-4 font-monospace">${fmt(totalInterest)} <small class="fs-6 text-muted fw-normal">د.أ</small></b>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="p-3 bg-white border border-primary border-opacity-25 rounded-4 shadow-sm text-center h-100 transition-hover">
                                <span class="d-block text-muted small fw-bold mb-2">المبلغ النهائي المسدد</span>
                                <b class="text-primary fs-4 font-monospace">${fmt(totalAmount)} <small class="fs-6 text-muted fw-normal">د.أ</small></b>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="p-3 bg-white border border-secondary border-opacity-25 rounded-4 shadow-sm text-center h-100 transition-hover">
                                <span class="d-block text-muted small fw-bold mb-2">إجمالي الدفعات</span>
                                <b class="text-secondary fs-4 font-monospace">${totalPayments} <small class="fs-6 text-muted fw-normal">شهر</small></b>
                            </div>
                        </div>
                    </div>
                    <div class="alert alert-light border border-info border-opacity-50 small text-muted mt-4 mb-0 fw-bold rounded-3 text-start lh-lg shadow-sm">
                        <i class="fas fa-info-circle me-1 text-info fs-5 align-middle"></i> 
                        تم الحساب بناءً على نظام القسط الثابت (الفائدة المتناقصة) المعتمد رسمياً في معظم البنوك المركزية. الأرقام تقريبية وقد تختلف بشكل طفيف جداً حسب سياسة عمولات التأمين المحددة للبنك.
                    </div>
                `;
                
                // إظهار النتيجة مع الحركات
                resDiv.className = "mt-4 p-4 bg-white border border-2 border-success shadow-lg rounded-4 fade-in";
                resDiv.classList.remove("d-none");

                // استعادة الزر
                btnCalc.innerHTML = originalBtnText;
                btnCalc.disabled = false;
            }, 300);
        });
    }

    // دالة الإشعارات السريعة المضمنة
    function showAlert(message, type = 'success') {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true, position: 'top-end',
                icon: type === 'danger' ? 'error' : (type === 'warning' ? 'warning' : 'success'),
                title: message, showConfirmButton: false, timer: 3000
            });
        } else {
            alert(message);
        }
    }
});