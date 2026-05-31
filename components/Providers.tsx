'use client';

import React from 'react';
import { ThemeProvider } from './ThemeContext';
import AntdProvider from './AntdProvider';

interface ProvidersProps {
  children: React.ReactNode;
  locale: string;
}

export default function Providers({ children, locale }: ProvidersProps) {
  return (
    <ThemeProvider>
      <AntdProvider locale={locale}>
        {children}
      </AntdProvider>
    </ThemeProvider>
  );
}
