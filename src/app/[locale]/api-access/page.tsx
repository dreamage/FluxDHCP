'use client';

import React from 'react';
import { Typography } from 'antd';
import { useTranslations } from 'next-intl';
import ApiKeysCard from '@/components/ApiKeysCard';

const { Title } = Typography;

export default function ApiAccessPage() {
  const t = useTranslations('settings');

  return (
    <>
      <div className="page-title-bar">
        <Title level={3} style={{ margin: 0 }}>{t('apiAccess')}</Title>
      </div>
      <ApiKeysCard />
    </>
  );
}
