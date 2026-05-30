'use client';

import React from 'react';
import { ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';

interface AntdProviderProps {
  children: React.ReactNode;
  locale?: string;
}

export default function AntdProvider({ children, locale = 'en' }: AntdProviderProps) {
  const antdLocale = locale === 'zh' ? zhCN : enUS;

  return (
    <ConfigProvider
      locale={antdLocale}
      theme={{
        token: {
          colorPrimary: '#0ea5e9',
          colorSuccess: '#22c55e',
          colorWarning: '#f59e0b',
          colorError: '#ef4444',
          colorInfo: '#0ea5e9',
          borderRadius: 10,
          fontFamily: "var(--font-dm-sans), -apple-system, BlinkMacSystemFont, sans-serif",
          colorBgLayout: '#f8fafc',
          colorBgContainer: '#ffffff',
          colorBgElevated: '#ffffff',
          colorBorderSecondary: '#e2e8f0',
          colorText: '#0f172a',
          colorTextSecondary: '#64748b',
          controlHeight: 36,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
          boxShadowSecondary: '0 4px 12px rgba(0, 0, 0, 0.08)',
        },
        components: {
          Table: {
            headerBg: '#f8fafc',
            headerColor: '#64748b',
            rowHoverBg: '#f8fafc',
            borderColor: '#f1f5f9',
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
