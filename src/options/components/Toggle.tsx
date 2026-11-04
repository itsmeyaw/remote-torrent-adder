import React from "react";

interface ToggleProps {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
}

const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label }) => (
    <label className="flex items-center gap-3 cursor-pointer">
        <span className="relative inline-block w-11 h-6">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="absolute left-0 top-0 m-0 w-11 h-6 opacity-0 cursor-pointer"
            />
            <span
                className={`block w-full h-full rounded-2xl transition-colors duration-200 ${checked ? "bg-rta-success" : "bg-rta-neutral"}`}
            ></span>
            <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-rta-surface shadow-[0_1px_4px_rgba(0,0,0,0.4)] transition-[left] duration-200 ${checked ? "left-5" : "left-1"}`}
            ></span>
        </span>
        <span className="font-medium">{label}</span>
    </label>
);

export default Toggle;
