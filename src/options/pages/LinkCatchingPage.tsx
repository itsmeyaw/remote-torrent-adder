import { useState, type JSX } from "react";
import { CheckIcon, CircleCheckIcon, CircleXIcon, PencilIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SettingsSection, { SettingsRow } from "@/components/settings/SettingsSection";
import SwitchRow from "@/components/settings/SwitchRow";
import Loading from "../components/Loading";
import { useSettings } from "../SettingsContext";
import { isMatchedByRegexes } from "../../content-script/link-catching";

function regexToString(r: RegExp): string {
    return r.source;
}

function stringToRegex(s: string): RegExp | null {
    if (s.trim() === "") return null;
    try {
        return new RegExp(s);
    } catch {
        return null;
    }
}

function patternError(s: string): string {
    return s.trim() === "" ? "Pattern cannot be empty." : "Not a valid regular expression.";
}

/** A stored pattern can be anything the user pasted, so a throw means "no match". */
function testRegexSafely(regex: RegExp, value: string): boolean {
    try {
        return isMatchedByRegexes(value, [regex]);
    } catch {
        return false;
    }
}

export default function LinkCatchingPage(): JSX.Element {
    const { settings, updateSetting, loading } = useSettings();
    const [newRegex, setNewRegex] = useState<string>("");
    const [addError, setAddError] = useState<string | null>(null);
    const [editIdx, setEditIdx] = useState<number | null>(null);
    const [editValue, setEditValue] = useState<string>("");
    const [editError, setEditError] = useState<string | null>(null);
    const [testerValue, setTesterValue] = useState<string>("");

    if (loading || !settings) return <Loading />;

    const regexStrings: string[] = settings.linkCatchingRegexes.map(regexToString);

    const handleAdd = (): void => {
        const reg = stringToRegex(newRegex);
        setAddError(reg ? null : patternError(newRegex));
        if (reg) {
            updateSetting("linkCatchingRegexes", [...settings.linkCatchingRegexes, reg]);
            setNewRegex("");
        }
    };

    const handleRemove = (idx: number): void => {
        const arr = [...settings.linkCatchingRegexes];
        arr.splice(idx, 1);
        // The edit slot is an index, so it must follow the pattern it was opened on.
        if (editIdx !== null && idx < editIdx) setEditIdx(editIdx - 1);
        updateSetting("linkCatchingRegexes", arr);
    };

    const handleEdit = (idx: number): void => {
        setEditIdx(idx);
        setEditValue(regexStrings[idx] ?? "");
        setEditError(null);
    };

    const handleEditSave = (idx: number): void => {
        const reg = stringToRegex(editValue);
        setEditError(reg ? null : patternError(editValue));
        if (reg) {
            const arr = [...settings.linkCatchingRegexes];
            arr[idx] = reg;
            updateSetting("linkCatchingRegexes", arr);
            setEditIdx(null);
            setEditValue("");
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <SettingsSection label="Link catching">
                <SwitchRow
                    label="Enable link catching"
                    description="Intercept clicks on torrent and magnet links and send them to your primary WebUI."
                    checked={settings.linkCatchingEnabled}
                    onChange={(v) => updateSetting("linkCatchingEnabled", v)}
                />
            </SettingsSection>

            <SettingsSection
                title="Link patterns"
                description="A link is caught when it matches any of these regular expressions. Magnet links are always caught."
            >
                {regexStrings.length === 0 && (
                    <SettingsRow>
                        <p className="text-sm text-muted-foreground">No patterns. Only magnet links are caught.</p>
                    </SettingsRow>
                )}
                {regexStrings.map((r, idx) =>
                    editIdx === idx ? (
                        <SettingsRow key={idx} className="gap-2">
                            <div className="flex items-center gap-2">
                                <Input
                                    aria-label="Regex pattern"
                                    aria-invalid={editError ? true : undefined}
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleEditSave(idx);
                                        if (e.key === "Escape") setEditIdx(null);
                                    }}
                                    className="font-mono"
                                />
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="Save pattern"
                                    onClick={() => handleEditSave(idx)}
                                >
                                    <CheckIcon />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="Cancel editing"
                                    onClick={() => setEditIdx(null)}
                                >
                                    <XIcon />
                                </Button>
                            </div>
                            {editError && (
                                <p role="alert" className="text-sm text-destructive">
                                    {editError}
                                </p>
                            )}
                        </SettingsRow>
                    ) : (
                        <SettingsRow key={idx} className="flex-row items-center gap-2 py-2.5">
                            <span className="min-w-0 flex-1 font-mono text-sm break-all">{r}</span>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Edit pattern ${r}`}
                                onClick={() => handleEdit(idx)}
                            >
                                <PencilIcon />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Remove pattern ${r}`}
                                onClick={() => handleRemove(idx)}
                            >
                                <Trash2Icon />
                            </Button>
                        </SettingsRow>
                    ),
                )}
                <SettingsRow className="gap-2">
                    <div className="flex items-center gap-2">
                        <Input
                            aria-label="New pattern"
                            aria-invalid={addError ? true : undefined}
                            value={newRegex}
                            onChange={(e) => setNewRegex(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleAdd();
                            }}
                            placeholder="Add new regex"
                            className="font-mono"
                        />
                        <Button variant="outline" size="sm" onClick={handleAdd}>
                            Add
                        </Button>
                    </div>
                    {addError && (
                        <p role="alert" className="text-sm text-destructive">
                            {addError}
                        </p>
                    )}
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Test a link">
                <SettingsRow>
                    <Input
                        aria-label="Link to test"
                        placeholder="Paste a link to test..."
                        value={testerValue}
                        onChange={(e) => setTesterValue(e.target.value)}
                    />
                    {testerValue && (
                        <ul className="flex flex-col gap-2">
                            {settings.linkCatchingRegexes.map((reg: RegExp, idx: number) => (
                                <TestResult key={idx} label={reg.source} matched={testRegexSafely(reg, testerValue)} />
                            ))}
                            <TestResult label="magnet:" matched={testerValue.startsWith("magnet:")} />
                        </ul>
                    )}
                </SettingsRow>
            </SettingsSection>
        </div>
    );
}

function TestResult({ label, matched }: { label: string; matched: boolean }) {
    return (
        <li className="flex items-center gap-2 text-sm">
            {matched ? (
                <CircleCheckIcon className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
                <CircleXIcon className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 font-mono break-all">{label}</span>
            <span className="text-muted-foreground">{matched ? "matches" : "no match"}</span>
        </li>
    );
}
