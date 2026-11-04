import { useId, useState } from "react";
import { PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import type { AutoLabelDirSetting, AutoLabelDirCriterion } from "../../models/webui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AutoLabelDirTester from "./AutoLabelDirTester";
import SettingsSection, { SettingsRow } from "@/components/settings/SettingsSection";
import { CRITERIA_FIELDS, fieldLabel, type CriterionField } from "./auto-label-dir-fields";

interface AutoLabelDirSettingsEditorProps {
    value: AutoLabelDirSetting[];
    onChange: (settings: AutoLabelDirSetting[]) => void;
    showLabel: boolean;
    showDir: boolean;
    labels: string[];
    dirs: string[];
    defaultLabel: string | null;
    defaultDir: string | null;
}

const fieldItems = CRITERIA_FIELDS.map((f) => ({ value: f.value, label: f.label }));

function CriterionAdder({
    startOpen,
    onAdd,
}: {
    startOpen: boolean;
    onAdd: (criterion: AutoLabelDirCriterion) => void;
}) {
    const [open, setOpen] = useState(startOpen);
    const [field, setField] = useState<CriterionField>("trackerUrl");
    const [value, setValue] = useState("");
    const placeholder = CRITERIA_FIELDS.find((f) => f.value === field)?.placeholder;

    const handleAdd = () => {
        if (!value.trim()) return;
        onAdd({ field, value: value.trim() });
        setValue("");
        setOpen(false);
    };

    // A rule that already has criteria keeps the adder folded away, so it stays as short as what it says.
    if (!open) {
        return (
            <Button variant="ghost" size="xs" className="-ml-2 self-start" onClick={() => setOpen(true)}>
                <PlusIcon data-icon="inline-start" />
                Add criterion
            </Button>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <Select items={fieldItems} value={field} onValueChange={(next) => setField(next as CriterionField)}>
                <SelectTrigger aria-label="Criterion field" className="w-36 shrink-0">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {fieldItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                            {item.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Input
                aria-label="Criterion value"
                autoFocus={!startOpen}
                value={value}
                placeholder={placeholder}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        handleAdd();
                    }
                }}
                className="min-w-0 flex-1 font-mono"
            />
            <Button variant="outline" size="sm" onClick={handleAdd}>
                Add
            </Button>
        </div>
    );
}

function ChoiceSelect({
    label,
    value,
    choices,
    onChange,
}: {
    label: string;
    value: string | null;
    choices: string[];
    onChange: (value: string | null) => void;
}) {
    const id = useId();
    // A stored value that is no longer in the list must stay visible, or it would silently read as "(none)".
    const options = [...new Set(value && !choices.includes(value) ? [value, ...choices] : choices)].filter(Boolean);
    const items = [{ value: "", label: "(none)" }, ...options.map((o) => ({ value: o, label: o }))];

    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Select items={items} value={value ?? ""} onValueChange={(next) => onChange(next ? next : null)}>
                <SelectTrigger id={id} className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {items.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                            {item.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

export default function AutoLabelDirSettingsEditor({
    value,
    onChange,
    showLabel,
    showDir,
    labels,
    dirs,
    defaultLabel,
    defaultDir,
}: AutoLabelDirSettingsEditorProps) {
    // Rules have no id of their own; these keep each row (and its unsent criterion draft) with its rule.
    const [keys, setKeys] = useState<string[]>(() => value.map(() => crypto.randomUUID()));
    // Rules added elsewhere (another tab) have no tracked key yet; they get a positional one.
    const rowKeys = value.map((_, i) => keys[i] ?? `untracked-${i}`);

    const handleAdd = () => {
        setKeys([...rowKeys, crypto.randomUUID()]);
        onChange([...value, { criteria: [], label: showLabel ? "" : null, dir: showDir ? "" : null }]);
    };
    const handleRemove = (idx: number) => {
        setKeys(rowKeys.filter((_, i) => i !== idx));
        onChange(value.filter((_, i) => i !== idx));
    };
    const updateAt = (idx: number, patch: Partial<AutoLabelDirSetting>) =>
        onChange(value.map((setting, i) => (i === idx ? { ...setting, ...patch } : setting)));

    return (
        <>
            <SettingsSection
                title="Auto Label/Dir Settings"
                description="The first rule whose criteria all match sets the label and directory."
                actions={
                    <Button variant="outline" size="sm" onClick={handleAdd}>
                        <PlusIcon data-icon="inline-start" />
                        Add Rule
                    </Button>
                }
            >
                {value.length === 0 && (
                    <SettingsRow>
                        <p className="text-sm text-muted-foreground">No rules defined yet.</p>
                    </SettingsRow>
                )}
                {value.map((setting, idx) => (
                    <SettingsRow key={rowKeys[idx]}>
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium">Rule {idx + 1}</span>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Remove rule ${idx + 1}`}
                                onClick={() => handleRemove(idx)}
                            >
                                <Trash2Icon />
                            </Button>
                        </div>
                        <div className="flex flex-col gap-2">
                            {setting.criteria.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {setting.criteria.map((criterion, cIdx) => (
                                        <span
                                            key={cIdx}
                                            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted pr-1 pl-3 text-sm"
                                        >
                                            <span className="text-muted-foreground">
                                                {fieldLabel(criterion.field)}:
                                            </span>
                                            <span className="font-mono">{criterion.value}</span>
                                            <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                aria-label={`Remove criterion ${fieldLabel(criterion.field)} ${criterion.value}`}
                                                onClick={() =>
                                                    updateAt(idx, {
                                                        criteria: setting.criteria.filter((_, i) => i !== cIdx),
                                                    })
                                                }
                                            >
                                                <XIcon />
                                            </Button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <CriterionAdder
                                startOpen={setting.criteria.length === 0}
                                onAdd={(criterion) => updateAt(idx, { criteria: [...setting.criteria, criterion] })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {showLabel && (
                                <ChoiceSelect
                                    label="Label"
                                    value={setting.label}
                                    choices={labels}
                                    onChange={(label) => updateAt(idx, { label })}
                                />
                            )}
                            {showDir && (
                                <ChoiceSelect
                                    label="Directory"
                                    value={setting.dir}
                                    choices={dirs}
                                    onChange={(dir) => updateAt(idx, { dir })}
                                />
                            )}
                        </div>
                    </SettingsRow>
                ))}
            </SettingsSection>
            {value.length > 0 && (
                <SettingsSection
                    title="Test these rules"
                    description="Drop a .torrent file or paste a magnet link to see which rule matches. Nothing is added to your client."
                >
                    <AutoLabelDirTester
                        settings={value}
                        defaultLabel={defaultLabel}
                        defaultDir={defaultDir}
                        labels={labels}
                        dirs={dirs}
                        showLabel={showLabel}
                        showDir={showDir}
                    />
                </SettingsSection>
            )}
        </>
    );
}
