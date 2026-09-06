import { PlannedSubApp } from "@/components/planned-subapp";

export default function BuilderPage() {
  return (
    <PlannedSubApp
      eyebrow="The Engager"
      title="Builder"
      subtitle="Landing pages, emails, and campaign micro-sites — agent-driven, brand-locked, with a live design guide."
      features={[
        { title: "Landing page builder", detail: "Agent generates a page from a campaign brief; you edit blocks and publish to a summit-branded subdomain." },
        { title: "Email template builder", detail: "Structured email components matching IDN brand — hero, letter, offer, event card, footer." },
        { title: "Design guide", detail: "Live machine-readable brand context: colors, type scale, tone. Every builder output validates against it before publishing." },
        { title: "Reversible patches", detail: "Every agent edit is a diff you can review, apply, and roll back." },
      ]}
      speedLinks={[
        { label: "New landing page", href: "/engager/builder/landing" },
        { label: "New email template", href: "/engager/builder/email" },
        { label: "Design guide", href: "/engager/builder/design" },
      ]}
    />
  );
}
