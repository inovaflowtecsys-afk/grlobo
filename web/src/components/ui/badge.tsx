import { type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const variants = {
  success: "bg-status-success/10 text-status-success",
  warning: "bg-status-warning/15 text-amber-700",
  info: "bg-brand-primary/10 text-brand-primary",
  danger: "bg-status-error/10 text-status-error",
  neutral: "bg-brand-muted text-brand-border",
  accent: "bg-brand-accent/15 text-brand-primary",
} as const;

export function Badge({ variant = "info", className, ...props }: HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof variants }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", variants[variant], className)} {...props} />;
}
