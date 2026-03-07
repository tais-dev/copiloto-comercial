// ====== UTILS: FORMATAÇÃO DE TEXTO ======

export function toTitleCase(str: string): string {
  if (!str) return "";
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function nomeCliente(cliente: {
  nome_fantasia?: string | null;
  razao_social: string;
}): string {
  return cliente.nome_fantasia?.trim() || toTitleCase(cliente.razao_social);
}
