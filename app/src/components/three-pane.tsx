"use client";
import * as React from "react";

// Three-pane shell matching the idn-skill-platform class viewer:
//   - sticky left rail (collapsible)
//   - fluid center
//   - sticky right rail (collapsible)
// Collapse state persists in localStorage per storage key.

type Props = {
  storageKey?: string;
  left: React.ReactNode;
  leftCollapsedLabel?: string;
  right: React.ReactNode;
  rightCollapsedLabel?: string;
  crumbs?: React.ReactNode;
  children: React.ReactNode;
  defaultLeft?: boolean;
  defaultRight?: boolean;
};

export function ThreePane({
  storageKey = "crm-shell",
  left,
  leftCollapsedLabel = "Navigation",
  right,
  rightCollapsedLabel = "Properties",
  crumbs,
  children,
  defaultLeft = true,
  defaultRight = true,
}: Props) {
  const [leftOpen, setLeftOpen] = React.useState(defaultLeft);
  const [rightOpen, setRightOpen] = React.useState(defaultRight);

  React.useEffect(() => {
    const l = localStorage.getItem(`${storageKey}:left`);
    const r = localStorage.getItem(`${storageKey}:right`);
    if (l !== null) setLeftOpen(l === "1");
    if (r !== null) setRightOpen(r === "1");
  }, [storageKey]);

  const toggleLeft = () => {
    const next = !leftOpen; setLeftOpen(next);
    localStorage.setItem(`${storageKey}:left`, next ? "1" : "0");
  };
  const toggleRight = () => {
    const next = !rightOpen; setRightOpen(next);
    localStorage.setItem(`${storageKey}:right`, next ? "1" : "0");
  };

  return (
    <div className="tk-shell" data-left={leftOpen ? "1" : "0"} data-right={rightOpen ? "1" : "0"}>
      {/* Left rail */}
      <aside className="tk-rail tk-rail-left">
        {leftOpen ? (
          <div className="tk-rail-inner">{left}</div>
        ) : (
          <div className="tk-rail-collapsed"><span>{leftCollapsedLabel}</span></div>
        )}
      </aside>
      <button
        type="button"
        aria-label={leftOpen ? "Collapse navigation" : "Expand navigation"}
        title={leftOpen ? "Collapse navigation" : "Expand navigation"}
        className="tk-collapse-btn tk-collapse-left"
        onClick={toggleLeft}
      >
        {leftOpen ? "‹" : "›"}
      </button>

      {/* Center */}
      <section className="tk-center">
        {crumbs && <div className="tk-center-crumbs">{crumbs}</div>}
        <div className="tk-center-body">{children}</div>
      </section>

      {/* Right rail */}
      <aside className="tk-rail tk-rail-right">
        {rightOpen ? (
          <div className="tk-rail-inner">{right}</div>
        ) : (
          <div className="tk-rail-collapsed"><span>{rightCollapsedLabel}</span></div>
        )}
      </aside>
      <button
        type="button"
        aria-label={rightOpen ? "Collapse properties" : "Expand properties"}
        title={rightOpen ? "Collapse properties" : "Expand properties"}
        className="tk-collapse-btn tk-collapse-right"
        onClick={toggleRight}
      >
        {rightOpen ? "›" : "‹"}
      </button>
    </div>
  );
}
