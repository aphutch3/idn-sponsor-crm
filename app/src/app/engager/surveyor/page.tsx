import { PlannedSubApp } from "@/components/planned-subapp";

export default function SurveyorPage() {
  return (
    <PlannedSubApp
      eyebrow="The Engager"
      title="Surveyor"
      subtitle="Build and send sponsor, attendee, and NPS surveys — with responses flowing back to contacts and campaigns."
      features={[
        { title: "Survey builder", detail: "Question library, branching logic, sponsor / attendee / NPS templates." },
        { title: "Distribution", detail: "Send via Email Manager, embed on a landing page, or share a private link with tracked recipients." },
        { title: "Response library", detail: "Per-question analytics, per-contact response history, tags routed back into the Sponsor CRM." },
        { title: "Sponsor NPS loop", detail: "Automatic post-summit NPS with sentiment scoring and follow-up triggers." },
      ]}
      speedLinks={[
        { label: "New survey", href: "/engager/surveyor/new" },
        { label: "Live surveys", href: "/engager/surveyor?tab=live" },
        { label: "Response library", href: "/engager/surveyor?tab=responses" },
      ]}
    />
  );
}
