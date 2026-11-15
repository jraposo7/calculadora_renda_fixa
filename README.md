# Calculadora de Renda Fixa

Calculadora comparativa de renda fixa que roda 100% no navegador. Compara **Tesouro Direto**, **CDB** e **LCI** em três modalidades — pós-fixada, prefixada e IPCA+ — mostrando o valor líquido final, a rentabilidade percentual e a evolução mês a mês do investimento.

Sem backend, sem build, sem dependências instaladas: é só abrir o `index.html`.

![status](https://img.shields.io/badge/status-uso%20pessoal-0d9488) ![licença](https://img.shields.io/badge/licen%C3%A7a-MIT-0d9488)

**[Repositório](https://github.com/jraposo7/calculadora_renda_fixa)** · Sem instalação, sem build — rode localmente ou publique no GitHub Pages em segundos (veja [Como usar](#como-usar)).

---

## Sumário

- [Funcionalidades](#funcionalidades)
- [Como usar](#como-usar)
- [Parâmetros de entrada](#parâmetros-de-entrada)
- [Como o cálculo é feito](#como-o-cálculo-é-feito)
- [Persistência e tema](#persistência-e-tema)
- [Integração com o Banco Central](#integração-com-o-banco-central)
- [Exportação CSV](#exportação-csv)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Limitações do modelo](#limitações-do-modelo)
- [Aviso](#aviso)
- [Contribuindo](#contribuindo)

---

## Funcionalidades

- **9 cenários comparados** ao mesmo tempo: Tesouro, CDB e LCI em pós-fixado, prefixado e IPCA+.
- **Aporte inicial + aportes mensais** opcionais, com o mesmo prazo, taxa e custos.
- **Tabela de resultados** com bruto antes de custos, custos, IR/IOF, líquido final e **rentabilidade líquida (%)**.
- **Gráfico de evolução** mês a mês (Chart.js), com o último ponto representando o valor líquido após IR e custos.
- **IR regressivo** automático por prazo ou alíquota fixa selecionável; alíquota própria para LCI.
- **Custos configuráveis**: custódia B3, taxa da instituição, taxa anual de CDB/LCI e custo inicial (entrada).
- **Taxas atualizadas do BCB** (Selic, CDI e IPCA 12 meses) via API pública do SGS.
- **Tema claro/escuro** com detecção da preferência do sistema e alternância manual.
- **Salvamento automático** de todos os campos no `localStorage`.
- **Exportação CSV** dos resultados (separador `;`, compatível com Excel pt-BR).
- **100% client-side** — nenhum dado sai do navegador, exceto a consulta opcional ao BCB.

## Como usar

### Clonar o repositório

```bash
git clone https://github.com/jraposo7/calculadora_renda_fixa.git
cd calculadora_renda_fixa
```

### Opção 1 — abrir direto

Dê duplo clique em `index.html`.

> A consulta ao BCB pode falhar quando a página é aberta via `file://` por causa de restrições de origem. Se isso acontecer, use a opção 2.

### Opção 2 — servidor local (recomendado)

```bash
# na pasta do projeto
python -m http.server 8000
```

Depois acesse <http://localhost:8000>.

Alternativas: `npx serve .`, `php -S localhost:8000`, ou a extensão Live Server do VS Code.

### Publicar no GitHub Pages

1. **Settings → Pages**;
2. em *Build and deployment*, escolha **Deploy from a branch**;
3. branch `main`, pasta `/ (root)` e salve.

A página fica disponível em `https://jraposo7.github.io/calculadora_renda_fixa/`.

### Fluxo básico

1. Informe **valor inicial**, **prazo (meses)** e, se quiser, **aporte mensal**.
2. Ajuste **Selic**, **CDI** e **IPCA** — ou clique em **Atualizar BCB** para buscar as taxas mais recentes.
3. Configure custos do Tesouro (custódia B3, taxa da instituição) e de CDB/LCI.
4. Informe as taxas oferecidas por cada produto na tabela "Taxas oferecidas por cada produto".
5. O cálculo é automático a cada alteração. Use **Calcular comparação** para recalcular manualmente e **Exportar CSV** para baixar os resultados.

## Parâmetros de entrada

### Parâmetros gerais

| Campo | ID | Padrão | Descrição |
|---|---|---|---|
| Valor inicial (R$) | `principal` | `10000` | Aporte único no início. Pode ser `0` se houver aporte mensal. |
| Prazo (meses) | `months` | `36` | De 1 a 600 meses. |
| Aporte mensal (R$) | `monthly` | `0` | Deposita ao final de cada mês do prazo. |
| Selic (% a.a.) | `selic` | `10,00` | Usada como taxa do Tesouro pós-fixado. |
| CDI (% a.a.) | `cdi` | `9,90` | Base dos produtos pós-fixados de CDB/LCI. |
| IPCA (% a.a.) | `ipca` | `4,50` | Inflação constante usada nos produtos IPCA+. |
| IR padrão | `taxMode` | regressivo | Tabela regressiva por prazo ou alíquota fixa (15%, 17,5%, 20%, 22,5%). |

> Selic e CDI são independentes: o CDI **não** é derivado da Selic, para permitir cenários.

### Custos do Tesouro Direto

| Campo | ID | Padrão | Descrição |
|---|---|---|---|
| Custódia B3 (% a.a.) | `b3fee` | `0,20` | Descontada mensalmente sobre o saldo. |
| Taxa instituição (% a.a.) | `treasuryFee` | `0` | Somada à custódia no Tesouro. |

### Custos de CDB e LCI

| Campo | ID | Padrão | Descrição |
|---|---|---|---|
| Taxa anual (% a.a.) | `bankFee` | `0` | Spread/tarifa anual do emissor. |
| Custo inicial (%) | `entryFee` | `0` | Incide sobre o aporte inicial **e** sobre cada aporte mensal. |
| IR da LCI (%) | `lciTax` | `0` | Alíquota aplicada à LCI (padrão isento). |

### Taxas dos produtos

| Produto | Pós-fixado (% do CDI) | Prefixado (% a.a.) | IPCA+ (% real a.a.) |
|---|---|---|---|
| Tesouro Direto | `tPost` `100` | `tPre` `12` | `tIpca` `6` |
| CDB | `cPost` `110` | `cPre` `13` | `cIpca` `7` |
| LCI | `lPost` `95` | `lPre` `11` | `lIpca` `5,5` |

## Como o cálculo é feito

Tudo é feito em `script.js`, função `simulate()`.

### Taxas mensais

```js
taxaMensal = (1 + taxaAnual)^(1/12) - 1
```

O mesmo vale para os custos anuais (`annualCost`), aplicados como desconto mensal sobre o saldo.

### Produtos IPCA+

A taxa real é combinada com a inflação informada de forma composta:

```js
taxaNominal = (1 + ipca) * (1 + taxaReal) - 1
```

### Aportes mensais

- O aporte mensal é depositado **no final de cada mês** do prazo;
- passa a render junto com o saldo acumulado;
- sofre a mesma taxa anual de custo e o mesmo custo inicial (`entryFee`) do aporte inicial;
- total investido = `aporte inicial + aporte mensal × meses`.

Com aporte mensal igual a `0`, o resultado é idêntico ao de um único aporte inicial.

### Custos e impostos

```js
// base tributável = saldo bruto após custos - aportes líquidos de entrada
ganhoTributavel = max(0, saldo - (aporteInicialLiquido + aporteMensalLiquido * meses))
ir             = ganhoTributavel * aliquota
liquido        = saldo - ir
rentabilidade  = liquido / totalInvestido - 1
```

A alíquota vem da tabela regressiva, calculada em dias (`meses × 365 / 12`):

| Prazo | Alíquota |
|---|---|
| até 180 dias | 22,5% |
| 181 a 360 dias | 20,0% |
| 361 a 720 dias | 17,5% |
| acima de 720 dias | 15,0% |

CDB e Tesouro usam essa tabela (ou a alíquota fixa escolhida). A LCI usa o campo `IR da LCI`.

> **Rentabilidade** é o retorno **total do período** sobre o total investido, não uma taxa anualizada. Com aportes mensais ela tende a ser menor que a de um aporte único, porque os depósitos mais recentes rendem por menos tempo.

### Gráfico

- Uma linha por produto, com o saldo **bruto** acumulado mês a mês;
- o último ponto ("Líquido") mostra o valor após IR e custos, ligado por um trecho tracejado — é a "queda" visual dos descontos;
- clique na legenda para ocultar/exibir produtos.

## Persistência e tema

| Chave | Conteúdo |
|---|---|
| `rf-inputs` | Todos os campos do formulário (JSON). |
| `rf-theme` | `dark` ou `light` (tema escolhido manualmente). |

- Os valores são salvos a cada alteração de campo (`change` e `input`) e restaurados ao reabrir a página.
- Sem valor salvo, o tema segue a preferência do sistema (`prefers-color-scheme`).
- O botão **Restaurar padrão** volta aos valores iniciais definidos no HTML e regrava o `localStorage`.

## Integração com o Banco Central

Consulta à API pública do SGS (`api.bcb.gov.br`), que retorna o último valor de cada série:

| Série | Código | Uso |
|---|---|---|
| Selic | 432 | Campo `selic` |
| CDI | 4389 | Campo `cdi` |
| IPCA 12m | 13522 | Campo `ipca` |

- Disparada pelo botão **Atualizar BCB** e automaticamente na primeira visita (quando não há dados salvos).
- O status é exibido ao lado do botão: `Consultando BCB...`, `BCB: <data> (...)` ou falha (mantendo os valores locais).
- Os valores retornados são gravados nos campos, salvos no `localStorage` e o cálculo é refeito.

## Exportação CSV

Gera `comparativo-renda-fixa.csv` com BOM UTF-8 e separador `;`, contendo:

```
Investimento; Produto; Modalidade; Total investido; Bruto antes de custos;
Custos; IR/IOF; Liquido final; Rentabilidade liquida (%)
```

Os valores numéricos usam ponto decimal (padrão de planilha para importação).

## Estrutura do projeto

```
calculadora_renda_fixa/
├── index.html   # estrutura e conteúdo da página
├── styles.css   # variáveis de tema, componentes e overrides do Tailwind
├── script.js    # persistência, BCB, tema, simulação, gráfico, CSV
└── README.md
```

- **Tailwind CSS** e **Chart.js 4.4.0** são carregados por CDN — é necessária conexão com a internet na primeira carga.
- Não há etapa de build: os arquivos são servidos como estão.
- `script.js` é carregado no fim do `<body>`, então o DOM já existe quando o script roda.

## Limitações do modelo

Modelo simplificado, para comparação rápida — **não é recomendação de investimento**. Ele não modela:

- marcação a mercado e preço unitário dos títulos;
- spread de recompra do Tesouro Direto;
- cupons semestrais (Tesouro IPCA+ com juros semestrais);
- variação futura de CDI, IPCA e Selic (tudo é constante);
- carência, liquidez e prazos parciais de resgate;
- risco de crédito, FGC e limites de cobertura;
- IOF dos primeiros 30 dias;
- regras específicas de tributação por produto ou por tipo de investidor.

A custódia B3 é aproximada como desconto mensal; a cobrança real segue regras e datas da B3. Confirme tarifas e condições vigentes antes de investir.

## Aviso

**Importante — estimativa, não oferta ou recomendação.** Os resultados são projeções com base nos parâmetros informados e podem divergir dos valores efetivos. As taxas do BCB são obtidas de API pública e podem ter defasagem.

## Contribuindo

Este é um projeto aberto e livre — issues e pull requests são bem-vindos.

1. Faça um fork e crie uma branch (`git checkout -b minha-melhoria`);
2. Mantenha o estilo do código existente (JS puro, sem build, sem dependências novas);
3. Teste abrindo o `index.html` e conferindo o console do navegador;
4. Abra um pull request descrevendo a mudança.

Ideias de contribuição: anualizar a rentabilidade, modelar IOF dos primeiros 30 dias, suportar aportes com datas diferentes, cupons semestrais e temas adicionais.

## Licença

MIT © [Jefferson Raposo (@jraposo7)](https://github.com/jraposo7) — veja [LICENSE](LICENSE).

Projeto open source: use, estude, modifique, distribua e venda livremente.
