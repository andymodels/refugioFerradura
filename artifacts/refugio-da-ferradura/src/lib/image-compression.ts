// A hospedagem (Vercel) rejeita qualquer requisição acima de ~4,5MB antes
// mesmo do servidor rodar — foto de celular passa fácil disso. Em vez de a
// pessoa ter que adivinhar o tamanho e comprimir na mão, redimensiona/
// recomprime aqui no navegador antes de enviar. Não mexe em imagens já
// pequenas nem em vídeo (vídeo tem seu próprio aviso de limite).
export async function compressImageFile(file: File, maxDim = 1600, quality = 0.82): Promise<File> {
  if (!/^image\//.test(file.type) || file.type === "image/svg+xml") return file;
  if (file.size <= 1.5 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file;
  }
}
