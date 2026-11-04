import { type JSX } from "react";
import { useSettings } from "../SettingsContext";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import Loading from "../components/Loading";
import { surfaceClass } from "@/components/settings/SettingsSection";
import { type IconClickAction } from "../../models/settings";

const OPTIONS: { value: IconClickAction; label: string; description: string; disabledNote?: string }[] = [
    {
        value: "openPrimaryWebUi",
        label: "Open the primary WebUI",
        description: "Opens your primary WebUI in a new tab.",
    },
    {
        value: "showWebUiPicker",
        label: "Let me choose which WebUI to open",
        description: "Shows a list of your WebUIs to pick from.",
        disabledNote: "Configure at least one more WebUI to enable this option.",
    },
    {
        value: "showPageLinks",
        label: "Show links found on this page",
        description: "Lists the torrent and magnet links on the current page. Clicking one adds it.",
    },
];

export default function IconClickPage(): JSX.Element {
    const { settings, updateSetting, loading } = useSettings();

    if (loading || !settings) return <Loading />;

    const current: IconClickAction = settings.iconClickAction;
    const multipleWebUisConfigured = settings.webuiSettings.length > 1;

    return (
        <div className="flex flex-col gap-3">
            <p className="text-sm text-pretty text-muted-foreground">
                What happens when you click the extension&apos;s icon in the toolbar.
            </p>
            <RadioGroup
                aria-label="Icon click"
                value={current}
                onValueChange={(value) => updateSetting("iconClickAction", value as IconClickAction)}
                className="gap-2"
            >
                {OPTIONS.map((option) => {
                    const disabled = option.value === "showWebUiPicker" && !multipleWebUisConfigured;
                    const selected = current === option.value;
                    return (
                        <label
                            key={option.value}
                            className={cn(
                                "flex items-start gap-3 p-4 transition-[box-shadow] duration-150",
                                surfaceClass,
                                selected ? "ring-2 ring-primary" : "",
                                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                            )}
                        >
                            <RadioGroupItem value={option.value} disabled={disabled} className="mt-0.5" />
                            <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="text-sm font-medium">{option.label}</span>
                                <span className="text-sm text-pretty text-muted-foreground">{option.description}</span>
                                {disabled && option.disabledNote && (
                                    <span className="mt-1 text-xs text-muted-foreground">{option.disabledNote}</span>
                                )}
                            </span>
                        </label>
                    );
                })}
            </RadioGroup>
        </div>
    );
}
