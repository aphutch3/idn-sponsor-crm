import { PlannedSubApp } from "@/components/planned-subapp";

export default function SocializersPage() {
  return (
    <PlannedSubApp
      parentHref="/influencers"
      parentLabel="Influencers"
      eyebrow="Influencers"
      title="Socializers"
      subtitle="High-reach voices on X, LinkedIn, and YouTube — the people whose posts move enterprise IT conversations."
      features={[
        { title: "Reach index", detail: "Ranked by follower count, engagement rate, and share-of-voice on IDN topics — not just raw follower count." },
        { title: "Recent posts", detail: "Latest posts across X, LinkedIn, and YouTube for every tracked socializer, tagged by topic." },
        { title: "Topic mapping", detail: "Which socializers cover which IDN topics, so you know who to brief before a summit or report launch." },
        { title: "Engagement history", detail: "Whether they have posted about IDN before, quoted us, or replied — with tone and reach." },
      ]}
      speedLinks={[
        { label: "Top reach", href: "/influencers/socializers?tab=reach" },
        { label: "Recent posts", href: "/influencers/socializers?tab=posts" },
        { label: "By platform", href: "/influencers/socializers?tab=platform" },
      ]}
    />
  );
}
