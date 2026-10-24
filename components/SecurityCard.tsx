'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card, Form, Input, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import { LockOutlined, SafetyOutlined } from '@ant-design/icons';
import { useNotify } from '@/hooks/useNotify';
import { apiErrorMessage } from '@/lib/api-error';
import { formatLocalTimeNoMs } from '@/lib/format-time';

const { Text, Paragraph } = Typography;

interface SessionRow {
  id: number;
  created_at: string;
  last_seen_at: string | null;
  expires_at: string;
  user_agent: string | null;
  current: boolean;
}

export default function SecurityCard() {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const notify = useNotify();

  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/sessions');
      if (!res.ok) return;
      const json = await res.json();
      setSessions(Array.isArray(json.items) ? json.items : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleChangePassword = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      const res = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: values.current_password,
          new_password: values.new_password,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(apiErrorMessage(result));
        return;
      }
      form.resetFields();
      notify.success(t('passwordChanged'));
      fetchSessions();
    } catch (err: any) {
      if (err?.errorFields) return;
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (id: number) => {
    const res = await fetch(`/api/auth/sessions?id=${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const result = await res.json().catch(() => ({}));
      notify.error(apiErrorMessage(result));
      return;
    }
    fetchSessions();
  };

  const handleRevokeOthers = async () => {
    const res = await fetch('/api/auth/sessions?others=1', { method: 'DELETE' });
    if (!res.ok) {
      const result = await res.json().catch(() => ({}));
      notify.error(apiErrorMessage(result));
      return;
    }
    notify.success(t('sessionsRevoked'));
    fetchSessions();
  };

  const columns = [
    {
      title: t('sessionCreated'), dataIndex: 'created_at', key: 'created_at', width: 170,
      render: (v: string) => formatLocalTimeNoMs(v),
    },
    {
      title: t('sessionLastSeen'), dataIndex: 'last_seen_at', key: 'last_seen_at', width: 170,
      render: (v: string | null) => v ? formatLocalTimeNoMs(v) : '-',
    },
    {
      title: t('sessionExpires'), dataIndex: 'expires_at', key: 'expires_at', width: 170,
      render: (v: string) => formatLocalTimeNoMs(v),
    },
    {
      title: t('sessionAgent'), dataIndex: 'user_agent', key: 'user_agent', ellipsis: true,
      render: (v: string | null) => <Text type="secondary" style={{ fontSize: 12 }}>{v || '-'}</Text>,
    },
    {
      title: tc('actions'), key: 'actions', width: 90, align: 'right' as const,
      render: (_: unknown, row: SessionRow) => row.current
        ? <Tag color="green">{t('sessionCurrent')}</Tag>
        : (
          <Popconfirm title={t('sessionRevokeConfirm')} onConfirm={() => handleRevoke(row.id)}>
            <Button size="small" danger>{t('sessionRevoke')}</Button>
          </Popconfirm>
        ),
    },
  ];

  return (
    <Card
      title={<span><SafetyOutlined style={{ marginRight: 8 }} />{t('security')}</span>}
      style={{ marginBottom: 16 }}
    >
      <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
        {t('securityDesc')}
      </Paragraph>

      <Form form={form} layout="vertical" style={{ maxWidth: 420, marginBottom: 8 }}>
        <Form.Item name="current_password" label={t('currentPassword')}
          rules={[{ required: true, message: tc('requiredField') }]}>
          <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
        </Form.Item>
        <Form.Item name="new_password" label={t('newPassword')}
          rules={[{ required: true, message: tc('requiredField') }, { min: 8, message: t('passwordTooShort') }]}>
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="confirm_password" label={t('confirmPassword')} dependencies={['new_password']}
          rules={[
            { required: true, message: tc('requiredField') },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('new_password') === value) return Promise.resolve();
                return Promise.reject(new Error(t('passwordMismatch')));
              },
            }),
          ]}>
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" size="small" loading={saving} onClick={handleChangePassword}>
          {t('changePassword')}
        </Button>
      </Form>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, margin: '20px 0 8px' }}>
        <Text strong>{t('sessionsTitle')}</Text>
        <Space>
          <Button size="small" onClick={fetchSessions} loading={loading}>{t('sessionRefresh')}</Button>
          <Popconfirm title={t('sessionsRevokeOthersConfirm')} onConfirm={handleRevokeOthers}>
            <Button size="small" danger>{t('sessionsRevokeOthers')}</Button>
          </Popconfirm>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={sessions}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: tc('noData') }}
      />
    </Card>
  );
}
