import { PlannedSubApp } from "@/components/planned-subapp";

export default function SpeakersPage() {
  return (
    <PlannedSubApp
      parentHref="/influencers"
      parentLabel="Influencers"
      eyebrow="Influencers"
      title="Event Speakers"
      subtitle="Every past, confirmed, and prospective summit speaker in one roster — with session history, topics, and outreach status."
      features={[
        { title: "Speaker roster", detail: "Every speaker across every summit with bio, headshot, session history, and topics they cover." },
        { title: "Prospects pipeline", detail: "Prospective speakers by topic and target summit, with outreach status and last-contact date." },
        { title: "Session history", detail: "Per speaker: every session title, summit, sponsor associations, and downstream engagement metrics." },
        { title: "Topic coverage", detail: "Which topics have deep speaker benches and which are thin — informs summit programming and content gaps." },
      ]}
      speedLinks={[
        { label: "Speaker roster", href: "/influencers/speakers?tab=roster" },
        { label: "Prospects", href: "/influencers/speakers?tab=prospects" },
        { label: "By summit", href: "/influencers/speakers?tab=summit" },
      ]}
    />
  );
}
