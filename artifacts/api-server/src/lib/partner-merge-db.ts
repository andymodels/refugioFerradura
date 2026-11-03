// Pequeno adaptador para a mesclagem: reexporta o banco e grava o backup em `settings`
// usando a MESMA transação da limpeza (se algo falhar, o backup também não fica).
import { db, instagramPartnersTable, settingsTable } from "@workspace/db";

export { db, instagramPartnersTable };

export async function gravarSettingBackup(tx: any, key: string, value: string): Promise<void> {
  await tx.insert(settingsTable).values({ key, value }).onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}
