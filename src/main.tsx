/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/main.tsx
 * الوصف: نقطة الإقلاع الرئيسية لتطبيق React + تسجيل الـ Service Worker (V5.4)
 * ============================================================================
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/style.css';
import { ensureDeviceId } from './config/constants';

// ضمان وجود بصمة الجهاز الفريدة (x-device-id) قبل أي طلب شبكي
ensureDeviceId();

// تسجيل الـ Service Worker لدعم العمل دون اتصال وإشعارات الـ Web Push
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('/sw.js')
            .then(() => {
                // Service Worker V5.4 registered
            })
            .catch((err) => {
                console.warn('Service Worker registration skipped:', err);
            });
    });
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
