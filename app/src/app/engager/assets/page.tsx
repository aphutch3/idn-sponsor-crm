import { PlannedSubApp } from "@/components/planned-subapp";

export default function AssetsPage() {
  return (
    <PlannedSubApp
      eyebrow="The Engager"
      title="Asset Manager"
      subtitle="One inventory for every brand and campaign asset — logos, headshots, cover art, decks, video, and sponsor supplied creative."
      features={[
        { title: "Brand kit", detail: "IDN wordmarks, color swatches, type files, iconography, and brand tokens available to every builder and agent." },
        { title: "Content library", detail: "Campaign photography, cover art, videos, and audio. Tagged by summit, sponsor, and campaign for reuse." },
        { title: "Sponsor supplied", detail: "Sponsors upload their logos, headshots, and creative — validated against a spec before use." },
        { title: "Usage tracking", detail: "Every asset shows which campaigns, emails, and pages reference it, so you know what's safe to retire." },
      ]}
      speedLinks={[
        { label: "Brand kit", href: "/engager/assets/brand" },
        { label: "Content library", href: "/engager/assets/content" },
        { label: "Upload", href: "/engager/assets/upload" },
      ]}
    />
  );
}
