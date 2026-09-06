import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

const SEGMENTS = [
  { id: "seg_2nd_tier", label: "2_2nd Tier", size: 1_842 },
  { id: "seg_recent", label: "3_Recent", size: 312 },
  { id: "seg_attention", label: "4_Attention", size: 128 },
  { id: "seg_resurrection", label: "5_Resurrection", size: 486 },
  { id: "seg_try_again", label: "6_Try Again", size: 217 },
];

const TEMPLATES = [
  { id: "t_blank", label: "Blank", note: "Start from scratch" },
  { id: "t_save_date", label: "Summit save-the-date", note: "6-week runway announcement" },
  { id: "t_survey", label: "3-question survey", note: "Short outreach with a single ask" },
  { id: "t_dormant", label: "Dormant re-engage", note: "Comparing notes ask, one paragraph" },
  { id: "t_recap", label: "Post-event recap", note: "Highlights + next-summit CTA" },
];

export default function NewCampaignPage() {
  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-2 text-xs text-muted mb-3">
        <Link href="/campaigns" className="hover:text-strong">
          Campaigns
        </Link>
        <span>/</span>
        <span className="text-strong">New</span>
      </div>

      <PageHeader
        title="New campaign"
        subtitle="Pick an audience and a starting template. You can tune everything on the next screen."
      />

      <Card className="p-5 mb-4">
        <label className="text-xs text-muted uppercase tracking-wider">Campaign name</label>
        <input
          className="mt-1 w-full text-lg font-medium border-0 border-b border-subtle focus:border-strong outline-none py-2 bg-transparent"
          placeholder="e.g. A3 Summit — Q4 Save the Date"
        />
      </Card>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <Card className="p-5">
          <div className="text-xs text-muted uppercase tracking-wider mb-3">Audience segment</div>
          <div className="space-y-1.5">
            {SEGMENTS.map((s, i) => (
              <label
                key={s.id}
                className={`flex items-center justify-between p-2.5 rounded-md border cursor-pointer ${
                  i === 0 ? "border-black bg-subtle/40" : "border-subtle hover:border-strong"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input type="radio" name="segment" defaultChecked={i === 0} className="accent-black" />
                  <span className="text-sm">{s.label}</span>
                </div>
                <span className="mono text-xs text-muted">{s.size.toLocaleString()}</span>
              </label>
            ))}
          </div>
          <Link href="/segments" className="text-xs text-muted hover:text-strong mt-3 inline-block">
            + Create a new segment
          </Link>
        </Card>

        <Card className="p-5">
          <div className="text-xs text-muted uppercase tracking-wider mb-3">Starting template</div>
          <div className="space-y-1.5">
            {TEMPLATES.map((t, i) => (
              <label
                key={t.id}
                className={`flex items-start gap-3 p-2.5 rounded-md border cursor-pointer ${
                  i === 1 ? "border-black bg-subtle/40" : "border-subtle hover:border-strong"
                }`}
              >
                <input
                  type="radio"
                  name="template"
                  defaultChecked={i === 1}
                  className="accent-black mt-1"
                />
                <div>
                  <div className="text-sm">{t.label}</div>
                  <div className="text-xs text-muted">{t.note}</div>
                </div>
              </label>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5 mb-6">
        <div className="text-xs text-muted uppercase tracking-wider mb-3">Sender</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-muted">From name</label>
            <input
              defaultValue="John Hutchinson"
              className="mt-1 w-full text-sm border border-subtle rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted">From address</label>
            <select className="mt-1 w-full text-sm border border-subtle rounded-md px-3 py-2 bg-white">
              <option>john@idn.direct</option>
              <option>research@idn.direct</option>
              <option>summits@idn.direct</option>
            </select>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Link
          href="/campaigns"
          className="text-xs px-4 py-2 rounded-md border border-strong hover:bg-subtle/40"
        >
          Cancel
        </Link>
        <Link
          href="/campaigns/c_new"
          className="text-xs px-4 py-2 rounded-md bg-black text-white font-medium"
        >
          Continue → Content
        </Link>
      </div>

      <p className="text-[11px] text-muted mt-4">
        Skeleton — the form is visual only. Wiring saves + validation lands with the
        Resend integration.
      </p>
    </div>
  );
}
