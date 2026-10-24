import type { SearchIntent } from "../../../types";
import { INTENT_COLORS, INTENT_LABELS } from "../format";
import "../design-system.css";

interface IntentBadgeProps {
  intent: SearchIntent;
}

/** Shared search-intent badge — used in Search Intent (Analysis) and declared_intent
 * inside the Content Review panel's coverage card. Colours come from INTENT_COLORS,
 * already defined once in the code (format.ts) per LILIAN_TODAY.md's note. */
export function IntentBadge({ intent }: IntentBadgeProps) {
  return (
    <span className="intent-badge" style={{ color: INTENT_COLORS[intent] }}>
      {INTENT_LABELS[intent]}
    </span>
  );
}
