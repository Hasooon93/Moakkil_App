// js/config.js - ملف الإعدادات المركزية
const CONFIG = {
    // رابط السيرفر الخاص بك على كلود فلير
    API_URL: "https://curly-pond-9975.hassan-alsakka.workers.dev",
    
    // مفاتيح التخزين المحلي (LocalStorage)
    TOKEN_KEY: "moakkil_v2_token",
    USER_KEY: "moakkil_v2_user",
    FIRM_KEY: "moakkil_v2_firm_id"
};

// سطر اختباري للتأكد من تحميل الملف في المتصفح
console.log("✅ CONFIG Loaded: ", CONFIG.API_URL);