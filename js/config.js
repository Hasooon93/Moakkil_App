// js/config.js - الإعدادات العامة والمتغيرات المركزية للنظام

// 1. رابط الـ Cloudflare Worker الخاص بك (الباك إند)
const API_BASE_URL = "https://curly-pond-9975.hassan-alsakka.workers.dev"; 

// 2. إعدادات النظام الداخلية (متوافقة مع جميع ملفات JS التي قمنا ببرمجتها)
const CONFIG = {
    API_URL: API_BASE_URL,
    
    // ⚠️ هام جداً لحل مشكلة رفع الملفات (404 / CORS):
    // قم بمسح الرابط أدناه، وضع بدلاً منه الرابط الحقيقي الذي حصلت عليه بعد نشر سكربت جوجل كـ (Web App)
    // تأكد من أن الصلاحية (Who has access) مضبوطة على (Anyone)
    GAS_URL: "https://script.google.com/macros/s/AKfycbwxHOR6u00UEP-VLzFwuIICUH1ljhOWAMi8Qai4KGEKB5Khvd6aMSHk_7x_nW5G-ArQ/exec", 
    
    // مفاتيح التخزين المحلي في المتصفح (Local Storage Keys)
    TOKEN_KEY: "moakkil_token",
    USER_KEY: "moakkil_user",
    FIRM_KEY: "moakkil_firm_id"
};

// التأكد من توفر المتغيرات على مستوى النوافذ (Global Window Objects)
window.API_BASE_URL = API_BASE_URL;
window.CONFIG = CONFIG;