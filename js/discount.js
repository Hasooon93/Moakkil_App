document.addEventListener("DOMContentLoaded", function() {
    const calcDtBtn = document.getElementById("calcDtBtn");
    
    if(calcDtBtn) {
        calcDtBtn.addEventListener("click", function() {
            // جلب القيم؛ نستخدم 0 كقيمة افتراضية للخصم والضريبة
            const price = parseFloat(document.getElementById("dtPrice").value);
            const discountPercent = parseFloat(document.getElementById("dtDiscount").value) || 0;
            const taxPercent = parseFloat(document.getElementById("dtTax").value) || 0;
            const resultDiv = document.getElementById("dtResult");

            // التحقق من صحة المدخلات
            if (isNaN(price) || price <= 0 || discountPercent < 0 || taxPercent < 0) {
                resultDiv.className = "mt-4 alert alert-danger";
                resultDiv.innerHTML = "يرجى إدخال سعر صحيح وموجب، ونسب خصم وضريبة صحيحة.";
                resultDiv.classList.remove("d-none");
                return;
            }

            if (discountPercent > 100) {
                resultDiv.className = "mt-4 alert alert-warning";
                resultDiv.innerHTML = "نسبة الخصم لا يمكن أن تتجاوز 100%.";
                resultDiv.classList.remove("d-none");
                return;
            }

            // الحسابات
            const discountAmount = price * (discountPercent / 100);
            const priceAfterDiscount = price - discountAmount;
            const taxAmount = priceAfterDiscount * (taxPercent / 100);
            const finalPrice = priceAfterDiscount + taxAmount;

            // عرض النتيجة
            resultDiv.className = "mt-4 alert alert-success";
            resultDiv.innerHTML = `
                <div class="row text-center mb-3">
                    <div class="col-md-4 border-end border-success">
                        <span class="d-block text-success mb-1" style="font-size: 0.9rem;">قيمة الخصم</span>
                        <strong class="fs-5">${discountAmount.toFixed(2)}</strong>
                    </div>
                    <div class="col-md-4 border-end border-success">
                        <span class="d-block text-success mb-1" style="font-size: 0.9rem;">السعر بعد الخصم</span>
                        <strong class="fs-5">${priceAfterDiscount.toFixed(2)}</strong>
                    </div>
                    <div class="col-md-4">
                        <span class="d-block text-success mb-1" style="font-size: 0.9rem;">قيمة الضريبة المضافة</span>
                        <strong class="fs-5">${taxAmount.toFixed(2)}</strong>
                    </div>
                </div>
                <div class="row text-center border-top border-success pt-3">
                    <div class="col-12">
                        <span class="d-block text-success mb-1" style="font-size: 1rem;">السعر النهائي المطلوب</span>
                        <strong class="fs-3">${finalPrice.toFixed(2)}</strong>
                    </div>
                </div>
            `;
            resultDiv.classList.remove("d-none");
        });
    }
});