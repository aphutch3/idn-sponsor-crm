import { PlannedSubApp } from "@/components/planned-subapp";

export default function EvangelistsPage() {
  return (
    <PlannedSubApp
      parentHref="/influencers"
      parentLabel="Influencers"
      eyebrow="Influencers"
      title="Evangelists"
      subtitle="Vendor and platform evangelists — the paid and unpaid voices carrying vendor stories into the community."
      features={[
        { title: "By vendor", detail: "Grouped by employer — every evangelist working for GitHub, AWS, HashiCorp, Vercel, and the rest of the ecosystem." },
        { title: "By platform", detail: "Grouped by the platform they evangelize (Kubernetes, Next.js, GraphQL, etc.) rather than employer." },
        { title: "Sponsor mapping", detail: "Which evangelists work for our sponsors — natural bridges into sponsor programs and speaker asks." },
        { title: "Activity feed", detail: "Recent talks, blog posts, and community appearances for every tracked evangelist." },
      ]}
      speedLinks={[
        { label: "By vendor", href: "/influencers/evangelists?tab=vendor" },
        { label: "By platform", href: "/influencers/evangelists?tab=platform" },
        { label: "Recent activity", href: "/influencers/evangelists?tab=activity" },
      ]}
    />
  );
}
