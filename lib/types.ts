// ====== TYPES: ENTIDADES DO SISTEMA COMERCIAL ======

// ====== CLIENTS (CRUD) ======
export type Cliente = {
  id: string
  razao_social: string
  nome_fantasia: string | null
  cnpj: string | null
  regiao: string | null
  uf: string | null
  canal: string | null
  ativo: boolean
}

export type ClienteFabrica = {
  id: string
  cliente_id: string
  fabrica: 'amapa' | 'gpaniz' | 'bermar'
  tabela: string | null // 'padrao' | 'especial' | 'ecom'
  regiao: string | null
}

// ====== PRODUCT SEARCH ======
export type Produto = {
  id: string
  descricao: string
  cod_material: string | null
  cod_fornecedor: string | null
  ean: string | null
  ncm: string | null
  gama: string | null
  categoria: string | null
  fabrica: 'amapa' | 'gpaniz' | 'bermar'
  ipi: number
}

// ====== ORDERS + INSTALLMENTS ======
export type PrecoCliente = {
  id: string
  cliente_id: string
  produto_id: string
  preco_vigente: number
  preco_com_frete: number | null
  tabela_id: string
}

// ====== COMMISSION RECONCILIATION ======
export type Campanha = {
  id: string
  nome: string
  descricao: string | null
  desconto_pct: number
  vigencia_de: string
  vigencia_ate: string
  ativa: boolean
  fabrica: 'amapa' | 'gpaniz' | 'bermar' | null
}

export type RegiaoFrete = {
  id: string
  regiao: string
  fob: number
  cif: number | null
  redespacho: number | null
}

// ====== UI: CORES POR FÁBRICA ======
export const FABRICA_COR: Record<string, string> = {
  amapa: '#00e5a0',
  gpaniz: '#60a5fa',
  bermar: '#fb923c',
}

export const FABRICA_LABEL: Record<string, string> = {
  amapa: 'Amapá',
  gpaniz: 'G.Paniz',
  bermar: 'Bermar',
}

// ====== UI: CONDIÇÃO DE PAGAMENTO POR FÁBRICA ======
// Bermar tem prazo único "28/56/84 dias" — apenas informativo, não altera preço.
// null = fábrica sem prazo fixo / prazo não se aplica.
export const FABRICA_PRAZO: Record<string, string | null> = {
  amapa: null,
  gpaniz: null,
  bermar: '28/56/84 dias',
}
