'use client';

import React from 'react';
import { Button, Result } from 'antd';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc' }}>
      <Result
        status="error"
        title="Something went wrong"
        subTitle={error.message || 'An unexpected error occurred'}
        extra={
          <Button type="primary" onClick={reset}>
            Try Again
          </Button>
        }
      />
    </div>
  );
}
