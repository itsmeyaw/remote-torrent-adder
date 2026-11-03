import React from "react";

interface SelectProps {
  label: string;
  value: string;
  changeable?: boolean;
  options: { value: string; label: string }[];
  onChange?: (value: string) => void;
}

const Select: React.FC<SelectProps> = ({ label, value, changeable, options, onChange }) => (
  <div>
    <label className="block mb-1 font-medium">{label}</label>
    <select
      value={value}
      onChange={onChange ? e => onChange(e.target.value) : undefined}
      className="text-[15px] rounded-[8px] py-1.5 px-3 border border-rta-border bg-rta-input-bg text-rta-text min-w-[180px]"
      disabled={changeable === false}
    >
      <option value="" disabled>Select...</option>
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

export default Select;
