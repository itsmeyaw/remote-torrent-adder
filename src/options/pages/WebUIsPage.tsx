import { ext } from "../../util/browser-api";
import { useEffect, useState } from "react";
import { useSettings } from "../SettingsContext";
import ChipList from "../components/ChipList";
import AutoLabelDirSettingsEditor from "../components/AutoLabelDirSettingsEditor";
import ClientSpecificSettingsEditor from "../components/ClientSpecificSettingsEditor";
import Select from "../components/Select";
import SettingsGroup from "../components/SettingsGroup";
import { Client, ClientClassByClient, ClientDisplayName, WebUIFactory } from "../../models/clients";
import type { ConnectionTestResult, WebUISettings } from "../../models/webui";
import { TestConnectionMessage, type ITestConnectionMessage } from "../../models/messages";
import Toggle from "../components/Toggle";
import { generateId, moveItem, parsePortInput, MAX_PORT, MIN_PORT } from "../../util/utils";
import { inputClass } from "../ui-classes";

const clientOptions = Object.values(Client).map(c => ({ value: c, label: ClientDisplayName[c] }));

function isClientSelected(client: Client | ""): client is Client {
  return !!client && client in ClientClassByClient;
}


const dropIndicatorClass: Record<"above" | "below", string> = {
  above: "shadow-[inset_0_3px_0_0_var(--rta-green-dark)]",
  below: "shadow-[inset_0_-3px_0_0_var(--rta-green-dark)]",
};

function getDefaultWebUISettings(): WebUISettings {
  return {
    id: generateId(),
    // No client is chosen yet: the user picks one in the detail panel, which is
    // what reveals the rest of the configuration. Until then this entry is a
    // draft and is filtered out by consumers that resolve a concrete client.
    client: "" as Client,
    name: "",
    host: "",
    port: null,
    secure: false,
    relativePath: "",
    username: "",
    password: "",
    showPerTorrentConfigSelector: false,
    defaultLabel: null,
    defaultDir: null,
    labels: [],
    dirs: [],
    addPaused: false,
    autoLabelDirSettings: [],
    clientSpecificSettings: {},
    useAlternativeLabelDirChooser: false,
  };
}

type DropIndicator = "above" | "below" | null;

interface WebUIListItemProps {
  webui: WebUISettings;
  index: number;
  selected: boolean;
  isPrimary: boolean;
  isDragging: boolean;
  dropIndicator: DropIndicator;
  onSelect: () => void;
  onNameChange: (name: string) => void;
  onMove: (from: number, to: number) => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}

function WebUIListItem({
  webui,
  index,
  selected,
  isPrimary,
  isDragging,
  dropIndicator,
  onSelect,
  onNameChange,
  onMove,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: WebUIListItemProps) {
  const subtitle = isClientSelected(webui.client) ? ClientDisplayName[webui.client] : "No client selected";
  // Only the handle arms dragging, so the inline name input stays selectable.
  const [dragArmed, setDragArmed] = useState(false);

  useEffect(() => {
    if (!dragArmed || isDragging) return;
    const disarm = () => setDragArmed(false);
    window.addEventListener("pointerup", disarm);
    window.addEventListener("pointercancel", disarm);
    return () => {
      window.removeEventListener("pointerup", disarm);
      window.removeEventListener("pointercancel", disarm);
    };
  }, [dragArmed, isDragging]);

  return (
    <div
      onClick={onSelect}
      draggable={dragArmed}
      onDragStart={e => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", webui.id);
        onDragStart();
      }}
      onDragOver={e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver();
      }}
      onDrop={e => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={() => {
        setDragArmed(false);
        onDragEnd();
      }}
      className={[
        "flex flex-col gap-1 py-2.5 px-3 rounded-[10px] cursor-pointer transition-colors duration-150",
        isDragging ? "opacity-40" : "opacity-100",
        selected ? "bg-rta-accent border border-rta-green-dark" : "bg-transparent border border-transparent",
        dropIndicator ? dropIndicatorClass[dropIndicator] : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          title="Drag to reorder (or use the arrow keys)"
          aria-label={`Reorder ${webui.name || "Unnamed WebUI"}`}
          onClick={e => e.stopPropagation()}
          onPointerDown={() => setDragArmed(true)}
          onKeyDown={e => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onMove(index, index - 1);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              onMove(index, index + 1);
            }
          }}
          className={`bg-transparent border-none p-0 text-[15px] leading-none cursor-grab touch-none ${selected ? "text-rta-green-dark" : "text-rta-text-muted"}`}
        >⠿</button>
        {selected ? (
          <input
            type="text"
            value={webui.name}
            autoFocus={!webui.name}
            onClick={e => e.stopPropagation()}
            onChange={e => onNameChange(e.target.value)}
            placeholder="Unnamed WebUI"
            className="text-[15px] rounded-lg py-1 px-2 border border-rta-border bg-rta-input-bg text-rta-text flex-1 min-w-0 font-semibold"
          />
        ) : (
          <span
            className={`flex-1 min-w-0 font-semibold text-[15px] overflow-hidden text-ellipsis whitespace-nowrap ${webui.name ? "text-rta-text" : "text-rta-text-muted"}`}
          >
            {webui.name || "Unnamed WebUI"}
          </span>
        )}
        {isPrimary && (
          <span className="text-[11px] font-bold text-white bg-rta-green rounded-md py-0.5 px-1.5 whitespace-nowrap">
            Primary
          </span>
        )}
      </div>
      <span className={`text-[12px] ${selected ? "text-rta-green-dark" : "text-rta-text-muted"}`}>
        {subtitle}
      </span>
    </div>
  );
}

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

function WebUIDetail({ webui, onChange, onRemove, onPromote, isPrimary }: WebUIDetailProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const clientChosen = isClientSelected(webui.client);
  const webUiInstance = clientChosen ? WebUIFactory.createWebUI(webui) : null;
  const labelDirGroupTitle = webUiInstance?.isLabelSupported && webUiInstance?.isDirSupported
    ? "Labels & Directories"
    : webUiInstance?.isLabelSupported ? "Labels" : "Directories";

  // A result only describes the endpoint + credentials it was produced for, so
  // it is stored together with a signature of those fields. Anything that would
  // change the request makes the stored result stale, which is derived during
  // render rather than cleared from an effect.
  const endpointSignature = JSON.stringify([
    webui.id, webui.client, webui.host, webui.port, webui.secure, webui.relativePath, webui.username, webui.password,
  ]);
  const [testState, setTestState] = useState<TestConnectionState>({ signature: endpointSignature, testing: false, result: null });
  const isCurrent = testState.signature === endpointSignature;
  const testing = isCurrent && testState.testing;
  const testResult = isCurrent ? testState.result : null;

  const handleTest = async () => {
    setTestState({ signature: endpointSignature, testing: true, result: null });
    try {
      const result = await ext.runtime.sendMessage({
        action: TestConnectionMessage.action,
        webUiSettings: webui,
      } as ITestConnectionMessage);
      setTestState({ signature: endpointSignature, testing: false, result: result as ConnectionTestResult });
    } catch (error) {
      setTestState({
        signature: endpointSignature,
        testing: false,
        result: { reachable: false, authenticated: null, httpResponseCode: 0, message: String(error) },
      });
    }
  };

  return (
    <div>
      <div className="flex gap-3 items-center mb-5">
        <span className="font-bold text-[22px] flex-1">{webui.name || "Unnamed WebUI"}</span>
        {!isPrimary && (
          <button
            onClick={onPromote}
            className="bg-rta-info text-white border-none rounded-lg py-1.5 px-4 font-bold cursor-pointer transition-all duration-150"
          >Promote to Primary</button>
        )}
        <button
          onClick={() => {
            if (confirmRemove) onRemove();
            else setConfirmRemove(true);
          }}
          className={`${confirmRemove ? "bg-rta-danger-dark shadow-[0_0_8px_2px_var(--rta-danger-dark)]" : "bg-rta-danger"} text-white border-none rounded-lg py-1.5 px-4 font-bold cursor-pointer transition-all duration-150`}
        >
          {confirmRemove ? "For real?" : "Remove"}
        </button>
        {confirmRemove && (
          <button
            onClick={() => setConfirmRemove(false)}
            className="bg-rta-neutral text-rta-danger border-none rounded-lg py-1.5 px-3 font-medium cursor-pointer"
          >Cancel</button>
        )}
      </div>

      {/* Client type: choosable while still a draft, locked once chosen. */}
      <div className="mb-5">
        <Select
          label="Client"
          value={webui.client}
          changeable={!clientChosen}
          options={clientOptions}
          onChange={clientChosen ? undefined : value => onChange({ ...webui, client: value as Client })}
        />
      </div>

      {!clientChosen ? (
        <div className="text-rta-text-muted text-[15px]">
          Select a client type above to configure this WebUI.
        </div>
      ) : (
        <>
          <SettingsGroup title="General">
            <div className="flex flex-col gap-4">
              {/* Host + Port + Secure + Relative Path */}
              <div className="flex gap-4 items-end flex-wrap">
                <div>
                  <label className="block mb-1 font-medium">Host</label>
                  <input type="text" value={webui.host} onChange={e => onChange({ ...webui, host: e.target.value })} className={`${inputClass} min-w-[120px]`} />
                </div>
                <div>
                  <label htmlFor="rta-webui-port" className="block mb-1 font-medium">Port</label>
                  <input
                    id="rta-webui-port"
                    type="number"
                    inputMode="numeric"
                    min={MIN_PORT}
                    max={MAX_PORT}
                    placeholder={webui.secure ? "443" : "80"}
                    value={webui.port ?? ""}
                    onChange={e => onChange({ ...webui, port: parsePortInput(e.target.value) })}
                    className={`${inputClass} min-w-[80px]`}
                  />
                </div>
                <Toggle checked={webui.secure} onChange={v => onChange({ ...webui, secure: v })} label="Secure (HTTPS)" />
                <div>
                  <label className="block mb-1 font-medium">Relative Path</label>
                  <input type="text" value={webui.relativePath || ""} onChange={e => onChange({ ...webui, relativePath: e.target.value })} className={`${inputClass} min-w-[120px]`} />
                </div>
              </div>
              <div className="text-rta-text-muted">Base URL for API calls: {webUiInstance?.createBaseUrl()}</div>
              {/* Username + Password */}
              <div className="flex gap-4 items-end flex-wrap">
                <div>
                  <label className="block mb-1 font-medium">Username</label>
                  <input type="text" value={webui.username} onChange={e => onChange({ ...webui, username: e.target.value })} className={`${inputClass} min-w-[120px]`} />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Password</label>
                  <input type="password" value={webui.password} onChange={e => onChange({ ...webui, password: e.target.value })} className={`${inputClass} min-w-[120px]`} />
                </div>
              </div>
              {/* Test connection */}
              {webUiInstance?.isConnectionTestSupported && (
                <div className="flex gap-3 items-center flex-wrap">
                  <button
                    onClick={handleTest}
                    disabled={testing}
                    className={`bg-rta-info text-white border-none rounded-lg py-1.5 px-4 font-bold transition-all duration-150 ${testing ? "cursor-default opacity-70" : "cursor-pointer opacity-100"}`}
                  >{testing ? "Testing…" : "Test connection"}</button>
                  {testResult && (() => {
                    const color = !testResult.reachable
                      ? "text-rta-danger"
                      : testResult.authenticated !== true
                        ? "text-rta-warning"
                        : "text-rta-success";
                    const icon = !testResult.reachable ? "❌" : testResult.authenticated !== true ? "⚠" : "✅";
                    return (
                      <span className={`${color} font-semibold text-[14px]`}>
                        {icon} {testResult.message}
                      </span>
                    );
                  })()}
                </div>
              )}
              {/* Only show these fields if supported by the WebUI instance */}
              {(webUiInstance?.isAddPausedSupported || webUiInstance?.isLabelDirChooserSupported) && (
                <div className="flex flex-col items-start gap-3">
                  {webUiInstance?.isAddPausedSupported && (
                    <Toggle checked={webui.addPaused} onChange={v => onChange({ ...webui, addPaused: v })} label="Add torrents paused" />
                  )}
                  {webUiInstance?.isLabelDirChooserSupported && (
                    <>
                      <Toggle checked={webui.showPerTorrentConfigSelector} onChange={v => onChange({ ...webui, showPerTorrentConfigSelector: v })} label="Show per-torrent config selector" />
                      <Toggle checked={webui.useAlternativeLabelDirChooser ?? false} onChange={v => onChange({ ...webui, useAlternativeLabelDirChooser: v })} label="Use alternative container (window instead of popup)" />
                    </>
                  )}
                </div>
              )}
            </div>
          </SettingsGroup>
          {webUiInstance && webUiInstance.clientSpecificSettingDescriptors.length > 0 && (
            <ClientSpecificSettingsEditor
              descriptors={webUiInstance.clientSpecificSettingDescriptors}
              value={webui.clientSpecificSettings ?? {}}
              onChange={clientSpecificSettings => onChange({ ...webui, clientSpecificSettings })}
            />
          )}
          {(webUiInstance?.isLabelSupported || webUiInstance?.isDirSupported) && (
            <SettingsGroup title={labelDirGroupTitle}>
              <div className="flex gap-8 items-start flex-wrap">
                {webUiInstance?.isLabelSupported && (
                  <div className="flex-1 min-w-[240px]">
                    <div className="mb-2">
                      <label className="block mb-1 font-medium">Default Label</label>
                      <input
                        type="text"
                        value={webui.defaultLabel ?? ""}
                        onChange={e => onChange({ ...webui, defaultLabel: e.target.value })}
                        className={`${inputClass} min-w-[180px]`}
                        placeholder="Default label"
                      />
                    </div>
                    <ChipList label="Labels for per-torrent selection" values={webui.labels} onChange={labels => onChange({ ...webui, labels })} placeholder="Add label" />
                  </div>
                )}
                {webUiInstance?.isDirSupported && (
                  <div className="flex-1 min-w-[240px]">
                    <div className="mb-2">
                      <label className="block mb-1 font-medium">Default Directory</label>
                      <input
                        type="text"
                        value={webui.defaultDir ?? ""}
                        onChange={e => onChange({ ...webui, defaultDir: e.target.value })}
                        className={`${inputClass} min-w-[180px]`}
                        placeholder="Default directory"
                      />
                    </div>
                    <ChipList label="Directories for per-torrent selection" values={webui.dirs} onChange={dirs => onChange({ ...webui, dirs })} placeholder="Add directory" />
                  </div>
                )}
              </div>
            </SettingsGroup>
          )}
          {webUiInstance?.isLabelDirChooserSupported && (
            <AutoLabelDirSettingsEditor
              value={webui.autoLabelDirSettings ?? []}
              onChange={autoLabelDirSettings => onChange({ ...webui, autoLabelDirSettings })}
              showLabel={!!webUiInstance?.isLabelSupported}
              showDir={!!webUiInstance?.isDirSupported}
              labels={webui.labels}
              dirs={webui.dirs}
              defaultLabel={webui.defaultLabel}
              defaultDir={webui.defaultDir}
            />
          )}
        </>
      )}
    </div>
  );
}

export default function WebUIsPage() {
  const { settings, updateSetting, loading } = useSettings();
  const [requestedId, setRequestedId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const webuis = settings?.webuiSettings ?? [];

  // Default to the primary WebUI so the page never opens to an empty panel, and
  // keep the selection valid if the selected entry is removed. Derived during
  // render so no effect has to chase the settings list.
  const selectedId = webuis.some(w => w.id === requestedId) ? requestedId : (webuis[0]?.id ?? null);
  const setSelectedId = setRequestedId;

  if (loading || !settings) return <div>Loading...</div>;

  const handleAdd = () => {
    const newWebUI = getDefaultWebUISettings();
    updateSetting("webuiSettings", [...webuis, newWebUI]);
    setSelectedId(newWebUI.id);
  };

  const handleChange = (id: string, updated: WebUISettings) => {
    updateSetting("webuiSettings", webuis.map(w => (w.id === id ? updated : w)));
  };

  const handleRemove = (id: string) => {
    updateSetting("webuiSettings", webuis.filter(w => w.id !== id));
  };

  // The stored order is what the context menu and the "primary" WebUI are
  // derived from, so reordering the list is all this needs to do.
  const handleMove = (from: number, to: number) => {
    const reordered = moveItem(webuis, from, to);
    if (reordered !== webuis) updateSetting("webuiSettings", reordered);
  };

  const handlePromote = (id: string) => {
    handleMove(webuis.findIndex(w => w.id === id), 0);
  };

  const handleDrop = () => {
    if (dragIndex !== null && overIndex !== null) handleMove(dragIndex, overIndex);
    setDragIndex(null);
    setOverIndex(null);
  };

  const dropIndicatorFor = (idx: number): DropIndicator => {
    if (dragIndex === null || overIndex !== idx || dragIndex === idx) return null;
    return dragIndex > idx ? "above" : "below";
  };

  const selected = webuis.find(w => w.id === selectedId) ?? null;

  return (
    <div className="flex gap-5 items-stretch min-h-[360px]">
      {/* Left panel: list of configured WebUIs */}
      <div className="w-[260px] shrink-0 border-r border-rta-border pr-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <span className="font-bold text-[16px]">WebUIs</span>
          <button
            onClick={handleAdd}
            title="Add new WebUI"
            aria-label="Add new WebUI"
            className="bg-rta-success text-white border-none rounded-lg w-8 h-8 text-[22px] leading-none cursor-pointer flex items-center justify-center"
          >+</button>
        </div>
        <div className="flex flex-col gap-1">
          {webuis.length === 0 ? (
            <div className="text-rta-text-muted text-[14px] py-2 px-1">
              No WebUIs yet. Click + to add one.
            </div>
          ) : (
            webuis.map((webui, idx) => (
              <WebUIListItem
                key={webui.id}
                webui={webui}
                index={idx}
                selected={webui.id === selectedId}
                isPrimary={idx === 0}
                isDragging={dragIndex === idx}
                dropIndicator={dropIndicatorFor(idx)}
                onSelect={() => setSelectedId(webui.id)}
                onNameChange={name => handleChange(webui.id, { ...webui, name })}
                onMove={handleMove}
                onDragStart={() => setDragIndex(idx)}
                onDragOver={() => setOverIndex(idx)}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDrop={handleDrop}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel: configuration for the selected WebUI */}
      <div className="flex-1 min-w-0">
        {selected ? (
          <WebUIDetail
            key={selected.id}
            webui={selected}
            onChange={updated => handleChange(selected.id, updated)}
            onRemove={() => handleRemove(selected.id)}
            onPromote={() => handlePromote(selected.id)}
            isPrimary={webuis[0]?.id === selected.id}
          />
        ) : (
          <div className="text-rta-text-muted text-[15px] pt-2">
            Select a WebUI on the left, or click + to add a new one.
          </div>
        )}
      </div>
    </div>
  );
}
