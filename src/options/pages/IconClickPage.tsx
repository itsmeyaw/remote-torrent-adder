import { type JSX } from "react";
import { useSettings } from "../SettingsContext";
import RadioCard from "../components/RadioCard";
import { type IconClickAction } from "../../models/settings";

const sectionClass = "inline-flex flex-col gap-2.5 bg-rta-surface-alt border border-rta-border rounded-[12px] p-4.5";

const sectionTitleClass = "mt-0 mb-1 mx-0 text-[13px] font-bold tracking-[0.6px] uppercase text-rta-green-dark";

const OPTIONS: { value: IconClickAction; label: string; description: string; disabledNote?: string }[] = [
  {
    value: "openPrimaryWebUi",
    label: "Open the primary WebUI",
    description: "Clicking the extension icon opens your primary configured WebUI in a new tab.",
  },
  {
    value: "showWebUiPicker",
    label: "Let me choose which WebUI to open",
    description: "Clicking the icon shows a list of your configured WebUIs to pick from.",
    disabledNote: "Configure at least one more WebUI to enable this option.",
  },
  {
    value: "showPageLinks",
    label: "Show links found on this page",
    description: "Clicking the icon shows a popup listing torrent/magnet links detected on the current page. Clicking one adds it, just like clicking it on the page.",
  },
];

export default function IconClickPage(): JSX.Element {
  const { settings, updateSetting, loading } = useSettings();

  if (loading || !settings) return <div>Loading...</div>;

  const current: IconClickAction = settings.iconClickAction ?? "openPrimaryWebUi";
  const multipleWebUisConfigured = settings.webuiSettings.length > 1;

  return (
    <div>
      <p className="mb-4">Choose what happens when you click the extension&apos;s icon in the toolbar.</p>
      <section className={sectionClass}>
        <h3 className={sectionTitleClass}>Icon Click Behavior</h3>
        {OPTIONS.map(option => {
          const disabled = option.value === "showWebUiPicker" && !multipleWebUisConfigured;
          return (
            <RadioCard
              key={option.value}
              name="iconClickAction"
              value={option.value}
              checked={current === option.value}
              disabled={disabled}
              label={option.label}
              description={option.description}
              note={disabled ? option.disabledNote : undefined}
              onChange={value => updateSetting("iconClickAction", value as IconClickAction)}
            />
          );
        })}
      </section>
    </div>
  );
}
