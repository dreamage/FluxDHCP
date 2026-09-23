'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface TrendPoint {
  /** 桶起始时间 (ISO 8601 UTC) */
  t: string;
  /** 该桶事件总数 */
  count: number;
  /** 各 DHCP 消息类型数量 (message_type -> count) */
  byType?: Record<number, number>;
}

/** 悬停明细中单个消息类型的展示元信息 */
export interface TrendTypeMeta {
  label: string;
  color: string;
}

interface TrendAreaChartProps {
  data: TrendPoint[];
  unit: 'hour' | 'day';
  height?: number;
  /** 主色，支持 CSS 变量 */
  color?: string;
  emptyText?: string;
  ariaLabel?: string;
  /** 解析消息类型 -> 展示元信息；返回 null 则该类型不计入明细 */
  resolveType?: (type: number) => TrendTypeMeta | null;
}

// 明细最多展示的类型行数，超出部分合并为一行，避免 tooltip 溢出图表
const MAX_DETAIL_ROWS = 6;

/**
 * 手写 SVG 面积趋势图 — 零第三方依赖。
 * 采用 ResizeObserver 获取容器实宽，viewBox 与像素 1:1 映射，避免描边变形。
 * 悬停时除总数外，还会按 DHCP 消息类型展示明细。
 */
export default function TrendAreaChart({
  data,
  unit,
  height = 180,
  color = 'var(--color-chart-1)',
  emptyText = '',
  ariaLabel,
  resolveType,
}: TrendAreaChartProps) {
  const rawId = useId();
  // useId 可能含特殊字符（如 «r0»），清理后再用于 SVG url(#id) 引用更安全
  const gradId = `trend-grad-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  // 响应式宽度
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = { top: 14, right: 14, bottom: 24, left: 34 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = Math.max(0, height - pad.top - pad.bottom);
  const n = data.length;
  const max = Math.max(1, ...data.map(d => d.count));

  const points = useMemo(() => {
    if (n === 0 || innerW <= 0) return [] as Array<TrendPoint & { x: number; y: number }>;
    const step = n > 1 ? innerW / (n - 1) : 0;
    return data.map((d, i) => ({
      ...d,
      x: pad.left + (n > 1 ? i * step : innerW / 2),
      y: pad.top + innerH * (1 - d.count / max),
    }));
  }, [data, innerW, innerH, max, n, pad.left, pad.top]);

  const baseY = pad.top + innerH;
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = points.length
    ? `${linePath} L${points[points.length - 1].x.toFixed(1)},${baseY} L${points[0].x.toFixed(1)},${baseY} Z`
    : '';

  // Y 轴参考线
  const yTicks = [0, 0.5, 1].map(r => ({
    value: Math.round(max * r),
    y: pad.top + innerH * (1 - r),
  }));

  const fmtLabel = (t: string) => {
    const d = new Date(t);
    if (unit === 'hour') return `${String(d.getHours()).padStart(2, '0')}:00`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // X 轴标签：均匀取样，最多 6 个且去重
  const labelIdx = useMemo(() => {
    if (n === 0) return [] as number[];
    const want = Math.min(n, unit === 'hour' ? 6 : 7);
    const raw = Array.from({ length: want }, (_, k) =>
      Math.round((k * (n - 1)) / Math.max(want - 1, 1)),
    );
    return [...new Set(raw)];
  }, [n, unit]);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (n === 0 || innerW <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const step = n > 1 ? innerW / (n - 1) : 1;
    const idx = n > 1 ? Math.round((x - pad.left) / step) : 0;
    setHover(Math.max(0, Math.min(n - 1, idx)));
  };

  const hoverPoint = hover != null && points[hover] ? points[hover] : null;

  // 悬停明细：按各消息类型数量降序
  const detailRows = useMemo(() => {
    const byType = hover != null ? data[hover]?.byType : undefined;
    if (!byType || !resolveType) return [];
    return Object.entries(byType)
      .map(([type, value]) => {
        const meta = resolveType(Number(type));
        return meta ? { type: Number(type), label: meta.label, color: meta.color, value } : null;
      })
      .filter((r): r is { type: number; label: string; color: string; value: number } => r !== null)
      .sort((a, b) => b.value - a.value);
  }, [hover, data, resolveType]);

  const visibleRows = detailRows.slice(0, MAX_DETAIL_ROWS);
  const hiddenRows = detailRows.slice(MAX_DETAIL_ROWS);
  const hiddenTotal = hiddenRows.reduce((sum, r) => sum + r.value, 0);

  // tooltip 定位：数据点在上半部则显示在下方，反之显示在上方，避免溢出容器
  const tipBelow = hoverPoint ? hoverPoint.y < height * 0.45 : true;
  const tipLeft = hoverPoint ? Math.max(80, Math.min(width - 80, hoverPoint.x)) : 0;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      {n === 0 ? (
        <div style={{
          height, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--color-text-muted)', fontSize: 13,
        }}>
          {emptyText}
        </div>
      ) : width === 0 ? (
        <div style={{ height }} />
      ) : (
        <>
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={ariaLabel}
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
            style={{ display: 'block', overflow: 'visible' }}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.34" />
                <stop offset="100%" stopColor={color} stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* 横向参考线 + Y 轴刻度 */}
            {yTicks.map((tick, i) => (
              <g key={i}>
                <line
                  x1={pad.left} y1={tick.y} x2={width - pad.right} y2={tick.y}
                  stroke="var(--color-border)" strokeWidth={1} strokeDasharray="3 4" opacity={0.6}
                />
                <text
                  x={pad.left - 6} y={tick.y + 3}
                  textAnchor="end" fontSize={10}
                  fill="var(--color-text-muted)"
                >
                  {tick.value}
                </text>
              </g>
            ))}

            {/* 面积 + 折线 */}
            <path d={areaPath} fill={`url(#${gradId})`} />
            <path
              d={linePath} fill="none" stroke={color}
              strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
            />

            {/* Hover 指示 */}
            {hoverPoint && (
              <g>
                <line
                  x1={hoverPoint.x} y1={pad.top} x2={hoverPoint.x} y2={baseY}
                  stroke={color} strokeWidth={1} strokeDasharray="3 3" opacity={0.6}
                />
                <circle cx={hoverPoint.x} cy={hoverPoint.y} r={4} fill={color} stroke="var(--color-surface)" strokeWidth={2} />
              </g>
            )}

            {/* X 轴标签 */}
            {labelIdx.map(i => (
              <text
                key={i}
                x={points[i]?.x ?? 0}
                y={height - 8}
                textAnchor="middle"
                fontSize={10}
                fill="var(--color-text-muted)"
              >
                {fmtLabel(data[i].t)}
              </text>
            ))}
          </svg>

          {/* Hover Tooltip：总数 + 各消息类型明细 */}
          {hoverPoint && (
            <div
              style={{
                position: 'absolute',
                left: tipLeft,
                transform: 'translateX(-50%)',
                ...(tipBelow
                  ? { top: hoverPoint.y + 12 }
                  : { bottom: height - hoverPoint.y + 12 }),
                background: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 11,
                lineHeight: 1.5,
                color: 'var(--color-text)',
                boxShadow: 'var(--shadow-md)',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                minWidth: 108,
                zIndex: 2,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: 'var(--color-text-secondary)' }}>
                <span>{fmtLabel(hoverPoint.t)}</span>
                <span className="tabular-nums" style={{ fontWeight: 700, color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>
                  {hoverPoint.count}
                </span>
              </div>

              {visibleRows.length > 0 && (
                <>
                  <div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '4px 0' }} />
                  {visibleRows.map(row => (
                    <div key={row.type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, color: 'var(--color-text-secondary)' }}>{row.label}</span>
                      <span className="tabular-nums" style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{row.value}</span>
                    </div>
                  ))}
                  {hiddenRows.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ width: 6, flexShrink: 0 }} />
                      <span style={{ flex: 1, color: 'var(--color-text-muted)' }}>···</span>
                      <span className="tabular-nums" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{hiddenTotal}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
