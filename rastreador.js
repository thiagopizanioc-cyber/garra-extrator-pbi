/**
 * rastreador.js — Robô PBI v16 (MERGE DEFINITIVO)
 *
 * P1: motor físico do v15 (mouse.wheel + keyboard) — extrai 187 linhas ✅
 * P6: navegação do v8 (aria-label exato) + foco explícito na tabela após nav
 *
 * Colunas P6 confirmadas no screenshot:
 * FAIXA DE DIAS | APELIDO | ENTRADA | SITUAÇÃO | FUNÇÃO | GERENTE | SUPERINT. | DIRETOR | DATA ÚLTIMA VENDA | DIAS S/ VENDER
 */
const { chromium } = require('playwright');

const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbx90wUuh6OqPQ9OYU_md0VVZ1AMq-GqaA_R1AzoTAKDqDFMobL5ajDwJg-EIAIiBX1xCQ/exec';
const URL_PBI     = 'https://construtora-metrocasa.github.io/central/lisboa/Diretoria-Garra-385.html';
const aguardar    = ms => new Promise(r => setTimeout(r, ms));

// ─── ENCONTRA FRAME ───────────────────────────────────────────────────────────
async function encontrarFrame(page) {
  for (let i = 0; i < 20; i++) {
    const f = page.frames().find(f => f.url().includes('powerbi') || f.url().includes('app.powerbi'));
    if (f) { console.log('✅ Frame PBI localizado.'); return f; }
    await aguardar(1500);
  }
  return page.mainFrame();
}

// ─── FOCA NA TABELA E CLICA — garante que scroll irá para a tabela ────────────
async function focarTabela(page, frame) {
  try {
    await frame.waitForSelector('div[role="gridcell"]', { state: 'visible', timeout: 20000 });
    const celula = frame.locator('div[role="gridcell"]').last();
    const box = await celula.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 10, box.y + 10);
      await page.mouse.click(box.x + 10, box.y + 10);
      console.log('✅ Tabela focada via clique físico.');
    } else {
      await celula.click({ force: true });
    }
  } catch (e) {
    console.log('⚠️ Clique de emergência no centro da tela.');
    await page.mouse.click(960, 540);
  }
}

// ─── EXTRAÇÃO COM MOTOR FÍSICO (v15 que extraiu 187 linhas) ──────────────────
async function extrairTabela(page, frame, nomeTabela, maxSemNovo = 6) {
  console.log(`\n📋 Iniciando extração: ${nomeTabela}`);

  await focarTabela(page, frame);

  const linhas = new Set();
  let semNovo = 0;

  for (let volta = 0; volta < 80 && semNovo < maxSemNovo; volta++) {
    const novas = await frame.evaluate(() => {
      const resultado = [];
      document.querySelectorAll('div[role="row"]').forEach(row => {
        const celulas = [];
        row.querySelectorAll('div[role="gridcell"], div[role="columnheader"]').forEach(c => {
          const t = (c.getAttribute('title') || c.innerText || '').trim().replace(/\n/g, ' ');
          if (t && t !== 'Select Row' && !t.includes('Row Selection')) celulas.push(t);
        });
        if (celulas.length >= 2) resultado.push(celulas.join(' | '));
      });
      return resultado;
    });

    let novosNesta = 0;
    novas.forEach(l => { if (!linhas.has(l)) { linhas.add(l); novosNesta++; } });

    if (novosNesta > 0) {
      semNovo = 0;
      console.log(`  [${volta+1}] +${novosNesta} novas | total: ${linhas.size}`);
    } else {
      semNovo++;
    }

    // Motor físico: wheel + teclado (funcionou para P1)
    await page.mouse.wheel(0, 1000);
    await page.keyboard.press('PageDown');
    await page.keyboard.press('ArrowDown');
    await aguardar(2000);
  }

  console.log(`🎯 ${nomeTabela}: ${linhas.size} linhas extraídas.`);
  return Array.from(linhas);
}

// ─── NAVEGA P6 — aria-label exato confirmado no diagnóstico ──────────────────
async function navegarP6(page, frame) {
  console.log('\n➡️ Navegando para P6...');

  // Estratégia 1: clique direto na aba pelo aria-label exato
  try {
    await frame.evaluate(() => {
      document.querySelectorAll('.sections-container, .sectionsList, nav[role]').forEach(el => {
        el.scrollLeft += 1000;
      });
    });
    await aguardar(1000);

    await frame.locator('button[aria-label="Vendas - Dias S/ Vender"]')
      .click({ timeout: 6000 });
    console.log('✅ P6 via aba direta.');
    await aguardar(15000); // PBI precisa de tempo para carregar gráficos da P6
    return;
  } catch (e) {
    console.log('⚠️ Aba direta falhou:', e.message.split('\n')[0]);
  }

  // Estratégia 2: Next Page 5x (funcionou nos testes anteriores)
  console.log('   Tentando Next Page 5x...');
  for (let i = 1; i <= 5; i++) {
    await frame.locator('button[aria-label="Next Page"]')
      .click({ force: true, timeout: 4000 }).catch(() => {});
    console.log(`  Clique ${i}/5`);
    await aguardar(2500);
  }
  console.log('✅ Navegação concluída via Next Page.');
  await aguardar(15000); // espera P6 renderizar completamente

  // CRUCIAL: após navegar, move o mouse para a área da tabela da P6
  // Sem isso o foco fica na barra de navegação e o scroll não entra na tabela
  console.log('🖱️ Reposicionando foco para a tabela da P6...');
  await page.mouse.move(960, 500); // centro da tela onde a tabela fica
  await page.mouse.click(960, 500);
  await aguardar(1000);
}

// ─── PRINCIPAL ────────────────────────────────────────────────────────────────
(async () => {
  console.log('🚀 Robô PBI v16 iniciando...');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  }).then(ctx => ctx.newPage());

  const baseDeDados = [['Data_Captura', 'Métricas_Lidas', 'Dados_Brutos']];
  const hoje = new Date().toLocaleString('pt-BR');

  // KPIs via API interna do Power BI
  page.on('response', async (response) => {
    if (!response.url().includes('querydata')) return;
    try {
      const json = JSON.parse(await response.text());
      for (const res of (json.results || [])) {
        const desc = res.result?.data?.descriptor?.Select || [];
        if (!desc.length) continue;
        const nomes = desc.map(d => d.Name).join(' | ');
        const alvos = ['Sum(BD.VLRVENDA)', 'Sum(BD.Entrada Final)', 'Sum(BD.ENTRADA PAGA)', 'BD.Última Atualização'];
        if (alvos.some(a => nomes.includes(a))) {
          baseDeDados.push([hoje, nomes, JSON.stringify(res.result?.data?.dsr || '').substring(0, 45000)]);
        }
      }
    } catch (_) {}
  });

  console.log('🌐 Acessando dashboard...');
  await page.goto(URL_PBI, { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('⏳ Aguardando estabilização (18s)...');
  await aguardar(18000);

  const frame = await encontrarFrame(page);

  // ── P1: Relação de Vendas ──
  console.log('\n=== P1: Relação de Vendas ===');
  const p1 = await extrairTabela(page, frame, 'P1_VENDA');
  p1.forEach(l => baseDeDados.push([hoje, 'P1_VENDA', l]));

  // ── Navega para P6 ──
  await navegarP6(page, frame);

  // ── P6: Dias Sem Vender ──
  // maxSemNovo=8 para dar mais margem (P6 tem gráficos que demoram)
  console.log('\n=== P6: Dias Sem Vender ===');
  const p6 = await extrairTabela(page, frame, 'P6_CORRETOR', 8);
  p6.forEach(l => baseDeDados.push([hoje, 'P6_CORRETOR', l]));

  // ── Envio ──
  console.log(`\n📤 Enviando ${baseDeDados.length} linhas...`);
  try {
    const resp = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseDeDados),
    });
    console.log('🎯 GAS:', await resp.text());
  } catch (e) {
    console.log('❌ Envio falhou:', e.message);
  }

  await browser.close();
  console.log(`\n✅ Concluído. P1: ${p1.length} | P6: ${p6.length} | Total: ${baseDeDados.length}`);
  console.log('   Meta: P1 ~187 linhas | P6 ~172 linhas');
})();
