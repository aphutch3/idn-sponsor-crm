import { PlannedSubApp } from "@/components/planned-subapp";

export default function AdsPage() {
  return (
    <PlannedSubApp
      eyebrow="The Engager"
      title="Ad Manager"
      subtitle="Ads we run for IDN summits and reports, plus paid placements sponsors buy from us — one place for creative, spend, and performance."
      features={[
        { title: "Our campaigns", detail: "Paid promotion of summits and living reports across LinkedIn, X, and search. Creative, budget, and pacing per campaign." },
        { title: "Sponsor placements", detail: "Newsletter takeovers, cover-band sponsorships, and report placements sponsors buy from us. Priced, scheduled, and tracked." },
        { title: "Creative library", detail: "Ad units share the same Asset Manager pool with per-platform sizing and copy variants." },
        { title: "Performance rollup", detail: "Impressions, clicks, and conversions from every ad channel roll into a single view per campaign." },
      ]}
      speedLinks={[
        { label: "Our campaigns", href: "/engager/ads?tab=ours" },
        { label: "Sponsor placements", href: "/engager/ads?tab=sponsor" },
        { label: "Creative library", href: "/engager/ads?tab=creative" },
      ]}
    />
  );
}
