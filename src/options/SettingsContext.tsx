import { ext } from "../util/browser-api";
import { sendMessageAndForget } from "../util/messaging";
import React, { createContext, useContext, useRef, useState, useEffect } from "react";
import type { RTASettings } from "../models/settings";
import { deserializeSettings, serializeSettings } from "../settings/serializer";
import { requestSettings } from "../settings/request-settings";
import { SETTINGS_KEY } from "../settings/settings";

interface SettingsContextType {
  settings: RTASettings | null;
  setSettings: (settings: RTASettings) => void;
  updateSetting: <K extends keyof RTASettings>(key: K, value: RTASettings[K]) => void;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

type StorageChangedListener = Parameters<typeof ext.storage.local.onChanged.addListener>[0];

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<RTASettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  // Serialized settings this page sent and has not seen echoed back by storage yet.
  const pendingSaves = useRef<string[]>([]);

  // Fetch settings from service worker on mount
  useEffect(() => {
    let cancelled = false;
    void requestSettings()
      .then((settings) => {
        if (!settings) throw new Error("The service worker returned no settings.");
        if (!cancelled) setSettings(settings);
      })
      .catch((error: unknown) => {
        console.error("Failed loading settings", error);
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The background writes settings too (e.g. new Label/Directory Lists), so take those
  // in; the echo of this page's own saves is skipped, or it would undo a newer edit.
  useEffect(() => {
    const onChanged: StorageChangedListener = (changes) => {
      const newValue = changes[SETTINGS_KEY]?.newValue as string | undefined;
      if (newValue === undefined) return;
      const echoIndex = pendingSaves.current.indexOf(newValue);
      if (echoIndex >= 0) {
        pendingSaves.current.splice(0, echoIndex + 1);
        return;
      }
      const next = deserializeSettings(newValue);
      if (next) setSettings(next);
    };
    ext.storage.local.onChanged.addListener(onChanged);
    return () => ext.storage.local.onChanged.removeListener(onChanged);
  }, []);

  // Save settings to service worker whenever they change
  const saveSettings = (newSettings: RTASettings) => {
    setSettings(newSettings);
    const serialized = serializeSettings(newSettings);
    pendingSaves.current.push(serialized);
    sendMessageAndForget("saveSettings", { settings: serialized });
  };

  const updateSetting = <K extends keyof RTASettings>(key: K, value: RTASettings[K]) => {
    if (!settings) return;
    const updated = { ...settings, [key]: value };
    saveSettings(updated);
  };

  return (
    <SettingsContext.Provider value={{ settings, setSettings: saveSettings, updateSetting, loading }}>
      {loadFailed ? (
        <div role="alert" className="rta-error">
          Could not load settings. Reload this page to try again.
        </div>
      ) : children}
    </SettingsContext.Provider>
  );
};

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}
