// js/share.js
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("calcShareBtn");
    if(btn) {
        btn.addEventListener("click", () => {
            const total = parseFloat(document.getElementById("shareTotal").value);
            const type = document.getElementById("shareType").value;
            const value = parseFloat(document.getElementById("shareValue").value);
            const resDiv = document.getElementById("shareResult");

            if (isNaN(total) || isNaN(value) || total <= 0 || value <= 0) {
                showAlert("يرجى إدخال أرقام صحيحة وموجبة في الحقول.", "warning");
                resDiv.classList.add("d-none");
                return;
            }

            let shareAmount = 0;
            let shareText = "";

            if (type === "count") {
                shareAmount = total / value;
                shareText = `حصة الفرد الواحد (مقسمة على ${value})`;
            } else if (type === "percent") {
                if (value > 100) {
                    showAlert("النسبة المئوية لا يمكن أن تتجاوز 100%.", "warning");
                    resDiv.classList.add("d-none");
                    return;
                }
                shareAmount = total * (value / 100);
                shareText = `قيمة الحصة المستخرجة (${value}%)`;
            }

            resDiv.innerHTML = `
                <h6 class="fw-bold mb-3 text-info border-bottom pb-2">النتيجة:</h6>
                <div class="d-flex justify-content-between align-items-center">
                    <span>${shareText}:</span> 
                    <b class="fs-4">${shareAmount.toFixed(2)} د.أ</b>
                </div>
            `;
            resDiv.classList.remove("d-none");
        });
    }
});