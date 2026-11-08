/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/breakeven.js
 * الوصف: محرك حاسبة نقطة التعادل التجارية (Break-even Point Calculator)
 * المهام:
 * 1. معالجة التكاليف الثابتة والمتغيرة لتحديد حجم المبيعات المطلوب لعدم الخسارة.
 * 2. التحقق المنطقي من الأرقام (يمنع أن تكون التكلفة المتغيرة أعلى من سعر البيع).
 * 3. عرض النتائج بتنسيق مالي احترافي.
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
    // ========================================================================
    // [1] ربط العناصر (DOM Elements)
    // ========================================================================
    const btnCalc = document.getElementById("calcBeBtn");
    const resDiv = document.getElementById("beResult");

    if (btnCalc) {
        btnCalc.addEventListener("click", () => {
            
            // ========================================================================
            // [2] جلب وتجهيز القيم المدخلة (Data Fetching)
            // ========================================================================
            const fixedCosts = parseFloat(document.getElementById("beFixedCosts").value);
            const varCost = parseFloat(document.getElementById("beVarCost").value);
            const price = parseFloat(document.getElementById("bePrice").value);

            // ========================================================================
            // [3] جدار الحماية والتحقق المنطقي (Validation Firewall)
            // ========================================================================
            
            // التأكد من أن جميع المدخلات أرقام صحيحة وموجبة
            if (isNaN(fixedCosts) || isNaN(varCost) || isNaN(price) || fixedCosts < 0 || varCost < 0 || price <= 0) {
                if (typeof showAlert === 'function') {
                    showAlert("يرجى إدخال قيم رقمية صحيحة وموجبة في جميع الحقول.", "warning");
                }
                resDiv.classList.add("d-none");
                return;
            }

            // التحقق التجاري: لا يمكن تحقيق تعادل إذا كانت تكلفة القطعة أعلى أو تساوي سعر بيعها!
            if (price <= varCost) {
                if (typeof showAlert === 'function') {
                    showAlert("خطأ منطقي: يجب أن يكون سعر البيع أكبر من التكلفة المتغيرة لتحقيق نقطة التعادل.", "error");
                }
                resDiv.classList.add("d-none");
                return;
            }

            // إعطاء تأثير حركي للزر للإيحاء بالمعالجة
            const originalBtnText = btnCalc.innerHTML;
            btnCalc.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري التحليل...';
            btnCalc.disabled = true;

            // ========================================================================
            // [4] تنفيذ العمليات الحسابية (Core Calculations)
            // ========================================================================
            setTimeout(() => {
                // المعادلة: نقطة التعادل بالوحدات = التكاليف الثابتة / هامش المساهمة للوحدة (السعر - التكلفة المتغيرة)
                const breakevenUnitsRaw = fixedCosts / (price - varCost);
                // نجبر الكسر للوحدة الأعلى لأنه لا يمكن بيع "نصف وحدة"
                const breakevenUnits = Math.ceil(breakevenUnitsRaw); 
                
                // المعادلة: نقطة التعادل بالقيمة (الإيرادات المطلوبة)
                const breakevenSales = breakevenUnits * price;

                // ========================================================================
                // [5] عرض النتيجة النهائية (Rendering Results)
                // ========================================================================
                resDiv.innerHTML = `
                    <h6 class="fw-bold mb-4 border-bottom border-dark border-opacity-25 pb-2 text-dark text-start">
                        <i class="fas fa-check-circle me-1 text-success"></i> النتيجة التحليلية لنقطة التعادل:
                    </h6>
                    <div class="d-flex justify-content-between align-items-center mb-3 text-dark">
                        <span class="fw-bold"><i class="fas fa-box text-warning me-1"></i> الوحدات المطلوبة للتعادل:</span> 
                        <b class="fs-4 font-monospace text-primary bg-white px-3 py-1 rounded shadow-sm">
                            ${breakevenUnits.toLocaleString('en-US')} <small class="fs-6 text-muted">وحدة</small>
                        </b>
                    </div>
                    <div class="d-flex justify-content-between align-items-center text-dark">
                        <span class="fw-bold"><i class="fas fa-money-bill-wave text-success me-1"></i> قيمة المبيعات للتعادل:</span> 
                        <b class="fs-4 font-monospace text-success bg-white px-3 py-1 rounded shadow-sm">
                            ${breakevenSales.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} <small class="fs-6 text-muted">د.أ</small>
                        </b>
                    </div>
                `;
                
                // إظهار النتيجة مع حركة التلاشي الناعمة
                resDiv.classList.remove("d-none");
                resDiv.classList.add("fade-in");

                // استعادة حالة الزر
                btnCalc.innerHTML = originalBtnText;
                btnCalc.disabled = false;
            }, 300); // تأخير بسيط جداً لإعطاء إحساس بالمعالجة المتقدمة
        });
    }
});