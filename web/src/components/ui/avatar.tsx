import { cn } from "../../lib/utils";

export function Avatar({ name, imageUrl, className }: { name?: string | null; imageUrl?: string | null; className?: string }) {
  const initials = name?.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "GL";

  if (imageUrl) {
    return <img src={imageUrl} alt={`Foto de ${name || "usuário"}`} className={cn("size-10 shrink-0 rounded-full object-cover", className)} />;
  }
  return (
    <div
      className={cn("flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-white", className)}
      aria-label={`Avatar de ${name || "usuário"}`}
    >
      {initials}
    </div>
  );
}
