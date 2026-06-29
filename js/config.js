/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/config.js
 * الوصف: الإعدادات العامة والمتغيرات المركزية للنظام (V4.2 Enterprise Edition)
 * المهام:
 * 1. إدارة متغيرات البيئة (Environment Variables).
 * 2. توحيد مفاتيح التخزين المحلي (Local Storage Keys) لمنع الأخطاء الإملائية.
 * 3. تهيئة روابط الاتصال السحابي (Cloudflare Workers & R2).
 * 4. دوال التشفير المساعدة للإشعارات (VAPID Keys Converter).
 * ============================================================================
 */

// ============================================================================
// [1] إعدادات البيئة وإصدار النظام (Environment & Version Control)
// ============================================================================
// غيّر القيمة إلى "development" أثناء التطوير لاختبار الأخطاء، وإلى "production" عند الإطلاق
const ENV = "production"; 

// رقم الإصدار (يُستخدم لتحديث الكاش الخاص بـ Service Worker عند إطلاق ميزات جديدة)
const APP_VERSION = "4.2.0"; 

// ============================================================================
// [2] روابط الاتصال السحابي (Cloud & API Endpoints)
// ============================================================================
// ⚠️ رابط الـ Cloudflare Worker الخاص بك (الباك إند) - يجب أن يبدأ دائماً بـ HTTPS
const API_BASE_URL = "https://curly-pond-9975.hassan-alsakka.workers.dev"; 

// رابط سكربت جوجل (Google Apps Script) للنسخ الاحتياطي أو التكامل الخارجي
const GAS_URL = "https://script.google.com/macros/s/AKfycbwxHOR6u00UEP-VLzFwuIICUH1ljhOWAMi8Qai4KGEKB5Khvd6aMSHk_7x_nW5G-ArQ/exec";

// ============================================================================
// [3] كائن الإعدادات المركزي (The Central Configuration Object)
// ============================================================================
const CONFIG = {
    APP_VERSION: APP_VERSION,
    API_URL: API_BASE_URL,
    GAS_URL: GAS_URL,
    
    // --- مفاتيح التخزين المحلي (Local Storage Keys) ---
    // تم تجميعها هنا لتجنب التكرار والخطأ الإملائي في باقي ملفات النظام
    TOKEN_KEY: "moakkil_token",                 // مفتاح تخزين الـ JWT
    USER_KEY: "moakkil_user",                   // مفتاح بيانات المستخدم الحالية
    FIRM_KEY: "moakkil_firm_id",                // مفتاح معرّف المكتب (للعزل التام)
    
    // --- مفاتيح الميزات المتقدمة (Advanced Features Keys) ---
    OFFLINE_QUEUE_KEY: "moakkil_offline_queue", // طابور الطلبات أثناء انقطاع الإنترنت
    BIOMETRIC_ID_KEY: "moakkil_biometric_id",   // معرّف البصمة المسجلة للجهاز
    SAVED_PHONE_KEY: "moakkil_saved_phone",     // رقم الهاتف المرتبط بالبصمة
    
    // --- مفاتيح الأمان وإشعارات الدفع (Web Push API) ---
    // 🔔 مفتاح VAPID العام (Public Key) للتواصل المشفر مع خوادم الإشعارات
    VAPID_PUBLIC_KEY: "BEl62vp95h4An3Wp7K8nS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYv" 
};

// ============================================================================
// [4] دوال التشفير والمساعدة (Cryptographic & Utility Functions)
// ============================================================================
const UTILS = {
    /**
     * دالة مساعدة لتحويل مفتاح VAPID من صيغة Base64 إلى مصفوفة بايتات (Uint8Array)
     * هذه الخطوة إلزامية ليقبلها المتصفح عند الاشتراك في خدمة إشعارات الدفع (Push Notifications).
     * @param {string} base64String - مفتاح VAPID النصي
     * @returns {Uint8Array} - المصفوفة المشفرة الجاهزة
     */
    urlBase64ToUint8Array: (base64String) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
};

// ============================================================================
// [5] تصدير المتغيرات على مستوى النظام (Global Window Exposure)
// ============================================================================
// إتاحة الكائنات للوصول المباشر من أي ملف JavaScript آخر في المشروع
window.API_BASE_URL = API_BASE_URL;
window.CONFIG = CONFIG;
window.UTILS = UTILS;

// ============================================================================
// [6] أدوات التشخيص والمراقبة (Diagnostic Logging)
// ============================================================================
// طباعة رسالة ترحيبية في الـ Console لمعرفة حالة النظام بسرعة (تعمل فقط في بيئة التطوير)
if (ENV === "development") {
    console.log(`%c⚖️ [Moakkil System] Booted Successfully - v${APP_VERSION}`, 'color: #D4AF37; font-size: 14px; font-weight: bold; background: #0B132B; padding: 5px 10px; border-radius: 5px;');
    console.log(`🔗 [API Linked]: ${CONFIG.API_URL}`);
}