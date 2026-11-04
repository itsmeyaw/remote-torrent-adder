import { useId, useState, type ComponentProps } from "react";
import { CircleCheckIcon, CircleXIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { sendMessage } from "../../../util/messaging";
import { Client, ClientDisplayName, WebUIFactory } from "../../../models/clients";
import type { ConnectionTestResult, WebUISettings } from "../../../models/webui";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import SettingsSection, { SettingsRow } from "@/components/settings/SettingsSection";
import SwitchRow from "@/components/settings/SwitchRow";
import ChipList from "../ChipList";
import ClientSpecificSettingsEditor from "../ClientSpecificSettingsEditor";
import AutoLabelDirSettingsEditor from "../AutoLabelDirSettingsEditor";
import { MAX_PORT, MIN_PORT, isClientSelected, parsePortInput } from "./webui-helpers";

const clientItems = Object.values(Client).map((c) => ({ value: c, label: ClientDisplayName[c] }));

interface WebUIDetailProps {
    webui: WebUISettings;
    onChange: (w: WebUISettings) => void;
    onRemove: () => void;
    onPromote: () => void;
    isPrimary: boolean;
}

interface TestConnectionState {
    signature: string;
    testing: boolean;
    result: ConnectionTestResult | null;
}

export default function WebUIDetail({ webui, onChange, onRemove, onPromote, isPrimary }: WebUIDetailProps) {
    const [confirmingRemove, setConfirmingRemove] = useState(false);
    const clientId = useId();
    const clientChosen = isClientSelected(webui.client);
    const webUiInstance = clientChosen ? WebUIFactory.createWebUI(webui) : null;
    const labelDirSectionTitle =
        webUiInstance?.isLabelSupported && webUiInstance?.isDirSupported
            ? "Labels & Directories"
            : webUiInstance?.isLabelSupported
              ? "Labels"
              : "Directories";
    const name = webui.name || "Unnamed WebUI";

    // A result only describes the endpoint + credentials it was produced for, so
    // it is stored together with a signature of those fields. Anything that would
    // change the request makes the stored result stale, which is derived during
    // render rather than cleared from an effect.
    const endpointSignature = JSON.stringify([
        webui.id,
        webui.client,
        webui.host,
        webui.port,
        webui.secure,
        webui.relativePath,
        webui.username,
        webui.password,
    ]);
    const [testState, setTestState] = useState<TestConnectionState>({
        signature: endpointSignature,
        testing: false,
        result: null,
    });
    const isCurrent = testState.signature === endpointSignature;
    const testing = isCurrent && testState.testing;
    const testResult = isCurrent ? testState.result : null;

    const handleTest = async () => {
        setTestState({ signature: endpointSignature, testing: true, result: null });
        try {
            const result = await sendMessage("testConnection", { webUiSettings: webui });
            setTestState({ signature: endpointSignature, testing: false, result });
        } catch (error) {
            setTestState({
                signature: endpointSignature,
                testing: false,
                result: {
                    reachable: false,
                    authenticated: null,
                    httpResponseCode: 0,
                    message: error instanceof Error ? error.message : String(error),
                },
            });
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-col">
                    <input
                        aria-label="Name"
                        value={webui.name}
                        autoFocus={!webui.name}
                        placeholder="Unnamed WebUI"
                        onChange={(e) => onChange({ ...webui, name: e.target.value })}
                        className="-mx-2 h-9 min-w-0 rounded-xl bg-transparent px-2 text-lg font-semibold tracking-tight outline-none placeholder:text-muted-foreground hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    />
                    <p className="truncate text-sm text-muted-foreground">
                        {clientChosen
                            ? [ClientDisplayName[webui.client as Client], webui.host].filter(Boolean).join(" · ")
                            : "No client selected"}
                    </p>
                </div>
                {!isPrimary && (
                    <Button variant="outline" size="sm" onClick={onPromote}>
                        Make primary
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingRemove(true)}
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                    <Trash2Icon data-icon="inline-start" />
                    Remove
                </Button>
            </div>

            <AlertDialog open={confirmingRemove} onOpenChange={setConfirmingRemove}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{`Remove ${name}?`}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {"Its connection, labels and Auto Label/Dir rules are deleted. This can't be undone."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={() => {
                                setConfirmingRemove(false);
                                onRemove();
                            }}
                        >
                            Remove WebUI
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <SettingsSection title="Connection">
                <SettingsRow className="gap-1.5">
                    {clientChosen ? (
                        // Locked once chosen: a WebUI's settings only make sense for the client they were made for.
                        <>
                            <span className="text-sm font-medium">Client</span>
                            <p className="text-sm">
                                {ClientDisplayName[webui.client as Client]}
                                <span className="text-muted-foreground"> · can't be changed once chosen</span>
                            </p>
                        </>
                    ) : (
                        <>
                            <Label htmlFor={clientId}>Client</Label>
                            <Select
                                items={clientItems}
                                value={null}
                                onValueChange={(value) => {
                                    if (value) onChange({ ...webui, client: value as Client });
                                }}
                            >
                                <SelectTrigger id={clientId} className="w-full">
                                    <SelectValue placeholder="Select a client…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {clientItems.map((item) => (
                                        <SelectItem key={item.value} value={item.value}>
                                            {item.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </>
                    )}
                </SettingsRow>

                {!webUiInstance ? (
                    <SettingsRow>
                        <p className="text-sm text-muted-foreground">Choose a client to configure this WebUI.</p>
                    </SettingsRow>
                ) : (
                    <>
                        <SettingsRow>
                            <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
                                <TextField
                                    label="Host"
                                    value={webui.host}
                                    onChange={(e) => onChange({ ...webui, host: e.target.value })}
                                />
                                <TextField
                                    label="Port"
                                    type="number"
                                    inputMode="numeric"
                                    min={MIN_PORT}
                                    max={MAX_PORT}
                                    placeholder={webui.secure ? "443" : "80"}
                                    value={webui.port ?? ""}
                                    onChange={(e) => onChange({ ...webui, port: parsePortInput(e.target.value) })}
                                />
                            </div>
                        </SettingsRow>
                        <SwitchRow
                            label="Use HTTPS"
                            checked={webui.secure}
                            onChange={(v) => onChange({ ...webui, secure: v })}
                        />
                        <SettingsRow>
                            <TextField
                                label="Relative path"
                                placeholder="/"
                                value={webui.relativePath || ""}
                                onChange={(e) => onChange({ ...webui, relativePath: e.target.value })}
                            />
                            <p className="text-sm text-muted-foreground">
                                Requests go to <span className="font-mono">{webUiInstance.createBaseUrl()}</span>
                            </p>
                        </SettingsRow>
                        <SettingsRow>
                            <div className="grid grid-cols-2 gap-3">
                                <TextField
                                    label="Username"
                                    value={webui.username}
                                    onChange={(e) => onChange({ ...webui, username: e.target.value })}
                                />
                                <TextField
                                    label="Password"
                                    type="password"
                                    value={webui.password}
                                    onChange={(e) => onChange({ ...webui, password: e.target.value })}
                                />
                            </div>
                        </SettingsRow>
                        {webUiInstance.isConnectionTestSupported && (
                            <SettingsRow className="flex-row flex-wrap items-center gap-3">
                                <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
                                    {testing && <Spinner role="presentation" />}
                                    {testing ? "Testing…" : "Test connection"}
                                </Button>
                                <p role="status" className="flex min-w-0 items-center gap-1.5 text-sm">
                                    {testResult && <ConnectionResult result={testResult} />}
                                </p>
                            </SettingsRow>
                        )}
                    </>
                )}
            </SettingsSection>

            {webUiInstance && (webUiInstance.isAddPausedSupported || webUiInstance.isLabelDirChooserSupported) && (
                <SettingsSection title="Adding torrents">
                    {webUiInstance.isAddPausedSupported && (
                        <SwitchRow
                            label="Add torrents paused"
                            checked={webui.addPaused}
                            onChange={(v) => onChange({ ...webui, addPaused: v })}
                        />
                    )}
                    {webUiInstance.isLabelDirChooserSupported && (
                        <>
                            <SwitchRow
                                label="Show per-torrent config selector"
                                description="Ask for a label and directory every time you add a torrent."
                                checked={webui.showPerTorrentConfigSelector}
                                onChange={(v) => onChange({ ...webui, showPerTorrentConfigSelector: v })}
                            />
                            <SwitchRow
                                label="Use alternative container (window instead of popup)"
                                checked={webui.useAlternativeLabelDirChooser}
                                onChange={(v) => onChange({ ...webui, useAlternativeLabelDirChooser: v })}
                            />
                        </>
                    )}
                </SettingsSection>
            )}

            {webUiInstance && webUiInstance.clientSpecificSettingDescriptors.length > 0 && (
                <ClientSpecificSettingsEditor
                    descriptors={webUiInstance.clientSpecificSettingDescriptors}
                    value={webui.clientSpecificSettings}
                    onChange={(clientSpecificSettings) => onChange({ ...webui, clientSpecificSettings })}
                />
            )}

            {webUiInstance && (webUiInstance.isLabelSupported || webUiInstance.isDirSupported) && (
                <SettingsSection title={labelDirSectionTitle}>
                    {webUiInstance.isLabelSupported && (
                        <SettingsRow>
                            <TextField
                                label="Default Label"
                                placeholder="Default label"
                                value={webui.defaultLabel ?? ""}
                                onChange={(e) => onChange({ ...webui, defaultLabel: e.target.value })}
                            />
                            <ChipList
                                label="Labels for per-torrent selection"
                                itemName="label"
                                values={webui.labels}
                                onChange={(labels) => onChange({ ...webui, labels })}
                                placeholder="Add label"
                            />
                        </SettingsRow>
                    )}
                    {webUiInstance.isDirSupported && (
                        <SettingsRow>
                            <TextField
                                label="Default Directory"
                                placeholder="Default directory"
                                value={webui.defaultDir ?? ""}
                                onChange={(e) => onChange({ ...webui, defaultDir: e.target.value })}
                            />
                            <ChipList
                                label="Directories for per-torrent selection"
                                itemName="directory"
                                values={webui.dirs}
                                onChange={(dirs) => onChange({ ...webui, dirs })}
                                placeholder="Add directory"
                            />
                        </SettingsRow>
                    )}
                </SettingsSection>
            )}

            {webUiInstance?.isLabelDirChooserSupported && (
                <AutoLabelDirSettingsEditor
                    value={webui.autoLabelDirSettings}
                    onChange={(autoLabelDirSettings) => onChange({ ...webui, autoLabelDirSettings })}
                    showLabel={!!webUiInstance.isLabelSupported}
                    showDir={!!webUiInstance.isDirSupported}
                    labels={webui.labels}
                    dirs={webui.dirs}
                    defaultLabel={webui.defaultLabel}
                    defaultDir={webui.defaultDir}
                />
            )}
        </div>
    );
}

function TextField({ label, ...inputProps }: ComponentProps<typeof Input> & { label: string }) {
    const id = useId();
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Input id={id} {...inputProps} />
        </div>
    );
}

function ConnectionResult({ result }: { result: ConnectionTestResult }) {
    const { icon: Icon, tone } = !result.reachable
        ? { icon: CircleXIcon, tone: "text-destructive" }
        : result.authenticated !== true
          ? { icon: TriangleAlertIcon, tone: "text-amber-600 dark:text-amber-400" }
          : { icon: CircleCheckIcon, tone: "text-emerald-600 dark:text-emerald-400" };
    return (
        <>
            <Icon className={cn("size-4 shrink-0", tone)} />
            {result.message}
        </>
    );
}
