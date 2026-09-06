import { PlannedSubApp } from "@/components/planned-subapp";

export default function CampaignerPage() {
  return (
    <PlannedSubApp
      eyebrow="The Engager"
      title="Campaigner"
      subtitle="Plan a multi-channel play once — Campaigner coordinates email, video, ads, surveys, and social under a single campaign brief."
      features={[
        { title: "Campaign brief", detail: "One brief captures audience, goal, timing, and channel mix; each sub-app draws its instructions from here." },
        { title: "Channel timeline", detail: "A single Gantt view showing every email, ad flight, video drop, and survey send within a campaign." },
        { title: "Shared audience", detail: "Segment once; every sub-app filters against the same recipient set with suppression rules applied." },
        { title: "Campaign scorecard", detail: "Rolled-up performance across channels with per-channel drilldown." },
      ]}
      speedLinks={[
        { label: "New campaign", href: "/engager/campaigner/new" },
        { label: "Active plans", href: "/engager/campaigner?tab=active" },
        { label: "Templates", href: "/engager/campaigner?tab=templates" },
      ]}
    />
  );
}
