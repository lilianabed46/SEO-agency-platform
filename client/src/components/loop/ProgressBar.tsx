import "./ProgressBar.css";

interface ProgressBarProps {
  label?: string;
}

/**
 * Indeterminate progress indicator — we never know how far along a PageSpeed run,
 * a diagnosis, or a pre-publish review actually is, only that it's in flight. Plain
 * CSS animation, no charting/progress library.
 */
export function ProgressBar({ label }: ProgressBarProps) {
  return (
    <div>
      {label && <span style={{ color: "#666", fontSize: 12 }}>{label}</span>}
      <div className="progress-bar-track" role="progressbar" aria-label={label}>
        <div className="progress-bar-fill" />
      </div>
    </div>
  );
}
