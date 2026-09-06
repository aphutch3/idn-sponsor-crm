import { PlannedSubApp } from "@/components/planned-subapp";

export default function VideoPage() {
  return (
    <PlannedSubApp
      eyebrow="The Engager"
      title="Video Channels"
      subtitle="From live summit sessions to YouTube channels — capture, edit, tag, and publish the whole video pipeline in one place."
      features={[
        { title: "Summit sessions", detail: "Each session ingested with speakers, sponsors, and transcript attached — ready to clip and publish." },
        { title: "Clip queue", detail: "Agent proposes highlight clips per session; you approve, brand them, and schedule the drop." },
        { title: "YouTube publish", detail: "Push finished clips and full sessions to summit-branded YouTube channels with SEO metadata pre-filled." },
        { title: "Performance", detail: "Views, watch time, and click-throughs per clip and per sponsor mention." },
      ]}
      speedLinks={[
        { label: "Summit sessions", href: "/engager/video?tab=summit" },
        { label: "YouTube publish", href: "/engager/video?tab=youtube" },
        { label: "Clip queue", href: "/engager/video?tab=clips" },
      ]}
    />
  );
}
