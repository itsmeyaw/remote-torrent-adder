import React, { useState } from "react";
import { chipClass, chipInputClass, monoInputClass, primaryButtonClass } from "../ui-classes";

interface ChipListProps {
    label: string;
    values: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
}

const ChipList: React.FC<ChipListProps> = ({ label, values, onChange, placeholder }) => {
    const [input, setInput] = useState("");
    const handleAdd = () => {
        if (input.trim() && !values.includes(input.trim())) {
            onChange([...values, input.trim()]);
            setInput("");
        }
    };
    const handleRemove = (idx: number) => {
        const arr = [...values];
        arr.splice(idx, 1);
        onChange(arr);
    };
    const handleEdit = (idx: number, newValue: string) => {
        const arr = [...values];
        arr[idx] = newValue;
        onChange(arr);
    };
    return (
        <div className="mb-4">
            <label className="block mb-2 font-medium">{label}</label>
            {values.length > 0 && (
                <div className="flex flex-wrap gap-2 min-h-10">
                    {values.map((v, idx) => (
                        <span key={idx} className={chipClass}>
                            <input
                                type="text"
                                value={v}
                                onChange={(e) => handleEdit(idx, e.target.value)}
                                className={chipInputClass}
                            />
                            <button onClick={() => handleRemove(idx)} className="text-[13px] ml-0.5">
                                🗑
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <div className={`flex items-center gap-2 ${values.length > 0 ? "mt-2" : "mt-0"}`}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={placeholder || "Add new entry"}
                    className={monoInputClass}
                />
                <button onClick={handleAdd} className={primaryButtonClass}>
                    Add
                </button>
            </div>
        </div>
    );
};

export default ChipList;
