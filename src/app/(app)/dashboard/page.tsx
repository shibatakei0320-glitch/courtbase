import { SCHOOL } from "@/lib/brand";
import { EventDashboard } from "./EventDashboard";
import { SchoolDashboard } from "./SchoolDashboard";

export const metadata = { title: "ダッシュボード" };

/** スクールは今日のレッスン・LINE・月謝、それ以外は予約・稼働率・売上 */
export default async function Dashboard() {
  return SCHOOL ? <SchoolDashboard /> : <EventDashboard />;
}
