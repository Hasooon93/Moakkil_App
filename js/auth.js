// js/auth.js - نسخة التشخيص

async function requestOTP() {
    console.log("🚀 تم الضغط على زر الإرسال"); // سيظهر في الـ Console
    
    const phone = document.getElementById('phone').value;
    if (!phone) {
        alert("يرجى إدخال رقم الهاتف");
        return;
    }

    const btn = document.querySelector('button');
    btn.disabled = true;
    btn.innerText = "جاري الاتصال بالسيرفر...";

    try {
        console.log("📡 جاري الإرسال إلى الرابط:", `${CONFIG.API_URL}/api/auth/admin/request-otp`);
        
        const response = await fetch(`${CONFIG.API_URL}/api/auth/admin/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });

        console.log("📥 استجابة السيرفر حالة:", response.status);

        if (response.ok) {
            console.log("✅ نجح الطلب، جاري الانتقال لشاشة الكود");
            document.getElementById('phone-section').classList.add('d-none');
            document.getElementById('otp-section').classList.remove('d-none');
            alert("تم إرسال الكود لتيليجرام");
        } else {
            const errorData = await response.json();
            console.error("❌ فشل السيرفر:", errorData);
            alert("فشل السيرفر: " + (errorData.error || "خطأ غير معروف"));
        }
    } catch (error) {
        console.error("❌ خطأ اتصال:", error);
        alert("حدث خطأ في الاتصال: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "إرسال كود الدخول";
    }
}

async function verifyOTP() {
    const phone = document.getElementById('phone').value;
    const otp = document.getElementById('otp').value;

    try {
        const response = await fetch(`${CONFIG.API_URL}/api/auth/admin/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, otp })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            localStorage.setItem(CONFIG.TOKEN_KEY, data.token);
            localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(data.user));
            window.location.href = 'app.html';
        } else {
            alert(data.error || "كود خاطئ");
        }
    } catch (error) {
        alert("خطأ في التحقق");
    }
}