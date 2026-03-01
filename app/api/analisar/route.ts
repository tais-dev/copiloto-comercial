import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const { mensagem } = body;

  const texto = mensagem.toLowerCase();

  let categoria = "Outros";
  let prioridade = "Baixa";
  let sugestao = "Recebido 👍 já retorno em breve.";

  if (
    texto.includes("preciso") ||
    texto.includes("manda") ||
    texto.includes("separa") ||
    texto.includes("quero")
  ) {
    categoria = "Pedido";
    prioridade = "Média";
    sugestao =
      "Perfeito 👍 só me confirma fábrica, código e quantidade para registrar.";
  }

  if (
    texto.includes("preço") ||
    texto.includes("valor") ||
    texto.includes("quanto")
  ) {
    categoria = "Cotação";
    prioridade = "Média";
    sugestao =
      "Vou verificar o valor na tabela atual e já retorno com as condições.";
  }

  if (
    texto.includes("urgente") ||
    texto.includes("hoje") ||
    texto.includes("agora")
  ) {
    prioridade = "Alta";
    sugestao =
      "Recebido. Vou priorizar isso e retorno o mais rápido possível.";
  }

  return NextResponse.json({
    categoria,
    prioridade,
    sugestao,
  });
}