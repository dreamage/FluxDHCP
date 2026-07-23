'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Card, Row, Col, Typography, Progress, Tag, Space, Tooltip, Spin, Alert } from 'antd';
import {
  TeamOutlined, ClusterOutlined, EnvironmentOutlined, LineChartOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import MacAddress from '@/components/MacAddress';
import { formatLocalTimeNoMs } from '@/lib/format-time';
import { translateServerResponse } from '@/lib/server-response';
import { useMacNotes } from '@/hooks/useMacNotes';
import { useNotify } from '@/hooks/useNotify';

const { Title, Text } = Typography;

// Tag colors (Ant Design preset names — auto-adapt to light/dark mode)
const MSG_TYPE_TAG_COLORS: Record<number, string> = {
  1: 'blue', 2: 'cyan', 3: 'orange', 4: 'red', 5: 'green', 6: 'volcano', 7: 'default', 8: 'purple',
};

// Dot colors (muted hex — not too bright in either theme)
const MSG_TYPE_DOT_COLORS: Record<number, string> = {
  1: '#6b9dc2', 2: '#5ba8b5', 3: '#c49558', 4: '#c27070', 5: '#5da878', 6: '#c2885e', 7: '#8a929a', 8: '#8070a8',
};

interface DashboardData {
  activeLeases: number;
  totalIPs: number;
  poolCount: number;
  activePoolCount: number;
  reservationCount: number;
  requests24h: number;
  poolUsage: Array<{ poolId: number; name: string; used: number; total: number; percentage: number }>;
  recentEvents: Array<{ timestamp: string; message_type: number; client_mac: string; hostname: string; server_response: string }>;
}

interface StatCardProps {
  icon: React.ReactNode;
  color: string;
  title: string;
  value: React.ReactNode;
  suffix?: string;
  bgColor?: string;
}

function StatCard({ icon, color, title, value, suffix, bgColor }: StatCardProps) {
  return (
    <Card bordered={false} className="stat-card" style={{ borderRadius: 12, height: '100%', padding: 0, overflow: 'hidden' }}>
      <div className="stat-card-top-bar" style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0 0' }}>
        <div style={{
          width: 46, height: 46, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: bgColor || `linear-gradient(135deg, ${color}, ${color}bb)`, color: '#fff', fontSize: 20, flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.3, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</Text>
          <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
            {value}{suffix && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-text-secondary)', marginLeft: 4 }}>{suffix}</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tMsg = useTranslations('messageTypes');
  const tSr = useTranslations('serverResponse');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { macNotes, fetchMacNotes } = useMacNotes();
  const notify = useNotify();
  const hasNotified = useRef(false);

  useEffect(() => { fetchMacNotes(); }, [fetchMacNotes]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/dashboard');
        if (!res.ok) {
          setError(t('fetchError') || 'Failed to load');
          if (!hasNotified.current) { notify.fatal(t('fetchError') || 'Failed to load'); hasNotified.current = true; }
          return;
        }
        const json = await res.json();
        setData({
          activeLeases: json.activeLeases ?? 0,
          totalIPs: json.totalIPs ?? 0,
          poolCount: json.poolCount ?? 0,
          activePoolCount: json.activePoolCount ?? 0,
          reservationCount: json.reservationCount ?? 0,
          requests24h: json.requests24h ?? 0,
          poolUsage: json.poolUsage ?? [],
          recentEvents: json.recentEvents ?? [],
        });
        setError('');
        hasNotified.current = false;
      } catch (err) {
        setError(t('fetchError') || 'Failed to load');
        if (!hasNotified.current) { notify.fatal(t('fetchError') || 'Failed to load', err); hasNotified.current = true; }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const timer = setInterval(fetchData, 30000);
    return () => clearInterval(timer);
  }, []);

  const usagePercent = data && data.totalIPs > 0
    ? Math.round((data.activeLeases / data.totalIPs) * 100) : 0;

  return (
    <>
      <div className="page-title-bar">
        <Title level={3} style={{ margin: 0 }}>{t('title')}</Title>
      </div>
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      {loading && !data && <Spin style={{ display: 'block', marginTop: 48, textAlign: 'center' }} />}
      {data && (
        <>
          {/* Stat Cards */}
          <Row gutter={[16, 16]}>
            <Col xs={12} sm={12} md={6}>
              <StatCard icon={<TeamOutlined />} color="#0ea5e9" title={t('activeLeases')}
                value={data.activeLeases} suffix={`/ ${data.totalIPs}`} />
            </Col>
            <Col xs={12} sm={12} md={6}>
              <StatCard icon={<ClusterOutlined />} color="#8b5cf6" title={t('poolCount')}
                value={data.activePoolCount} suffix={`/ ${data.poolCount}`} />
            </Col>
            <Col xs={12} sm={12} md={6}>
              <StatCard icon={<EnvironmentOutlined />} color="#f59e0b" title={t('reservationCount')}
                value={data.reservationCount} />
            </Col>
            <Col xs={12} sm={12} md={6}>
              <StatCard icon={<LineChartOutlined />} color="#22c55e" title={t('requests24h')}
                value={data.requests24h} />
            </Col>
          </Row>

          {/* Overall usage — circular gauge */}
          {data.totalIPs > 0 && (
            <Card bordered={false} style={{ marginTop: 16, borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <Progress
                    type="circle"
                    percent={usagePercent}
                    size={148}
                    strokeWidth={9}
                    strokeColor="#4a90d9"
                    format={() => (
                      <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
                        <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--color-text)' }}>{usagePercent}%</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{t('overallUsage')}</div>
                      </div>
                    )}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#4a90d9', flexShrink: 0 }} />
                      <Text style={{ fontSize: 14, flex: 1 }}>{t('activeLeases')}</Text>
                      <Text strong style={{ fontSize: 18, fontFamily: 'var(--font-mono)' }}>{data.activeLeases}</Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--color-border)', flexShrink: 0 }} />
                      <Text style={{ fontSize: 14, flex: 1 }}>{t('totalIPs')}</Text>
                      <Text strong style={{ fontSize: 18, fontFamily: 'var(--font-mono)' }}>{data.totalIPs}</Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                      <Text style={{ fontSize: 14, flex: 1 }}>{t('freeIPs')}</Text>
                      <Text strong style={{ fontSize: 18, fontFamily: 'var(--font-mono)', color: '#22c55e' }}>{data.totalIPs - data.activeLeases}</Text>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Pool Usage — mini ring gauges */}
          <Title level={5} style={{ marginTop: 24, marginBottom: 12, color: 'var(--color-text-secondary)', fontWeight: 700 }}>{t('poolUsage')}</Title>
          <Row gutter={[16, 16]}>
            {data.poolUsage.map(pool => {
              const color = pool.percentage > 90 ? '#ef4444' : pool.percentage > 70 ? '#f59e0b' : '#4a90d9';
              return (
                <Col xs={12} sm={8} md={6} key={pool.poolId}>
                  <Card bordered={false} size="small" className="stat-card" style={{ borderRadius: 10, textAlign: 'center', height: '100%' }}>
                    <Progress
                      type="circle"
                      percent={pool.percentage}
                      size={92}
                      strokeWidth={8}
                      strokeColor={color}
                      format={() => (
                        <div style={{ lineHeight: 1.2 }}>
                          <div style={{ fontSize: 17, fontWeight: 800, color }}>{pool.percentage}%</div>
                        </div>
                      )}
                    />
                    <div style={{ marginTop: 10 }}>
                      <Text strong style={{ fontSize: 13, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pool.name}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{pool.used} / {pool.total}</Text>
                    </div>
                  </Card>
                </Col>
              );
            })}
            {data.poolUsage.length === 0 && (
              <Col span={24}><Text type="secondary">{t('noPools')}</Text></Col>
            )}
          </Row>

          {/* Recent Events */}
          <div className="page-title-bar" style={{ marginTop: 24, marginBottom: 12 }}>
            <Title level={5} style={{ margin: 0, color: 'var(--color-text-secondary)' }}>{t('recentEvents')}</Title>
          </div>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            {data.recentEvents.length === 0 ? (
              <Text type="secondary">{t('noEvents')}</Text>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {data.recentEvents.map((event, idx) => {
                  const isLast = idx === data.recentEvents.length - 1;
                  return (
                    <div key={idx} style={{ display: 'flex', gap: 12, position: 'relative' }}>
                      {/* Timeline dot and line */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16, flexShrink: 0 }}>
                        <div className={idx === 0 ? 'timeline-dot-pulse' : undefined} style={{
                          width: 10, height: 10, borderRadius: '50%', background: MSG_TYPE_DOT_COLORS[event.message_type] || '#94a3b8',
                          border: '2px solid var(--color-surface)', boxShadow: '0 0 0 1px ' + (MSG_TYPE_DOT_COLORS[event.message_type] || '#94a3b8') + '44',
                          marginTop: 5, flexShrink: 0,
                        }} />
                        {!isLast && <div style={{ width: 1, flex: 1, background: 'var(--color-border)', marginTop: 4, opacity: 0.5 }} />}
                      </div>
                      {/* Content */}
                      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 }}>
                          <Space size={4}>
                            <Tag color={MSG_TYPE_TAG_COLORS[event.message_type] || 'default'} style={{ margin: 0, fontSize: 11 }}>
                              {tMsg(String(event.message_type))}
                            </Tag>
                            <MacAddress mac={event.client_mac} macNotes={macNotes} onNoteUpdate={fetchMacNotes} />
                            {event.hostname && <Text type="secondary" style={{ fontSize: 12 }}>({event.hostname})</Text>}
                          </Space>
                          <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatLocalTimeNoMs(event.timestamp)}</Text>
                        </div>
                        {event.server_response ? (
                          <Tooltip title={translateServerResponse(event.server_response, tSr)}>
                            <Text ellipsis style={{ fontSize: 12, color: '#94a3b8', maxWidth: 400, display: 'block', marginTop: 2 }}>
                              {translateServerResponse(event.server_response, tSr)}
                            </Text>
                          </Tooltip>
                        ) : (
                          <div style={{ height: 18 }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
