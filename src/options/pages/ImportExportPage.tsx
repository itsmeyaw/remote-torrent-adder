import { useState, type JSX } from "react";
import { useSettings } from "../SettingsContext";
import { serializeSettings } from "../../settings/serializer";
import { parseSettingsExport } from "../../settings/settings-validation";

export default function ImportExportPage(): JSX.Element {
  const { settings, setSettings, loading } = useSettings();
  const [importValue, setImportValue] = useState<string>("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [copied, setCopied] = useState<boolean>(false);
  const [copyError, setCopyError] = useState<string>("");

  if (loading || !settings) return <div>Loading...</div>;

  const handleCopy = async (): Promise<void> => {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(serializeSettings(settings));
    } catch {
      setCopyError("Could not copy to the clipboard. Select the text above and copy it by hand.");
      return;
    }
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
        <div id="rta-export-warning" role="note" className="rta-notice rta-notice--warning">
          Warning: this export contains your WebUI passwords in plain text. Anyone who gets this text can log in to your clients, so only store it somewhere you trust.
        </div>
        <textarea id="rta-export" className="rta-textarea" readOnly value={serializeSettings(settings)} aria-describedby="rta-export-warning" />
        <button
          type="button"
          onClick={handleCopy}
          className={copied ? "rta-button rta-button--success" : "rta-button rta-button--accent"}
        >
          {copied ? "Copied!" : "Copy to clipboard"}
        </button>
        {copyError && <div role="alert" className="rta-error">{copyError}</div>}
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
