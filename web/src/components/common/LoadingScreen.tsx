export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-surface">
      <div className="size-8 animate-spin rounded-full border-4 border-brand-muted border-t-brand-primary" role="status" aria-label="Carregando" />
    </div>
  );
}
