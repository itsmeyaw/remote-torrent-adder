import { useState, type ChangeEvent, type JSX } from "react";
import Toggle from "../components/Toggle";
import { useSettings } from "../SettingsContext";
import { isMatchedByRegexes } from "../../util/utils";

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

  if (loading || !settings) return <div>Loading...</div>;

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

  const handleTesterChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setTesterValue(e.target.value);
  };

  return (
    <div>
      <div className="mb-4">
        <Toggle
          checked={settings.linkCatchingEnabled}
          onChange={v => updateSetting("linkCatchingEnabled", v)}
          label="Enable link catching"
        />
      </div>
      <div className="mb-4">
        <label className="block mb-2 font-medium">Link matching regexes:</label>
        <div className="flex flex-wrap gap-2 min-h-10">
          {regexStrings.map((r, idx) => (
            <span
              key={idx}
              className="inline-flex items-center bg-rta-chip-bg border border-rta-chip-border rounded-[16px] py-1 px-3 font-[monospace] text-[15px] shadow-[0_1px_4px_rgba(110,139,116,0.08)] transition-[box-shadow] duration-200"
            >
              {editIdx === idx ? (
                <>
                  <input
                    type="text"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    className="font-[monospace] text-[15px] border-none outline-none bg-rta-input-bg text-rta-text rounded-[8px] py-0.5 px-2 mr-1"
                  />
                  <button onClick={() => handleEditSave(idx)} className="mr-0.5 text-[13px]">✔</button>
                  <button onClick={() => setEditIdx(null)} className="text-[13px]">✖</button>
                  {editError && <span role="alert" className="text-rta-danger text-[13px] ml-1.5">{editError}</span>}
                </>
              ) : (
                <>
                  <span>{r}</span>
                  <button onClick={() => handleEdit(idx)} className="ml-1.5 text-[13px]">✎</button>
                  <button onClick={() => handleRemove(idx)} className="ml-0.5 text-[13px]">🗑</button>
                </>
              )}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <input
            type="text"
            value={newRegex}
            onChange={e => setNewRegex(e.target.value)}
            placeholder="Add new regex"
            className="font-[monospace] text-[15px] border border-rta-border bg-rta-input-bg text-rta-text rounded-[8px] py-1 px-2.5"
          />
          <button
            onClick={handleAdd}
            className="bg-rta-accent text-rta-green-dark border-none rounded-[8px] py-1 px-3 font-medium cursor-pointer"
          >Add</button>
        </div>
        {addError && <div role="alert" className="text-rta-danger text-[13px] mt-1.5">{addError}</div>}
      </div>
      <hr className="mt-8 mb-6 mx-0 border-0 border-t border-rta-border" />
      <div className="mb-4">
        <label className="block mb-2 font-medium">Test your regexes:</label>
        <input
          type="text"
          placeholder="Paste a link to test..."
          value={testerValue}
          onChange={handleTesterChange}
          className="w-full max-w-[400px] text-[15px] py-1.5 px-3 rounded-[8px] border border-rta-border bg-rta-input-bg text-rta-text mb-3"
        />
        <div>
          {testerValue && (
            <ul className="pl-5">
              {settings.linkCatchingRegexes.map((reg: RegExp, idx: number) => {
                const match = testRegexSafely(reg, testerValue);
                return (
                  <li key={idx} className={`flex items-center gap-2 font-semibold ${match ? "text-rta-success" : "text-rta-danger"}`}>
                    <span className="font-[monospace]">{reg.source}</span>
                    {match ? <span className="text-rta-success">✔</span> : <span className="text-rta-danger">✖</span>}
                  </li>
                );
              })}
              {/* Magnet link detection */}
              {(() => {
                const magnetMatch = testerValue.startsWith && testerValue.startsWith('magnet:');
                return (
                  <li className={`flex items-center gap-2 font-semibold ${magnetMatch ? "text-rta-success" : "text-rta-danger"}`}>
                    <span className="font-[monospace]">magnet:</span>
                    {magnetMatch ? <span className="text-rta-success">✔</span> : <span className="text-rta-danger">✖</span>}
                  </li>
                );
              })()}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
