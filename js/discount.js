// js/discount.js
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("calcDtBtn");
    if(btn) {
        btn.addEventListener("click", () => {
            const price = parseFloat(document.getElementById("dtPrice").value);
            const discountRate = parseFloat(document.getElementById("dtDiscount").value) || 0;
            const taxRate = parseFloat(document.getElementById("dtTax").value) || 0;
            const resDiv = document.getElementById("dtResult");

            if(isNaN(price) || price <= 0 || discountRate < 0 || taxRate < 0) {
                showAlert("يرجى إدخال مبلغ صحيح ونسب موجبة", "warning");
                resDiv.classList.add("d-none");
                return;
            }

            const discountAmount = price * (discountRate / 100);
            const priceAfterDiscount = price - discountAmount;
            const taxAmount = priceAfterDiscount * (taxRate / 100);
            const finalPrice = priceAfterDiscount + taxAmount;

            resDiv.innerHTML = `
                <h6 class="fw-bold mb-3 text-danger border-bottom pb-2">تفاصيل الفاتورة:</h6>
                <div class="d-flex justify-content-between mb-2"><span>المبلغ الأصلي:</span> <b>${price.toFixed(2)} د.أ</b></div>
                <div class="d-flex justify-content-between mb-2"><span>قيمة الخصم (${discountRate}%):</span> <b class="text-success">- ${discountAmount.toFixed(2)} د.أ</b></div>
                <div class="d-flex justify-content-between mb-2"><span>السعر بعد الخصم:</span> <b>${priceAfterDiscount.toFixed(2)} د.أ</b></div>
                <div class="d-flex justify-content-between mb-2"><span>قيمة الضريبة (${taxRate}%):</span> <b class="text-danger">+ ${taxAmount.toFixed(2)} د.أ</b></div>
                <div class="d-flex justify-content-between mt-3 pt-2 border-top border-danger"><span>السعر النهائي المطلوب:</span> <b class="fs-5">${finalPrice.toFixed(2)} د.أ</b></div>
            `;
            resDiv.classList.remove("d-none");
        });
    }
});