import sharp from "sharp";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// O Satori (motor de renderização de texto) não tem fonte nenhuma embutida
// com pesos diferentes — sem carregar uma fonte de verdade com variante
// bold, fontWeight no estilo simplesmente não tem efeito. Busca a fonte na
// própria Google Fonts; o truque do user-agent antigo força a resposta em
// TTF, formato que o Satori lê (a resposta padrão vem em WOFF2, que ele não
// suporta).
const FONT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/534.34 (KHTML, like Gecko)  wkhtmltopdf Qt4";

interface HeadlineFont {
  name: string;
  data: Buffer;
  weight: 500 | 800;
  style: "normal";
}

let cachedFonts: HeadlineFont[] | null = null;

async function loadGoogleFontTTF(weight: number): Promise<Buffer> {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&display=swap`, {
    headers: { "User-Agent": FONT_UA },
  }).then((r) => r.text());
  const match = css.match(/src: url\(([^)]+)\)/);
  if (!match) throw new Error("Não achei a URL da fonte no CSS do Google Fonts.");
  const res = await fetch(match[1]);
  return Buffer.from(await res.arrayBuffer());
}

async function loadHeadlineFonts(): Promise<HeadlineFont[]> {
  if (cachedFonts) return cachedFonts;
  const [regular, bold] = await Promise.all([loadGoogleFontTTF(500), loadGoogleFontTTF(800)]);
  cachedFonts = [
    { name: "Inter", data: regular, weight: 500, style: "normal" },
    { name: "Inter", data: bold, weight: 800, style: "normal" },
  ];
  return cachedFonts;
}

// Tamanho de fonte pra manchete se ajustar ao comprimento do texto: quanto
// mais caracteres, menor a fonte — sempre mirando fechar por volta de 2
// linhas dentro da largura útil (card - margem dos dois lados).
function headlineFontSize(totalChars: number): number {
  const availableWidth = CARD_WIDTH - 80 * 2;
  const avgCharWidthRatio = 0.95;
  const estimated = (2 * availableWidth) / (avgCharWidthRatio * Math.max(totalChars, 1));
  return Math.round(clamp(estimated, 32, 62));
}

// Corte "cover" simples, centralizado — sem análise de foco por IA (o
// pipeline do Refúgio não tem esse passo, e não vale o custo de chamada de
// IA extra só pra decidir o enquadramento do card do Instagram).
async function fetchAndCropCover(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Imagem indisponível (${response.status}).`);
    const input = Buffer.from(await response.arrayBuffer());
    const cropped = await sharp(input)
      .rotate()
      .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "cover", position: "centre" })
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
      .toBuffer();
    return `data:image/jpeg;base64,${cropped.toString("base64")}`;
  } catch {
    // Nunca cair pra URL remota crua aqui: o Satori não decodifica alguns
    // formatos (ex: WebP/HEIC), e o <img> simplesmente não desenha nada,
    // deixando o fundo escuro do card exposto como uma "faixa preta" sem
    // imagem nenhuma. Se o processamento falhar, melhor não desenhar
    // imagem nenhuma (fundo sólido) do que arriscar isso de novo.
    return null;
  }
}

export interface InstagramCardParams {
  imageUrl: string;
  siteLabel: string;
  // Primeira parte da manchete (geralmente o nome do lugar) — vem em
  // negrito e um pouco maior. Pode ser vazia (título vira uma frase só).
  headlineBold: string;
  headlineRest: string;
}

// Gera o card do feed do Instagram (1080x1350, formato retrato) igual ao
// efeito visual do blog do n9ve: foto cobrindo o quadro inteiro, site no
// canto superior esquerdo e manchete na base (nome do lugar em negrito
// maior + resto do título em peso normal, quebrando linha sozinho).
export async function generateInstagramCard(params: InstagramCardParams): Promise<Buffer> {
  const { imageUrl, siteLabel, headlineBold, headlineRest } = params;

  const [backgroundImage, fonts] = await Promise.all([
    fetchAndCropCover(imageUrl),
    loadHeadlineFonts().catch(() => null),
  ]);

  const fontSize = headlineFontSize(`${headlineBold}, ${headlineRest}`.length);

  const boldWords = (headlineBold ? `${headlineBold},` : "").split(" ").filter(Boolean);
  const restWords = headlineRest.split(" ").filter(Boolean);

  // Satori aceita um objeto plano nesse formato em tempo de execução (não
  // precisa de React/JSX de verdade), mas o tipo ReactNode dos parâmetros
  // dele é mais estrito que isso — daí o `as any` só na fronteira da
  // chamada, sem perder a checagem de tipo no resto do arquivo.
  const svg = await satori(
    ({
      type: "div",
      props: {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#111114",
          color: "#F3F3F4",
          fontFamily: fonts ? "Inter" : undefined,
        },
        children: [
          backgroundImage
            ? {
                type: "img",
                props: {
                  src: backgroundImage,
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                  style: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
                },
              }
            : null,
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "34%",
                display: "flex",
                background: "linear-gradient(180deg, rgba(8,8,10,0) 0%, rgba(8,8,10,.12) 40%, rgba(8,8,10,.62) 100%)",
              },
            },
          },
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                height: "16%",
                display: "flex",
                background: "linear-gradient(0deg, rgba(8,8,10,0) 0%, rgba(8,8,10,.45) 100%)",
              },
            },
          },
          {
            type: "div",
            props: {
              style: { position: "absolute", top: 64, left: 80, display: "flex", zIndex: 2 },
              children: {
                type: "span",
                props: {
                  style: { fontSize: 34, fontWeight: 800, letterSpacing: 1, textShadow: "0 2px 10px rgba(0,0,0,.85)" },
                  children: siteLabel,
                },
              },
            },
          },
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                left: 80,
                right: 80,
                bottom: 72,
                zIndex: 2,
                display: "flex",
                flexWrap: "wrap",
                alignContent: "flex-end",
                fontSize,
                lineHeight: 1.15,
                letterSpacing: 0.2,
                textShadow: "0 2px 14px rgba(0,0,0,.9)",
              },
              children: [
                ...boldWords.map((word) => ({
                  type: "span",
                  props: {
                    style: { fontWeight: 800, fontSize: Math.round(fontSize * 1.08), marginRight: "0.3em" },
                    children: word,
                  },
                })),
                ...restWords.map((word) => ({
                  type: "span",
                  props: { style: { fontWeight: 500, marginRight: "0.3em" }, children: word },
                })),
              ],
            },
          },
        ].filter(Boolean),
      },
    } as any),
    { width: CARD_WIDTH, height: CARD_HEIGHT, fonts: fonts || [] },
  );

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: CARD_WIDTH } });
  const overlayPng = resvg.render().asPng();

  return sharp(overlayPng)
    .flatten({ background: "#111114" })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
