import { useState } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChipListProps {
    label: string;
    /** What each chip is, for its remove button's name: "Remove label tv". */
    itemName: "label" | "directory";
    values: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
}

export default function ChipList({ label, itemName, values, onChange, placeholder }: ChipListProps) {
    const [input, setInput] = useState("");
    const addLabel = placeholder ?? "Add new entry";

    const handleAdd = () => {
        const next = input.trim();
        if (next && !values.includes(next)) {
            onChange([...values, next]);
            setInput("");
        }
    };
    const handleRemove = (idx: number) => onChange(values.filter((_, i) => i !== idx));
    const handleEdit = (idx: number, newValue: string) => onChange(values.map((v, i) => (i === idx ? newValue : v)));

    return (
        <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{label}</span>
            {values.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {values.map((value, idx) => (
                        <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-3"
                        >
                            <input
                                type="text"
                                aria-label={label}
                                value={value}
                                onChange={(e) => handleEdit(idx, e.target.value)}
                                // `size` sizes the field where field-sizing is unsupported (Firefox).
                                size={Math.max(value.length, 1)}
                                className="field-sizing-content bg-transparent text-sm outline-none"
                            />
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Remove ${itemName} ${value}`}
                                onClick={() => handleRemove(idx)}
                            >
                                <XIcon />
                            </Button>
                        </span>
                    ))}
                </div>
            )}
            <div className="flex items-center gap-2">
                <Input
                    type="text"
                    aria-label={addLabel}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            handleAdd();
                        }
                    }}
                    placeholder={addLabel}
                />
                <Button variant="outline" size="sm" onClick={handleAdd}>
                    Add
                </Button>
            </div>
        </div>
    );
}
