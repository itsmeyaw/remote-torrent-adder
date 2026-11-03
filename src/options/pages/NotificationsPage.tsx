import { sendMessageAndForget } from "../../util/browser-api";
import { useEffect, useRef, useState } from "react";
import { useSettings } from "../SettingsContext";
import { type ITestNotificationMessage, TestNotificationMessage } from "../../models/messages";
import { deleteCustomSound, getCustomSound, saveCustomSound, type SoundKind } from "../../notifications/sound-storage";
import Toggle from "../components/Toggle";
import { isFirefox } from "../../util/platform";

// Custom sounds are kept small; they live in IndexedDB but are still loaded
// into memory to play, so cap the size to keep things snappy.
const MAX_SOUND_BYTES = 1024 * 1024; // 1 MB

const sectionClass = "bg-rta-surface-alt border border-rta-border rounded-xl p-4.5 mb-4.5";

const sectionTitleClass = "mt-0 mb-3.5 mx-0 text-[13px] font-bold tracking-[0.6px] uppercase text-rta-green-dark";

const rowClass = "flex items-center gap-3";

const buttonClass = "border border-rta-border rounded-lg py-1.5 px-3.5 bg-rta-surface text-rta-text font-medium cursor-pointer";

export default function NotificationsPage() {
  const { settings, updateSetting, loading } = useSettings();

  if (loading || !settings) return <div>Loading...</div>;

  const sendTest = (isFailed: boolean) => {
    sendMessageAndForget({
      action: TestNotificationMessage.action,
      isFailed,
    } as ITestNotificationMessage);
  };

  return (
    <div className="max-w-[640px]">
      <section className={sectionClass}>
        <h3 className={sectionTitleClass}>Notifications</h3>
        <div className={`${rowClass} mb-3.5`}>
          <Toggle
            checked={settings.notificationsEnabled}
            onChange={v => updateSetting("notificationsEnabled", v)}
            label="Show notifications"
          />
        </div>
        <div className={`${rowClass} mb-3.5`}>
          <Toggle
            checked={settings.notificationsSoundEnabled}
            onChange={v => updateSetting("notificationsSoundEnabled", v)}
            label="Play a sound"
          />
        </div>
        {!isFirefox() && (
          <div className={`${rowClass} mb-3.5`}>
            <Toggle
              checked={settings.notificationsLabelButtonEnabled}
              onChange={v => updateSetting("notificationsLabelButtonEnabled", v)}
              label='Offer an "Add label" button after adding'
            />
          </div>
        )}
        <div className={rowClass}>
          <label htmlFor="notif-duration">Display duration</label>
          <input
            id="notif-duration"
            type="number"
            min={0}
            value={settings.notificationsDurationMs}
            onChange={e => updateSetting("notificationsDurationMs", Number(e.target.value))}
            className="w-[110px] bg-rta-input-bg text-rta-text border border-rta-border rounded-lg py-1.5 px-2.5"
          />
          <span className="text-rta-text-muted">ms</span>
        </div>
      </section>

      {settings.notificationsSoundEnabled && (
        <section className={sectionClass}>
          <h3 className={sectionTitleClass}>Custom sounds</h3>
          <p className="mt-0 mb-4 text-rta-text-muted text-[13px]">
            Pick your own audio files to play when a torrent is added or fails. Leave a slot empty to use the built-in default.
          </p>
          <SoundPicker kind="success" label="Success sound" />
          <SoundPicker kind="failure" label="Failure sound" />
        </section>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => sendTest(false)}
          className="bg-rta-success text-white border-none rounded-lg py-[9px] px-[18px] font-medium cursor-pointer"
        >
          Test Success Notification
        </button>
        <button
          onClick={() => sendTest(true)}
          className="bg-rta-danger text-white border-none rounded-lg py-[9px] px-[18px] font-medium cursor-pointer"
        >
          Test Failed Notification
        </button>
      </div>
    </div>
  );
}

function SoundPicker({ kind, label }: { kind: SoundKind; label: string }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    getCustomSound(kind)
      .then(stored => { if (active) setFileName(stored?.name ?? null); })
      .catch(() => { if (active) setFileName(null); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [kind]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_SOUND_BYTES) {
      alert(`That sound file is too large (max ${Math.round(MAX_SOUND_BYTES / 1024)} KB).`);
      return;
    }
    setBusy(true);
    try {
      await saveCustomSound(kind, file, file.name);
      setFileName(file.name);
    } catch (e) {
      console.error(e);
      alert("Could not save that sound file.");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await deleteCustomSound(kind);
      setFileName(null);
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
    <div className={`${rowClass} mb-3`}>
      <span className="w-[110px] font-medium">{label}</span>

      <span
        className={`flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${fileName ? "text-rta-text not-italic" : "text-rta-text-muted italic"}`}
        title={fileName ?? "Default sound"}
      >
        {busy ? "…" : fileName ?? "Default sound"}
      </span>

      <button type="button" className={buttonClass} onClick={preview} disabled={busy} title="Preview">
        ▶
      </button>

      <button type="button" className={buttonClass} onClick={() => fileInputRef.current?.click()} disabled={busy}>
        Choose…
      </button>

      {fileName && (
        <button
          type="button"
          className="border border-rta-border rounded-lg py-1.5 px-3.5 bg-rta-surface text-rta-danger font-medium cursor-pointer"
          onClick={reset}
          disabled={busy}
          title="Reset to default"
        >
          Reset
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={e => handleFile(e.target.files?.[0])}
        className="hidden"
      />
    </div>
  );
}
