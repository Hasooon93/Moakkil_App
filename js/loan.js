// js/loan.js - حاسبة القروض المصرفية (الفائدة المتناقصة / Amortization)

document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("calcLoanBtn");
    
    if(btn) {
        btn.addEventListener("click", (e) => {
            e.preventDefault(); // منع تحديث الصفحة عند الضغط على الزر

            // التأكد من وجود الحقول في الـ HTML أولاً لتجنب خطأ null
            const amountInput = document.getElementById("loanAmount");
            const rateInput = document.getElementById("loanRate");
            const yearsInput = document.getElementById("loanYears");
            const resDiv = document.getElementById("loanResult");

            if (!amountInput || !rateInput || !yearsInput || !resDiv) {
                showAlert("خطأ في الواجهة: تأكد من تحديث أكواد HTML لتطابق المعرفات المطلوبة.", "error");
                return;
            }

            // جلب القيم من واجهة المستخدم
            const amount = parseFloat(amountInput.value);
            const rate = parseFloat(rateInput.value);
            const years = parseFloat(yearsInput.value);

            // التحقق من صحة الإدخالات
            if(isNaN(amount) || isNaN(rate) || isNaN(years) || amount <= 0 || rate < 0 || years <= 0) {
                showAlert("يرجى إدخال قيم صحيحة وموجبة للقرض.", "warning");
                resDiv.classList.add("d-none");
                return;
            }

            // نسبة الفائدة الشهرية
            const monthlyRate = (rate / 100) / 12;
            // إجمالي عدد الدفعات (الأشهر)
            const totalPayments = years * 12;

            let monthlyPayment = 0;
            let totalAmount = 0;
            let totalInterest = 0;

            if (rate === 0) {
                // إذا كان القرض حسن (بدون فائدة)
                monthlyPayment = amount / totalPayments;
                totalAmount = amount;
                totalInterest = 0;
            } else {
                // معادلة القسط الثابت (الفائدة المتناقصة)
                monthlyPayment = amount * (monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / (Math.pow(1 + monthlyRate, totalPayments) - 1);
                totalAmount = monthlyPayment * totalPayments;
                totalInterest = totalAmount - amount;
            }

            // طباعة النتائج في واجهة المستخدم
            resDiv.innerHTML = `
                <h6 class="fw-bold mb-3 text-navy border-bottom pb-2"><i class="fas fa-hand-holding-usd text-accent me-2"></i> تفاصيل احتساب القرض:</h6>
                <div class="row g-3">
                    <div class="col-6">
                        <div class="p-3 bg-white border rounded shadow-sm text-center h-100">
                            <span class="d-block text-muted small fw-bold mb-1">القسط الشهري المتوقع</span>
                            <b class="text-success fs-5">${monthlyPayment.toFixed(2)} <small>د.أ</small></b>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="p-3 bg-white border rounded shadow-sm text-center h-100">
                            <span class="d-block text-muted small fw-bold mb-1">إجمالي الفوائد</span>
                            <b class="text-danger fs-5">${totalInterest.toFixed(2)} <small>د.أ</small></b>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="p-3 bg-white border rounded shadow-sm text-center h-100">
                            <span class="d-block text-muted small fw-bold mb-1">إجمالي المبلغ المسدد</span>
                            <b class="text-navy fs-5">${totalAmount.toFixed(2)} <small>د.أ</small></b>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="p-3 bg-white border rounded shadow-sm text-center h-100">
                            <span class="d-block text-muted small fw-bold mb-1">عدد الدفعات</span>
                            <b class="text-secondary fs-5">${totalPayments} <small>شهر</small></b>
                        </div>
                    </div>
                </div>
                <div class="alert alert-light border small text-muted mt-3 mb-0">
                    <i class="fas fa-info-circle me-1 text-primary"></i> تم الحساب بناءً على نظام القسط الثابت (الفائدة المتناقصة) المعتمد في معظم البنوك. الأرقام تقريبية وقد تختلف قليلاً حسب سياسة البنك وعمولات التأمين.
                </div>
            `;
            resDiv.className = "mt-4 p-3 bg-light border border-2 border-primary shadow-sm rounded-3 fade-in";
            resDiv.classList.remove("d-none");
        });
    }

    // دالة الإشعارات السريعة 
    function showAlert(message, type = 'success') {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: type === 'danger' ? 'error' : (type === 'warning' ? 'warning' : 'success'),
                title: message,
                showConfirmButton: false,
                timer: 3000
            });
        } else {
            alert(message);
        }
    }
});