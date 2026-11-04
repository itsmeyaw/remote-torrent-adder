import { type ClientSpecificSettingDescriptor, resolveClientSpecificSetting } from "../../models/webui";
import SettingsSection from "@/components/settings/SettingsSection";
import SwitchRow from "@/components/settings/SwitchRow";

interface ClientSpecificSettingsEditorProps {
    descriptors: ReadonlyArray<ClientSpecificSettingDescriptor>;
    value: Record<string, unknown>;
    onChange: (value: Record<string, unknown>) => void;
}

export default function ClientSpecificSettingsEditor({
    descriptors,
    value,
    onChange,
}: ClientSpecificSettingsEditorProps) {
    return (
        <SettingsSection title="Client-specific settings">
            {descriptors.map((descriptor) => (
                <SwitchRow
                    key={descriptor.key}
                    label={descriptor.label}
                    description={descriptor.description}
                    checked={resolveClientSpecificSetting(descriptor.key, descriptors, value)}
                    onChange={(v) => onChange({ ...value, [descriptor.key]: v })}
                />
            ))}
        </SettingsSection>
    );
}
