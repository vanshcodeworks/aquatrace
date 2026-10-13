import React from "react";

export function Panel({
  children,
  className = "",
  elevated = false,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { elevated?: boolean }) {
  return (
    <div
      className={`rounded border border-line ${elevated ? "bg-elevated" : "bg-panel"} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  subtitle,
  right,
  icon,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-3.5 py-2.5">
      <div className="flex min-w-0 items-baseline gap-2">
        {icon ? <span className="translate-y-px text-dim">{icon}</span> : null}
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold text-ink">{title}</h3>
          {subtitle ? <p className="mt-0.5 truncate text-[11px] text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function Kpi({
  label,
  value,
  unit,
  hint,
  tone = "default",
  icon,
  delta,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: "default" | "healthy" | "warning" | "critical" | "teal";
  icon?: React.ReactNode;
  delta?: string;
}) {
  const toneText =
    tone === "critical"
      ? "text-critical"
      : tone === "warning"
        ? "text-warning"
        : tone === "healthy"
          ? "text-healthy"
          : tone === "teal"
            ? "text-teal"
            : "text-ink";
  return (
    <div className="border border-line bg-panel px-3.5 py-3" title={hint}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted">{label}</span>
        {icon ? <span className="text-dim">{icon}</span> : null}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className={`font-mono text-[24px] font-semibold leading-none tracking-tight ${toneText}`}>
          {value}
        </span>
        {unit ? <span className="text-[11px] text-muted">{unit}</span> : null}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {delta ? <span className="text-[11px] text-muted">{delta}</span> : null}
        {hint ? <span className="truncate text-[11px] text-dim">{hint}</span> : null}
      </div>
    </div>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "secondary";
  size?: "sm" | "md";
  icon?: React.ReactNode;
};

export function Button({
  children,
  variant = "secondary",
  size = "md",
  icon,
  className = "",
  ...rest
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-45";
  const sizes = size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]";
  const variants: Record<string, string> = {
    primary: "bg-teal text-[#0b0e11] hover:bg-teal/90",
    secondary: "border border-line bg-elevated text-ink hover:border-line-strong hover:bg-[#22272d]",
    ghost: "text-muted hover:bg-elevated hover:text-ink",
    danger: "border border-critical/50 text-critical hover:bg-critical/10",
  };
  return (
    <button className={`${base} ${sizes} ${variants[variant]} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export function Select({
  children,
  className = "",
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-8 rounded border border-line bg-elevated px-2 text-[13px] text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-teal ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Input({ className = "", ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-8 w-full rounded border border-line bg-elevated px-2 text-[13px] text-ink placeholder:text-dim focus:outline-none focus-visible:ring-1 focus-visible:ring-teal ${className}`}
      {...rest}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-dim">{hint}</span> : null}
    </label>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-line ${className}`} />;
}

export function EmptyState({
  title,
  message,
  icon,
}: {
  title: string;
  message: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-1.5 px-4 py-8">
      {icon ? <div className="text-dim">{icon}</div> : null}
      <p className="text-[13px] font-medium text-ink">{title}</p>
      <p className="max-w-md text-[12px] text-muted">{message}</p>
    </div>
  );
}

export function Badge({
  children,
  tone = "default",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "default" | "healthy" | "warning" | "critical" | "teal" | "muted";
  className?: string;
}) {
  const tones: Record<string, string> = {
    default: "border-line text-muted",
    muted: "border-line text-dim",
    healthy: "border-healthy/40 text-healthy",
    warning: "border-warning/40 text-warning",
    critical: "border-critical/40 text-critical",
    teal: "border-teal/40 text-teal",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10.5px] leading-none ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
