import { useEffect, useRef, useState, type JSX } from "react";
import { CheckIcon, CopyIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSettings } from "../SettingsContext";
import SettingsSection, { SettingsRow } from "@/components/settings/SettingsSection";
import Loading from "../components/Loading";
import { serializeSettings } from "../../settings/serializer";
import { parseSettings } from "../../settings/settings-validation";

export default function ImportExportPage(): JSX.Element {
    const { settings, setSettings, loading } = useSettings();
    const [importValue, setImportValue] = useState<string>("");
    const [importErrors, setImportErrors] = useState<string[]>([]);
    const [copied, setCopied] = useState<boolean>(false);
    const [copyError, setCopyError] = useState<string>("");
    const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => () => clearTimeout(copiedTimer.current), []);

    if (loading || !settings) return <Loading />;

    const handleCopy = async (): Promise<void> => {
        setCopyError("");
        try {
            await navigator.clipboard.writeText(serializeSettings(settings));
        } catch {
            setCopyError("Could not copy to the clipboard. Select the text above and copy it by hand.");
            return;
        }
        setCopied(true);
        clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    };

    const handleImport = (): void => {
        const result = parseSettings(importValue);
        if (!result.ok) {
            setImportErrors(result.problems);
            return;
        }
        setImportErrors([]);
        setSettings(result.settings);
        setImportValue("");
    };

    return (
        <div className="flex flex-col gap-8">
            <SettingsSection
                title="Export"
                description={
                    <span id="rta-export-warning" role="note" className="flex gap-2">
                        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        This export contains your WebUI passwords in plain text. Anyone who gets this text can log in to
                        your clients, so only store it somewhere you trust.
                    </span>
                }
            >
                <SettingsRow>
                    <Textarea
                        id="rta-export"
                        aria-label="Exported settings"
                        readOnly
                        value={serializeSettings(settings)}
                        aria-describedby="rta-export-warning"
                        className="h-40 font-mono text-xs"
                    />
                    <div className="flex flex-col items-start gap-2">
                        <Button variant="outline" size="sm" onClick={handleCopy}>
                            {copied ? <CheckIcon /> : <CopyIcon />}
                            {copied ? "Copied!" : "Copy to clipboard"}
                        </Button>
                        {copyError && (
                            <p role="alert" className="text-sm text-destructive">
                                {copyError}
                            </p>
                        )}
                    </div>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Import">
                <SettingsRow>
                    <Textarea
                        id="rta-import"
                        aria-label="Settings to import"
                        value={importValue}
                        onChange={(e) => setImportValue(e.target.value)}
                        placeholder="Paste a previous export here…"
                        aria-describedby={importErrors.length > 0 ? "rta-import-error" : undefined}
                        aria-invalid={importErrors.length > 0 ? true : undefined}
                        className="h-40 font-mono text-xs"
                    />
                    <div className="flex flex-col items-start gap-2">
                        <Button onClick={handleImport}>Import settings</Button>
                        {importErrors.length > 0 && (
                            <div
                                id="rta-import-error"
                                role="alert"
                                className="flex flex-col gap-1 text-sm text-destructive"
                            >
                                {importErrors.map((problem) => (
                                    <p key={problem}>{problem}</p>
                                ))}
                            </div>
                        )}
                    </div>
                </SettingsRow>
            </SettingsSection>
        </div>
    );
}
