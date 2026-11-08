/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/App.tsx
 * الوصف: الحاوية الجذرية للتطبيق (ThemeProvider + AuthProvider + BrowserRouter)
 * ============================================================================
 */

import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { AppRouter } from './router/AppRouter';

export const App: React.FC = () => {
    return (
        <ThemeProvider>
            <AuthProvider>
                <BrowserRouter>
                    <AppRouter />
                </BrowserRouter>
            </AuthProvider>
        </ThemeProvider>
    );
};

export default App;
