import { useState, type ReactNode } from "react";

// Section whose h2 header toggles the body; `summary` (when given) stays visible while
// collapsed, serving as the section's at-a-glance line.
export function CollapsibleSection({ title, defaultCollapsed = false, summary, children, className }: {
  title: string;
  defaultCollapsed?: boolean;
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <section className={className}>
      <h2>
        <button type="button" className="section-toggle" aria-expanded={!collapsed}
                onClick={() => setCollapsed((c) => !c)}>
          {title}
        </button>
      </h2>
      {summary}
      {!collapsed && children}
    </section>
  );
}
