document.addEventListener("DOMContentLoaded", function() {
    const calcBeBtn = document.getElementById("calcBeBtn");
    
    if(calcBeBtn) {
        calcBeBtn.addEventListener("click", function() {
            // جلب القيم من الحقول
            const fixedCosts = parseFloat(document.getElementById("beFixedCosts").value);
            const varCost = parseFloat(document.getElementById("beVarCost").value);
            const price = parseFloat(document.getElementById("bePrice").value);
            const resultDiv = document.getElementById("beResult");

            // التحقق من صحة المدخلات
            if (isNaN(fixedCosts) || isNaN(varCost) || isNaN(price) || fixedCosts < 0 || varCost < 0 || price <= 0) {
                resultDiv.className = "mt-4 alert alert-danger";
                resultDiv.innerHTML = "يرجى إدخال أرقام صحيحة وموجبة في جميع الحقول.";
                resultDiv.classList.remove("d-none");
                return;
            }

            // التأكد من أن سعر البيع أعلى من التكلفة المتغيرة (هامش المساهمة موجب)
            if (price <= varCost) {
                resultDiv.className = "mt-4 alert alert-warning";
                resultDiv.innerHTML = "سعر البيع يجب أن يكون أعلى من التكلفة المتغيرة، وإلا فلن تتحقق نقطة التعادل أبداً وستستمر الخسارة.";
                resultDiv.classList.remove("d-none");
                return;
            }

            // الحسابات
            const contributionMargin = price - varCost; // هامش المساهمة للوحدة
            const breakEvenUnits = fixedCosts / contributionMargin; // نقطة التعادل بالوحدات
            const breakEvenRevenue = breakEvenUnits * price; // نقطة التعادل بالقيمة (الإيرادات)

            // عرض النتيجة
            resultDiv.className = "mt-4 alert alert-success";
            resultDiv.innerHTML = `
                <div class="row text-center">
                    <div class="col-md-6 border-end border-success">
                        <span class="d-block text-success mb-1" style="font-size: 0.9rem;">الكمية المطلوبة للتعادل</span>
                        <strong class="fs-4">${Math.ceil(breakEvenUnits)} وحدة</strong>
                    </div>
                    <div class="col-md-6">
                        <span class="d-block text-success mb-1" style="font-size: 0.9rem;">إجمالي الإيرادات عند التعادل</span>
                        <strong class="fs-4">${breakEvenRevenue.toFixed(2)}</strong>
                    </div>
                </div>
            `;
            resultDiv.classList.remove("d-none");
        });
    }
});