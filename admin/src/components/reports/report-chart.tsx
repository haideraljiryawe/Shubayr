import type { ReportChartPoint } from "@/lib/reports";

/** Dependency-free SVG: the table remains authoritative and accessible. */
export function ReportChart({ points, kind, label }: { points: ReportChartPoint[]; kind: "line" | "bar"; label: string }) {
  const visible = points.slice(0, 31);
  if (visible.length < 2) return null;
  const values = visible.map((point) => Number(point.value) || 0);
  const max = Math.max(...values, 1);
  const coordinates = visible.map((point, index) => ({
    x: visible.length === 1 ? 50 : (index / (visible.length - 1)) * 100,
    y: 92 - (values[index] / max) * 80,
    point,
  }));
  return (
    <figure className="mb-6 rounded-lg border border-border bg-surface p-4" data-testid="report-chart">
      <figcaption className="mb-3 font-semibold">{label}</figcaption>
      <svg viewBox="0 0 100 100" className="h-56 w-full overflow-visible" role="img" aria-label={label} preserveAspectRatio="none">
        <line x1="0" y1="92" x2="100" y2="92" stroke="currentColor" className="text-border" vectorEffect="non-scaling-stroke" />
        {kind === "line" ? <polyline points={coordinates.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke="currentColor" className="text-primary-dark" strokeWidth="2" vectorEffect="non-scaling-stroke" /> : coordinates.map(({ x, y, point }, index) => <rect key={`${point.label}-${index}`} x={Math.max(0, x - 1.2)} y={y} width="2.4" height={92 - y} fill="currentColor" className="text-primary-dark"><title>{point.label}: {point.value}</title></rect>)}
        {kind === "line" ? coordinates.map(({ x, y, point }, index) => <circle key={`${point.label}-${index}`} cx={x} cy={y} r="1.5" fill="currentColor" className="text-primary-dark"><title>{point.label}: {point.value}</title></circle>) : null}
      </svg>
    </figure>
  );
}
