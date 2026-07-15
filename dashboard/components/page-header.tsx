import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Mono, uppercase section label that situates the page (e.g. "TALABALAR / IMPORT"). */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Right-aligned actions (buttons, filters). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * The institutional page header: a mono eyebrow that encodes the section, a serif
 * title for gravitas, and a hairline rule marked with the gold accent tick — the
 * recurring signature of the "akademik & aniq" system.
 */
export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("space-y-3", className)}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className="relative h-px w-full bg-border">
        <span className="absolute left-0 top-0 h-px w-12 bg-accent-gold" />
      </div>
    </header>
  );
}
