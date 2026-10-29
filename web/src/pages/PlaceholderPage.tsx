import { Construction } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="p-4 md:p-7">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Construction className="size-8 text-brand-accent" aria-hidden="true" />
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="max-w-sm text-sm text-brand-border">Este módulo entra nas próximas etapas do desenvolvimento.</p>
        </CardContent>
      </Card>
    </div>
  );
}
