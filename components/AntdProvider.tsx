'use client';

import React from 'react';
import { ConfigProvider, theme } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import { useTheme } from './ThemeContext';

interface AntdProviderProps {
  children: React.ReactNode;
  locale?: string;
}

export default function AntdProvider({ children, locale = 'en' }: AntdProviderProps) {
  const antdLocale = locale === 'zh' ? zhCN : enUS;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';

  return (
    <ConfigProvider
      locale={antdLocale}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: isDark ? '#38bdf8' : '#0ea5e9',
          colorSuccess: '#22c55e',
          colorWarning: '#f59e0b',
          colorError: '#ef4444',
          colorInfo: isDark ? '#38bdf8' : '#0ea5e9',
          borderRadius: 10,
          fontFamily: "var(--font-dm-sans), -apple-system, BlinkMacSystemFont, sans-serif",
          colorBgLayout: isDark ? '#0f172a' : '#f8fafc',
          colorBgContainer: isDark ? '#1e293b' : '#ffffff',
          colorBgElevated: isDark ? '#273449' : '#ffffff',
          colorBorderSecondary: isDark ? '#334155' : '#e2e8f0',
          colorText: isDark ? '#f1f5f9' : '#0f172a',
          colorTextSecondary: isDark ? '#94a3b8' : '#64748b',
          controlHeight: 36,
          boxShadow: isDark ? '0 1px 3px rgba(0, 0, 0, 0.2)' : '0 1px 3px rgba(0, 0, 0, 0.06)',
          boxShadowSecondary: isDark ? '0 4px 12px rgba(0, 0, 0, 0.3)' : '0 4px 12px rgba(0, 0, 0, 0.08)',
        },
        components: {
          Table: {
            headerBg: isDark ? '#1e293b' : '#f8fafc',
            headerColor: isDark ? '#94a3b8' : '#64748b',
            rowHoverBg: isDark ? '#1e293b' : '#f8fafc',
            borderColor: isDark ? '#334155' : '#f1f5f9',
            cellPaddingBlock: 12,
          },
          Menu: {
            itemBorderRadius: 8,
            itemMarginInline: 8,
            itemHeight: 40,
            iconSize: 16,
            collapsedIconSize: 18,
          },
          Card: {
            paddingLG: 20,
          },
          Button: {
            controlHeight: 36,
            borderRadius: 8,
          },
          Input: {
            controlHeight: 36,
          },
          Select: {
            controlHeight: 36,
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
