/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/services/aiHandler.service.ts
 * الوصف: المحرك المساعد لمعالجة الملفات والصور محلياً قبل إرسالها للذكاء الاصطناعي
 * مطابق 100% لملف js/ai-handler.js (ضغط الصور عبر Canvas + استخراج نصوص PDF عبر PDF.js)
 * ============================================================================
 */

import Swal from 'sweetalert2';
import { MoakkilAPI } from './moakkilApi.service';

export const AIHandler = {
    /**
     * 1. قراءة الهوية المدنية أو الوثائق عبر الكاميرا (Vision OCR) مع ضغط الصورة
     */
    scanIDCard: async (file: File): Promise<any> => {
        if (!file) return null;
        if (!navigator.onLine) {
            Swal.fire('تنبيه', 'محرك الرؤية الحاسوبية (OCR) يتطلب اتصالاً بالإنترنت.', 'warning');
            return null;
        }

        Swal.fire({
            title: 'جاري قراءة الوثيقة...',
            text: 'يقوم الذكاء الاصطناعي (Llama 3.2 Vision) باستخراج البيانات...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading(),
        });

        try {
            const base64 = await AIHandler.compressImage(file, 900, 0.8);
            const res = await MoakkilAPI.readOCR(base64);
            Swal.close();

            if (res && !res.error) {
                return typeof res === 'string' ? JSON.parse(res) : res;
            }
            throw new Error(res?.error || 'تعذر قراءة الصورة');
        } catch (err: any) {
            Swal.fire('خطأ في القراءة', err.message || 'تأكد من وضوح الصورة وأعد المحاولة.', 'error');
            return null;
        }
    },

    /**
     * 2. ضغط الصورة على المتصفح وإرجاع Base64 صافي بدون البادئة
     */
    compressImage: (file: File, maxWidth = 900, quality = 0.8): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (e) => {
                const img = new Image();
                img.src = e.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
                    canvas.width = img.width * ratio;
                    canvas.height = img.height * ratio;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        reject(new Error('Canvas context unavailable'));
                        return;
                    }
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/jpeg', quality);
                    resolve(dataUrl.split(',')[1]);
                };
                img.onerror = (err) => reject(err);
            };
            reader.onerror = (err) => reject(err);
        });
    },

    /**
     * 3. استخراج النصوص من ملفات PDF أو الصور أو الملفات النصية لتحليل القضايا
     */
    extractTextFromFile: async (file: File): Promise<string> => {
        if (!file) throw new Error('لم يتم اختيار ملف');

        const ext = file.name.split('.').pop()?.toLowerCase() || '';

        // أ. ملفات نصية مباشرة
        if (ext === 'txt') {
            return await file.text();
        }

        // ب. ملفات PDF عبر مكتبة PDF.js
        if (ext === 'pdf') {
            const pdfjsLib = (window as any).pdfjsLib;
            if (!pdfjsLib) {
                throw new Error('مكتبة قراءة الـ PDF غير محملة حالياً');
            }
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            const maxPages = Math.min(pdf.numPages, 15);
            for (let i = 1; i <= maxPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const strings = content.items.map((item: any) => item.str);
                fullText += strings.join(' ') + '\n';
            }
            return fullText.trim();
        }

        // ج. الصور (JPG, PNG, WEBP) عبر Vision OCR
        if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
            const base64 = await AIHandler.compressImage(file, 1000, 0.85);
            const ocrRes = await MoakkilAPI.readOCR(base64);
            if (ocrRes && !ocrRes.error) {
                return typeof ocrRes === 'string' ? ocrRes : JSON.stringify(ocrRes, null, 2);
            }
            throw new Error(ocrRes?.error || 'تعذر استخراج النص من الصورة');
        }

        throw new Error('يرجى رفع ملف بصيغة PDF أو صورة واضحة أو ملف نصي (TXT).');
    },
};

if (typeof window !== 'undefined') {
    (window as any).AIHandler = AIHandler;
}
