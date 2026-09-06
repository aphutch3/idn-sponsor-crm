import { PlannedSubApp } from "@/components/planned-subapp";

export default function BuilderPage() {
  return (
    <PlannedSubApp
      eyebrow="The Engager"
      title="Builder & Assets"
      subtitle="Landing pages, emails, and the brand + content library that feeds them — agent-driven, brand-locked, one inventory shared across every campaign."
      features={[
        { title: "Landing page builder", detail: "Agent generates a page from a campaign brief; edit blocks and publish to a summit-branded subdomain." },
        { title: "Email template builder", detail: "Structured IDN components — hero, letter, offer, event card, footer — reusable across Email Manager and Ad Manager." },
        { title: "Brand kit", detail: "IDN wordmarks, color swatches, type files, iconography, and machine-readable brand tokens the builders validate against." },
        { title: "Content library", detail: "Campaign photography, cover art, videos, audio, sponsor supplied creative. Tagged by summit, sponsor, and campaign for reuse." },
        { title: "Design guide", detail: "Live rules the agents follow — every builder output validates against the guide before it can publish." },
        { title: "Usage tracking", detail: "Every asset shows which campaigns, emails, ads, and pages reference it, so you know what is safe to retire." },
      ]}
      speedLinks={[
        { label: "New landing page", href: "/engager/builder/landing" },
        { label: "New email template", href: "/engager/builder/email" },
        { label: "Brand kit", href: "/engager/builder/brand" },
        { label: "Content library", href: "/engager/builder/content" },
        { label: "Design guide", href: "/engager/builder/design" },
      ]}
    />
  );
}
