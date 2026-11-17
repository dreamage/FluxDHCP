'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card, Form, Input, Popconfirm, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { LockOutlined, SafetyOutlined, InfoCircleOutlined, ReloadOutlined, LogoutOutlined } from '@ant-design/icons';
import { useNotify } from '@/hooks/useNotify';
import { apiErrorMessage } from '@/lib/api-error';
import { formatLocalTime } from '@/lib/format-time';

const { Text } = Typography;

/**
 * 本卡片内的所有按钮共用一套紧凑尺寸。
 * 系统主题把 controlHeight 调到了 36，默认字号偏大，工具栏按钮和表格行内按钮
 * 会呈现出不同高度；这里显式锁定，保证二者高度、字号、圆角完全一致。
 */
const COMPACT_BTN: React.CSSProperties = {
  height: 26,
  minHeight: 26,
  paddingInline: 10,
  fontSize: 12,
  borderRadius: 6,
};

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
      title: t('sessionCreated'), dataIndex: 'created_at', key: 'created_at', width: 180, className: 'mono-cell',
      render: (v: string) => formatLocalTime(v),
    },
    {
      title: t('sessionLastSeen'), dataIndex: 'last_seen_at', key: 'last_seen_at', width: 180, className: 'mono-cell',
      render: (v: string | null) => v ? formatLocalTime(v) : '-',
    },
    {
      title: t('sessionExpires'), dataIndex: 'expires_at', key: 'expires_at', width: 180, className: 'mono-cell',
      render: (v: string) => formatLocalTime(v),
    },
    {
      title: t('sessionAgent'), dataIndex: 'user_agent', key: 'user_agent', ellipsis: true, className: 'mono-cell',
      render: (v: string | null) => <Text type="secondary" style={{ fontSize: 12 }}>{v || '-'}</Text>,
    },
    {
      title: tc('actions'), key: 'actions', width: 92, align: 'right' as const,
      render: (_: unknown, row: SessionRow) => (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          {row.current ? (
            <Tag color="green" style={{ marginInlineEnd: 0 }}>{t('sessionCurrent')}</Tag>
          ) : (
            <Popconfirm title={t('sessionRevokeConfirm')} onConfirm={() => handleRevoke(row.id)}>
              {/* 行内动作改成文字按钮：表格里不再是一排描边小方框，与工具栏按钮拉开层级 */}
              <Button type="link" size="small" danger style={{ ...COMPACT_BTN, paddingInline: 2 }}>
                {t('sessionRevoke')}
              </Button>
            </Popconfirm>
          )}
        </div>
      ),
    },
  ];

  return (
    <Card
      title={<span><SafetyOutlined style={{ marginRight: 8 }} />{t('security')}</span>}
      style={{ marginBottom: 16 }}
    >
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
        <Space size={8}>
          <Button type="primary" size="small" loading={saving} style={COMPACT_BTN} onClick={handleChangePassword}>
            {t('changePassword')}
          </Button>
          <Tooltip title={t('securityChangePwdTip')}>
            <InfoCircleOutlined style={{ color: 'var(--color-text-secondary)', cursor: 'help' }} />
          </Tooltip>
        </Space>
      </Form>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, margin: '20px 0 8px' }}>
        <Text strong>{t('sessionsTitle')}</Text>
        <Space size={8} wrap>
          <Button size="small" icon={<ReloadOutlined />} style={COMPACT_BTN} onClick={fetchSessions} loading={loading}>
            {t('sessionRefresh')}
          </Button>
          <Popconfirm title={t('sessionsRevokeOthersConfirm')} onConfirm={handleRevokeOthers}>
            <Button size="small" danger icon={<LogoutOutlined />} style={COMPACT_BTN}>
              {t('sessionsRevokeOthers')}
            </Button>
          </Popconfirm>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={sessions}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 820 }}
        locale={{ emptyText: tc('noData') }}
      />
    </Card>
  );
}
