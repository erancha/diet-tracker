import { useState, type ReactNode } from "react";

type Shared = {
  title: string;
  summary?: ReactNode;
  // Rides at the far end of the title's own row, for a control that belongs beside the heading
  // rather than inside the fold — it stays on screen whether the section is open or folded.
  headerAside?: ReactNode;
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
  const { title, summary, headerAside, children, className, headingLevel = 2 } = props;
  const [selfCollapsed, setSelfCollapsed] = useState(props.defaultCollapsed === true);

  const collapsed = props.collapsed === undefined ? selfCollapsed : props.collapsed;
  const toggle = props.onToggle === undefined
    ? () => setSelfCollapsed((c) => !c)
    : props.onToggle;
  const Heading = headingLevel === 3 ? "h3" : "h2";

  const heading = (
    <Heading>
      <button type="button" className="section-toggle" aria-expanded={!collapsed}
              onClick={toggle}>
        {title}
      </button>
    </Heading>
  );

  return (
    <section className={className}>
      {headerAside === undefined
        ? heading
        : <div className="section-header">{heading}{headerAside}</div>}
      {summary}
      {!collapsed && children}
    </section>
  );
}
