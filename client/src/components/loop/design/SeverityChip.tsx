import { severityColor, MUTED } from "../format";
import "../design-system.css";

interface SeverityChipProps {
  /** 1-5, same scale used by audit issues and diagnoses. */
  severity: number;
}

/** Shared severity chip for audit issues and diagnoses (1-5: 5 = crimson, 4 = amber, else muted). */
export function SeverityChip({ severity }: SeverityChipProps) {
  return (
    <span className="severity-chip" style={{ color: severityColor(severity) ?? MUTED }}>
      {severity}
    </span>
  );
}
