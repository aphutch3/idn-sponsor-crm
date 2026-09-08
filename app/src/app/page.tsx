import { redirect } from "next/navigation";

// Root path now routes into the unified Start experience.
// Old Overview / Priorities / Taxonomy pages were folded into /start as tabs.
export default function RootRedirect() {
  redirect("/start");
}
