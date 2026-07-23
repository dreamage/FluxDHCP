'use client';

import React from 'react';
import { ConfigProvider, theme, App as AntdApp } from 'antd';
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
          colorPrimary: isDark ? '#6aace8' : '#4a90d9',
          colorSuccess: '#22c55e',
          colorWarning: '#f59e0b',
          colorError: '#ef4444',
          colorInfo: isDark ? '#6aace8' : '#4a90d9',
          borderRadius: 10,
          fontFamily: "var(--font-dm-sans), -apple-system, BlinkMacSystemFont, sans-serif",
          colorBgLayout: isDark ? '#111827' : '#f8fafc',
          colorBgContainer: isDark ? '#1f2937' : '#ffffff',
          colorBgElevated: isDark ? '#283342' : '#ffffff',
          colorBorderSecondary: isDark ? '#374151' : '#e2e8f0',
          colorText: isDark ? '#f1f5f9' : '#0f172a',
          colorTextSecondary: isDark ? '#94a3b8' : '#64748b',
          controlHeight: 36,
          fontSize: 14,
          lineHeight: 1.5,
          boxShadow: isDark ? '0 1px 3px rgba(0, 0, 0, 0.2)' : '0 1px 3px rgba(0, 0, 0, 0.06)',
          boxShadowSecondary: isDark ? '0 4px 12px rgba(0, 0, 0, 0.3)' : '0 4px 12px rgba(0, 0, 0, 0.08)',
          wireframe: false,
        },
        components: {
          Table: {
            headerBg: isDark ? '#1f2937' : '#f8fafc',
            headerColor: isDark ? '#94a3b8' : '#64748b',
            rowHoverBg: isDark ? '#1f2937' : '#f8fafc',
            borderColor: isDark ? '#374151' : '#f1f5f9',
            cellPaddingBlock: 12,
            headerBorderRadius: 10,
          },
          Menu: {
            itemBorderRadius: 8,
            itemMarginInline: 8,
            itemHeight: 40,
            iconSize: 16,
            collapsedIconSize: 18,
            itemHoverBg: isDark ? '#1f2937' : '#f8fafc',
            itemSelectedBg: isDark ? '#082f49' : '#eff6ff',
            itemSelectedColor: isDark ? '#6aace8' : '#4a90d9',
          },
          Card: {
            paddingLG: 20,
            borderRadiusLG: 12,
          },
          Button: {
            controlHeight: 36,
            borderRadius: 8,
            contentFontSizeLG: 15,
          },
          Input: {
            controlHeight: 36,
            borderRadius: 8,
          },
          Select: {
            controlHeight: 36,
            borderRadius: 8,
          },
          Modal: {
            borderRadiusLG: 14,
          },
          Tag: {
            borderRadiusSM: 6,
          },
          Switch: {
            trackHeight: 22,
          },
          Progress: {
            remainingColor: isDark ? '#334155' : '#f1f5f9',
          },
          Badge: {
            dotSize: 8,
          },
        },
      }}
    >
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
