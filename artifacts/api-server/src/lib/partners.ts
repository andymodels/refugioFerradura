import { db, postsTable, instagramPartnersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { extractInstagramHandle, extractPhone } from "./partner-extraction";
import { acharDuplicado, type IdentidadeParceiro } from "./partner-dedupe";

export interface ScanPartnersResult {
  postsChecked: number;
  partnersCreated: number;
  // Matérias cujo estabelecimento já existe (mesmo Instagram, nome ou telefone): não viram linha nova.
  duplicatesSkipped: number;
}

// Varredura manual (só roda quando o admin clica) sobre os posts publicados:
// lê o texto de cada um, acha o @ do Instagram e o telefone quando houver, e
// cria um registro de parceiro pra quem ainda não tem um. Nunca segue
// perfil, nunca baixa mídia, nunca publica ou altera o post original — só
// lê e organiza.
export async function scanPostsForPartners(): Promise<ScanPartnersResult> {
  const posts = await db.select().from(postsTable).where(eq(postsTable.status, "published"));

  const existing = await db
    .select({ postId: instagramPartnersTable.postId, nome: instagramPartnersTable.nomeEstabelecimento, instagram: instagramPartnersTable.instagramHandle, telefone: instagramPartnersTable.telefone })
    .from(instagramPartnersTable);
  const alreadyTracked = new Set(existing.map((r) => r.postId));
  // Identidades já cadastradas; cresce durante a varredura para não duplicar entre matérias da mesma rodada.
  const conhecidos: IdentidadeParceiro[] = existing.map((r) => ({ nome: r.nome, instagram: r.instagram, telefone: r.telefone }));

  let partnersCreated = 0;
  let duplicatesSkipped = 0;

  for (const post of posts) {
    if (alreadyTracked.has(post.id)) continue;

    const handle = extractInstagramHandle(post.content);
    if (!handle) continue; // o foco da lista é perfil de Instagram citado

    const telefone = extractPhone(post.content);

    // Mesmo estabelecimento já cadastrado (Instagram, nome exato ou telefone): não cria outra linha.
    const candidato: IdentidadeParceiro = { nome: post.title, instagram: handle, telefone };
    if (acharDuplicado(candidato, conhecidos)) {
      duplicatesSkipped++;
      continue;
    }
    conhecidos.push(candidato);

    await db.insert(instagramPartnersTable).values({
      postId: post.id,
      nomeEstabelecimento: post.title,
      instagramHandle: handle,
      telefone,
      status: "encontrado",
    });
    partnersCreated++;
  }

  return { postsChecked: posts.length, partnersCreated, duplicatesSkipped };
}
