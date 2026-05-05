/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/ai-handler.js
 * الوصف: العقل المدبر للذكاء الاصطناعي في الواجهة الأمامية (Front-End AI Core)
 * المهام الرئيسية:
 * 1. ضغط الصور (Image Compression) لتقليل حجم البيانات وتسريع الـ Vision OCR.
 * 2. قراءة ملفات PDF محلياً (Local PDF Text Extraction) لتخفيف العبء عن الباك إند.
 * ============================================================================
 */

const AIHandler = {
    // مرجع مكتبة PDF.js سيتم تعيينه عند التهيئة
    pdfjsLib: window['pdfjs-dist/build/pdf'] || null,

    /**
     * [1] دالة تهيئة مكتبة PDF.js
     * تتأكد من تحميل المكتبة وتربط الـ Worker الخاص بها
     */
    initPDFjs: async function() {
        if (this.pdfjsLib) return true;
        
        if (window['pdfjs-dist/build/pdf']) {
            this.pdfjsLib = window['pdfjs-dist/build/pdf'];
            // ربط الـ Worker من CDN لضمان عمل المكتبة بسلاسة دون حجب
            this.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            return true;
        }
        throw new Error('مكتبة pdf.js غير محملة. سيتم إضافتها في خطوة تعديل الـ HTML.');
    },

    /**
     * [2] دالة ضغط الصور (Image Compression)
     * تستخدم تقنية HTML5 Canvas لتقليل حجم الصورة مع الحفاظ على وضوح النص للـ OCR
     * * @param {File} imageFile - ملف الصورة الأصلي
     * @param {number} maxWidth - أقصى عرض (1200 بكسل يعتبر مثالياً للـ OCR)
     * @param {number} quality - جودة الصورة (0.8 لتقليل الحجم دون فقدان المعالم)
     * @returns {Promise<string>} - الصورة مضغوطة بصيغة Base64
     */
    compressImage: function(imageFile, maxWidth = 1200, quality = 0.8) {
        return new Promise((resolve, reject) => {
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

                    // رسم الصورة بالقياسات الجديدة على الـ Canvas
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // استخراج النتيجة كـ Base64
                    const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                    resolve(compressedBase64);
                };
                img.onerror = (err) => reject(new Error('فشل تحميل الصورة أثناء الضغط.'));
            };
            reader.onerror = (err) => reject(new Error('فشل قراءة ملف الصورة.'));
        });
    },

    /**
     * [3] دالة استخراج النص من ملف PDF (Local Text Extraction)
     * * @param {File} pdfFile - ملف الـ PDF
     * @returns {Promise<string>} - النص الكامل المستخرج من جميع الصفحات
     */
    extractTextFromPDF: async function(pdfFile) {
        try {
            await this.initPDFjs();

            const arrayBuffer = await pdfFile.arrayBuffer();
            const pdf = await this.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';

            // المرور على جميع صفحات الـ PDF
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                // تجميع النصوص وتكوين مسافات صحيحة
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n\n';
            }

            return fullText.trim();
        } catch (error) {
            console.error('[AI Handler Error] - PDF Extraction:', error);
            throw new Error('فشل استخراج النص من ملف الـ PDF. قد يكون الملف محمياً أو تالفاً.');
        }
    },

    /**
     * [4] الدالة الموحدة لمعالجة أي ملف (الواجهة الرئيسية للفرونت إند)
     * تقوم بالتعرف التلقائي على نوع الملف وتوجيهه للمعالجة المناسبة
     * * @param {File} file - الملف المرفوع من قبل المستخدم
     * @returns {Promise<Object>} - كائن يحتوي على نوع المعالجة والنتيجة النهائية
     */
    processFile: async function(file) {
        if (!file) throw new Error('لم يتم تحديد أي ملف لمعالجته.');

        const fileType = file.type;

        try {
            if (fileType === 'application/pdf') {
                // إذا كان PDF، استخرج النص
                const text = await this.extractTextFromPDF(file);
                return {
                    type: 'pdf',
                    isTextExtracted: true,
                    payload: text // نرسل النص كـ Payload بدلاً من الملف نفسه
                };
            } else if (fileType.startsWith('image/')) {
                // إذا كان صورة، قم بالضغط
                const base64 = await this.compressImage(file);
                return {
                    type: 'image',
                    isTextExtracted: false,
                    payload: base64 // نرسل الصورة المضغوطة للـ OCR
                };
            } else {
                throw new Error('نوع الملف غير مدعوم للذكاء الاصطناعي. يُرجى رفع صور أو PDF فقط.');
            }
        } catch (error) {
            throw error;
        }
    }
};

// إتاحة الكائن ليكون متاحاً على مستوى الـ Window لتسهيل استدعائه من أي ملف JS آخر
window.AIHandler = AIHandler;