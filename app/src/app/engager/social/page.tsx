import { PlannedSubApp } from "@/components/planned-subapp";

export default function SocialPage() {
  return (
    <PlannedSubApp
      eyebrow="The Engager"
      title="Social Engager"
      subtitle="Post, schedule, and reply across X, LinkedIn, and YouTube — organic reach that reinforces every summit and living report."
      features={[
        { title: "Multi-channel composer", detail: "Draft once, adapt per platform. Agent proposes X, LinkedIn, and YouTube copy variants from the same campaign brief." },
        { title: "Scheduling calendar", detail: "See every scheduled post across all three channels in one calendar; drag to reshuffle." },
        { title: "Mentions & replies inbox", detail: "One inbox for mentions and replies across X, LinkedIn, and YouTube comments — triaged by sponsor and topic." },
        { title: "Sponsor amplification", detail: "Cross-post sponsor content with attribution and track engagement per sponsor deliverable." },
        { title: "Performance rollup", detail: "Impressions, engagements, and follower delta per channel, per campaign." },
      ]}
      speedLinks={[
        { label: "New post", href: "/engager/social/new" },
        { label: "Schedule", href: "/engager/social?tab=schedule" },
        { label: "Mentions & replies", href: "/engager/social?tab=inbox" },
      ]}
    />
  );
}
