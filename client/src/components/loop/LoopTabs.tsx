import "./LoopTabs.css";

export interface TabItem<Id extends string = string> {
  id: Id;
  label: string;
}

interface LoopTabsProps<Id extends string> {
  tabs: TabItem<Id>[];
  activeId: Id;
  onChange: (id: Id) => void;
  /** "compact" is used for the Analysis sub-tabs so they read as a level below the main nav. */
  size?: "default" | "compact";
  /** "vertical" renders the same tabs as a stacked sidebar nav instead of a horizontal row. */
  orientation?: "horizontal" | "vertical";
}

/**
 * Dependency-free tab nav — no library, plain CSS (see LoopTabs.css), matches the
 * "no new libraries" constraint in LILIAN_TODAY.md. Reused for both the 8 main
 * loop tabs and the Analysis sub-tabs (Technical audit / Search intent / Content
 * performance).
 */
export function LoopTabs<Id extends string>({
  tabs,
  activeId,
  onChange,
  size = "default",
  orientation = "horizontal",
}: LoopTabsProps<Id>) {
  const classes = [
    "loop-tabs",
    size === "compact" && "loop-tabs--compact",
    orientation === "vertical" && "loop-tabs--vertical",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} role="tablist" aria-orientation={orientation}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeId}
          className={`loop-tab${tab.id === activeId ? " loop-tab--active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
