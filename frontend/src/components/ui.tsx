import { AlertCircle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="page-head-text">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  footer,
  className = "",
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <header className="panel-head">
          <div className="panel-head-text">
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      <div className="panel-body">{children}</div>
      {footer && <footer className="panel-foot">{footer}</footer>}
    </section>
  );
}

/** A row of key figures inside one bordered container, separated by dividers. */
export function StatGroup({ children, busy = false }: { children: ReactNode; busy?: boolean }) {
  return (
    <div className={`stat-group ${busy ? "is-busy" : ""}`} aria-busy={busy}>
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  detail,
  tone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  detail?: ReactNode;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ? `tone-${tone}` : ""}`}>
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      {detail && <div className="stat-detail">{detail}</div>}
    </div>
  );
}

type SeriesVariant = "line" | "dash" | "area";

function SeriesSwatch({ color, variant }: { color: string; variant: SeriesVariant }) {
  if (variant === "area") return <span className="swatch swatch-area" style={{ background: color }} aria-hidden="true" />;
  return (
    <span
      className="swatch swatch-line"
      style={{ borderTopColor: color, borderTopStyle: variant === "dash" ? "dashed" : "solid" }}
      aria-hidden="true"
    />
  );
}

/** Static legend entry. */
export function LegendItem({ color, label, variant = "line" }: { color: string; label: string; variant?: SeriesVariant }) {
  return (
    <span className="legend-item">
      <SeriesSwatch color={color} variant={variant} />
      {label}
    </span>
  );
}

/** Legend entry that also toggles the series on and off. */
export function SeriesToggle({
  color,
  label,
  variant = "line",
  active,
  onToggle,
}: {
  color: string;
  label: string;
  variant?: SeriesVariant;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className={`series-toggle ${active ? "" : "is-off"}`} aria-pressed={active} onClick={onToggle}>
      <SeriesSwatch color={color} variant={variant} />
      {label}
    </button>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warning" | "positive" }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function Skeleton({ height = 16, width = "100%" }: { height?: number; width?: number | string }) {
  return <span className="skeleton" style={{ height, width }} aria-hidden="true" />;
}

export function LoadingPage() {
  return (
    <div className="loading-page" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <Skeleton height={14} width={140} />
      <Skeleton height={28} width={360} />
      <div className="loading-grid">
        <Skeleton height={92} />
        <Skeleton height={92} />
        <Skeleton height={92} />
      </div>
      <Skeleton height={360} />
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <div>
        <strong>Data could not be loaded</strong>
        <p>{message}</p>
      </div>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          <RotateCw size={14} aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}
