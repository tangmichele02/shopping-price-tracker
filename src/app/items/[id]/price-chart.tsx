"use client";

import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";

export type PricePoint = { time: number; price: number; regularPrice: number | null };

const HEIGHT = 240;
const MARGIN = { top: 16, right: 72, bottom: 28, left: 52 };

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

// Round tick values (multiples of 1, 2 or 5) that cover the range.
function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.max(max, 1) * 0.2;
  const rawStep = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep)!;
  const start = Math.floor((min - span * 0.05) / step) * step;
  const end = Math.ceil((max + span * 0.05) / step) * step;
  const ticks: number[] = [];
  for (let v = Math.max(start, 0); v <= end + step / 2; v += step) ticks.push(v);
  return ticks;
}

export function PriceChart({
  points,
  targetPrice,
  currency,
}: {
  points: PricePoint[];
  targetPrice: number | null;
  currency: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Unknown until measured, so the first paint never overflows a narrow screen.
  const [width, setWidth] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    // Measure right away too; the observer's first callback waits for a frame.
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  if (points.length === 0) {
    return <p className="text-sm text-neutral-500">No successful price checks yet.</p>;
  }

  if (width === null) {
    return <div ref={containerRef} className="chart w-full" style={{ height: HEIGHT }} />;
  }

  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 40);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const values = points.map((p) => p.price);
  if (targetPrice !== null) values.push(targetPrice);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];

  const tMin = points[0].time;
  const tMax = points[points.length - 1].time;
  const x = (time: number) =>
    MARGIN.left + (tMax === tMin ? plotWidth / 2 : ((time - tMin) / (tMax - tMin)) * plotWidth);
  const y = (value: number) => MARGIN.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;

  // A price holds until the next check, so draw steps rather than slopes.
  const path = points
    .map((p, i) => (i === 0 ? `M${x(p.time)},${y(p.price)}` : `H${x(p.time)}V${y(p.price)}`))
    .join("");

  const last = points[points.length - 1];
  const active = hovered !== null ? points[hovered] : null;

  function onPointerMove(event: React.PointerEvent<SVGRectElement>) {
    const bounds = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    let nearest = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(x(points[i].time) - pointerX) < Math.abs(x(points[nearest].time) - pointerX)) {
        nearest = i;
      }
    }
    setHovered(nearest);
  }

  const tooltipOnLeft = active !== null && x(active.time) > MARGIN.left + plotWidth / 2;

  return (
    <div ref={containerRef} className="chart relative w-full">
      <svg width={width} height={HEIGHT} role="img" aria-label="Price history">
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={MARGIN.left}
              x2={MARGIN.left + plotWidth}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--chart-grid)"
              strokeWidth={1}
            />
            <text
              x={MARGIN.left - 8}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="chart-axis-text"
            >
              {formatPrice(tick, currency).replace(/\.00$/, "")}
            </text>
          </g>
        ))}

        <text x={MARGIN.left} y={HEIGHT - 8} className="chart-axis-text">
          {dateFormat.format(tMin)}
        </text>
        {tMax !== tMin && (
          <text x={MARGIN.left + plotWidth} y={HEIGHT - 8} textAnchor="end" className="chart-axis-text">
            {dateFormat.format(tMax)}
          </text>
        )}

        {targetPrice !== null && (
          <g>
            <line
              x1={MARGIN.left}
              x2={MARGIN.left + plotWidth}
              y1={y(targetPrice)}
              y2={y(targetPrice)}
              stroke="var(--chart-reference)"
              strokeWidth={1}
            />
            <text
              x={MARGIN.left + 4}
              y={y(targetPrice) - 5}
              className="chart-axis-text"
            >
              Target {formatPrice(targetPrice, currency)}
            </text>
          </g>
        )}

        <path
          d={path}
          fill="none"
          stroke="var(--chart-series)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={x(last.time)}
          cy={y(last.price)}
          r={5}
          fill="var(--chart-series)"
          stroke="var(--background)"
          strokeWidth={2}
        />
        <text
          x={x(last.time) + 10}
          y={y(last.price)}
          dominantBaseline="middle"
          className="chart-value-text"
        >
          {formatPrice(last.price, currency)}
        </text>

        {active && (
          <g pointerEvents="none">
            <line
              x1={x(active.time)}
              x2={x(active.time)}
              y1={MARGIN.top}
              y2={MARGIN.top + plotHeight}
              stroke="var(--chart-reference)"
              strokeWidth={1}
            />
            <circle
              cx={x(active.time)}
              cy={y(active.price)}
              r={5}
              fill="var(--chart-series)"
              stroke="var(--background)"
              strokeWidth={2}
            />
          </g>
        )}

        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHovered(null)}
        />
      </svg>

      {active && (
        <div
          className="chart-tooltip pointer-events-none absolute rounded-md px-3 py-2 text-xs shadow-md"
          style={{
            top: MARGIN.top,
            ...(tooltipOnLeft
              ? { right: width - x(active.time) + 12 }
              : { left: x(active.time) + 12 }),
          }}
        >
          <p className="chart-tooltip-muted">
            {new Date(active.time).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
          <p className="text-sm font-semibold">{formatPrice(active.price, currency)}</p>
          {active.regularPrice !== null && (
            <p className="chart-tooltip-muted">Was {formatPrice(active.regularPrice, currency)}</p>
          )}
        </div>
      )}
    </div>
  );
}
