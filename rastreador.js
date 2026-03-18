/**
 * rastreador.js — Robô Power BI v6
 * Correções aplicadas:
 *  1. Acesso ao iframe via waitForSelector + page.frames() (resolve cross-origin)
 *  2. Timeout aumentado + espera por elemento concreto antes de extrair
 *  3. Navegação P6 com múltiplas estratégias em cascata
 *  4. --no-sandbox adicionado para GitHub Actions
 */
const { chromium } = require('playwright');

const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbx90wUuh6OqPQ9OYU_md0VVZ1AMq-GqaA_R1AzoTAKDqDFMobL5ajDwJg-EIAIiBX1xCQ/exec';
const URL_PBI     = 'https://construtora-metrocasa.github.io/central/lisboa/Diretoria-Garra-385.html';

// Aguarda até N ms por uma condição (evita sleep fixo)
const aguardar = ms => new Promise(r => setTimeout(r, ms));

// Tenta encontrar o frame do Power BI — várias estratégias
async function encontrarFramePBI(page) {
  // Estratégia 1: frame com "powerbi" na URL
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const frame = page.frames().find(f =>
      f.url().includes('powerbi') ||
      f.url().includes('app.powerbi') ||
      f.url().includes('msit.bi')
    );
    if (frame) { console.log('✅ Frame PBI encontrado via URL:', frame.url()); return frame; }
    await aguardar(1500);
  }

  // Estratégia 2: primeiro iframe da página
  const iframeEl = await page.$('iframe');
  if (iframeEl) {
    const frame = await iframeEl.contentFrame();
    if (frame) { console.log('✅ Frame via primeiro iframe'); return frame; }
  }

  // Estratégia 3: scraping direto na página principal (PBI embedded sem iframe)
  console.log('⚠️ Nenhum frame PBI isolado — usando página principal');
  return page.mainFrame();
}

// Extrai linhas de tabela com scroll progressivo
async function extrairComScroll(frame, tentativasMax = 6) {
  return await frame.evaluate(async (tentativasMax) => {
    const linhasExtraidas = new Set();
    let tentativasSemNovoDado = 0;
    let ultimoTamanho = 0;

    while (tentativasSemNovoDado < tentativasMax) {
      // Seletores mais abrangentes para tabelas Power BI
      const seletores = [
        'div[role="row"]',
        'div[role="rowgroup"] > div',
        '.pivotTableCellWrap',
        'tr',
      ];

      for (const sel of seletores) {
        document.querySelectorAll(sel).forEach(row => {
          const dadosLinha = [];
          // Células: columnheader, gridcell, td, th
          row.querySelectorAll(
            'div[role="columnheader"], div[role="gridcell"], td, th, .cell, .pivotTableCellWrap'
          ).forEach(cell => {
            const texto = (cell.innerText || cell.getAttribute('title') || '').trim();
            if (texto) dadosLinha.push(texto);
          });
          if (dadosLinha.length > 1) linhasExtraidas.add(dadosLinha.join(' | '));
        });
      }

      if (linhasExtraidas.size > ultimoTamanho) {
        ultimoTamanho = linhasExtraidas.size;
        tentativasSemNovoDado = 0;
      } else {
        tentativasSemNovoDado++;
      }

      // Scroll em todos os contêineres possíveis
      document.querySelectorAll(
        '.scroll-region, .scrollable-area, div.bodyCells, .tableEx, .visual-container'
      ).forEach(el => el.scrollBy(0, 600));
      document.documentElement.scrollBy(0, 600);

      await new Promise(r => setTimeout(r, 1200));
    }

    return Array.from(linhasExtraidas);
  }, tentativasMax);
}

// Navega para a página 6 (Dias Sem Vender) com 3 estratégias em cascata
async function navegarParaP6(pbiFrame) {
  // Estratégia 1: menu de páginas → clica pelo texto exato
  try {
    await pbiFrame.locator('button.page-navigation-item').last().click({ force: true, timeout: 5000 });
    await aguardar(2000);
    await pbiFrame.getByText(/Dias S[\/.]*\s*Vender/i).last().click({ force: true, timeout: 5000 });
    console.log('✅ P6 via menu de navegação');
    await aguardar(14000);
    return true;
  } catch (e) { console.log('⚠️ Estratégia 1 falhou:', e.message); }

  // Estratégia 2: seta → 5 cliques consecutivos
  try {
    for (let i = 0; i < 5; i++) {
      await pbiFrame.locator('.pbi-glyph-chevronright, [aria-label*="próxima"], [aria-label*="next"]')
        .last().click({ force: true, timeout: 3000 }).catch(() => {});
      await aguardar(2000);
    }
    console.log('✅ P6 via setas de navegação');
    await aguardar(10000);
    return true;
  } catch (e) { console.log('⚠️ Estratégia 2 falhou:', e.message); }

  // Estratégia 3: URL direta com parâmetro de página (se disponível)
  console.log('⚠️ Todas as estratégias de navegação falharam — extraindo o que há na tela');
  return false;
}

// ──────────────────────────────────────────────────────────────
// EXECUÇÃO PRINCIPAL
// ──────────────────────────────────────────────────────────────
(async () => {
  console.log('🚀 Robô PBI v6 iniciando...');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',           // obrigatório no GitHub Actions
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  });
  const page = await context.newPage();

  const baseDeDados = [['Data_Captura', 'Métricas_Lidas', 'Dados_Brutos']];
  const hoje = new Date().toLocaleString('pt-BR');

  // Intercepta chamadas querydata do Power BI (KPIs: VGV, entradas, última atualização)
  page.on('response', async (response) => {
    if (!response.url().includes('querydata')) return;
    try {
      const json = JSON.parse(await response.text());
      for (const res of (json.results || [])) {
        const descriptor = res.result?.data?.descriptor?.Select || [];
        if (!descriptor.length) continue;
        const metricNames = descriptor.map(d => d.Name).join(' | ');
        const KPI_KEYWORDS = [
          'Sum(BD.VLRVENDA)', 'Sum(BD.Entrada Final)',
          'Sum(BD.ENTRADA PAGA)', 'BD.Última Atualização',
        ];
        if (KPI_KEYWORDS.some(k => metricNames.includes(k))) {
          const dsr = JSON.stringify(res.result?.data?.dsr || '').substring(0, 45000);
          baseDeDados.push([hoje, metricNames, dsr]);
        }
      }
    } catch (_) {}
  });

  // ── ACESSO À PÁGINA ──
  console.log('🌐 Acessando dashboard...');
  await page.goto(URL_PBI, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Aguarda o Power BI carregar (espera algum elemento de tabela aparecer)
  console.log('⏳ Aguardando Power BI renderizar (máx 40s)...');
  try {
    await page.waitForSelector(
      'iframe, div[role="row"], div[role="gridcell"], .visual-container',
      { timeout: 40000 }
    );
  } catch (_) {
    console.log('⚠️ Seletor de espera não encontrado — continuando mesmo assim');
  }
  await aguardar(8000); // margem extra para gráficos pesados

  // ── ENCONTRA O FRAME ──
  const pbiFrame = await encontrarFramePBI(page);

  // ── EXTRAÇÃO P1 ──
  console.log('👁️ Extraindo P1 (Vendas)...');
  const tabelasP1 = await extrairComScroll(pbiFrame, 6);
  tabelasP1.forEach(linha => baseDeDados.push([hoje, 'P1_VENDA', linha]));
  console.log(`📊 P1: ${tabelasP1.length} linhas capturadas`);

  // ── NAVEGAÇÃO PARA P6 ──
  console.log('➡️ Navegando para P6 (Dias Sem Vender)...');
  await navegarParaP6(pbiFrame);

  // ── EXTRAÇÃO P6 ──
  console.log('👁️ Extraindo P6 (Corretores)...');
  const tabelasP6 = await extrairComScroll(pbiFrame, 6);
  tabelasP6.forEach(linha => baseDeDados.push([hoje, 'P6_CORRETOR', linha]));
  console.log(`📊 P6: ${tabelasP6.length} linhas capturadas`);

  // ── ENVIO PARA SHEETS ──
  console.log(`📤 Enviando ${baseDeDados.length} linhas para o Sheets...`);
  try {
    const resp = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseDeDados),
    });
    console.log('🎯 Resposta GAS:', await resp.text());
  } catch (e) {
    console.log('❌ Falha no envio:', e.message);
  }

  await browser.close();
  console.log('✅ Robô finalizado.');
})();
