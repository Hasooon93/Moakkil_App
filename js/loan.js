/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/loan.js
 * الإصدار: V5.6 Enterprise Edition (Bank Loan & Amortization Legal Engine)
 * ============================================================================
 * الميزات والمهام:
 * 1. حساب القسط الشهري الثابت وفق معادلة الاستهلاك المصرفي (Amortization Formula).
 * 2. احتساب إجمالي الفوائد والمبلغ النهائي المسدد للبنك مع دعم القرض الحسن (0%).
 * 3. توليد جدول الاستهلاك السنوي (Amortization Schedule) لدعم دعاوى محاسبة البنوك.
 * 4. إمكانية نسخ التقرير المالي المنسق بنقرة واحدة لإرفاقه بالمذكرات واللوائح القضائية.
 * 5. دعم الهوية البصرية الملكية V5.6 والوضع الليلي عالي التباين (WCAG AAA).
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
    const btnCalc = document.getElementById("calcLoanBtn");
    
    if (btnCalc) {
        btnCalc.addEventListener("click", (e) => {
            e.preventDefault();

            // 1. جلب العناصر والمدخلات
            const amountInput = document.getElementById("loanAmount");
            const rateInput = document.getElementById("loanRate");
            const yearsInput = document.getElementById("loanYears");
            const resDiv = document.getElementById("loanResult");

            if (!amountInput || !rateInput || !yearsInput || !resDiv) {
                showAlert("خطأ في الواجهة: الحقول المطلوبة غير موجودة.", "error");
                return;
            }

            const amount = parseFloat(amountInput.value);
            const rate = parseFloat(rateInput.value);
            const years = parseFloat(yearsInput.value);

            // 2. التحقق من صحة المدخلات
            if (isNaN(amount) || isNaN(rate) || isNaN(years) || amount <= 0 || rate < 0 || years <= 0) {
                showAlert("يرجى إدخال قيم رقمية موجبة وصحيحة لجميع حقول القرض.", "warning");
                resDiv.classList.add("d-none");
                return;
            }

            if (years > 40) {
                showAlert("مدة سداد القرض تتجاوز الحد الأقصى المعمول به مصرفياً (40 سنة).", "warning");
                return;
            }

            // تأثير التحميل المؤقت
            const originalBtnText = btnCalc.innerHTML;
            btnCalc.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري التدقيق والتحليل المصرفي...';
            btnCalc.disabled = true;

            setTimeout(() => {
                // 3. المعادلات المصرفية الرسمية
                const monthlyRate = (rate / 100) / 12;
                const totalPayments = Math.round(years * 12);

                let monthlyPayment = 0;
                let totalAmount = 0;
                let totalInterest = 0;

                if (rate === 0) {
                    // قرض حسن (بدون فوائد)
                    monthlyPayment = amount / totalPayments;
                    totalAmount = amount;
                    totalInterest = 0;
                } else {
                    // معادلة القسط الثابت (Annuity Formula) المعتمدة لدى البنوك المركزية
                    const factor = Math.pow(1 + monthlyRate, totalPayments);
                    monthlyPayment = amount * (monthlyRate * factor) / (factor - 1);
                    totalAmount = monthlyPayment * totalPayments;
                    totalInterest = totalAmount - amount;
                }

                if (!isFinite(monthlyPayment) || isNaN(monthlyPayment)) {
                    showAlert("تعذر احتساب القسط بدقة للقيم المدخلة، يرجى التحقق من المدخلات.", "error");
                    btnCalc.innerHTML = originalBtnText;
                    btnCalc.disabled = false;
                    return;
                }

                // 4. بناء جدول الاستهلاك السنوي (Amortization Schedule)
                let amortizationRows = [];
                let balance = amount;
                const maxDisplayYears = Math.min(Math.ceil(years), 30);

                for (let y = 1; y <= maxDisplayYears; y++) {
                    let yearInterest = 0;
                    let yearPrincipal = 0;
                    const monthsInThisYear = (y === Math.ceil(years) && totalPayments % 12 !== 0) ? (totalPayments % 12) : 12;

                    for (let m = 1; m <= monthsInThisYear; m++) {
                        let mInterest = rate === 0 ? 0 : (balance * monthlyRate);
                        let mPrincipal = monthlyPayment - mInterest;
                        if (balance < mPrincipal) {
                            mPrincipal = balance;
                        }
                        balance -= mPrincipal;
                        yearInterest += mInterest;
                        yearPrincipal += mPrincipal;
                        if (balance <= 0.001) {
                            balance = 0;
                            break;
                        }
                    }

                    amortizationRows.push({
                        year: y,
                        principalPaid: yearPrincipal,
                        interestPaid: yearInterest,
                        totalPaid: yearPrincipal + yearInterest,
                        remainingBalance: Math.max(0, balance)
                    });

                    if (balance <= 0) break;
                }

                // 5. استخراج العملة المعتمدة
                let currency = 'د.أ';
                try {
                    const settings = JSON.parse(localStorage.getItem('firm_settings') || '{}');
                    currency = settings.currency || settings.currency_code || 'د.أ';
                } catch (e) {}

                // دالة تنسيق الأرقام
                const fmt = (num) => Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                // نص ملخص القرض الجاهز للنسخ
                const legalSummaryText = `[تقرير الحسبة المصرفية للقرض - نظام موكّل]\n` +
                    `• قيمة القرض الأصلية: ${fmt(amount)} ${currency}\n` +
                    `• نسبة الفائدة السنوية: ${rate}%\n` +
                    `• مدة التمويل: ${years} سنة (${totalPayments} قسطاً شهرياً)\n` +
                    `• القسط الشهري الثابت: ${fmt(monthlyPayment)} ${currency}\n` +
                    `• إجمالي الفوائد البنكية: ${fmt(totalInterest)} ${currency}\n` +
                    `• إجمالي المبلغ الواجب سداده: ${fmt(totalAmount)} ${currency}`;

                // 6. حقن واجهة النتيجة التفاعلية المحدثة
                resDiv.innerHTML = `
                    <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
                        <h5 class="fw-bold mb-0 text-success d-flex align-items-center">
                            <i class="fas fa-file-invoice-dollar me-2 fs-4"></i> التقرير المالي المفصل للقرض
                        </h5>
                        <button class="btn btn-sm btn-outline-dark fw-bold rounded-pill px-3 shadow-sm" onclick="copyLoanSummary(${JSON.stringify(legalSummaryText)})" title="نسخ التقرير المالي للاستخدام في المذكرات القانونية">
                            <i class="fas fa-copy me-1 text-primary"></i> نسخ الملخص القضائي
                        </button>
                    </div>

                    <div class="row g-3 mb-4">
                        <div class="col-6 col-md-3">
                            <div class="p-3 bg-light border border-success border-opacity-25 rounded-4 shadow-sm text-center h-100">
                                <span class="d-block text-muted small fw-bold mb-2">القسط الشهري المتوقع</span>
                                <b class="text-success fs-4 font-monospace">${fmt(monthlyPayment)}</b>
                                <small class="text-muted d-block mt-1 font-monospace" style="font-size: 0.75rem;">${currency}</small>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="p-3 bg-light border border-danger border-opacity-25 rounded-4 shadow-sm text-center h-100">
                                <span class="d-block text-muted small fw-bold mb-2">إجمالي الفوائد البنكية</span>
                                <b class="text-danger fs-4 font-monospace">${fmt(totalInterest)}</b>
                                <small class="text-danger d-block mt-1 font-monospace" style="font-size: 0.75rem;">${currency}</small>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="p-3 bg-light border border-primary border-opacity-25 rounded-4 shadow-sm text-center h-100">
                                <span class="d-block text-muted small fw-bold mb-2">المبلغ النهائي المسدد</span>
                                <b class="text-primary fs-4 font-monospace">${fmt(totalAmount)}</b>
                                <small class="text-primary d-block mt-1 font-monospace" style="font-size: 0.75rem;">${currency}</small>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="p-3 bg-light border border-secondary border-opacity-25 rounded-4 shadow-sm text-center h-100">
                                <span class="d-block text-muted small fw-bold mb-2">إجمالي عدد الأقساط</span>
                                <b class="text-dark fs-4 font-monospace">${totalPayments}</b>
                                <small class="text-muted d-block mt-1 font-monospace" style="font-size: 0.75rem;">شهراً</small>
                            </div>
                        </div>
                    </div>

                    <!-- Amortization Schedule Accordion -->
                    <div class="accordion border-0 shadow-sm rounded-4 overflow-hidden mb-3" id="amortizationAccordion">
                        <div class="accordion-item border-0">
                            <h2 class="accordion-header" id="headingAmort">
                                <button class="accordion-button collapsed fw-bold bg-light text-dark py-3" type="button" data-bs-toggle="collapse" data-bs-target="#collapseAmort" aria-expanded="false" aria-controls="collapseAmort">
                                    <i class="fas fa-table-list me-2 text-warning"></i> عرض جدول استهلاك أصل الدين والفوائد سنوياً (Amortization Schedule)
                                </button>
                            </h2>
                            <div id="collapseAmort" class="accordion-collapse collapse" aria-labelledby="headingAmort" data-bs-parent="#amortizationAccordion">
                                <div class="accordion-body p-0">
                                    <div class="table-responsive">
                                        <table class="table table-hover table-striped mb-0 text-center" style="font-size: 0.9rem;">
                                            <thead class="table-dark">
                                                <tr>
                                                    <th class="py-2">السنة</th>
                                                    <th class="py-2">أصل الدين المسدد</th>
                                                    <th class="py-2">الفوائد المسددة</th>
                                                    <th class="py-2">إجمالي المسدد سنوياً</th>
                                                    <th class="py-2">الرصيد المتبقي</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${amortizationRows.map(r => `
                                                    <tr>
                                                        <td class="fw-bold align-middle">السنة ${r.year}</td>
                                                        <td class="text-success fw-bold font-monospace align-middle">${fmt(r.principalPaid)} ${currency}</td>
                                                        <td class="text-danger fw-bold font-monospace align-middle">${fmt(r.interestPaid)} ${currency}</td>
                                                        <td class="text-primary fw-bold font-monospace align-middle">${fmt(r.totalPaid)} ${currency}</td>
                                                        <td class="text-dark fw-bold font-monospace align-middle">${fmt(r.remainingBalance)} ${currency}</td>
                                                    </tr>
                                                `).join('')}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="alert alert-light border border-info border-opacity-50 small text-muted mt-3 mb-0 fw-bold rounded-4 text-start lh-lg shadow-sm">
                        <i class="fas fa-shield-alt me-1 text-info fs-5 align-middle"></i> 
                        تم الاحتساب وفق نظام الاستهلاك الثابت بالفوائد المتناقصة المعتمد في البنوك المركزية (قانون المعاملات المالية). الأرقام قطعية رياضياً وتستثني أي رسوم تأمين حياة أو عمولات فتح ملف قد تفرضها البنوك التجارية.
                    </div>
                `;

                resDiv.className = "mt-4 p-4 card-custom border-2 border-success shadow-lg rounded-4 fade-in";
                resDiv.classList.remove("d-none");

                // استعادة الزر
                btnCalc.innerHTML = originalBtnText;
                btnCalc.disabled = false;
            }, 250);
        });
    }
});

/**
 * نسخ الملخص المالي للقرض إلى الحافظة لاستخدامه في اللوائح
 */
window.copyLoanSummary = function(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'تم نسخ تقرير القرض للحافظة بنجاح!',
                showConfirmButton: false,
                timer: 2500
            });
        }
    }).catch(() => {
        showAlert("تعذر النسخ التلقائي للحافظة.", "warning");
    });
};

/**
 * دالة التنبيهات الموحدة
 */
function showAlert(message, type = 'info') {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: type === 'danger' ? 'error' : (type === 'warning' ? 'warning' : (type === 'success' ? 'success' : 'info')),
            title: message,
            showConfirmButton: false,
            timer: 3000
        });
    } else {
        alert(message);
    }
}
