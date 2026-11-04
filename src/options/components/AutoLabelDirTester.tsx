import { useMemo, useRef, useState } from "react";
import type { AutoLabelDirSetting } from "../../models/webui";
import type { Torrent } from "../../models/torrent";
import {
    explainAutoLabelDir,
    type AutoLabelDirCriterionEvaluation,
    type AutoLabelDirRuleEvaluation,
} from "../../torrent/auto-label-dir-matcher";
import { buildTorrentFromMagnetLink, parseTorrentFile } from "../../torrent/torrent-source";
import { resolveUploadConfig, type UploadConfigSource } from "../../torrent/upload-config";
import { fieldLabel } from "./auto-label-dir-fields";
import { primaryButtonClass } from "../ui-classes";

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

const monospace = "font-[monospace] bg-rta-chip-bg border border-rta-chip-border rounded-md py-px px-1.5";

function Outcome({ caption, value, source }: { caption: string; value: string | null; source: string | null }) {
    return (
        <div className="flex items-baseline gap-2">
            <span className="font-medium min-w-[74px]">{caption}</span>
            <span className={value ? `${monospace} text-[15px]` : "text-rta-text-muted"}>{value || "(none)"}</span>
            {source && <span className="text-rta-text-muted text-[13px]">{source}</span>}
        </div>
    );
}

function CriterionRow({ evaluation }: { evaluation: AutoLabelDirCriterionEvaluation }) {
    const { criterion, matched, matchedCandidates, invalidPattern } = evaluation;

    const verdict = () => {
        if (invalidPattern) {
            return <span className="text-rta-danger">❌ invalid regular expression</span>;
        }
        if (!criterion.value) {
            return <span className="text-rta-text-muted">✅ empty pattern, always matches</span>;
        }
        if (!matched) {
            return <span className="text-rta-danger">❌ no match</span>;
        }
        const extra = matchedCandidates.length - 1;
        return (
            <span className="text-rta-success">
                ✅ {matchedCandidates[0]}
                {extra > 0 ? ` (+${extra} more)` : ""}
            </span>
        );
    };

    return (
        <div className="flex gap-2 items-baseline flex-wrap text-[14px] mt-1">
            <span className="text-rta-text-muted min-w-[96px]">{fieldLabel(criterion.field)}</span>
            <span className={monospace}>{criterion.value || "(empty)"}</span>
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
    if (showDir) outcomeParts.push(`dir ${rule.setting.dir ? `"${rule.setting.dir}"` : "(none)"}`);

    return (
        <div
            className={`py-2 px-2.5 mt-2 rounded-lg bg-rta-surface border ${isWinner ? "border-rta-success" : "border-rta-border"}`}
        >
            <div className="flex gap-2 items-baseline flex-wrap">
                <span className="font-semibold">Rule {rule.index + 1}</span>
                {isWinner && (
                    <span className="text-rta-success font-medium">✅ applied → {outcomeParts.join(", ")}</span>
                )}
                {isShadowed && (
                    <span className="text-rta-text-muted">✅ matches, but rule {(winningRuleIndex ?? 0) + 1} wins</span>
                )}
                {!rule.matched && <span className="text-rta-text-muted">❌ does not match</span>}
            </div>
            {rule.criteria.length === 0 ? (
                <div className="text-rta-text-muted text-[14px] mt-1">
                    No criteria — a rule without criteria never matches.
                </div>
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
        <div className="mt-3">
            <button
                onClick={() => setOpen(!open)}
                className="bg-transparent border-none p-0 cursor-pointer text-rta-info text-[14px]"
            >
                {open ? "▾" : "▸"} Torrent contents ({trackers.length} {trackers.length === 1 ? "tracker" : "trackers"},{" "}
                {files.length} {files.length === 1 ? "file" : "files"})
            </button>
            {open && (
                <div className="mt-2 max-h-[260px] overflow-y-auto border border-rta-border rounded-lg p-2.5 bg-rta-surface">
                    <div className="font-medium mb-1">Trackers</div>
                    {trackers.length === 0 ? (
                        <div className="text-rta-text-muted text-[14px]">None.</div>
                    ) : (
                        trackers.map((tracker, idx) => (
                            <div key={idx} className="font-[monospace] text-[13px]">
                                {tracker}
                            </div>
                        ))
                    )}
                    <div className="font-medium mt-2.5 mb-1">Files</div>
                    {files.length === 0 ? (
                        <div className="text-rta-text-muted text-[14px]">None.</div>
                    ) : (
                        files.map((file, idx) => (
                            <div key={idx} className="font-[monospace] text-[13px]">
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
        <div className="mt-4 border-t border-rta-border pt-3.5">
            <div className="font-semibold mb-1">Test these rules</div>
            <div className="text-rta-text-muted text-[13px] mb-2.5">
                Drop a .torrent file or paste a magnet link to see which rules would match it. Nothing is uploaded or
                added to your client.
            </div>

            <div
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
                className={`border-2 border-dashed ${dragging ? "border-rta-success bg-rta-chip-bg" : "border-rta-border bg-rta-surface"} rounded-[10px] py-4 px-3 text-center`}
            >
                <span className="mr-2">Drop a .torrent file here</span>
                <button onClick={() => fileInputRef.current?.click()} className={primaryButtonClass}>
                    Choose file…
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".torrent,application/x-bittorrent"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                    className="hidden"
                />
            </div>

            <div className="flex gap-2 items-center mt-2">
                <input
                    type="text"
                    value={magnetLink}
                    onChange={(e) => setMagnetLink(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") handleMagnet();
                    }}
                    placeholder="…or paste a magnet link"
                    className="flex-1 min-w-0 font-[monospace] text-[14px] border border-rta-border bg-rta-input-bg text-rta-text rounded-lg py-1 px-2.5"
                />
                <button onClick={handleMagnet} className={primaryButtonClass}>
                    Test
                </button>
            </div>

            {error && <div className="text-rta-danger mt-2.5">{error}</div>}

            {torrent && explanation && (
                <div className="mt-3.5 border border-rta-border rounded-[10px] p-3 bg-rta-surface-alt">
                    <div className="flex gap-3 items-baseline justify-between">
                        <span className="font-semibold break-all">{torrent.name}</span>
                        <button
                            onClick={clear}
                            className="bg-transparent border-none cursor-pointer text-rta-text-muted text-[13px]"
                        >
                            Clear
                        </button>
                    </div>

                    <div className="mt-2 mb-1">
                        {showLabel && <Outcome caption="Label" value={effectiveLabel} source={labelSource} />}
                        {showDir && <Outcome caption="Directory" value={effectiveDir} source={dirSource} />}
                    </div>

                    {torrent.isMagnet && hasFileCriteria && (
                        <div className="text-rta-text-muted text-[13px] mt-2">
                            This is a magnet link, so it carries trackers but no file list — file criteria can never
                            match it.
                            {torrent.declaredName ? " Torrent name and tracker criteria still work." : ""}
                        </div>
                    )}

                    {!torrent.declaredName && hasNameCriteria && (
                        <div className="text-rta-text-muted text-[13px] mt-2">
                            This torrent declares no name of its own, so torrent name criteria can never match it — “
                            {torrent.name}” is only a stand-in for display.
                        </div>
                    )}

                    {explanation.rules.map((rule) => (
                        <RuleRow
                            key={rule.index}
                            rule={rule}
                            winningRuleIndex={explanation.winningRuleIndex}
                            showLabel={showLabel}
                            showDir={showDir}
                        />
                    ))}

                    <TorrentContents torrent={torrent} />
                </div>
            )}
        </div>
    );
}

export default AutoLabelDirTester;
