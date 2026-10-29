import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand-primary text-white hover:bg-brand-primary/90",
  secondary: "border border-brand-border/40 bg-white text-brand-dark hover:bg-brand-muted",
  ghost: "text-brand-dark hover:bg-brand-muted",
  danger: "bg-status-error text-white hover:opacity-90",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }>(
  ({ className, variant = "primary", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-60",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent",
        variants[variant],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
