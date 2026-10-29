import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-11 w-full rounded-md border border-brand-border/40 bg-white px-3 text-sm text-brand-dark outline-none transition",
      "placeholder:text-brand-border/70 focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/25",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
