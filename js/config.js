// js/config.js - ملف الإعدادات المركزية
const CONFIG = {
    // رابط السيرفر الخاص بك على كلود فلير (Worker)
    API_URL: "https://curly-pond-9975.hassan-alsakka.workers.dev",
    
    // رابط تطبيق جوجل ويب (Google Apps Script) لرفع وأرشفة الملفات
    GAS_URL: "https://script.google.com/macros/s/AKfycbwxHOR6u00UEP-VLzFwuIICUH1ljhOWAMi8Qai4KGEKB5Khvd6aMSHk_7x_nW5G-ArQ/exec",
    
    // مفاتيح التخزين المحلي (LocalStorage)
    TOKEN_KEY: "moakkil_v2_token",
    USER_KEY: "moakkil_v2_user",
    FIRM_KEY: "moakkil_v2_firm_id"
};

// سطر اختباري للتأكد من تحميل الملف في المتصفح
console.log("✅ CONFIG Loaded. API:", CONFIG.API_URL);