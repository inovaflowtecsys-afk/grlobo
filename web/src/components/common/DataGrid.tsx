import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

export type DataGridColumn<T> = {
  key: string;
  header: string;
  sortable?: boolean;
  className?: string;
  render: (row: T) => React.ReactNode;
};

type DataGridProps<T> = {
  columns: DataGridColumn<T>[];
  rows: T[];
  loading?: boolean;
  getRowId: (row: T) => string;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (key: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
};

export function DataGrid<T>({ columns, rows, loading, getRowId, sortBy, sortDirection, onSort, emptyTitle = "Nenhum registro encontrado.", emptyDescription }: DataGridProps<T>) {
  if (loading) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-lg border border-brand-border/15 bg-white">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-border">
          <Loader2 className="size-4 animate-spin text-brand-accent" aria-hidden="true" />
          Carregando dados...
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-brand-border/35 bg-white p-8 text-center">
        <Inbox className="mb-3 size-9 text-brand-border" aria-hidden="true" />
        <p className="text-sm font-semibold">{emptyTitle}</p>
        {emptyDescription ? <p className="mt-1 max-w-sm text-sm text-brand-border">{emptyDescription}</p> : null}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-brand-border/15 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-brand-muted/60 text-xs uppercase text-brand-border">
            <tr>
              {columns.map((column) => {
                const active = sortBy === column.key;
                const SortIcon = active ? (sortDirection === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
                return (
                  <th key={column.key} className={cn("whitespace-nowrap px-4 py-3 font-bold", column.className)} aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : undefined}>
                    {column.sortable ? (
                      <button type="button" className="inline-flex items-center gap-1 uppercase transition hover:text-brand-dark" onClick={() => onSort?.(column.key)}>
                        {column.header}
                        <SortIcon className="size-3.5" aria-hidden="true" />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border/10">
            {rows.map((row) => (
              <tr key={getRowId(row)} className="transition hover:bg-brand-surface">
                {columns.map((column) => (
                  <td key={column.key} className={cn("px-4 py-3 align-middle", column.className)}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
