// js/breakeven.js
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("calcBeBtn");
    if(btn) {
        btn.addEventListener("click", () => {
            const fixedCosts = parseFloat(document.getElementById("beFixedCosts").value);
            const varCost = parseFloat(document.getElementById("beVarCost").value);
            const price = parseFloat(document.getElementById("bePrice").value);
            const resDiv = document.getElementById("beResult");

            if(isNaN(fixedCosts) || isNaN(varCost) || isNaN(price) || fixedCosts < 0 || varCost < 0 || price <= 0) {
                showAlert("يرجى إدخال قيم صحيحة وموجبة", "warning");
                resDiv.classList.add("d-none");
                return;
            }

            if(price <= varCost) {
                showAlert("سعر البيع يجب أن يكون أكبر من التكلفة المتغيرة لتحقيق تعادل", "error");
                resDiv.classList.add("d-none");
                return;
            }

            const breakevenUnits = fixedCosts / (price - varCost);
            const breakevenSales = breakevenUnits * price;

            resDiv.innerHTML = `
                <h6 class="fw-bold mb-3 text-warning border-bottom pb-2 text-dark">نتيجة نقطة التعادل:</h6>
                <div class="d-flex justify-content-between mb-2 text-dark"><span>الوحدات المطلوبة للتعادل:</span> <b>${Math.ceil(breakevenUnits)} وحدة</b></div>
                <div class="d-flex justify-content-between text-dark"><span>قيمة مبيعات التعادل:</span> <b class="fs-5">${breakevenSales.toFixed(2)} د.أ</b></div>
            `;
            resDiv.classList.remove("d-none");
        });
    }
});