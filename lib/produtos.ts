import { supabase } from "@/lib/supabaseClient";

const STOPWORDS = new Set([
  "oi","ola","olá","bom","boa","dia","tarde","noite",
  "pedro","por","favor","pf","porfavor",
  "me","passa","manda","tem","tens","vc","vcs","voce","vocês",
  "preco","preço","valor","quanto","cust","custa","custo",
  "da","do","de","a","o","as","os","um","uma","uns","umas",
  "pra","para","pro","com","sem","e","em","no","na","nos","nas",
  "preciso","queria","gostaria","pode","consegue"
]);

function extrairCodigo(texto: string) {
  // pega códigos do tipo FT-200, MI-1000 etc em qualquer lugar da frase
  const m = texto.toUpperCase().match(/\b[A-Z]{2,}-?\d{2,}\b/);
  return m?.[0] || null;
}

function keywords(texto: string) {
  return texto
    .toLowerCase()
    .replace(/[,;:!?()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => w.replace(/[^\w.\-]/g, "")) // mantém 1.20 e FT-200
    .filter((w) => w.length >= 3)
    .filter((w) => !STOPWORDS.has(w));
}

export async function buscarProdutos({
  fabricaId,
  termo,
}: {
  fabricaId: string;
  termo: string;
}) {
  const codigo = extrairCodigo(termo);

  // 1) se tiver código, tenta direto
  if (codigo) {
    const { data: byCode } = await supabase
      .from("produtos")
      .select("*")
      .eq("fabrica_id", fabricaId)
      .eq("codigo", codigo)
      .limit(5);

    if (byCode && byCode.length) return byCode;
  }

  // 2) pega palavras relevantes e busca por OR (qualquer uma)
  const keys = keywords(termo).slice(0, 5);
  if (!keys.length) return [];

  // Supabase OR: descricao ilike %palavra% OR descricao ilike %palavra2% ...
  const orFilter = keys.map((k) => `descricao.ilike.%${k}%`).join(",");

  const { data, error } = await supabase
    .from("produtos")
    .select("*")
    .eq("fabrica_id", fabricaId)
    .or(orFilter)
    .limit(10);

  if (error) return [];
  return data || [];
}