import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { Importer } from "./Importer";

export const metadata = { title: "会員の取り込み" };

export default async function ImportPage() {
  await requireStaff(["OWNER", "ADMIN"]);
  return (
    <>
      <PageHeader title="会員の取り込み（CSV）" back="/members" />
      <Importer />
    </>
  );
}
