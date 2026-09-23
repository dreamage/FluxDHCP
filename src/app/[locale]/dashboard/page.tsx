'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Card, Row, Col, Typography, Progress, Tag, Space, Tooltip, Alert,
  Segmented, Button, Skeleton, Divider,
} from 'antd';
import {
  TeamOutlined, ClusterOutlined, EnvironmentOutlined, LineChartOutlined,
  ReloadOutlined, FieldTimeOutlined, ArrowRightOutlined,
} from '@ant-design/icons';
import MacAddress from '@/components/MacAddress';
import TrendAreaChart from '@/components/charts/TrendAreaChart';
import DonutChart from '@/components/charts/DonutChart';
import BarList from '@/components/charts/BarList';
import type { TrendPoint } from '@/components/charts/TrendAreaChart';
import type { DonutSlice } from '@/components/charts/DonutChart';
import type { BarItem } from '@/components/charts/BarList';
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

// Chart palette — CSS variables so charts follow the active theme
const CHART_PALETTE = [
  'var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-3)',
  'var(--color-chart-4)', 'var(--color-chart-5)', 'var(--color-chart-6)',
];
const msgColor = (type: number) => CHART_PALETTE[(type - 1) % CHART_PALETTE.length];

type TrendRange = 'h24' | 'd7' | 'd30';

interface DashboardData {
  activeLeases: number;
  totalIPs: number;
  poolCount: number;
  activePoolCount: number;
  reservationCount: number;
  requests24h: number;
  poolUsage: Array<{ poolId: number; name: string; used: number; total: number; percentage: number }>;
  recentEvents: Array<{ timestamp: string; message_type: number; client_mac: string; hostname: string; server_response: string }>;
  dhcpStatus: 'running' | 'stopped';
  leaseStates: { bound: number; offered: number; expired: number; released: number };
  expiringLeases: { within1h: number; within24h: number };
  msgTypeDistribution: Array<{ type: number; count: number }>;
  trends: { h24: TrendPoint[]; d7: TrendPoint[]; d30: TrendPoint[] };
  webhookHealth: { success: number; failed: number };
  security: { macBlacklist: number; activeDeclines: number };
  assets: { deviceOptions: number; macNotes: number; disabledPools: number };
  topClients: Array<{ mac: string; hostname: string | null; count: number }>;
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
    <Card variant="borderless" className="stat-card card-rise" style={{ borderRadius: 12, height: '100%', padding: 0, overflow: 'hidden' }}>
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
          <div className="tabular-nums" style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
            {value}{suffix && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-text-secondary)', marginLeft: 4 }}>{suffix}</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Panel({ title, extra, children, delay = 0 }: {
  title: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode; delay?: number;
}) {
  return (
    <Card
      variant="borderless"
      className="card-rise"
      style={{ borderRadius: 12, height: '100%', animationDelay: `${delay}ms` }}
      title={<span style={{ fontWeight: 700, fontSize: 14 }}>{title}</span>}
      extra={extra}
    >
      {children}
    </Card>
  );
}

function LegendRow({ color, label, value }: { color: string; label: React.ReactNode; value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
      <Text style={{ fontSize: 13, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</Text>
      <Text strong className="tabular-nums" style={{ fontSize: 14, fontFamily: 'var(--font-mono)' }}>{value.toLocaleString()}</Text>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: React.ReactNode; value: number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Text style={{ fontSize: 13, flex: 1, color: 'var(--color-text-secondary)' }}>{label}</Text>
      <span className="tabular-nums" style={{
        fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)',
        color: color || 'var(--color-text)',
      }}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tMsg = useTranslations('messageTypes');
  const tSr = useTranslations('serverResponse');
  const locale = useLocale();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [trendRange, setTrendRange] = useState<TrendRange>('h24');
  const { macNotes, fetchMacNotes } = useMacNotes();
  const notify = useNotify();
  const hasNotified = useRef(false);
  const tRef = useRef(t);
  const notifyRef = useRef(notify);
  useEffect(() => { tRef.current = t; notifyRef.current = notify; });

  useEffect(() => { fetchMacNotes(); }, [fetchMacNotes]);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/dashboard');
      if (!res.ok) {
        setError(tRef.current('fetchError') || 'Failed to load');
        if (!hasNotified.current) { notifyRef.current.fatal(tRef.current('fetchError') || 'Failed to load'); hasNotified.current = true; }
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
        dhcpStatus: json.dhcpStatus ?? 'stopped',
        leaseStates: json.leaseStates ?? { bound: 0, offered: 0, expired: 0, released: 0 },
        expiringLeases: json.expiringLeases ?? { within1h: 0, within24h: 0 },
        msgTypeDistribution: json.msgTypeDistribution ?? [],
        trends: json.trends ?? { h24: [], d7: [], d30: [] },
        webhookHealth: json.webhookHealth ?? { success: 0, failed: 0 },
        security: json.security ?? { macBlacklist: 0, activeDeclines: 0 },
        assets: json.assets ?? { deviceOptions: 0, macNotes: 0, disabledPools: 0 },
        topClients: json.topClients ?? [],
      });
      setError('');
      setLastUpdated(new Date().toLocaleTimeString(undefined, { hour12: false }));
      hasNotified.current = false;
    } catch (err) {
      setError(tRef.current('fetchError') || 'Failed to load');
      if (!hasNotified.current) { notifyRef.current.fatal(tRef.current('fetchError') || 'Failed to load', err); hasNotified.current = true; }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(timer);
  }, [fetchData]);

  const usagePercent = data && data.totalIPs > 0
    ? Math.round((data.activeLeases / data.totalIPs) * 100) : 0;

  const isRunning = data?.dhcpStatus === 'running';

  // ===== 派生图表数据 =====
  const trendData = data ? data.trends[trendRange] : [];
  const trendUnit: 'hour' | 'day' = trendRange === 'h24' ? 'hour' : 'day';

  const msgSlices: DonutSlice[] = data
    ? data.msgTypeDistribution
        .filter(m => m.count > 0)
        .map(m => ({ label: tMsg(String(m.type)), value: m.count, color: msgColor(m.type) }))
    : [];
  const msgTotal = data ? data.msgTypeDistribution.reduce((s, m) => s + m.count, 0) : 0;

  const leaseSlices: DonutSlice[] = data
    ? [
        { label: t('leaseBound'), value: data.leaseStates.bound, color: 'var(--color-ip-bound)' },
        { label: t('leaseOffered'), value: data.leaseStates.offered, color: 'var(--color-ip-offered)' },
        { label: t('leaseExpired'), value: data.leaseStates.expired, color: 'var(--color-lease-expired)' },
        { label: t('leaseReleased'), value: data.leaseStates.released, color: 'var(--color-lease-released)' },
      ].filter(s => s.value > 0)
    : [];
  const leaseTotal = data
    ? Object.values(data.leaseStates).reduce((s, v) => s + v, 0)
    : 0;

  const poolBars: BarItem[] = data
    ? [...data.poolUsage]
        .sort((a, b) => b.percentage - a.percentage)
        .map(p => ({
          key: p.poolId,
          label: p.name,
          value: p.percentage,
          trailing: `${p.used.toLocaleString()} / ${p.total.toLocaleString()}`,
          color: p.percentage > 90 ? 'var(--color-chart-4)' : p.percentage > 70 ? 'var(--color-chart-3)' : 'var(--color-chart-1)',
          onClick: () => router.push(`/${locale}/pools`),
        }))
    : [];

  const clientBars: BarItem[] = data
    ? data.topClients.map(c => ({
        key: c.mac,
        label: (
          <Space size={6}>
            <MacAddress mac={c.mac} macNotes={macNotes} onNoteUpdate={fetchMacNotes} />
            {c.hostname && <Text type="secondary" style={{ fontSize: 12 }}>{c.hostname}</Text>}
          </Space>
        ),
        value: c.count,
        color: 'var(--color-chart-2)',
      }))
    : [];

  const go = (path: string) => router.push(`/${locale}${path}`);

  return (
    <>
      <div className="page-title-bar">
        <Title level={3} style={{ margin: 0 }}>{t('title')}</Title>
        <Space size={12}>
          {data && lastUpdated && (
            <Text type="secondary" style={{ fontSize: 12 }}>{t('lastUpdated', { time: lastUpdated })}</Text>
          )}
          <Button size="small" icon={<ReloadOutlined />} onClick={() => fetchData()} loading={loading}>
            {t('refresh')}
          </Button>
        </Space>
      </div>

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

      {/* 首屏骨架屏 */}
      {loading && !data && (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={10}>
            <Card variant="borderless" style={{ borderRadius: 12 }}><Skeleton active paragraph={{ rows: 4 }} /></Card>
          </Col>
          <Col xs={24} lg={14}>
            <Row gutter={[16, 16]}>
              {[0, 1, 2, 3].map(i => (
                <Col xs={12} sm={12} md={6} key={i}>
                  <Card variant="borderless" style={{ borderRadius: 12 }}><Skeleton active paragraph={{ rows: 1 }} /></Card>
                </Col>
              ))}
            </Row>
          </Col>
          <Col span={24}>
            <Card variant="borderless" style={{ borderRadius: 12 }}><Skeleton active paragraph={{ rows: 5 }} /></Card>
          </Col>
        </Row>
      )}

      {data && (
        <>
          {/* ===== Hero：服务状态 + 总体使用率 | KPI ===== */}
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={10}>
              <Card variant="borderless" className="card-rise" style={{ borderRadius: 12, height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <Space size={8}>
                    <span className={`status-dot ${isRunning ? 'status-dot-running' : 'status-dot-stopped'}`} />
                    <Text strong style={{ fontSize: 13 }}>{t('dhcpService')}</Text>
                  </Space>
                  <Tag color={isRunning ? 'success' : 'default'} style={{ margin: 0 }}>
                    {isRunning ? t('running') : t('stopped')}
                  </Tag>
                </div>

                {data.totalIPs > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
                    <Progress
                      type="circle"
                      percent={usagePercent}
                      size={148}
                      strokeWidth={9}
                      strokeColor="var(--color-primary)"
                      format={() => (
                        <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
                          <div className="tabular-nums" style={{ fontSize: 30, fontWeight: 800, color: 'var(--color-text)' }}>{usagePercent}%</div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{t('overallUsage')}</div>
                        </div>
                      )}
                    />
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <LegendRow color="var(--color-primary)" label={t('activeLeases')} value={data.activeLeases} />
                        <LegendRow color="var(--color-border)" label={t('totalIPs')} value={data.totalIPs} />
                        <LegendRow color="var(--color-ip-bound)" label={t('freeIPs')} value={data.totalIPs - data.activeLeases} />
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </Col>

            <Col xs={24} lg={14}>
              <Row gutter={[16, 16]}>
                <Col xs={12} sm={12} md={6}>
                  <StatCard icon={<TeamOutlined />} color="#0ea5e9" title={t('activeLeases')}
                    value={data.activeLeases.toLocaleString()} suffix={`/ ${data.totalIPs.toLocaleString()}`} />
                </Col>
                <Col xs={12} sm={12} md={6}>
                  <StatCard icon={<ClusterOutlined />} color="#8b5cf6" title={t('poolCount')}
                    value={data.activePoolCount} suffix={`/ ${data.poolCount}`} />
                </Col>
                <Col xs={12} sm={12} md={6}>
                  <StatCard icon={<EnvironmentOutlined />} color="#f59e0b" title={t('reservationCount')}
                    value={data.reservationCount.toLocaleString()} />
                </Col>
                <Col xs={12} sm={12} md={6}>
                  <StatCard icon={<LineChartOutlined />} color="#22c55e" title={t('requests24h')}
                    value={data.requests24h.toLocaleString()} />
                </Col>
              </Row>
            </Col>
          </Row>

          {/* ===== 事件趋势 ===== */}
          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col span={24}>
              <Panel
                title={t('eventTrend')}
                delay={60}
                extra={
                  <Segmented
                    size="small"
                    value={trendRange}
                    onChange={(v) => setTrendRange(v as TrendRange)}
                    options={[
                      { label: t('trend24h'), value: 'h24' },
                      { label: t('trend7d'), value: 'd7' },
                      { label: t('trend30d'), value: 'd30' },
                    ]}
                  />
                }
              >
                <TrendAreaChart
                  data={trendData}
                  unit={trendUnit}
                  height={220}
                  emptyText={t('noTrendData')}
                  ariaLabel={t('eventTrend')}
                />
              </Panel>
            </Col>
          </Row>

          {/* ===== 分布：消息类型 + 租约状态 ===== */}
          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} lg={12}>
              <Panel title={t('msgTypeDist')} delay={120}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
                  <DonutChart
                    slices={msgSlices}
                    size={148}
                    thickness={15}
                    centerValue={msgTotal.toLocaleString()}
                    centerLabel={t('totalEvents')}
                    emptyText={t('noEvents')}
                    ariaLabel={t('msgTypeDist')}
                  />
                  <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {msgSlices.map(s => (
                      <LegendRow key={s.label} color={s.color} label={s.label} value={s.value} />
                    ))}
                  </div>
                </div>
              </Panel>
            </Col>
            <Col xs={24} lg={12}>
              <Panel title={t('leaseStatesTitle')} delay={160}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
                  <DonutChart
                    slices={leaseSlices}
                    size={148}
                    thickness={15}
                    centerValue={leaseTotal.toLocaleString()}
                    centerLabel={t('totalEvents')}
                    emptyText={t('noEvents')}
                    ariaLabel={t('leaseStatesTitle')}
                  />
                  <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {leaseSlices.map(s => (
                      <LegendRow key={s.label} color={s.color} label={s.label} value={s.value} />
                    ))}
                  </div>
                </div>
              </Panel>
            </Col>
          </Row>

          {/* ===== 池使用率排行 + 活跃客户端 ===== */}
          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} lg={12}>
              <Panel title={t('poolRanking')} delay={200}>
                <BarList items={poolBars} max={100} emptyText={t('noPools')} />
              </Panel>
            </Col>
            <Col xs={24} lg={12}>
              <Panel title={t('topClients')} delay={240}>
                <BarList items={clientBars} emptyText={t('noClients')} />
              </Panel>
            </Col>
          </Row>

          {/* ===== 预警 / 健康 / 安全 ===== */}
          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} md={8}>
              <Panel title={<Space size={6}><FieldTimeOutlined />{t('expiringLeases')}</Space>} delay={280}>
                {data.expiringLeases.within24h === 0 ? (
                  <Text type="secondary" style={{ fontSize: 13 }}>{t('noExpiring')}</Text>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <MiniStat label={t('within1h')} value={data.expiringLeases.within1h} color="var(--color-chart-4)" />
                    <MiniStat label={t('within24h')} value={data.expiringLeases.within24h} color="var(--color-chart-3)" />
                  </div>
                )}
              </Panel>
            </Col>
            <Col xs={24} md={8}>
              <Panel title={t('webhookHealth')} delay={320}>
                {data.webhookHealth.success + data.webhookHealth.failed === 0 ? (
                  <Text type="secondary" style={{ fontSize: 13 }}>{t('noWebhooks')}</Text>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <MiniStat label={t('webhookSuccess')} value={data.webhookHealth.success} color="var(--color-chart-5)" />
                    <MiniStat label={t('webhookFailed')} value={data.webhookHealth.failed} color="var(--color-chart-4)" />
                  </div>
                )}
              </Panel>
            </Col>
            <Col xs={24} md={8}>
              <Panel title={t('securityOverview')} delay={360}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <MiniStat label={t('macBlacklist')} value={data.security.macBlacklist} />
                  <MiniStat label={t('activeDeclines')} value={data.security.activeDeclines} />
                  <Divider style={{ margin: '2px 0' }} />
                  <MiniStat label={t('deviceOptions')} value={data.assets.deviceOptions} />
                  <MiniStat label={t('macNotesCount')} value={data.assets.macNotes} />
                  <MiniStat label={t('disabledPools')} value={data.assets.disabledPools} />
                </div>
              </Panel>
            </Col>
          </Row>

          {/* ===== 最近事件 ===== */}
          <div className="page-title-bar" style={{ marginTop: 24, marginBottom: 12 }}>
            <Title level={5} style={{ margin: 0, color: 'var(--color-text-secondary)' }}>{t('recentEvents')}</Title>
            <Button type="link" size="small" onClick={() => go('/dhcp-logs')}>
              {t('viewAll')} <ArrowRightOutlined />
            </Button>
          </div>
          <Card variant="borderless" className="card-rise" style={{ borderRadius: 12, animationDelay: '400ms' }}>
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
                            <Text ellipsis style={{ fontSize: 12, color: 'var(--color-text-muted)', maxWidth: 400, display: 'block', marginTop: 2 }}>
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
