'use client';

import React from 'react';
import { Button, Result } from 'antd';
import { useTranslations } from 'next-intl';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('common');
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--color-bg)' }}>
      <Result
        status="error"
        title={t('errorTitle')}
        subTitle={error.message || t('unknownError')}
        extra={
          <Button type="primary" onClick={reset}>
            {t('tryAgain')}
          </Button>
        }
      />
    </div>
  );
}
