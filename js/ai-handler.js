/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/ai-handler.js
 * الإصدار: V5.6 Enterprise Edition (Front-End AI Core & OCR Pre-Processor)
 * ============================================================================
 * الميزات والمهام:
 * 1. تهيئة مكتبة PDF.js ذاتياً بالتحميل الكسول التلقائي (Self-Healing Lazy Loading).
 * 2. ضغط وتحسين صور المستندات والوكالات (Image Optimization) لخدمة نماذج الرؤية Llama 3.2 Vision.
 * 3. فك تشفير واستخراج نصوص ملفات الـ PDF محلياً على جهاز العميل لتسريع التحليل القانوني.
 * 4. موجه ذكي موحد (Unified File Router) لتوجيه أي ملف للنموذج المناسب (Text vs Vision).
 * 5. واجهات برمجية مساعدة لصياغة البنود التعاقدية واستخراج ملخصات القضايا والدفوع.
 * ============================================================================
 */

const AIHandler = {
    // مرجع مكتبة PDF.js
    pdfjsLib: null,

    /**
     * ========================================================================
     * [1] دالة تهيئة مكتبة PDF.js مع التحميل الكسول الذكي (Self-Healing Lazy Load)
     * ========================================================================
     */
    initPDFjs: async function() {
        if (this.pdfjsLib) return true;

        // فحص وجود المكتبة في النطاق العام
        if (typeof window !== 'undefined') {
            if (window['pdfjs-dist/build/pdf']) {
                this.pdfjsLib = window['pdfjs-dist/build/pdf'];
            } else if (window.pdfjsLib) {
                this.pdfjsLib = window.pdfjsLib;
            }
        }

        if (this.pdfjsLib) {
            this.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            return true;
        }

        // إذا لم تكن محملة، نقوم بحقنها ديناميكياً من CDN موثوق
        if (typeof document !== 'undefined') {
            try {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                    script.crossOrigin = 'anonymous';
                    script.onload = () => {
                        this.pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
                        if (this.pdfjsLib) {
                            this.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                            resolve();
                        } else {
                            reject(new Error('تعذر ربط كائن pdfjsLib بعد التحميل.'));
                        }
                    };
                    script.onerror = () => reject(new Error('فشل تحميل مكتبة PDF.js من شبكة التوزيع السحابية.'));
                    document.head.appendChild(script);
                });
                return true;
            } catch (err) {
                console.error("[AIHandler Error] Dynamic PDF.js Load:", err);
                throw new Error('تعذر تهيئة قارئ ملفات PDF. تأكد من اتصالك بالشبكة.');
            }
        }

        throw new Error('بيئة التشغيل غير مهيأة لتحميل مكتبات الواجهة.');
    },

    /**
     * ========================================================================
     * [2] دالة ضغط وتحسين الصور (Image Compression for OCR / Vision Models)
     * ========================================================================
     * تستخدم تقنية Canvas لمعالجة الصورة وتقليص حجمها مع المحافظة على دقة الحروف
     * @param {File|Blob} imageFile - ملف الصورة المرفوع
     * @param {number} maxWidth - أقصى عرض (1400 بكسل مثالي جداً لـ Llama 3.2 Vision)
     * @param {number} quality - جودة الضغط (0.82 للتوازن بين صغر الحجم ووضوح الخطوط)
     * @returns {Promise<string>} - تعيد كود Base64 صريح بدون بادئة Data URI
     */
    compressImage: function(imageFile, maxWidth = 1400, quality = 0.82) {
        return new Promise((resolve, reject) => {
            if (!imageFile || !imageFile.type || !imageFile.type.startsWith('image/')) {
                reject(new Error('الملف المرفوع ليس ملف صورة صالح.'));
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

                    // المحافظة على أبعاد ونسبة العرض للارتفاع
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    
                    // تحسين دقة الرسم
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, width, height);

                    const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                    const cleanBase64 = compressedBase64.split(',')[1];
                    resolve(cleanBase64);
                };
                
                img.onerror = () => reject(new Error('فشل تحميل الصورة أثناء عملية المعالجة.'));
            };
            
            reader.onerror = () => reject(new Error('فشل قراءة ملف الصورة من الذاكرة المحلية.'));
        });
    },

    /**
     * ========================================================================
     * [3] استخراج النصوص من ملفات PDF محلياً (Local PDF Text Extraction)
     * ========================================================================
     * تقرأ نصوص ملف الـ PDF صفحة بصفحة مع حماية المتصفح من الانهيار في الملفات الضخمة
     * @param {File|Blob} pdfFile - ملف الـ PDF
     * @param {number} maxPages - الحد الأقصى لعدد الصفحات المقروءة في الجلسة
     * @returns {Promise<string>} - النص الكامل المستخرج
     */
    extractTextFromPDF: async function(pdfFile, maxPages = 30) {
        try {
            await this.initPDFjs();

            const arrayBuffer = await pdfFile.arrayBuffer();
            const pdf = await this.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            const totalPages = Math.min(pdf.numPages, maxPages);

            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += `--- [الصفحة ${pageNum}] ---\n` + pageText + '\n\n';
            }

            if (pdf.numPages > maxPages) {
                fullText += `\n[ملاحظة النظام: تم استخراج أول ${maxPages} صفحة فقط من أصل ${pdf.numPages} للحفاظ على سرعة المعالجة واستقرار المتصفح].\n`;
            }

            return fullText.trim();
        } catch (error) {
            console.error('[AI Handler Error] PDF Extraction:', error);
            throw new Error('فشل استخراج النص من ملف PDF. قد يكون الملف تالفاً أو محمياً بكلمة مرور.');
        }
    },

    /**
     * ========================================================================
     * [4] الموجه الشامل لمعالجة الملفات (Universal File Processor & Router)
     * ========================================================================
     * يتعرف تلقائياً على نوع الملف ويوجهه للمعالجة المثلى
     * @param {File} file - الملف المرفوع
     * @returns {Promise<Object>} - كائن يحتوي على نوع المعالجة والـ payload
     */
    processFile: async function(file) {
        if (!file) throw new Error('لم يتم تحديد أي ملف لمعالجته.');

        const fileType = file.type || '';
        const fileName = (file.name || '').toLowerCase();

        try {
            if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
                const text = await this.extractTextFromPDF(file);
                return {
                    type: 'pdf',
                    isTextExtracted: true,
                    payload: text,
                    fileName: file.name
                };
                
            } else if (fileType.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(fileName)) {
                const base64 = await this.compressImage(file);
                return {
                    type: 'image',
                    isTextExtracted: false,
                    payload: base64,
                    fileName: file.name
                };
                
            } else {
                throw new Error('نوع الملف غير مدعوم للتحليل الذكي. يُرجى رفع مستندات PDF أو صور فقط.');
            }
        } catch (error) {
            throw error; 
        }
    },

    /**
     * ========================================================================
     * [5] خدمات الذكاء الاصطناعي المباشرة (Direct AI Services)
     * ========================================================================
     */

    /**
     * استخراج بيانات المستند أو الهوية باستخدام نموذج الرؤية (OCR Service)
     */
    ocrDocument: async function(imageFile) {
        const compressedBase64 = await this.compressImage(imageFile);
        const apiRunner = (typeof fetchAPI === 'function') ? fetchAPI : (typeof API !== 'undefined' && typeof API.fetchAPI === 'function' ? API.fetchAPI : null);
        
        if (!apiRunner) {
            throw new Error("محرك fetchAPI غير متاح.");
        }

        const payload = {
            type: 'ocr_document',
            image_data: compressedBase64
        };

        return await apiRunner('/api/ai/process', 'POST', payload);
    },

    /**
     * صياغة بند قانوني متخصص
     */
    draftLegalClause: async function(clauseType, context) {
        const apiRunner = (typeof fetchAPI === 'function') ? fetchAPI : (typeof API !== 'undefined' && typeof API.fetchAPI === 'function' ? API.fetchAPI : null);
        
        if (!apiRunner) {
            throw new Error("محرك fetchAPI غير متاح.");
        }

        const payload = {
            type: 'legal_draft',
            content: `قم بصياغة بند قانوني متخصص من نوع: [${clauseType}] في السياق التالي: ${context}`
        };

        return await apiRunner('/api/ai/process', 'POST', payload);
    },

    /**
     * استخراج ملخص قضائي ذكي من مستند
     */
    extractCaseSummary: async function(file) {
        const processed = await this.processFile(file);
        const apiRunner = (typeof fetchAPI === 'function') ? fetchAPI : (typeof API !== 'undefined' && typeof API.fetchAPI === 'function' ? API.fetchAPI : null);
        
        if (!apiRunner) {
            throw new Error("محرك fetchAPI غير متاح.");
        }

        const payload = {
            type: 'case_summary',
            content: processed.payload,
            is_image: !processed.isTextExtracted
        };

        return await apiRunner('/api/ai/process', 'POST', payload);
    }
};

// إتاحة الكائن في النطاق العام
if (typeof window !== 'undefined') {
    window.AIHandler = AIHandler;
}

// تصدير لبيئة Node.js إن وجدت لغايات الاختبار
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIHandler;
}
