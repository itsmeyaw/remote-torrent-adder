import React, { useId } from "react";

interface SettingsGroupProps {
  title: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

const SettingsGroup: React.FC<SettingsGroupProps> = ({ title, actions, children }) => {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="mb-5 border border-rta-border rounded-[10px] p-4 bg-rta-surface-alt"
    >
      <div className="flex items-center gap-3 mb-3">
        <span id={titleId} className="font-semibold text-[16px]">{title}</span>
        {actions}
      </div>
      {children}
    </section>
  );
};

export default SettingsGroup;
