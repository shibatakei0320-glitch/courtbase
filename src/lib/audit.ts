import { db } from "./db";
import { clientInfo } from "./request";

export async function audit(staffId: string | null, action: string, target?: string, detail?: string) {
  const { ip } = await clientInfo();
  await db.auditLog.create({ data: { staffId, action, target, detail, ip } });
}
