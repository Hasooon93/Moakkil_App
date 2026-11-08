/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/ai-handler.js
 * الوصف: العقل المدبر للذكاء الاصطناعي في الواجهة الأمامية (Front-End AI Core)
 * المهام الرئيسية:
 * 1. تهيئة مكتبة PDF.js بشكل ديناميكي (Lazy Loading).
 * 2. ضغط الصور (Image Compression) لتقليل حجم البيانات وتسريع الـ Vision OCR.
 * 3. قراءة ملفات PDF محلياً (Local PDF Text Extraction) لتخفيف العبء عن الباك إند.
 * 4. التعرف التلقائي على الملفات وتوجيهها للمعالجة الصحيحة (Router).
 * ============================================================================
 */

const AIHandler = {
    // مرجع مكتبة PDF.js سيتم تعيينه عند التهيئة لتجنب الأخطاء
    pdfjsLib: window['pdfjs-dist/build/pdf'] || null,

    /**
     * ========================================================================
     * [1] دالة تهيئة مكتبة PDF.js (Initialization)
     * ========================================================================
     * تتأكد من تحميل المكتبة وتربط الـ Worker الخاص بها من شبكة CDN آمنة
     */
    initPDFjs: async function() {
        if (this.pdfjsLib) return true; // إذا تم التحميل مسبقاً، لا داعي للتكرار
        
        if (window['pdfjs-dist/build/pdf']) {
            this.pdfjsLib = window['pdfjs-dist/build/pdf'];
            // ربط الـ Worker من CDN لضمان عمل المكتبة بسلاسة دون حجب من المتصفح
            this.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            return true;
        }
        throw new Error('مكتبة pdf.js غير محملة. يُرجى تضمينها في ملف الـ HTML الخاص بك.');
    },

    /**
     * ========================================================================
     * [2] دالة ضغط الصور (Image Compression & Optimization)
     * ========================================================================
     * تستخدم تقنية HTML5 Canvas لتقليل حجم الصورة مع الحفاظ على وضوح النص للـ OCR
     * * @param {File} imageFile - ملف الصورة الأصلي القادم من المستخدم
     * @param {number} maxWidth - أقصى عرض (1200 بكسل يعتبر مثالياً لدقة الـ OCR)
     * @param {number} quality - جودة الصورة (0.8 لتقليل الحجم دون فقدان المعالم)
     * @returns {Promise<string>} - تعيد الصورة مضغوطة بصيغة Base64 جاهزة للإرسال
     */
    compressImage: function(imageFile, maxWidth = 1200, quality = 0.8) {
        return new Promise((resolve, reject) => {
            // حماية للتحقق من نوع الملف
            if (!imageFile || !imageFile.type.startsWith('image/')) {
                reject(new Error('الملف المرفوع ليس صورة صالحة.'));
                return;
            }

            const reader = new FileReader();
            reader.readAsDataURL(imageFile);
            
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;

                    // الحفاظ على نسبة العرض إلى الارتفاع (Aspect Ratio)
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }

                    // رسم الصورة بالقياسات المحسنة على الـ Canvas
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // استخراج النتيجة كـ Base64 لسهولة إرسالها للـ API
                    const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                    
                    // إزالة بادئة Data URI للحصول على الـ Base64 الصافي للـ Worker
                    const cleanBase64 = compressedBase64.split(',')[1];
                    resolve(cleanBase64);
                };
                
                img.onerror = (err) => reject(new Error('فشل تحميل الصورة أثناء عملية الضغط.'));
            };
            
            reader.onerror = (err) => reject(new Error('فشل قراءة ملف الصورة من جهازك.'));
        });
    },

    /**
     * ========================================================================
     * [3] دالة استخراج النص من ملف PDF (Local Text Extraction)
     * ========================================================================
     * تقوم بفك تشفير الـ PDF وقراءته صفحة صفحة داخل جهاز المستخدم
     * * @param {File} pdfFile - ملف الـ PDF المرفوع
     * @returns {Promise<string>} - النص الكامل المستخرج من جميع الصفحات
     */
    extractTextFromPDF: async function(pdfFile) {
        try {
            await this.initPDFjs();

            const arrayBuffer = await pdfFile.arrayBuffer();
            const pdf = await this.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';

            // حلقة برمجية (Loop) للمرور على جميع صفحات الـ PDF
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                
                // تجميع النصوص وتكوين مسافات صحيحة للحفاظ على السياق القانوني
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n\n';
            }

            return fullText.trim();
        } catch (error) {
            console.error('[AI Handler Error] - PDF Extraction:', error);
            throw new Error('فشل استخراج النص من ملف الـ PDF. قد يكون الملف محمياً بكلمة مرور أو تالفاً.');
        }
    },

    /**
     * ========================================================================
     * [4] الدالة الموحدة لمعالجة أي ملف (Main Router / Interface)
     * ========================================================================
     * تقوم بالتعرف التلقائي على نوع الملف وتوجيهه للمعالجة المناسبة ثم تغليفه كـ Payload
     * * @param {File} file - الملف المرفوع من قبل المستخدم
     * @returns {Promise<Object>} - كائن يحتوي على نوع المعالجة والـ Payload النهائي
     */
    processFile: async function(file) {
        if (!file) throw new Error('لم يتم تحديد أي ملف لمعالجته.');

        const fileType = file.type;

        try {
            if (fileType === 'application/pdf') {
                // توجيه لمعالجة الـ PDF
                const text = await this.extractTextFromPDF(file);
                return {
                    type: 'pdf',
                    isTextExtracted: true,
                    payload: text // نرسل النص المستخرج للـ API للتلخيص السريع
                };
                
            } else if (fileType.startsWith('image/')) {
                // توجيه لمعالجة الصور والـ OCR
                const base64 = await this.compressImage(file);
                return {
                    type: 'image',
                    isTextExtracted: false,
                    payload: base64 // نرسل الصورة المضغوطة للـ Vision Model
                };
                
            } else {
                throw new Error('نوع الملف غير مدعوم للذكاء الاصطناعي. يُرجى رفع صور أو ملفات PDF فقط.');
            }
        } catch (error) {
            // إعادة توجيه الخطأ للواجهة ليتم عرضه للمستخدم بشكل لائق
            throw error; 
        }
    }
};

/**
 * ========================================================================
 * [5] تصدير الكائن (Export)
 * ========================================================================
 * إتاحة الكائن ليكون متاحاً على مستوى الـ Window لتسهيل استدعائه 
 * من أي ملف JS آخر في المشروع بكل سهولة: AIHandler.processFile(...)
 */
window.AIHandler = AIHandler;