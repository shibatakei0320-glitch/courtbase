import { SCHOOL } from "@/lib/brand";
import { EventHome } from "./EventHome";
import { SchoolHome } from "./SchoolHome";

export const metadata = { title: "マイページ" };

type Props = { searchParams: Promise<{ paid?: string; applied?: string; kind?: string; canceled?: string }> };

/** スクール（テニス）は在籍・欠席・振替が中心のホーム、それ以外は大会・イベント中心のホーム */
export default async function MyPage(props: Props) {
  return SCHOOL ? <SchoolHome {...props} /> : <EventHome {...props} />;
}
