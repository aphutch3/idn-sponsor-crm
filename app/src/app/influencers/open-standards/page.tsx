import { PlannedSubApp } from "@/components/planned-subapp";

export default function OpenStandardsPage() {
  return (
    <PlannedSubApp
      parentHref="/influencers"
      parentLabel="Influencers"
      eyebrow="Influencers"
      title="Open Standards"
      subtitle="Standards leaders and spec authors — the people shaping the open protocols enterprise IT actually runs on."
      features={[
        { title: "By standard", detail: "Grouped by standard (OpenTelemetry, MCP, Kubernetes, OpenAPI, CloudEvents, etc.) with lead maintainers and TSC members." },
        { title: "Working groups", detail: "Active working groups and SIGs with chairs, meeting cadence, and current focus areas." },
        { title: "Spec authors", detail: "People whose names appear on shipped RFCs and specs — natural byline candidates and interview targets." },
        { title: "Foundation mapping", detail: "Cross-referenced with CNCF, Linux Foundation, OpenJS, Apache, and Eclipse membership rolls." },
      ]}
      speedLinks={[
        { label: "By standard", href: "/influencers/open-standards?tab=standard" },
        { label: "Working groups", href: "/influencers/open-standards?tab=groups" },
        { label: "Spec authors", href: "/influencers/open-standards?tab=authors" },
      ]}
    />
  );
}
