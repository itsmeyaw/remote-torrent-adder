import { useState } from "react";
import type { AutoLabelDirSetting, AutoLabelDirCriterion } from "../../models/webui";
import AutoLabelDirTester from "./AutoLabelDirTester";
import SettingsGroup from "./SettingsGroup";
import { CRITERIA_FIELDS, fieldLabel, type CriterionField } from "./auto-label-dir-fields";
import { chipClass, compactInputClass, monoInputClass, primaryButtonClass } from "../ui-classes";

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

function CriteriaEditor({ criteria, onChange }: { criteria: AutoLabelDirCriterion[]; onChange: (c: AutoLabelDirCriterion[]) => void }) {
  const [field, setField] = useState<CriterionField>("trackerUrl");
  const [value, setValue] = useState("");

  const handleAdd = () => {
    if (value.trim()) {
      onChange([...criteria, { field, value: value.trim() }]);
      setValue("");
    }
  };
  const handleRemove = (idx: number) => {
    const arr = [...criteria];
    arr.splice(idx, 1);
    onChange(arr);
  };
  return (
    <div className="mb-3">
      <label className="block mb-1 font-medium">Criteria</label>
      <div className="text-rta-text-muted text-[13px] mb-1.5">
        All criteria of a rule must match (AND). For alternatives, create one rule per case — the first matching rule wins.
      </div>
      {criteria.length > 0 && (
        <div className="flex flex-wrap gap-2 min-h-8">
          {criteria.map((c, idx) => (
            <span key={idx} className={chipClass}>
              <span className="mr-2">{fieldLabel(c.field)}:</span>
              <span className="mr-2">{c.value}</span>
              <button onClick={() => handleRemove(idx)} className="text-[13px] ml-0.5">🗑</button>
            </span>
          ))}
        </div>
      )}
      <div className={`flex items-center gap-2 ${criteria.length > 0 ? "mt-2" : "mt-0"}`}>
        <select
          value={field}
          onChange={e => setField(e.target.value as CriterionField)}
          className={compactInputClass}>
          {CRITERIA_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={CRITERIA_FIELDS.find(f => f.value === field)?.placeholder}
          className={`flex-1 min-w-0 ${monoInputClass}`}
        />
        <button onClick={handleAdd} className={primaryButtonClass}>Add</button>
      </div>
    </div>
  );
}

function AutoLabelDirSettingsEditor({ value, onChange, showLabel, showDir, labels, dirs, defaultLabel, defaultDir }: AutoLabelDirSettingsEditorProps) {
  const handleAdd = () => {
    onChange([...value, { criteria: [], label: showLabel ? "" : null, dir: showDir ? "" : null }]);
  };
  const handleRemove = (idx: number) => {
    const arr = [...value];
    arr.splice(idx, 1);
    onChange(arr);
  };
  const updateAt = (idx: number, patch: Partial<AutoLabelDirSetting>) => {
    const existing = value[idx];
    if (!existing) {
      return;
    }
    const arr = [...value];
    arr[idx] = { ...existing, ...patch };
    onChange(arr);
  };
  const handleCriteriaChange = (idx: number, criteria: AutoLabelDirCriterion[]) => updateAt(idx, { criteria });
  const handleLabelChange = (idx: number, label: string | null) => updateAt(idx, { label });
  const handleDirChange = (idx: number, dir: string | null) => updateAt(idx, { dir });
  return (
    <SettingsGroup
      title="Auto Label/Dir Settings"
      actions={<button onClick={handleAdd} className="bg-rta-success text-white border-none rounded-lg py-1.5 px-4 font-medium cursor-pointer">Add Rule</button>}
    >
      {value.length === 0 && <div className="text-rta-text-muted mb-2">No rules defined yet.</div>}
      {value.map((setting, idx) => (
        <div key={idx} className="mb-4.5 p-3 border border-rta-border rounded-lg bg-rta-surface relative">
          <button
            onClick={() => handleRemove(idx)}
            className="absolute top-2 right-2 bg-rta-danger text-white border-none rounded-lg py-1 px-2.5 font-medium cursor-pointer"
            title="Remove rule"
          >🗑</button>
          <div className="flex gap-8 items-start">
            <div className="flex-1">
              <CriteriaEditor criteria={setting.criteria} onChange={c => handleCriteriaChange(idx, c)} />
            </div>
            <div className="flex-1">
              {showLabel && (
                <div className="mb-2.5">
                  <label className="block mb-1 font-medium">Label</label>
                  <select
                    value={setting.label ?? ""}
                    onChange={e => handleLabelChange(idx, e.target.value === "" ? null : e.target.value)}
                    className={`${compactInputClass} min-w-[120px]`}>
                    <option value="">(none)</option>
                    {[...(labels.includes(setting.label ?? "") || !setting.label ? labels : [setting.label, ...labels])]
                      .filter((l, i, arr) => l && arr.indexOf(l) === i)
                      .map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              )}
              {showDir && (
                <div className="mb-2.5">
                  <label className="block mb-1 font-medium">Directory</label>
                  <select
                    value={setting.dir ?? ""}
                    onChange={e => handleDirChange(idx, e.target.value === "" ? null : e.target.value)}
                    className={`${compactInputClass} min-w-[120px]`}>
                    <option value="">(none)</option>
                    {[...(dirs.includes(setting.dir ?? "") || !setting.dir ? dirs : [setting.dir, ...dirs])]
                      .filter((d, i, arr) => d && arr.indexOf(d) === i)
                      .map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
      {value.length > 0 && (
        <AutoLabelDirTester
          settings={value}
          defaultLabel={defaultLabel}
          defaultDir={defaultDir}
          labels={labels}
          dirs={dirs}
          showLabel={showLabel}
          showDir={showDir}
        />
      )}
    </SettingsGroup>
  );
}

export default AutoLabelDirSettingsEditor;
