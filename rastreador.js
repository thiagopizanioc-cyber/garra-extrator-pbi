/**
 * rastreador.js — Robô Power BI v9
 * Mudanças vs v8:
 *  1. P1: scroll mais agressivo — aumenta tentativas sem novo dado de 5 para 12
 *     e tenta 3 estratégias diferentes de scroll no mesmo container
 *  2. P6 aba: tenta scrollar a barra de navegação para tornar o botão visível
 *     antes de clicar, resolvendo "Element is not visible"
 */
const { chromium } = require('playwright');

const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbx90wUuh6OqPQ9OYU_md0VVZ1AMq-GqaA_R1AzoTAKDqDFMobL5ajDwJg-EIAIiBX1xCQ/exec';
const URL_PBI     = 'https://construtora-metrocasa.github.io/central/lisboa/Diretoria-Garra-385.html';
const aguardar    = ms => new Promise(r => setTimeout(r, ms));

async function encontrarFrame(page) {
  for (let i = 0; i < 20; i++) {
    const f = page.frames().find(f => f.url().includes('powerbi') || f.url().includes('app.powerbi'));
    if (f) { console.log('✅ Frame PBI:', f.url().substring(0, 60)); return f; }
    await aguardar(1500);
  }
  return page.mainFrame();
}

async function aguardarTabela(frame, minLinhas = 5, maxMs = 25000) {
  const inicio = Date.now();
  while (Date.now() - inicio < maxMs) {
    const n = await frame.evaluate(() =>
      document.querySelectorAll('.scrollRegion span, div[role="gridcell"]').length
    );
    if (n >= minLinhas) return true;
    await aguardar(1000);
  }
  return false;
}

// ─── EXTRAÇÃO — semNovo aumentado para 12 (antes era 5) ──────────────────────
async function extrairTabela(frame, nomeTabela) {
  console.log('\n📋 Extraindo: ' + nomeTabela);
  const linhas = new Set();
  let semNovo = 0;

  for (let volta = 0; volta < 120 && semNovo < 12; volta++) {
    const novas = await frame.evaluate(() => {
      const resultado = [];
      const textos = [];

      document.querySelectorAll(
        '.scrollRegion span, .scrollRegion div.cell, div[role="gridcell"], div[role="columnheader"]'
      ).forEach(el => {
        const t = (el.getAttribute('title') || el.innerText || '').trim().replace(/\n/g, ' ');
        if (t && t.length > 0 && t !== 'Select Row' && t !== 'Row Selection'
            && !t.startsWith('Scroll')) textos.push(t);
      });

      // Blocos de 5: VENDEDOR|GERENTE|SUPERINT|EMPREEND|ESTÁGIO
      for (let i = 0; i <= textos.length - 5; i++) {
        const ultimo = (textos[i + 4] || '').toUpperCase();
        if (ultimo.includes('VENDA') || ultimo.includes('PRÉ') || ultimo.includes('PRE')
            || ultimo.includes('PROPOSTA') || ultimo.includes('ESTEIRA')) {
          resultado.push(textos.slice(i, i + 5).join(' | '));
          i += 4;
        }
      }

      // Fallback div[role="row"]
      if (resultado.length === 0) {
        document.querySelectorAll('div[role="row"]').forEach(row => {
          const cells = [];
          row.querySelectorAll('div[role="gridcell"], div[role="columnheader"]').forEach(c => {
            const t = (c.getAttribute('title') || c.innerText || '').trim();
            if (t) cells.push(t);
          });
          if (cells.length >= 3) resultado.push(cells.join(' | '));
        });
      }

      return resultado;
    });

    let novosNesta = 0;
    novas.forEach(l => { if (!linhas.has(l)) { linhas.add(l); novosNesta++; } });
    if (novosNesta > 0) {
      semNovo = 0;
      console.log('  +' + novosNesta + ' novas | total: ' + linhas.size);
    } else {
      semNovo++;
    }

    // 3 estratégias de scroll em cascata no mesmo container
    await frame.evaluate(() => {
      const containers = [
        ...document.querySelectorAll('.scrollRegion'),
        ...document.querySelectorAll('.scroll-content'),
        ...document.querySelectorAll('div[class*="scrollWrapper"]'),
      ];
      containers.forEach(c => {
        c.scrollTop += 350;
        c.scrollBy(0, 350);
        c.dispatchEvent(new WheelEvent('wheel', { deltaY: 350, bubbles: true }));
      });
      // Também scrolla o documento inteiro (fallback)
      window.scrollBy(0, 350);
    });

    await aguardar(800);
  }

  console.log('✅ ' + nomeTabela + ': ' + linhas.size + ' linhas');
  return Array.from(linhas);
}

// ─── NAVEGA P6 — resolve "Element is not visible" ────────────────────────────
async function navegarP6(frame) {
  console.log('\n➡️ Navegando para P6...');

  // FIX: scrollar a barra de abas para expor o botão antes de clicar
  // O botão existe mas está fora da área visível da barra de navegação
  try {
    await frame.evaluate(() => {
      // Scrolla a barra de abas para a direita para expor a última aba
      document.querySelectorAll('.sections-container, .sectionsList, nav[role]').forEach(el => {
        el.scrollLeft += 800;
      });
    });
    await aguardar(1000);

    await frame.locator('button[aria-label="Vendas - Dias S/ Vender"]')
      .scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await aguardar(500);

    await frame.locator('button[aria-label="Vendas - Dias S/ Vender"]')
      .click({ force: true, timeout: 6000 });
    console.log('✅ P6 via aba direta (com scroll)');
    await aguardar(15000);
    return true;
  } catch (e) {
    console.log('⚠️ Aba direta falhou: ' + e.message.split('\n')[0]);
  }

  // Fallback: Next Page 5x (funciona conforme log do v8)
  try {
    for (let i = 0; i < 5; i++) {
      await frame.locator('button[aria-label="Next Page"]').click({ force: true, timeout: 4000 });
      await aguardar(2500);
      console.log('  Clique ' + (i+1) + '/5');
    }
    console.log('✅ P6 via Next Page');
    await aguardar(12000);
    return true;
  } catch (e) {
    console.log('⚠️ Next Page falhou: ' + e.message.split('\n')[0]);
  }

  return false;
}

// ─── PRINCIPAL ────────────────────────────────────────────────────────────────
(async () => {
  console.log('🚀 Robô PBI v9 iniciando...');

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

  page.on('response', async (response) => {
    if (!response.url().includes('querydata')) return;
    try {
      const json = JSON.parse(await response.text());
      for (const res of (json.results || [])) {
        const descriptor = res.result?.data?.descriptor?.Select || [];
        if (!descriptor.length) continue;
        const names = descriptor.map(d => d.Name).join(' | ');
        const KPIs = ['Sum(BD.VLRVENDA)', 'Sum(BD.Entrada Final)', 'Sum(BD.ENTRADA PAGA)', 'BD.Última Atualização'];
        if (KPIs.some(k => names.includes(k))) {
          baseDeDados.push([hoje, names, JSON.stringify(res.result?.data?.dsr || '').substring(0, 45000)]);
          console.log('📡 KPI: ' + names.substring(0, 60));
        }
      }
    } catch (_) {}
  });

  console.log('🌐 Acessando dashboard...');
  await page.goto(URL_PBI, { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('⏳ Aguardando PBI renderizar...');
  try { await page.waitForSelector('iframe', { timeout: 35000 }); } catch (_) {}
  await aguardar(12000);

  const frame = await encontrarFrame(page);
  await aguardarTabela(frame);

  // P1
  console.log('\n=== P1: Relação de Vendas ===');
  const p1 = await extrairTabela(frame, 'P1_VENDA');
  p1.forEach(l => baseDeDados.push([hoje, 'P1_VENDA', l]));

  // P6
  await navegarP6(frame);
  await aguardarTabela(frame, 3, 20000);
  console.log('\n=== P6: Dias Sem Vender ===');
  const p6 = await extrairTabela(frame, 'P6_CORRETOR');
  p6.forEach(l => baseDeDados.push([hoje, 'P6_CORRETOR', l]));

  console.log('\n📤 Enviando ' + baseDeDados.length + ' linhas...');
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
  console.log('\n✅ Concluído. P1: ' + p1.length + ' | P6: ' + p6.length + ' | Total: ' + baseDeDados.length);
})();
