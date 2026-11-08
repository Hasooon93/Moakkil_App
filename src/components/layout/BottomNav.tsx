/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/components/layout/BottomNav.tsx
 * الوصف: شريط التنقل السفلي الموحد في جميع واجهات النظام (.bottom-nav)
 * ============================================================================
 */

import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export type MainViewTab = 'dashboard' | 'cases' | 'clients' | 'agenda' | 'tools' | 'audit' | 'settings';

interface BottomNavProps {
  activeTab?: MainViewTab;
  onSelectTab?: (tab: MainViewTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onSelectTab }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname.toLowerCase();

  const handleNav = (tab: MainViewTab) => {
    if (onSelectTab && (path === '/app' || path === '/app.html')) {
      onSelectTab(tab);
    } else {
      navigate(`/app.html?tab=${tab}`);
    }
  };

  const isToolsSubpage =
    path.includes('staff') ||
    path.includes('library') ||
    path.includes('calculators') ||
    path.includes('reports') ||
    path.includes('ai-chat');

  const isCasesSubpage = path.includes('case-details');
  const isClientsSubpage = path.includes('client-details');

  return (
    <nav className="bottom-nav no-print" id="bottomNav">
      <button
        type="button"
        className={`nav-item-btn ${activeTab === 'dashboard' && !isToolsSubpage && !isCasesSubpage && !isClientsSubpage ? 'active' : ''}`}
        onClick={() => handleNav('dashboard')}
      >
        <i className="fas fa-home"></i>
        <span>الرئيسية</span>
      </button>

      <button
        type="button"
        className={`nav-item-btn ${activeTab === 'cases' || isCasesSubpage ? 'active' : ''}`}
        onClick={() => handleNav('cases')}
      >
        <i className="fas fa-briefcase"></i>
        <span>القضايا</span>
      </button>

      <button
        type="button"
        className={`nav-item-btn ${activeTab === 'clients' || isClientsSubpage ? 'active' : ''}`}
        onClick={() => handleNav('clients')}
      >
        <i className="fas fa-users"></i>
        <span>الموكلين</span>
      </button>

      <button
        type="button"
        className={`nav-item-btn ${activeTab === 'agenda' ? 'active' : ''}`}
        onClick={() => handleNav('agenda')}
      >
        <i className="fas fa-calendar-alt"></i>
        <span>الأجندة</span>
      </button>

      <button
        type="button"
        className={`nav-item-btn ${activeTab === 'tools' || isToolsSubpage ? 'active' : ''}`}
        onClick={() => handleNav('tools')}
      >
        <i className="fas fa-th-large"></i>
        <span>الأدوات</span>
      </button>

      <button
        type="button"
        className={`nav-item-btn ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => handleNav('settings')}
      >
        <i className="fas fa-cog"></i>
        <span>الإعدادات</span>
      </button>
    </nav>
  );
};
