import { useMemo, useRef, useState, type ReactNode } from "react";
import {
    ChevronRightIcon,
    CircleCheckIcon,
    CircleIcon,
    CircleXIcon,
    TriangleAlertIcon,
    UploadIcon,
    type LucideIcon,
} from "lucide-react";
import type { AutoLabelDirSetting } from "../../models/webui";
import type { Torrent } from "../../models/torrent";
import {
    explainAutoLabelDir,
    type AutoLabelDirCriterionEvaluation,
    type AutoLabelDirRuleEvaluation,
} from "../../torrent/auto-label-dir-matcher";
import { buildTorrentFromMagnetLink, parseTorrentFile } from "../../torrent/torrent-source";
import { resolveUploadConfig, type UploadConfigSource } from "../../torrent/upload-config";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsRow } from "@/components/settings/SettingsSection";
import { fieldLabel } from "./auto-label-dir-fields";

interface AutoLabelDirTesterProps {
    settings: AutoLabelDirSetting[];
    defaultLabel: string | null;
    defaultDir: string | null;
    labels: string[];
    dirs: string[];
    showLabel: boolean;
    showDir: boolean;
}

const MAX_TORRENT_BYTES = 10 * 1024 * 1024;

const valueChip = "rounded-md bg-muted px-1.5 py-px font-mono text-xs";

function Verdict({ icon: Icon, tone, children }: { icon: LucideIcon; tone: string; children: ReactNode }) {
    return (
        <span className={cn("inline-flex items-center gap-1.5", tone)}>
            <Icon className="size-4 shrink-0" />
            {children}
        </span>
    );
}

function Outcome({ caption, value, source }: { caption: string; value: string | null; source: string | null }) {
    return (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <span className="w-20 font-medium">{caption}</span>
            {value ? <span className={valueChip}>{value}</span> : <span className="text-muted-foreground">(none)</span>}
            {source && <span className="text-muted-foreground">{source}</span>}
        </div>
    );
}

function CriterionRow({ evaluation }: { evaluation: AutoLabelDirCriterionEvaluation }) {
    const { criterion, matched, matchedCandidates, invalidPattern } = evaluation;

    const verdict = () => {
        if (invalidPattern) {
            return (
                <Verdict icon={TriangleAlertIcon} tone="text-destructive">
                    Invalid regular expression
                </Verdict>
            );
        }
        if (!criterion.value) {
            return (
                <Verdict icon={CircleCheckIcon} tone="text-muted-foreground">
                    Empty pattern, always matches
                </Verdict>
            );
        }
        if (!matched) {
            return (
                <Verdict icon={CircleXIcon} tone="text-muted-foreground">
                    No match
                </Verdict>
            );
        }
        const extra = matchedCandidates.length - 1;
        return (
            <Verdict icon={CircleCheckIcon} tone="text-emerald-600 dark:text-emerald-400">
                {matchedCandidates[0]}
                {extra > 0 ? ` (+${extra} more)` : ""}
            </Verdict>
        );
    };

    return (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span className="w-24 text-muted-foreground">{fieldLabel(criterion.field)}</span>
            <span className={valueChip}>{criterion.value || "(empty)"}</span>
            {verdict()}
        </div>
    );
}

function RuleRow({
    rule,
    winningRuleIndex,
    showLabel,
    showDir,
}: {
    rule: AutoLabelDirRuleEvaluation;
    winningRuleIndex: number | null;
    showLabel: boolean;
    showDir: boolean;
}) {
    const isWinner = rule.index === winningRuleIndex;
    const isShadowed = rule.matched && !isWinner;

    const outcomeParts: string[] = [];
    if (showLabel) outcomeParts.push(`label ${rule.setting.label ? `"${rule.setting.label}"` : "(none)"}`);
    if (showDir) outcomeParts.push(`directory ${rule.setting.dir ? `"${rule.setting.dir}"` : "(none)"}`);

    return (
        <div
            className={cn(
                "flex flex-col gap-2 rounded-xl border p-3 text-sm",
                isWinner ? "border-emerald-600/40 dark:border-emerald-400/40" : "border-border",
            )}
        >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">Rule {rule.index + 1}</span>
                {isWinner && (
                    <Verdict icon={CircleCheckIcon} tone="text-emerald-600 font-medium dark:text-emerald-400">
                        Applied: {outcomeParts.join(", ")}
                    </Verdict>
                )}
                {isShadowed && (
                    <Verdict icon={CircleIcon} tone="text-muted-foreground">
                        Matches, but rule {(winningRuleIndex ?? 0) + 1} wins
                    </Verdict>
                )}
                {!rule.matched && (
                    <Verdict icon={CircleXIcon} tone="text-muted-foreground">
                        Does not match
                    </Verdict>
                )}
            </div>
            {rule.criteria.length === 0 ? (
                <p className="text-muted-foreground">No criteria — a rule without criteria never matches.</p>
            ) : (
                rule.criteria.map((evaluation, idx) => <CriterionRow key={idx} evaluation={evaluation} />)
            )}
        </div>
    );
}

function TorrentContents({ torrent }: { torrent: Torrent }) {
    const [open, setOpen] = useState(false);
    const trackers = torrent.trackers ?? [];
    const files = torrent.files ?? [];

    return (
        <div className="flex flex-col gap-2">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
                className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
                <ChevronRightIcon className={cn("size-4 transition-transform", open && "rotate-90")} />
                Torrent contents ({trackers.length} {trackers.length === 1 ? "tracker" : "trackers"}, {files.length}{" "}
                {files.length === 1 ? "file" : "files"})
            </button>
            {open && (
                <div className="max-h-64 overflow-y-auto rounded-xl bg-muted/50 p-3 text-sm">
                    <div className="mb-1 font-medium">Trackers</div>
                    {trackers.length === 0 ? (
                        <div className="text-muted-foreground">None.</div>
                    ) : (
                        trackers.map((tracker, idx) => (
                            <div key={idx} className="font-mono text-xs break-all">
                                {tracker}
                            </div>
                        ))
                    )}
                    <div className="mt-2.5 mb-1 font-medium">Files</div>
                    {files.length === 0 ? (
                        <div className="text-muted-foreground">None.</div>
                    ) : (
                        files.map((file, idx) => (
                            <div key={idx} className="font-mono text-xs break-all">
                                {file}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

function AutoLabelDirTester({
    settings,
    defaultLabel,
    defaultDir,
    labels,
    dirs,
    showLabel,
    showDir,
}: AutoLabelDirTesterProps) {
    const [torrent, setTorrent] = useState<Torrent | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [magnetLink, setMagnetLink] = useState("");
    const [dragging, setDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const explanation = useMemo(() => (torrent ? explainAutoLabelDir(torrent, settings) : null), [torrent, settings]);

    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        if (file.size > MAX_TORRENT_BYTES) {
            setTorrent(null);
            setError(`That file is too large (max ${Math.round(MAX_TORRENT_BYTES / 1024 / 1024)} MB).`);
            return;
        }
        try {
            setTorrent(await parseTorrentFile(file));
            setError(null);
            setMagnetLink("");
        } catch (e) {
            setTorrent(null);
            setError((e as Error).message);
        }
    };

    const handleMagnet = () => {
        const trimmed = magnetLink.trim();
        if (!trimmed.startsWith("magnet:")) {
            setTorrent(null);
            setError("That doesn't look like a magnet link.");
            return;
        }
        setTorrent(buildTorrentFromMagnetLink(trimmed));
        setError(null);
    };

    const clear = () => {
        setTorrent(null);
        setError(null);
        setMagnetLink("");
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const winningRule = explanation?.winningRuleIndex != null ? explanation.winningRuleIndex + 1 : null;
    const resolved = torrent
        ? resolveUploadConfig(torrent, {
              autoLabelDirSettings: settings,
              defaultLabel,
              defaultDir,
              labels,
              dirs,
              addPaused: false,
          })
        : null;
    const describeSource = (
        source: UploadConfigSource | null | undefined,
        kind: "label" | "directory",
    ): string | null => {
        switch (source) {
            case "rule":
                return `from rule ${winningRule}`;
            case "default":
                return `from the default ${kind}`;
            case "list":
                return `from the ${kind} list`;
            default:
                return null;
        }
    };
    const effectiveLabel = resolved?.config.label ?? null;
    const effectiveDir = resolved?.config.dir ?? null;
    const labelSource = describeSource(resolved?.source.label, "label");
    const dirSource = describeSource(resolved?.source.dir, "directory");
    const hasFileCriteria = settings.some((setting) =>
        setting.criteria.some((criterion) => criterion.field === "filePath"),
    );
    const hasNameCriteria = settings.some((setting) =>
        setting.criteria.some((criterion) => criterion.field === "torrentName"),
    );

    return (
        <>
            <SettingsRow
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    handleFile(e.dataTransfer.files?.[0]);
                }}
                className={cn(
                    "flex-row flex-wrap items-center justify-center gap-2 text-center text-sm transition-colors",
                    dragging ? "bg-muted ring-2 ring-inset ring-primary/30" : "bg-muted/40",
                )}
            >
                <UploadIcon className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">Drop a .torrent file here or</span>
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    Choose file…
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".torrent,application/x-bittorrent"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                    className="hidden"
                />
            </SettingsRow>

            <SettingsRow className="flex-row items-center gap-2">
                <Input
                    aria-label="Magnet link"
                    value={magnetLink}
                    onChange={(e) => setMagnetLink(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") handleMagnet();
                    }}
                    placeholder="…or paste a magnet link"
                    className="min-w-0 flex-1 font-mono"
                />
                <Button variant="outline" size="sm" onClick={handleMagnet}>
                    Test
                </Button>
            </SettingsRow>

            {error && (
                <SettingsRow>
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                </SettingsRow>
            )}

            {torrent && explanation && (
                <SettingsRow className="gap-3">
                    <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 font-medium break-all">{torrent.name}</span>
                        <Button variant="ghost" size="sm" onClick={clear}>
                            Clear
                        </Button>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        {showLabel && <Outcome caption="Label" value={effectiveLabel} source={labelSource} />}
                        {showDir && <Outcome caption="Directory" value={effectiveDir} source={dirSource} />}
                    </div>

                    {torrent.isMagnet && hasFileCriteria && (
                        <p className="text-sm text-muted-foreground">
                            This is a magnet link, so it carries trackers but no file list — file criteria can never
                            match it.
                            {torrent.declaredName ? " Torrent name and tracker criteria still work." : ""}
                        </p>
                    )}

                    {!torrent.declaredName && hasNameCriteria && (
                        <p className="text-sm text-muted-foreground">
                            This torrent declares no name of its own, so torrent name criteria can never match it — “
                            {torrent.name}” is only a stand-in for display.
                        </p>
                    )}

                    <div className="flex flex-col gap-2">
                        {explanation.rules.map((rule) => (
                            <RuleRow
                                key={rule.index}
                                rule={rule}
                                winningRuleIndex={explanation.winningRuleIndex}
                                showLabel={showLabel}
                                showDir={showDir}
                            />
                        ))}
                    </div>

                    <TorrentContents torrent={torrent} />
                </SettingsRow>
            )}
        </>
    );
}

export default AutoLabelDirTester;
