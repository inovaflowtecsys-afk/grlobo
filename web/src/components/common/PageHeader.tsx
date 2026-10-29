export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="text-2xl font-bold">{title}</h2>
      {description ? <p className="mt-1 text-sm text-brand-border">{description}</p> : null}
    </div>
  );
}
