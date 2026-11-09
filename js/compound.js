/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/compound.js
 * الإصدار: V5.6 Enterprise Edition (Compound Interest & Investment Legal Engine)
 * ============================================================================
 * الميزات والمهام:
 * 1. حساب القيمة المستقبلية لرأس المال مع المساهمات الشهرية المتكررة بدقة مصرفية.
 * 2. احتساب صافي الأرباح التراكمية ونسبة النمو المركب الإجمالي.
 * 3. توليد جدول النمو التراكمي السنوي (Year-by-Year Growth Table) لدعم قضايا فوات الكسب والنزاعات الاستثمارية.
 * 4. خاصية نسخ التقرير المالي المنسق بنقرة واحدة لإرفاقه بالمذكرات واللوائح.
 * 5. التوافق التام مع الهوية البصرية الملكية V5.6 والوضع الليلي فائق التباين (WCAG AAA).
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
    const btnCalc = document.getElementById("calcCompBtn");
    const resDiv = document.getElementById("compResult");

    if (btnCalc && resDiv) {
        btnCalc.addEventListener("click", (e) => {
            if (e) e.preventDefault();

            // 1. جلب المدخلات
            const principalInput = document.getElementById("compPrincipal");
            const additionInput = document.getElementById("compAddition");
            const rateInput = document.getElementById("compRate");
            const yearsInput = document.getElementById("compYears");

            if (!principalInput || !rateInput || !yearsInput) {
                showAlert("خطأ في الواجهة: بعض حقول الحاسبة غير متوفرة.", "error");
                return;
            }

            const principal = parseFloat(principalInput.value);
            const addition = parseFloat(additionInput ? additionInput.value : 0) || 0;
            const rate = parseFloat(rateInput.value);
            const years = parseInt(yearsInput.value, 10);

            // 2. التحقق من صحة المدخلات
            if (isNaN(principal) || isNaN(rate) || isNaN(years) || principal < 0 || rate < 0 || years <= 0) {
                showAlert("يرجى إدخال قيم رقمية صحيحة (المبلغ والنسبة والمدة يجب أن تكون أكبر من صفر).", "warning");
                resDiv.classList.add("d-none");
                return;
            }

            if (years > 50) {
                showAlert("مدة الاستثمار تتجاوز الحد الأقصى للمحاكاة المالية (50 سنة).", "warning");
                return;
            }

            // تأثير التحميل
            const originalBtnText = btnCalc.innerHTML;
            btnCalc.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري احتساب العائد التراكمي...';
            btnCalc.disabled = true;

            setTimeout(() => {
                // 3. الحسابات التراكمية المركبة
                const r = rate / 100;
                let futureValue = principal;
                let totalContributions = principal;
                let yearlyBreakdown = [];
                const maxDisplayYears = Math.min(years, 30);

                for (let y = 1; y <= maxDisplayYears; y++) {
                    for (let m = 1; m <= 12; m++) {
                        futureValue += addition;
                        futureValue *= (1 + (r / 12));
                        totalContributions += addition;
                    }
                    yearlyBreakdown.push({
                        year: y,
                        contributions: totalContributions,
                        interest: Math.max(0, futureValue - totalContributions),
                        balance: futureValue
                    });
                }

                // استكمال الحساب إن كانت المدة تتجاوز 30 سنة
                if (years > 30) {
                    for (let y = 31; y <= years; y++) {
                        for (let m = 1; m <= 12; m++) {
                            futureValue += addition;
                            futureValue *= (1 + (r / 12));
                            totalContributions += addition;
                        }
                    }
                }

                const totalInterest = Math.max(0, futureValue - totalContributions);

                if (!isFinite(futureValue) || isNaN(futureValue)) {
                    showAlert("تعذر احتساب الناتج للقيم المدخلة، يرجى التحقق من الأرقام.", "error");
                    btnCalc.innerHTML = originalBtnText;
                    btnCalc.disabled = false;
                    return;
                }

                // 4. استخراج العملة المعتمدة
                let currency = 'د.أ';
                try {
                    const settings = JSON.parse(localStorage.getItem('firm_settings') || '{}');
                    currency = settings.currency || settings.currency_code || 'د.أ';
                } catch (e) {}

                // دالة تنسيق الأرقام
                const fmt = (num) => Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                // نص ملخص العائد المركب الجاهز للنسخ
                const legalSummaryText = `[تقرير العائد التراكمي والمركب - نظام موكّل]\n` +
                    `• رأس المال الأولي: ${fmt(principal)} ${currency}\n` +
                    `• المساهمة الشهرية الإضافية: ${fmt(addition)} ${currency}\n` +
                    `• نسبة العائد السنوي: ${rate}%\n` +
                    `• المدة الاستثمارية: ${years} سنوات (${years * 12} شهراً)\n` +
                    `• إجمالي رأس المال المدفوع: ${fmt(totalContributions)} ${currency}\n` +
                    `• صافي الأرباح المركبة: ${fmt(totalInterest)} ${currency}\n` +
                    `• القيمة المستقبلية الإجمالية: ${fmt(futureValue)} ${currency}`;

                // 5. حقن النتائج بتصميم V5.6 الملكي المتجاوب مع الوضع الليلي
                resDiv.innerHTML = `
                    <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
                        <h5 class="fw-bold mb-0 text-primary d-flex align-items-center">
                            <i class="fas fa-chart-line me-2 fs-4"></i> التقرير المالي للعائد المركب التراكمي
                        </h5>
                        <button class="btn btn-sm btn-outline-dark fw-bold rounded-pill px-3 shadow-sm" onclick="copyCompoundSummary(${JSON.stringify(legalSummaryText)})" title="نسخ تقرير الأرباح للمذكرات القانونية">
                            <i class="fas fa-copy me-1 text-primary"></i> نسخ الملخص المالي
                        </button>
                    </div>

                    <div class="row g-3 mb-4">
                        <div class="col-6 col-md-4">
                            <div class="p-3 bg-light border border-secondary border-opacity-25 rounded-4 shadow-sm text-center h-100">
                                <span class="d-block text-muted small fw-bold mb-2">إجمالي رأس المال المدفوع</span>
                                <b class="text-dark fs-4 font-monospace">${fmt(totalContributions)}</b>
                                <small class="text-muted d-block mt-1 font-monospace" style="font-size: 0.75rem;">${currency}</small>
                            </div>
                        </div>
                        <div class="col-6 col-md-4">
                            <div class="p-3 bg-light border border-success border-opacity-25 rounded-4 shadow-sm text-center h-100">
                                <span class="d-block text-muted small fw-bold mb-2">صافي الأرباح المركبة</span>
                                <b class="text-success fs-4 font-monospace">${fmt(totalInterest)}</b>
                                <small class="text-success d-block mt-1 font-monospace" style="font-size: 0.75rem;">${currency}</small>
                            </div>
                        </div>
                        <div class="col-12 col-md-4">
                            <div class="p-3 bg-light border border-primary border-opacity-25 rounded-4 shadow-sm text-center h-100">
                                <span class="d-block text-muted small fw-bold mb-2">القيمة المستقبلية الإجمالية</span>
                                <b class="text-primary fs-3 font-monospace">${fmt(futureValue)}</b>
                                <small class="text-primary d-block mt-1 font-monospace" style="font-size: 0.75rem;">${currency}</small>
                            </div>
                        </div>
                    </div>

                    <!-- Year by Year Growth Accordion -->
                    <div class="accordion border-0 shadow-sm rounded-4 overflow-hidden mb-3" id="compoundAccordion">
                        <div class="accordion-item border-0">
                            <h2 class="accordion-header" id="headingCompound">
                                <button class="accordion-button collapsed fw-bold bg-light text-dark py-3" type="button" data-bs-toggle="collapse" data-bs-target="#collapseCompound" aria-expanded="false" aria-controls="collapseCompound">
                                    <i class="fas fa-table-cells me-2 text-primary"></i> عرض جدول النمو التراكمي سنوياً (Year-by-Year Growth Table)
                                </button>
                            </h2>
                            <div id="collapseCompound" class="accordion-collapse collapse" aria-labelledby="headingCompound" data-bs-parent="#compoundAccordion">
                                <div class="accordion-body p-0">
                                    <div class="table-responsive">
                                        <table class="table table-hover table-striped mb-0 text-center" style="font-size: 0.9rem;">
                                            <thead class="table-dark">
                                                <tr>
                                                    <th class="py-2">السنة</th>
                                                    <th class="py-2">إجمالي المودع</th>
                                                    <th class="py-2">الأرباح المتراكمة</th>
                                                    <th class="py-2">الرصيد الإجمالي</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${yearlyBreakdown.map(r => `
                                                    <tr>
                                                        <td class="fw-bold align-middle">السنة ${r.year}</td>
                                                        <td class="text-muted fw-bold font-monospace align-middle">${fmt(r.contributions)} ${currency}</td>
                                                        <td class="text-success fw-bold font-monospace align-middle">${fmt(r.interest)} ${currency}</td>
                                                        <td class="text-primary fw-bold font-monospace align-middle">${fmt(r.balance)} ${currency}</td>
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
                        <i class="fas fa-info-circle me-1 text-info fs-5 align-middle"></i> 
                        تم الاحتساب وفق صيغة الفائدة المركبة الشهرية الدورية المعتمدة في تقييم عوائد المحافظ الاستثمارية، مع احتساب الإيداع الشهري المنتظم في بداية كل دورة شهرية.
                    </div>
                `;

                resDiv.className = "mt-4 p-4 card-custom border-2 border-primary shadow-lg rounded-4 fade-in";
                resDiv.classList.remove("d-none");

                // استعادة الزر
                btnCalc.innerHTML = originalBtnText;
                btnCalc.disabled = false;
            }, 250);
        });
    }
});

/**
 * نسخ التقرير المالي للعائد المركب
 */
window.copyCompoundSummary = function(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'تم نسخ تقرير العائد المركب للحافظة بنجاح!',
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
