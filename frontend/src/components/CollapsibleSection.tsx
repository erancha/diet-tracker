import { useState, type ReactNode } from "react";

type Shared = {
  title: string;
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
  // Nested sections need a subordinate heading so the document outline stays ordered.
  headingLevel?: 2 | 3;
};

// Either the section owns its folded state or the caller does, never both: a caller that has to
// open the section itself — reacting to something outside the header — would otherwise fight an
// internal copy that no longer agrees with what is on screen.
type SelfManaged = Shared & { defaultCollapsed?: boolean; collapsed?: never; onToggle?: never };
type CallerManaged = Shared & { collapsed: boolean; onToggle: () => void; defaultCollapsed?: never };

// Section whose heading toggles the body; `summary` (when given) stays visible while collapsed,
// serving as the section's at-a-glance line.
export function CollapsibleSection(props: SelfManaged | CallerManaged) {
  const { title, summary, children, className, headingLevel = 2 } = props;
  const [selfCollapsed, setSelfCollapsed] = useState(props.defaultCollapsed === true);

  const collapsed = props.collapsed === undefined ? selfCollapsed : props.collapsed;
  const toggle = props.onToggle === undefined
    ? () => setSelfCollapsed((c) => !c)
    : props.onToggle;
  const Heading = headingLevel === 3 ? "h3" : "h2";

  return (
    <section className={className}>
      <Heading>
        <button type="button" className="section-toggle" aria-expanded={!collapsed}
                onClick={toggle}>
          {title}
        </button>
      </Heading>
      {summary}
      {!collapsed && children}
    </section>
  );
}
