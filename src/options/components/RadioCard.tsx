import React from "react";

interface RadioCardProps {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  label: string;
  description: string;
  note?: string;
  onChange: (value: string) => void;
}

const RadioCard: React.FC<RadioCardProps> = ({ name, value, checked, disabled, label, description, note, onChange }) => (
  <label
    className={[
      "flex gap-3 items-start py-3 px-4 rounded-[10px] border transition-[border-color,background,box-shadow] duration-150",
      checked
        ? "border-rta-accent bg-rta-chip-bg shadow-[0_1px_4px_rgba(110,139,116,0.15)]"
        : "border-rta-border bg-rta-surface",
      disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
    ].join(" ")}
  >
    <input
      type="radio"
      name={name}
      value={value}
      checked={checked}
      disabled={disabled}
      onChange={() => onChange(value)}
      className="mt-0.75 accent-rta-green-dark"
    />
    <span>
      <span className="font-semibold block text-rta-text">{label}</span>
      <span className="text-rta-text-muted text-[13px] block mt-0.5 max-w-[440px]">
        {description}
      </span>
      {note && (
        <span className="text-rta-text-muted text-[12px] italic block mt-1">
          {note}
        </span>
      )}
    </span>
  </label>
);

export default RadioCard;
