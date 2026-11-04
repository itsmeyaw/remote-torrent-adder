import { sendMessage } from "../../util/messaging";
import { useEffect, useId, useRef, useState } from "react";
import { PlayIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import { useSettings } from "../SettingsContext";
import { deleteCustomSound, getCustomSound, saveCustomSound, type SoundKind } from "../../notifications/sound-storage";
import SettingsSection, { SettingsRow } from "@/components/settings/SettingsSection";
import SwitchRow from "@/components/settings/SwitchRow";
import Loading from "../components/Loading";
import { isFirefox } from "../../util/platform";

// Custom sounds are kept small; they live in IndexedDB but are still loaded
// into memory to play, so cap the size to keep things snappy.
const MAX_SOUND_BYTES = 1024 * 1024; // 1 MB

export default function NotificationsPage() {
    const { settings, updateSetting, loading } = useSettings();
    const durationId = useId();

    if (loading || !settings) return <Loading />;

    const sendTest = (isFailed: boolean) => {
        sendMessage("testNotification", { isFailed }).catch((error) =>
            console.error("Could not send the test notification", error),
        );
    };

    return (
        <div className="flex flex-col gap-8">
            <SettingsSection label="Notifications">
                <SwitchRow
                    label="Show notifications"
                    description="Tell me when a torrent was added, or why it could not be."
                    checked={settings.notificationsEnabled}
                    onChange={(v) => updateSetting("notificationsEnabled", v)}
                />
                <SwitchRow
                    label="Play a sound"
                    checked={settings.notificationsSoundEnabled}
                    onChange={(v) => updateSetting("notificationsSoundEnabled", v)}
                />
                {!isFirefox() && (
                    <SwitchRow
                        label='Offer an "Add label" button after adding'
                        description="Label a torrent right from its notification."
                        checked={settings.notificationsLabelButtonEnabled}
                        onChange={(v) => updateSetting("notificationsLabelButtonEnabled", v)}
                    />
                )}
                <SettingsRow className="flex-row items-center justify-between gap-6">
                    <label htmlFor={durationId} className="text-sm font-medium">
                        Display duration
                    </label>
                    <NumberField
                        id={durationId}
                        unit="s"
                        decrementLabel="Decrease display duration"
                        incrementLabel="Increase display duration"
                        min={0}
                        step={0.5}
                        format={{ maximumFractionDigits: 1 }}
                        value={settings.notificationsDurationMs / 1000}
                        onValueChange={(seconds) =>
                            updateSetting("notificationsDurationMs", Math.round((seconds ?? 0) * 1000))
                        }
                    />
                </SettingsRow>
                <SettingsRow className="flex-row flex-wrap items-center justify-between gap-3">
                    <span className="text-sm font-medium">Send a test notification</span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => sendTest(false)}>
                            Test success
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => sendTest(true)}>
                            Test failure
                        </Button>
                    </div>
                </SettingsRow>
            </SettingsSection>

            {settings.notificationsSoundEnabled && (
                <SettingsSection
                    title="Custom sounds"
                    description="Use your own audio files. A slot without one plays the built-in sound."
                >
                    <SoundPicker kind="success" label="Success sound" />
                    <SoundPicker kind="failure" label="Failure sound" />
                </SettingsSection>
            )}
        </div>
    );
}

function SoundPicker({ kind, label }: { kind: SoundKind; label: string }) {
    const [fileName, setFileName] = useState<string | null>(null);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let active = true;
        getCustomSound(kind)
            .then((stored) => {
                if (active) setFileName(stored?.name ?? null);
            })
            .catch(() => {
                if (active) setFileName(null);
            })
            .finally(() => {
                if (active) setBusy(false);
            });
        return () => {
            active = false;
        };
    }, [kind]);

    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        if (file.size > MAX_SOUND_BYTES) {
            setError(`That sound file is too large (max ${Math.round(MAX_SOUND_BYTES / 1024)} KB).`);
            return;
        }
        setBusy(true);
        try {
            await saveCustomSound(kind, file, file.name);
            setFileName(file.name);
            setError(null);
        } catch (e) {
            console.error(e);
            setError("Could not save that sound file.");
        } finally {
            setBusy(false);
        }
    };

    const reset = async () => {
        setBusy(true);
        try {
            await deleteCustomSound(kind);
            setFileName(null);
            setError(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
        } finally {
            setBusy(false);
        }
    };

    const preview = async () => {
        let src = `../assets/sounds/${kind}.ogg`;
        let objectUrl: string | undefined;
        try {
            const stored = await getCustomSound(kind);
            if (stored) {
                objectUrl = URL.createObjectURL(stored.blob);
                src = objectUrl;
            }
            const audio = new Audio(src);
            if (objectUrl) audio.addEventListener("ended", () => URL.revokeObjectURL(objectUrl!));
            await audio.play();
        } catch (e) {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            console.error(e);
        }
    };

    return (
        <SettingsRow className="gap-2">
            <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="truncate text-sm text-muted-foreground" title={fileName ?? "Built-in sound"}>
                        {busy ? "…" : (fileName ?? "Built-in sound")}
                    </span>
                </div>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={preview}
                    disabled={busy}
                    aria-label={`Preview ${label.toLowerCase()}`}
                >
                    <PlayIcon />
                </Button>
                {fileName && (
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={reset}
                        disabled={busy}
                        aria-label={`Reset ${label.toLowerCase()} to the built-in sound`}
                    >
                        <RotateCcwIcon />
                    </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                    Choose…
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                    className="hidden"
                />
            </div>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
        </SettingsRow>
    );
}
