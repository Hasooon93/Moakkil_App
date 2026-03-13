document.addEventListener("DOMContentLoaded", function() {
    const calcShareBtn = document.getElementById("calcShareBtn");
    
    if(calcShareBtn) {
        calcShareBtn.addEventListener("click", function() {
            // جلب القيم
            const total = parseFloat(document.getElementById("shareTotal").value);
            const type = document.getElementById("shareType").value;
            const value = parseFloat(document.getElementById("shareValue").value);
            const resultDiv = document.getElementById("shareResult");

            // التحقق من صحة المدخلات
            if (isNaN(total) || isNaN(value) || total <= 0 || value <= 0) {
                resultDiv.className = "mt-4 alert alert-danger";
                resultDiv.innerHTML = "يرجى إدخال أرقام صحيحة وموجبة في الحقول.";
                resultDiv.classList.remove("d-none");
                return;
            }

            let shareAmount = 0;
            let shareText = "";

            // تحديد نوع العملية الحسابية
            if (type === "count") {
                // تقسيم على عدد
                shareAmount = total / value;
                shareText = `حصة الفرد الواحد (مقسومة على ${value})`;
            } else if (type === "percent") {
                // استخراج نسبة مئوية
                if (value > 100) {
                    resultDiv.className = "mt-4 alert alert-warning";
                    resultDiv.innerHTML = "النسبة المئوية لا يمكن أن تتجاوز 100%.";
                    resultDiv.classList.remove("d-none");
                    return;
                }
                shareAmount = total * (value / 100);
                shareText = `قيمة الحصة المستخرجة (${value}%)`;
            }

            // عرض النتيجة
            resultDiv.className = "mt-4 alert alert-success text-center";
            resultDiv.innerHTML = `
                <span class="d-block text-success mb-2" style="font-size: 1.1rem;">${shareText}</span>
                <strong class="fs-1">${shareAmount.toFixed(2)}</strong>
            `;
            resultDiv.classList.remove("d-none");
        });
    }
});