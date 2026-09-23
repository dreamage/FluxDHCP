'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface TrendPoint {
  /** 桶起始时间 (ISO 8601 UTC) */
  t: string;
  count: number;
}

interface TrendAreaChartProps {
  data: TrendPoint[];
  unit: 'hour' | 'day';
  height?: number;
  /** 主色，支持 CSS 变量 */
  color?: string;
  emptyText?: string;
  ariaLabel?: string;
}

/**
 * 手写 SVG 面积趋势图 — 零第三方依赖。
 * 采用 ResizeObserver 获取容器实宽，viewBox 与像素 1:1 映射，避免描边变形。
 */
export default function TrendAreaChart({
  data,
  unit,
  height = 200,
  color = 'var(--color-chart-1)',
  emptyText = '',
  ariaLabel,
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

  const pad = { top: 16, right: 14, bottom: 26, left: 34 };
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

          {/* Hover Tooltip */}
          {hoverPoint && (
            <div
              style={{
                position: 'absolute',
                left: Math.max(46, Math.min(width - 46, hoverPoint.x)),
                top: 0,
                transform: 'translate(-50%, -100%)',
                background: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 11,
                lineHeight: 1.4,
                color: 'var(--color-text)',
                boxShadow: 'var(--shadow-sm)',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 2,
              }}
            >
              <div style={{ color: 'var(--color-text-secondary)' }}>{fmtLabel(hoverPoint.t)}</div>
              <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{hoverPoint.count}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
