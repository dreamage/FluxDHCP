'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card, Form, Space } from 'antd';
import { SearchOutlined, ReloadOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd/es/form';

interface FilterPanelProps {
  /** collapse toggle state */
  open: boolean;
  /** toggle setter */
  onToggle: () => void;
  /** filter toggle button text (already translated) */
  label: string;
  /** Ant Design Form instance */
  form: FormInstance;
  /** form initial values (should match hook defaults) */
  initialValues: Record<string, string>;
  /** Form onFinish handler */
  onFinish: () => void;
  /** search button handler (same as onFinish in most cases) */
  onSearch: () => void;
  /** reset button handler */
  onReset: () => void;
  /** form field children */
  children: React.ReactNode;
}

export default function FilterPanel({
  open, onToggle, label, form, initialValues, onFinish, onSearch, onReset, children,
}: FilterPanelProps) {
  const tc = useTranslations('common');

  return (
    <>
      <Button
        size="small"
        icon={open ? <UpOutlined /> : <DownOutlined />}
        onClick={onToggle}
      >
        {label}
      </Button>

      {open && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Form form={form} layout="inline" initialValues={initialValues} onFinish={onFinish}>
            {children}
            <Form.Item>
              <Space>
                <Button type="primary" size="small" icon={<SearchOutlined />} onClick={onSearch}>
                  {tc('search')}
                </Button>
                <Button size="small" icon={<ReloadOutlined />} onClick={onReset}>
                  {tc('reset')}
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      )}
    </>
  );
}
