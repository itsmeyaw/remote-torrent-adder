import { useState, type JSX } from "react";
import { useSettings } from "../SettingsContext";
import { serializeSettings } from "../../util/serializer";
import { parseSettingsExport } from "../../util/settings-validation";

export default function ImportExportPage(): JSX.Element {
  const { settings, setSettings, loading } = useSettings();
  const [importValue, setImportValue] = useState<string>("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [copied, setCopied] = useState<boolean>(false);

  if (loading || !settings) return <div>Loading...</div>;

  const handleCopy = (): void => {
    navigator.clipboard.writeText(serializeSettings(settings));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleImport = (): void => {
    const result = parseSettingsExport(importValue);
    if (!result.ok) {
      setImportErrors(result.problems);
      return;
    }
    setImportErrors([]);
    setSettings(result.settings);
    setImportValue("");
  };

  return (
    <div className="rta-page">
      <section className="rta-card">
        <h3 className="rta-card__heading">Export</h3>
        <label className="rta-muted" htmlFor="rta-export">Copy this and keep it somewhere safe.</label>
        <textarea id="rta-export" className="rta-textarea" readOnly value={serializeSettings(settings)} />
        <button
          type="button"
          onClick={handleCopy}
          className={copied ? "rta-button rta-button--success" : "rta-button rta-button--accent"}
        >
          {copied ? "Copied!" : "Copy to clipboard"}
        </button>
      </section>

      <section className="rta-card">
        <h3 className="rta-card__heading">Import</h3>
        <label className="rta-muted" htmlFor="rta-import">Paste a previously exported configuration.</label>
        <textarea
          id="rta-import"
          className="rta-textarea"
          value={importValue}
          onChange={e => setImportValue(e.target.value)}
          placeholder="Paste exported settings JSON here..."
          aria-describedby={importErrors.length > 0 ? "rta-import-error" : undefined}
          aria-invalid={importErrors.length > 0 ? true : undefined}
        />
        <button type="button" onClick={handleImport} className="rta-button">
          Import settings
        </button>
        {importErrors.length > 0 && (
          <div id="rta-import-error" role="alert" className="rta-error">
            {importErrors.map(problem => <div key={problem}>{problem}</div>)}
          </div>
        )}
      </section>
    </div>
  );
}
