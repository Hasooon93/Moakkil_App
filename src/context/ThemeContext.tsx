/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/context/ThemeContext.tsx
 * الوصف: إدارة الوضع الليلي (Dark Mode WCAG AAA) والهوية البصرية للمكتب (White-Labeling)
 * ============================================================================
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../config/constants';
import { AuthService } from '../services/auth.service';
import { MoFirm } from '../types/database.types';

interface ThemeContextValue {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (dark: boolean) => void;
  applyFirmTheme: (firm?: Partial<MoFirm> | null) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDarkMode: false,
  toggleDarkMode: () => {},
  setDarkMode: () => {},
  applyFirmTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return (
      localStorage.getItem(STORAGE_KEYS.DARK_MODE) === 'true' ||
      localStorage.getItem(STORAGE_KEYS.THEME) === 'dark' ||
      localStorage.getItem(STORAGE_KEYS.LEGACY_THEME) === 'dark'
    );
  });

  const applyThemeAttribute = (dark: boolean) => {
    if (dark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.body.classList.add('dark-mode');
      localStorage.setItem(STORAGE_KEYS.DARK_MODE, 'true');
      localStorage.setItem(STORAGE_KEYS.THEME, 'dark');
      localStorage.setItem(STORAGE_KEYS.LEGACY_THEME, 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.classList.remove('dark-mode');
      localStorage.setItem(STORAGE_KEYS.DARK_MODE, 'false');
      localStorage.setItem(STORAGE_KEYS.THEME, 'light');
      localStorage.setItem(STORAGE_KEYS.LEGACY_THEME, 'light');
    }
    AuthService.applyFirmBranding();
  };

  useEffect(() => {
    applyThemeAttribute(isDarkMode);
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
  };

  const setDarkMode = (dark: boolean) => {
    setIsDarkMode(dark);
  };

  const applyFirmTheme = (firm?: Partial<MoFirm> | null) => {
    AuthService.applyFirmBranding(firm);
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode, setDarkMode, applyFirmTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
