import React from "react";

export function Panel({
  children,
  className = "",
  elevated = false,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { elevated?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 ${
        elevated ? "bg-slate-50/80 shadow-sm" : "bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)]"
      } ${className}`}
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
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ? <span className="text-slate-400">{icon}</span> : null}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold tracking-tight text-slate-900">{title}</h3>
          {subtitle ? <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p> : null}
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
      ? "text-red-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "healthy"
          ? "text-emerald-600"
          : tone === "teal"
            ? "text-blue-600"
            : "text-slate-900";

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {icon ? <span className="text-slate-400">{icon}</span> : null}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`font-mono text-2xl font-bold tracking-tight ${toneText}`}>
          {value}
        </span>
        {unit ? <span className="text-xs font-medium text-slate-400">{unit}</span> : null}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {delta ? <span className="font-medium text-slate-600">{delta}</span> : null}
        {hint ? <span className="truncate text-slate-400">{hint}</span> : null}
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
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]";
  const sizes = size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm";
  const variants: Record<string, string> = {
    primary: "bg-blue-600 text-white shadow-sm hover:bg-blue-700",
    secondary: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-xs",
    ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    danger: "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100",
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
      className={`h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Input({ className = "", ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs ${className}`}
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
      <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200/70 ${className}`} />;
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
      {icon ? <div className="text-slate-400">{icon}</div> : null}
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="max-w-md text-xs text-slate-500">{message}</p>
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
    default: "bg-slate-100 text-slate-700 border-slate-200",
    muted: "bg-slate-50 text-slate-500 border-slate-200",
    healthy: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    critical: "bg-red-50 text-red-700 border-red-200",
    teal: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
