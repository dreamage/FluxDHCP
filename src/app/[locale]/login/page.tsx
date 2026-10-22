'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Alert, Button, Card, Form, Input, Spin, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { apiErrorMessage } from '@/lib/api-error';

const { Title, Text } = Typography;

type Mode = 'checking' | 'setup' | 'login';

export default function LoginPage() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('checking');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/state')
      .then(res => res.json())
      .then(state => {
        if (cancelled) return;
        if (state.authenticated) {
          router.replace(`/${locale}/dashboard`);
          return;
        }
        setMode(state.initialized ? 'login' : 'setup');
      })
      .catch(() => {
        if (!cancelled) {
          setMode('login');
          setError(t('stateFailed'));
        }
      });
    return () => { cancelled = true; };
  }, [locale, router, t]);

  const handleSubmit = async (values: { password: string; confirm?: string }) => {
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(mode === 'setup' ? '/api/auth/setup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: values.password }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(apiErrorMessage(payload) || tc('error'));
        return;
      }

      router.replace(`/${locale}/dashboard`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc('error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === 'checking') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-bg)', padding: 24,
    }}>
      <Card style={{ width: '100%', maxWidth: 380 }} styles={{ body: { padding: 28 } }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Title level={4} style={{ marginBottom: 4 }}>FluxDHCP</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {mode === 'setup' ? t('setupSubtitle') : t('loginSubtitle')}
          </Text>
        </div>

        {error && (
          <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }}
            closable onClose={() => setError('')} />
        )}

        <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          <Form.Item
            name="password"
            label={mode === 'setup' ? t('newPassword') : t('password')}
            rules={[{ required: true, message: t('passwordRequired') }]}
          >
            <Input.Password
              autoFocus
              prefix={<LockOutlined />}
              placeholder="••••••••"
              autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
            />
          </Form.Item>

          {mode === 'setup' && (
            <Form.Item
              name="confirm"
              label={t('confirmPassword')}
              dependencies={['password']}
              rules={[
                { required: true, message: t('confirmRequired') },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) return Promise.resolve();
                    return Promise.reject(new Error(t('passwordMismatch')));
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="••••••••" autoComplete="new-password" />
            </Form.Item>
          )}

          <Button type="primary" htmlType="submit" block loading={submitting} style={{ marginTop: 4 }}>
            {mode === 'setup' ? t('setupSubmit') : t('loginSubmit')}
          </Button>
        </Form>

        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          {mode === 'setup' ? t('setupHint') : t('forgotHint')}
        </div>
      </Card>
    </div>
  );
}
