'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Layout, Menu, Select, Tabs, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined, PartitionOutlined, PushpinOutlined, FileTextOutlined,
  SettingOutlined, HistoryOutlined, ToolOutlined, ApiOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, MenuOutlined,
  CloseOutlined, ColumnWidthOutlined, ReloadOutlined, TagOutlined,
  SunOutlined, MoonOutlined, DesktopOutlined,
} from '@ant-design/icons';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTheme } from './ThemeContext';

const { Sider, Content } = Layout;

interface AppLayoutProps {
  children: React.ReactNode;
  locale: string;
  onLocaleChange: (locale: string) => void;
}

interface TabItem { key: string; label: string; }

const TABS_KEY = 'fluxdhcp_open_tabs';

export default function AppLayout({ children, locale, onLocaleChange }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawer, setMobileDrawer] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('layout');
  const { mode: themeMode, setMode: setThemeMode } = useTheme();

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Auto-collapse on mobile
  useEffect(() => {
    if (isMobile) setCollapsed(true);
  }, [isMobile]);

  // Hide splash screen after React renders
  useEffect(() => {
    (window as any).__splash_hide?.();
  }, []);

  const pageKey = useMemo(() => {
    const match = pathname?.match(/\/(dashboard|pools|leases|reservations|options|mac-notes|webhooks|logs|settings)/);
    return match ? `/${match[1]}` : '/dashboard';
  }, [pathname]);

  const menuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: t('dashboard') },
    { key: '/pools', icon: <PartitionOutlined />, label: t('pools') },
    { key: '/leases', icon: <FileTextOutlined />, label: t('leases') },
    { key: '/reservations', icon: <PushpinOutlined />, label: t('reservations') },
    { key: '/options', icon: <ToolOutlined />, label: t('options') },
    { key: '/mac-notes', icon: <TagOutlined />, label: t('macNotes') },
    { key: '/webhooks', icon: <ApiOutlined />, label: t('webhooks') },
    { key: '/logs', icon: <HistoryOutlined />, label: t('logs') },
    { key: '/settings', icon: <SettingOutlined />, label: t('settings') },
  ];

  const labelMap = useMemo(() => {
    const map: Record<string, string> = {};
    menuItems.forEach(m => { map[m.key] = m.label; });
    return map;
  }, [t]);

  const [tabs, setTabs] = useState<TabItem[]>([{ key: '/dashboard', label: '' }]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TABS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        const loaded = parsed.map(k => ({ key: k, label: labelMap[k] || k }));
        if (loaded.length > 0) { setTabs(loaded); }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setTabs(prev => prev.map(tab => ({ ...tab, label: labelMap[tab.key] || tab.key })));
  }, [labelMap]);

  useEffect(() => {
    if (!pageKey) return;
    setTabs(prev => {
      const exists = prev.find(t => t.key === pageKey);
      if (exists) return prev;
      const newTabs = [...prev, { key: pageKey, label: labelMap[pageKey] || pageKey }];
      try { localStorage.setItem(TABS_KEY, JSON.stringify(newTabs.map(t => t.key))); } catch {}
      return newTabs;
    });
  }, [pageKey, labelMap]);

  const handleTabChange = (key: string) => {
    router.push(`/${locale}${key}`);
    if (isMobile) setMobileDrawer(false);
  };

  const closeTab = useCallback((key: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.key === key);
      const newTabs = prev.filter(t => t.key !== key);
      if (newTabs.length === 0) return prev;
      try { localStorage.setItem(TABS_KEY, JSON.stringify(newTabs.map(t => t.key))); } catch {}
      if (key === pageKey) {
        const nextTab = newTabs[Math.min(idx, newTabs.length - 1)];
        router.push(`/${locale}${nextTab.key}`);
      }
      return newTabs;
    });
  }, [pageKey, locale, router]);

  const closeOtherTabs = useCallback((keepKey: string) => {
    setTabs(prev => {
      const keep = prev.find(t => t.key === keepKey);
      if (!keep) return prev;
      const newTabs = [keep];
      try { localStorage.setItem(TABS_KEY, JSON.stringify(newTabs.map(t => t.key))); } catch {}
      if (keepKey !== pageKey) router.push(`/${locale}${keepKey}`);
      return newTabs;
    });
  }, [pageKey, locale, router]);

  const closeAllTabs = useCallback(() => {
    const newTabs = [{ key: '/dashboard', label: labelMap['/dashboard'] || '/dashboard' }];
    setTabs(newTabs);
    try { localStorage.setItem(TABS_KEY, JSON.stringify(['/dashboard'])); } catch {}
    router.push(`/${locale}/dashboard`);
  }, [locale, router, labelMap]);

  const closeRightTabs = useCallback((key: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.key === key);
      if (idx < 0) return prev;
      const newTabs = prev.slice(0, idx + 1);
      try { localStorage.setItem(TABS_KEY, JSON.stringify(newTabs.map(t => t.key))); } catch {}
      if (!newTabs.find(t => t.key === pageKey)) {
        router.push(`/${locale}${newTabs[newTabs.length - 1].key}`);
      }
      return newTabs;
    });
  }, [pageKey, locale, router]);

  const handleTabEdit = (targetKey: any, action: 'remove' | 'add') => {
    if (action !== 'remove') return;
    closeTab(targetKey as string);
  };

  const handleMenuClick = ({ key }: { key: string }) => {
    router.push(`/${locale}${key}`);
    if (isMobile) setMobileDrawer(false);
  };

  const handleLocaleChange = (newLocale: string) => {
    onLocaleChange(newLocale);
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000`;
    if (pathname) {
      const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
      router.push(newPath);
    }
  };

  const sidebarWidth = collapsed ? 80 : 220;

  const themeOptions = [
    { value: 'system', label: <span><DesktopOutlined style={{ marginRight: 6 }} />{t('themeSystem')}</span> },
    { value: 'light', label: <span><SunOutlined style={{ marginRight: 6 }} />{t('themeLight')}</span> },
    { value: 'dark', label: <span><MoonOutlined style={{ marginRight: 6 }} />{t('themeDark')}</span> },
  ];

  const renderTabBar: React.ComponentProps<typeof Tabs>['renderTabBar'] = (props, DefaultTabBar) => (
    <DefaultTabBar {...props}>
      {(node) => {
        const tabKey = (node as React.ReactElement)?.key as string;
        if (!tabKey) return node;
        const items: MenuProps['items'] = [
          { key: 'refresh', label: t('refreshTab'), icon: <ReloadOutlined />, onClick: () => { router.replace(`/${locale}${tabKey}?_r=${Date.now()}`); } },
          { type: 'divider' as const },
          { key: 'close', label: t('closeTab'), icon: <CloseOutlined />, onClick: () => closeTab(tabKey) },
          { key: 'closeOthers', label: t('closeOtherTabs'), icon: <ColumnWidthOutlined />, onClick: () => closeOtherTabs(tabKey) },
          { key: 'closeRight', label: t('closeRightTabs'), icon: <CloseOutlined />, onClick: () => closeRightTabs(tabKey) },
          { type: 'divider' as const },
          { key: 'closeAll', label: t('closeAllTabs'), icon: <CloseOutlined />, onClick: closeAllTabs },
        ];
        return (
          <Dropdown menu={{ items }} trigger={['contextMenu']} key={tabKey}>
            {node}
          </Dropdown>
        );
      }}
    </DefaultTabBar>
  );

  const sidebarContent = (
    <>
      <div style={{
        height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: collapsed ? '0 8px' : '0 12px 0 20px',
        borderBottom: '1px solid var(--color-sidebar-border)',
      }}>
        <span style={{ fontSize: collapsed ? 20 : 17, fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '-0.02em', fontFamily: "var(--font-dm-sans), sans-serif" }}>
          {collapsed ? 'F' : 'FluxDHCP'}
        </span>
        {!isMobile && (
          <div onClick={() => setCollapsed(!collapsed)}
            style={{ cursor: 'pointer', padding: '6px', borderRadius: 6, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', fontSize: 16 }}>
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </div>
        )}
      </div>
      <Menu mode="inline" selectedKeys={[pageKey]} items={menuItems}
        onClick={handleMenuClick}
        style={{ background: 'transparent', border: 'none', padding: '8px 0' }} />
    </>
  );

  return (
    <Layout style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Desktop sidebar */}
      {!isMobile && (
        <Sider collapsed={collapsed} width={220} trigger={null}
          style={{ background: 'var(--color-sidebar-bg)', borderRight: '1px solid var(--color-sidebar-border)', position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 10 }}>
          {sidebarContent}
        </Sider>
      )}

      {/* Mobile drawer sidebar */}
      {isMobile && !mobileDrawer && (
        <div onClick={() => setMobileDrawer(true)}
          style={{ position: 'fixed', top: 12, left: 12, zIndex: 1100, cursor: 'pointer',
            background: 'var(--color-hamburger-bg)', borderRadius: 8, padding: '8px 10px', boxShadow: `0 2px 8px var(--color-hamburger-shadow)` }}>
          <MenuOutlined style={{ fontSize: 18, color: 'var(--color-text-secondary)' }} />
        </div>
      )}
      {isMobile && mobileDrawer && (
        <>
          <div onClick={() => setMobileDrawer(false)}
            style={{ position: 'fixed', inset: 0, background: 'var(--color-mobile-overlay)', zIndex: 1099 }} />
          <div style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 220, zIndex: 1100,
            background: 'var(--color-sidebar-bg)', borderRight: '1px solid var(--color-sidebar-border)', boxShadow: '4px 0 12px rgba(0,0,0,0.1)' }}>
            {sidebarContent}
          </div>
        </>
      )}

      <Layout style={{ marginLeft: isMobile ? 0 : sidebarWidth, transition: 'margin-left 0.2s' }}>
        {/* Top bar: tabs full width, selectors overlaid right */}
        <div style={{ position: 'sticky', top: 0, zIndex: 9, background: 'var(--color-header-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: isMobile ? 48 : 16, paddingRight: 16, height: 44 }}>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <Tabs type="editable-card" activeKey={pageKey} onChange={handleTabChange}
                onEdit={handleTabEdit} hideAdd size="small"
                items={tabs.map(tab => ({ key: tab.key, label: tab.label, closable: tabs.length > 1 }))}
                renderTabBar={renderTabBar}
                style={{ marginBottom: 0 }}
                tabBarStyle={{ marginBottom: 0 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8, background: 'var(--color-header-bg)', paddingLeft: 8 }}>
              <Select value={themeMode} onChange={setThemeMode}
                style={{ width: 130 }} size="small" bordered={false}
                options={themeOptions} popupMatchSelectWidth={false} />
              <Select value={locale} onChange={handleLocaleChange} style={{ width: 110 }} size="small" bordered={false}
                options={[{ value: 'en', label: 'English' }, { value: 'zh', label: '中文' }]} />
            </div>
          </div>
        </div>
        <Content style={{ padding: isMobile ? 12 : 24, minHeight: 'calc(100vh - 44px)' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
