import React, { useState } from "react";

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
            <span key={idx} className="inline-flex items-center bg-rta-chip-bg border border-rta-chip-border rounded-[16px] py-1 px-3 font-[monospace] text-[15px]">
              <input
                type="text"
                value={v}
                onChange={e => handleEdit(idx, e.target.value)}
                className="font-[monospace] text-[15px] border-none outline-none bg-rta-input-bg text-rta-text rounded-[8px] py-0.5 px-2 mr-1"
              />
              <button onClick={() => handleRemove(idx)} className="text-[13px] ml-0.5">🗑</button>
            </span>
          ))}
        </div>
      )}
      <div className={`flex items-center gap-2 ${values.length > 0 ? "mt-2" : "mt-0"}`}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={placeholder || "Add new entry"}
          className="font-[monospace] text-[15px] border border-rta-border bg-rta-input-bg text-rta-text rounded-[8px] py-1 px-2.5"
        />
        <button onClick={handleAdd} className="bg-rta-accent text-rta-green-dark border-none rounded-[8px] py-1 px-3 font-medium cursor-pointer">Add</button>
      </div>
    </div>
  );
};

export default ChipList;
