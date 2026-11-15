import { STYLES } from "../config";
/** Style preview swatches. These are product previews, not purchased candles. */
export function StylePicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <fieldset className="styles">
      <legend>Style <span className="muted">· {STYLES[value].name} ({STYLES[value].color}) · preview</span></legend>
      <div className="swatches">
        {STYLES.map((s, i) => (
          <label key={s.name} className="swatch" title={s.name}>
            <input type="radio" name="style" value={i} checked={value === i} onChange={() => onChange(i)} aria-label={`${s.name}, ${s.color}`} />
            <svg viewBox="0 0 24 34" width="22" height="31" aria-hidden="true">
              <ellipse cx="12" cy="7" rx="4" ry="7" fill={s.flame} />
              <rect x="5" y="14" width="14" height="19" rx="3" fill={s.wax} />
            </svg>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
