import { useId, type ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { SettingsRow } from "./SettingsSection";

interface SwitchRowProps {
    label: string;
    description?: ReactNode;
    checked: boolean;
    disabled?: boolean;
    onChange: (checked: boolean) => void;
}

/** One on/off setting: its name and explanation on the left, the switch on the right. */
export default function SwitchRow({ label, description, checked, disabled, onChange }: SwitchRowProps) {
    const id = useId();
    const descriptionId = useId();
    return (
        <SettingsRow className="flex-row items-center justify-between gap-6">
            <div className={cn("flex min-w-0 flex-col gap-0.5", disabled && "opacity-50")}>
                <label htmlFor={id} className="text-sm font-medium">
                    {label}
                </label>
                {description && (
                    <p id={descriptionId} className="text-sm text-pretty text-muted-foreground">
                        {description}
                    </p>
                )}
            </div>
            <Switch
                id={id}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(next) => onChange(next)}
                aria-describedby={description ? descriptionId : undefined}
            />
        </SettingsRow>
    );
}
