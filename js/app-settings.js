/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/app-settings.js (Firm Settings & White-Labeling Engine V5.6 - Luxury Edition)
 * الوصف: محرك إعدادات المكتب (White-Labeling)، تخصيص الهوية البصرية، الحسابات الضريبية (VAT)،
 * ومحرك المشاركة الموثق (Smart Share Engine) عبر روابط التوثيق ورموز QR Code،
 * ومفتاح الأمان ضد الحذف النهائي (Hard Delete Protection).
 * 
 * الميزات المحدثة (V5.6 Enterprise):
 * 1. دعم كامل لحقول الهوية المؤسسية (الاسم، الهاتف، العنوان، الشعار، الألوان، العملة، الضريبة، بادئة الفواتير).
 * 2. رفع الشعار الرسمي مباشرة إلى سحابة التخزين الموزع R2 عبر دالة API.uploadFileToR2 الموحدة.
 * 3. حماية صارمة ضد هجمات Stored XSS في ترويسة المكتب عبر استخدام DOM API الآمن بدون innerHTML.
 * 4. تطبيق الألوان المخصصة مع احترام تباين الوضع الداكن عالي التباين (WCAG AAA Compliance).
 * 5. محرك مشاركة مرن يدعم كافة صيغ الروابط الرسمية (بوابة الموكل، إيصالات القبض، والسيرة المهنية).
 * 6. ربط دالة loadMegaSettings لضمان التوافق التلقائي مع إقلاع النظام الأساسي في app-core.js.
 * ============================================================================
 */

window.AppSettings = {
    
    // ==========================================
    // [0] دوال الحماية والتعقيم (Security Helpers)
    // ==========================================

    _escapeHTML: function(str) {
        if (window.AppCore && typeof window.AppCore.escapeHTML === 'function') {
            return window.AppCore.escapeHTML(str);
        }
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>'"]/g, (tag) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag));
    },

    _sanitizeColor: function(color, fallback) {
        if (typeof color === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(color.trim())) {
            return color.trim();
        }
        return fallback;
    },

    /**
     * تحديث اسم وشعار المكتب في الترويسة العلوية بأمان تام ضد Stored XSS
     */
    _renderSafeTopFirmName: function(firmName, logoUrl = '') {
        const topFirmName = document.getElementById('top-firm-name');
        if (!topFirmName) return;

        topFirmName.textContent = ''; // تفريغ آمن لمنع XSS

        if (logoUrl && typeof logoUrl === 'string' && (logoUrl.startsWith('http://') || logoUrl.startsWith('https://') || logoUrl.startsWith('/'))) {
            const img = document.createElement('img');
            img.src = logoUrl;
            img.width = 22;
            img.height = 22;
            img.className = 'me-2 rounded shadow-sm';
            img.style.objectFit = 'cover';
            img.alt = 'Logo';
            img.onerror = function() { this.style.display = 'none'; };
            topFirmName.appendChild(img);
        } else {
            const icon = document.createElement('i');
            icon.className = 'fas fa-balance-scale me-2';
            icon.style.color = 'var(--accent)';
            topFirmName.appendChild(icon);
        }

        const textNode = document.createTextNode(firmName || 'منصة موكّل');
        topFirmName.appendChild(textNode);
    },

    /**
     * تطبيق الهوية اللونية للمكتب على متغيرات CSS مع حماية الوضع الداكن
     */
    _applyThemeColors: function(primaryColor, accentColor) {
        const safePrimary = this._sanitizeColor(primaryColor, '#0B132B');
        const safeAccent = this._sanitizeColor(accentColor, '#D4AF37');

        document.documentElement.style.setProperty('--firm-brand-primary', safePrimary);
        document.documentElement.style.setProperty('--accent', safeAccent);
        document.documentElement.style.setProperty('--gold-luxury', safeAccent);

        const isDarkMode = (document.documentElement.getAttribute('data-theme') === 'dark' || localStorage.getItem('moakkil_dark_mode') === 'true');

        if (!isDarkMode) {
            document.documentElement.style.setProperty('--primary-dark', safePrimary);
            document.documentElement.style.setProperty('--navy', safePrimary);
        } else {
            document.documentElement.style.removeProperty('--primary-dark');
            document.documentElement.style.removeProperty('--navy');
        }
    },

    // ==========================================
    // [1] محرك الإعدادات (Settings Engine)
    // ==========================================

    /**
     * تحميل إعدادات المكتب وتطبيقها في الحقول والواجهة
     */
    loadSettings: async function() {
        try {
            const user = window.AppCore?.currentUser || JSON.parse(localStorage.getItem(window.CONFIG?.USER_KEY || 'moakkil_user') || 'null');
            if (!user || !user.firm_id) return;

            const el = (id) => document.getElementById(id);

            // إظهار زر الإعدادات للمديرين فقط
            const isAdmin = ['admin', 'super_admin'].includes(user.role);
            if (isAdmin && el('firm-settings-btn')) {
                el('firm-settings-btn').style.display = 'block';
            }

            // 1. التطبيق الفوري من الكاش المحلي (Optimistic UI)
            try {
                const cachedSettings = JSON.parse(localStorage.getItem('firm_settings') || 'null');
                const cachedName = localStorage.getItem('firm_name') || cachedSettings?.firm_name || '';
                if (cachedSettings) {
                    this._applyThemeColors(cachedSettings.primary_color, cachedSettings.accent_color);
                    if (cachedName) this._renderSafeTopFirmName(cachedName, cachedSettings.logo_url);
                }
            } catch (cacheErr) {}

            // 2. جلب أحدث الإعدادات الموثقة من السيرفر السحابي
            let firms = null;
            if (window.API && typeof window.API.getFirmSettings === 'function') {
                firms = await window.API.getFirmSettings();
            } else if (window.API && typeof window.API.request === 'function') {
                firms = await window.API.request(`/api/firms?id=eq.${encodeURIComponent(user.firm_id)}`, 'GET');
            }

            if (!Array.isArray(firms) || firms.length === 0) return;
            
            const firm = firms[0];
            const settings = (firm.settings && typeof firm.settings === 'object') ? firm.settings : {};
            const firmName = firm.firm_name || settings.firm_name || 'مكتب المحاماة';
            const phoneVal = settings.phone || firm.phone || firm.firm_phone || '';
            const addressVal = settings.address || firm.address || firm.firm_address || '';
            const logoVal = settings.logo_url || firm.logo_url || '';
            const primaryVal = this._sanitizeColor(settings.primary_color || firm.primary_color, '#0B132B');
            const accentVal = this._sanitizeColor(settings.accent_color || firm.accent_color, '#D4AF37');
            const currencyVal = settings.currency || firm.currency || firm.currency_code || 'د.أ';
            const taxVal = settings.tax_percent !== undefined ? settings.tax_percent : (firm.tax_rate !== undefined ? firm.tax_rate : '16');
            const invPrefixVal = settings.inv_prefix || firm.invoice_prefix || 'INV-2026-';
            const legalTermsVal = settings.legal_terms || firm.legal_terms || '';
            const allowHardDeleteVal = (settings.allow_hard_delete === true || firm.allow_hard_delete === true);

            // تعبئة حقول النموذج في modal الإعدادات
            if (el('firm_setting_name')) el('firm_setting_name').value = firmName;
            if (el('firm_setting_phone')) el('firm_setting_phone').value = phoneVal;
            if (el('firm_setting_address')) el('firm_setting_address').value = addressVal;
            if (el('firm_setting_logo')) el('firm_setting_logo').value = logoVal;
            if (el('firm_setting_primary')) el('firm_setting_primary').value = primaryVal;
            if (el('firm_setting_accent')) el('firm_setting_accent').value = accentVal;
            if (el('firm_setting_currency')) el('firm_setting_currency').value = currencyVal;
            if (el('firm_setting_tax')) el('firm_setting_tax').value = taxVal;
            if (el('firm_setting_inv_prefix')) el('firm_setting_inv_prefix').value = invPrefixVal;
            if (el('firm_setting_legal_terms')) el('firm_setting_legal_terms').value = legalTermsVal;
            
            const hardDeleteCheckbox = el('firm_setting_allow_hard_delete');
            if (hardDeleteCheckbox) {
                hardDeleteCheckbox.checked = allowHardDeleteVal;
            }

            // توحيد كائن الإعدادات المحلي للاستخدام في الفواتير والتقارير
            const unifiedLocalSettings = {
                ...settings,
                firm_name: firmName,
                phone: phoneVal,
                firm_phone: phoneVal,
                address: addressVal,
                firm_address: addressVal,
                logo_url: logoVal,
                primary_color: primaryVal,
                accent_color: accentVal,
                currency: currencyVal,
                tax_percent: taxVal,
                inv_prefix: invPrefixVal,
                legal_terms: legalTermsVal,
                allow_hard_delete: allowHardDeleteVal
            };

            localStorage.setItem('firm_settings', JSON.stringify(unifiedLocalSettings));
            localStorage.setItem('firm_name', firmName);
            
            this._applyThemeColors(primaryVal, accentVal);
            this._renderSafeTopFirmName(firmName, logoVal);

        } catch (error) {
            console.error("Error loading firm settings:", error);
        }
    },

    /**
     * حفظ وتطبيق إعدادات المكتب وتحديث السحابة
     */
    saveSettings: async function(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        
        const formEl = e?.target || document.querySelector('#settingsModal form');
        const btn = formEl ? formEl.querySelector('button[type="submit"]') : null;
        if (btn && btn.disabled) return;

        if (btn) { 
            btn.disabled = true; 
            btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري رفع وحفظ الإعدادات...'; 
        }

        try {
            const user = window.AppCore?.currentUser || JSON.parse(localStorage.getItem(window.CONFIG?.USER_KEY || 'moakkil_user') || 'null');
            if (!user || !user.firm_id) throw new Error('بيانات الجلسة مفقودة أو غير مصرح لك.');
            if (user.role !== 'admin' && user.role !== 'super_admin') {
                throw new Error('صلاحية تعديل إعدادات المكتب مقتصرة على المدير العام أو الشريك الإداري.');
            }

            const el = (id) => document.getElementById(id);
            let logoUrl = (el('firm_setting_logo')?.value || '').trim();
            if (logoUrl.startsWith('📄')) logoUrl = '';

            // معالجة رفع ملف الشعار الجديد إلى R2 إذا تم اختياره
            const fileInput = el('firm_setting_logo_file');
            if (fileInput && fileInput.files && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'png';
                const logoFile = new File([file], `firm_logo_${Date.now()}.${ext}`, { type: file.type || 'image/png' });

                if (window.API && typeof window.API.uploadFileToR2 === 'function') {
                    const uploadRes = await window.API.uploadFileToR2(logoFile, 'logos', user.firm_id);
                    if (uploadRes && (uploadRes.success || uploadRes.r2_key)) {
                        logoUrl = uploadRes.download_url || `/api/public/r2/download?key=${encodeURIComponent(uploadRes.r2_key)}`;
                    } else {
                        throw new Error('فشل في رفع ملف الشعار إلى الأرشيف السحابي.');
                    }
                }
                if (el('firm_setting_logo')) el('firm_setting_logo').value = logoUrl;
                fileInput.value = '';
            }

            const firmName = (el('firm_setting_name')?.value || '').trim() || 'مكتب المحاماة';
            const primaryColor = this._sanitizeColor(el('firm_setting_primary')?.value, '#0B132B');
            const accentColor = this._sanitizeColor(el('firm_setting_accent')?.value, '#D4AF37');
            const allowHardDelete = (el('firm_setting_allow_hard_delete')?.checked === true);
            
            const settingsPayload = {
                firm_name: firmName,
                phone: (el('firm_setting_phone')?.value || '').trim(),
                address: (el('firm_setting_address')?.value || '').trim(),
                logo_url: logoUrl,
                primary_color: primaryColor,
                accent_color: accentColor,
                currency: (el('firm_setting_currency')?.value || 'د.أ').trim(),
                tax_percent: el('firm_setting_tax')?.value || '16',
                inv_prefix: (el('firm_setting_inv_prefix')?.value || 'INV-2026-').trim(),
                legal_terms: (el('firm_setting_legal_terms')?.value || '').trim(),
                allow_hard_delete: allowHardDelete
            };

            const payload = {
                firm_name: firmName,
                firm_phone: settingsPayload.phone,
                firm_address: settingsPayload.address,
                logo_url: logoUrl,
                primary_color: primaryColor,
                accent_color: accentColor,
                currency_code: settingsPayload.currency,
                tax_rate: Number(settingsPayload.tax_percent) || 0,
                invoice_prefix: settingsPayload.inv_prefix,
                legal_terms: settingsPayload.legal_terms,
                allow_hard_delete: allowHardDelete,
                settings: settingsPayload
            };

            let saveResult = null;
            if (window.API && typeof window.API.updateFirmSettings === 'function') {
                saveResult = await window.API.updateFirmSettings(payload);
                if (saveResult && saveResult.error) throw new Error(saveResult.error);
            } else if (window.API && typeof window.API.request === 'function') {
                saveResult = await window.API.request(`/api/firms?id=eq.${encodeURIComponent(user.firm_id)}`, 'PATCH', payload);
                if (saveResult && saveResult.error) throw new Error(saveResult.error);
            }

            // تحديث الكاش المحلي
            localStorage.setItem('firm_settings', JSON.stringify(settingsPayload));
            localStorage.setItem('firm_name', firmName);

            // تطبيق التغييرات فوراً في الواجهة
            this._applyThemeColors(primaryColor, accentColor);
            this._renderSafeTopFirmName(firmName, logoUrl);

            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'success',
                    title: 'تم حفظ إعدادات المكتب',
                    text: 'تم تطبيق الهوية البصرية وشروط الفواتير وتحديث السحابة بنجاح.',
                    timer: 2200,
                    showConfirmButton: false
                });
            } else if (window.AppCore && typeof window.AppCore.showToast === 'function') {
                window.AppCore.showToast('تم حفظ إعدادات المكتب وتطبيقها بنجاح!', 'success');
            }

            if (window.AppCore && typeof window.AppCore.closeModal === 'function') {
                window.AppCore.closeModal('settingsModal');
            }

        } catch (error) {
            console.error("Save Settings Error:", error);
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'error',
                    title: 'تعذر حفظ الإعدادات',
                    text: error.message || 'حدث خطأ غير متوقع أثناء معالجة الطلب.'
                });
            } else if (window.AppCore && typeof window.AppCore.showToast === 'function') {
                window.AppCore.showToast('حدث خطأ أثناء الحفظ: ' + error.message, 'danger');
            }
        } finally {
            if (btn) { 
                btn.disabled = false; 
                btn.innerHTML = '<i class="fas fa-check-double me-2"></i> حفظ وتطبيق الإعدادات فوراً'; 
            }
        }
    },

    // ==========================================
    // [2] محرك المشاركة الذكي (Smart Share Engine)
    // ==========================================
    
    /**
     * دالة لفتح نافذة المشاركة وتوليد الرابط الموثق ورمز QR Code
     * @param {string} type نوع العنصر (case, receipt, cv, file)
     * @param {string} id المعرف (ID)
     * @param {string} title عنوان العنصر للمستخدم
     * @param {string} token التوكن السري (إذا كان قضية)
     * @param {string} pinCode الرمز السري للقضية (اختياري)
     */
    openShareModal: function(type, id, title, token = null, pinCode = null) {
        const baseUrl = window.location.origin;
        let shareUrl = '';

        if (type === 'case' && (token || id)) {
            shareUrl = `${baseUrl}/client.html?token=${encodeURIComponent(token || id)}`;
        } else if (type === 'receipt') {
            shareUrl = `${baseUrl}/verify.html?type=receipt&id=${encodeURIComponent(id)}`;
        } else if (type === 'cv') {
            shareUrl = `${baseUrl}/verify.html?type=cv&id=${encodeURIComponent(id)}`;
        } else {
            shareUrl = `${baseUrl}/verify.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`;
        }

        const titleEl = document.getElementById('share_modal_title');
        if (titleEl) {
            titleEl.innerHTML = `<i class="fas fa-share-alt text-primary me-2"></i> مشاركة الرابط الموثق: <span class="text-navy">${this._escapeHTML(title || '')}</span>`;
        }
        
        const linkInput = document.getElementById('share_modal_link') || document.getElementById('share_link_input');
        if (linkInput) linkInput.value = shareUrl;

        const pinContainer = document.getElementById('share_pin_container');
        const pinInput = document.getElementById('share_pin_input');
        if (pinInput) {
            if (pinCode) {
                if (pinContainer) pinContainer.classList.remove('d-none');
                pinInput.value = pinCode;
            } else if (pinContainer) {
                pinContainer.classList.add('d-none');
                pinInput.value = '';
            }
        }

        const qrContainer = document.getElementById('share_modal_qr') || document.getElementById('share-qrcode');
        if (qrContainer && typeof QRCode !== 'undefined') {
            qrContainer.innerHTML = '';
            try {
                new QRCode(qrContainer, {
                    text: shareUrl,
                    width: 150,
                    height: 150,
                    colorDark : "#0B132B",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.H
                });
            } catch (e) {
                console.warn('QR Code generation warning:', e);
            }
        }

        if (window.AppCore && typeof window.AppCore.openModal === 'function') {
            window.AppCore.openModal('shareModal');
        } else {
            try {
                const modalEl = document.getElementById('shareModal');
                if (modalEl && typeof bootstrap !== 'undefined') {
                    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
                    modal.show();
                }
            } catch(e) {}
        }
    },

    /**
     * نسخ رابط المشاركة للحافظة مع إظهار تنبيه نجاح
     */
    copyShareLink: function() {
        const linkInput = document.getElementById('share_modal_link') || document.getElementById('share_link_input');
        if (linkInput && linkInput.value) {
            linkInput.select();
            linkInput.setSelectionRange(0, 99999);
            
            const notifySuccess = () => {
                if (window.AppCore && typeof window.AppCore.showToast === 'function') {
                    window.AppCore.showToast('تم نسخ الرابط الموثق للحافظة بنجاح!', 'success');
                } else if (window.showToast) {
                    window.showToast('تم نسخ الرابط الموثق للحافظة بنجاح!', 'success');
                }
            };

            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                navigator.clipboard.writeText(linkInput.value).then(notifySuccess).catch(() => {
                    try { document.execCommand('copy'); notifySuccess(); } catch (e) {}
                });
            } else {
                try {
                    document.execCommand('copy');
                    notifySuccess();
                } catch(err) {
                    console.error('Failed to copy', err);
                }
            }
        }
    },

    /**
     * إرسال الرابط الموثق عبر WhatsApp
     */
    shareViaWhatsApp: function() {
        const linkInput = document.getElementById('share_modal_link') || document.getElementById('share_link_input');
        const pinInput = document.getElementById('share_pin_input');
        const pinContainer = document.getElementById('share_pin_container');
        const titleText = document.getElementById('share_modal_title')?.innerText || 'بوابة الموكل القانونية';
        
        if (linkInput && linkInput.value) {
            let rawMsg = `مرحباً،\nمرفق لكم الرابط الموثق من نظام إدارة المكتب القانوني (${titleText.trim()}):\n\n${linkInput.value}\n`;
            if (pinInput && pinInput.value && (!pinContainer || !pinContainer.classList.contains('d-none'))) {
                rawMsg += `\nرمز الدخول السري (PIN): ${pinInput.value}\n(يُرجى الحفاظ على سرية الرمز وعدم مشاركته).\n`;
            }
            rawMsg += `\nمع خالص التحية والتقدير.`;
            const text = encodeURIComponent(rawMsg);
            window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
        }
    }
};

// ============================================================================
// الروابط العامة (Global Bindings) لتوصيل الواجهة بمحرك الإعدادات V5.6
// ============================================================================
window.saveFirmSettings = (e) => window.AppSettings.saveSettings(e);
window.copyShareLink = () => window.AppSettings.copyShareLink();
window.shareViaWhatsApp = () => window.AppSettings.shareViaWhatsApp();
window.loadMegaSettings = () => window.AppSettings.loadSettings();

// إذا تم استدعاء openShareModal من أي بطاقة قضية
if (typeof window.openShareModal !== 'function') {
    window.openShareModal = function(token, pin) {
        window.AppSettings.openShareModal('case', null, 'بوابة الموكل', token, pin);
    };
}

document.addEventListener('DOMContentLoaded', () => {
    window.AppSettings.loadSettings();

    const logoInput = document.getElementById('firm_setting_logo_file');
    if (logoInput) {
        logoInput.addEventListener('change', function() {
            if (this.files && this.files.length > 0) {
                const urlInput = document.getElementById('firm_setting_logo');
                if (urlInput) urlInput.value = "📄 تم إرفاق ملف للرفع: " + this.files[0].name;
            }
        });
    }
});
