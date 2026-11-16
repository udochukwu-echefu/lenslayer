import { RenewalsView } from "@/components/renewals-view";

/** Same screen as Renewals, opening on the Tasks view (links such as "/tasks" land here). */
export default function TasksScreen() {
  return <RenewalsView initial="tasks" />;
}
