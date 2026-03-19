/**
 * rastreador.js — Robô PBI v18
 * Fix P6:
 *  1. Navegação: click via JS evaluate (ignora visibilidade)
 *  2. Scroll: clica em button.scrollDown repetidamente (confirmado no diagnóstico)
 */
const { chromium } = require('playwright');

const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbx90wUuh6OqPQ9OYU_md0VVZ1AMq-GqaA_R1AzoTAKDqDFMobL5ajDwJg-EIAIiBX1xCQ/exec';
const URL_PBI     = 'https://construtora-metrocasa.github.io/central/lisboa/Diretoria-Garra-385.html';
const aguardar    = ms => new Promise(r => setTimeout(r, ms));

async function encontrarFrame(page) {
  for (let i = 0; i < 20; i++) {
    const f = page.frames().find(f => f.url().includes('powerbi') || f.url().includes('app.powerbi'));
    if (f) { console.log('✅ Frame PBI localizado.'); return f; }
    await aguardar(1500);
  }
  return page.mainFrame();
}

async function focarTabela(page, frame) {
  try {
    await frame.waitForSelector('div[role="gridcell"]', { state: 'visible', timeout: 20000 });
    const celula = frame.locator('div[role="gridcell"]').last();
    const box = await celula.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 10, box.y + 10);
      await page.mouse.click(box.x + 10, box.y + 10);
    } else {
      await celula.click({ force: true });
    }
    console.log('✅ Tabela focada.');
  } catch (e) {
    console.log('⚠️ Foco de emergência.');
    await page.mouse.click(960, 540);
  }
}

// ─── EXTRAÇÃO P1: motor físico (mouse.wheel + keyboard) ──────────────────────
async function extrairTabelaFisica(page, frame, nomeTabela, maxSemNovo) {
  console.log('\n📋 Extraindo: ' + nomeTabela);
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
        if (celulas.length > 0 && /Additional Conditional/i.test(celulas[0])) celulas.shift();
        if (celulas.length >= 2) resultado.push(celulas.join(' | '));
      });
      return resultado;
    });

    let novosNesta = 0;
    novas.forEach(l => { if (!linhas.has(l)) { linhas.add(l); novosNesta++; } });
    if (novosNesta > 0) { semNovo = 0; console.log('  [' + (volta+1) + '] +' + novosNesta + ' | total: ' + linhas.size); }
    else semNovo++;

    await page.mouse.wheel(0, 1000);
    await page.keyboard.press('PageDown');
    await page.keyboard.press('ArrowDown');
    await aguardar(2000);
  }

  console.log('🎯 ' + nomeTabela + ': ' + linhas.size + ' linhas.');
  return Array.from(linhas);
}

// ─── EXTRAÇÃO P6: clica em button.scrollDown (confirmado no diagnóstico) ──────
async function extrairTabelaBotoes(frame, nomeTabela, maxSemNovo) {
  console.log('\n📋 Extraindo: ' + nomeTabela + ' (modo botões de scroll)');

  const linhas = new Set();
  let semNovo = 0;

  for (let volta = 0; volta < 100 && semNovo < maxSemNovo; volta++) {
    const novas = await frame.evaluate(() => {
      const resultado = [];
      document.querySelectorAll('div[role="row"]').forEach(row => {
        const celulas = [];
        row.querySelectorAll('div[role="gridcell"], div[role="columnheader"]').forEach(c => {
          const t = (c.getAttribute('title') || c.innerText || '').trim().replace(/\n/g, ' ');
          if (t && t !== 'Select Row' && !t.includes('Row Selection')) celulas.push(t);
        });
        if (celulas.length > 0 && /Additional Conditional/i.test(celulas[0])) celulas.shift();
        if (celulas.length >= 2) resultado.push(celulas.join(' | '));
      });
      return resultado;
    });

    let novosNesta = 0;
    novas.forEach(l => { if (!linhas.has(l)) { linhas.add(l); novosNesta++; } });
    if (novosNesta > 0) { semNovo = 0; console.log('  [' + (volta+1) + '] +' + novosNesta + ' | total: ' + linhas.size); }
    else semNovo++;

    // Clica 5x no botão scrollDown — método confirmado pelo diagnóstico
    const clicou = await frame.evaluate(() => {
      const btn = document.querySelector('button.scrollDown:not(.visually-hidden), .scrollDown');
      if (btn) { btn.click(); btn.click(); btn.click(); btn.click(); btn.click(); return true; }
      // Fallback: busca por aria-label
      const btnAlt = document.querySelector('button[aria-label*="Scroll down"], button[aria-label*="scroll down"]');
      if (btnAlt) { btnAlt.click(); btnAlt.click(); btnAlt.click(); return true; }
      return false;
    });

    if (!clicou && semNovo > 2) {
      console.log('  ⚠️ Botão scrollDown não encontrado.');
      break;
    }

    await aguardar(1500);
  }

  console.log('🎯 ' + nomeTabela + ': ' + linhas.size + ' linhas.');
  return Array.from(linhas);
}

// ─── NAVEGA P6 ────────────────────────────────────────────────────────────────
async function navegarP6(frame) {
  console.log('\n➡️ Navegando para P6...');

  // Estratégia 1: clique via JS (ignora visibilidade — resolve o timeout)
  try {
    const clicou = await frame.evaluate(() => {
      const btns = document.querySelectorAll('button[aria-label]');
      for (const btn of btns) {
        if (btn.getAttribute('aria-label') === 'Vendas - Dias S/ Vender') {
          btn.click();
          return true;
        }
      }
      return false;
    });
    if (clicou) {
      console.log('✅ P6 via JS click (ignorou visibilidade).');
      await aguardar(15000);
      return;
    }
    console.log('⚠️ Botão P6 não encontrado no DOM.');
  } catch (e) {
    console.log('⚠️ JS click falhou:', e.message.split('\n')[0]);
  }

  // Estratégia 2: Next Page 5x
  console.log('   Tentando Next Page 5x...');
  for (let i = 1; i <= 5; i++) {
    await frame.locator('button[aria-label="Next Page"]').click({ force: true, timeout: 4000 }).catch(() => {});
    console.log('  Clique ' + i + '/5');
    await aguardar(2500);
  }
  console.log('✅ Navegação via Next Page concluída.');
  await aguardar(15000);
}

// ─── PRINCIPAL ────────────────────────────────────────────────────────────────
(async () => {
  console.log('🚀 Robô PBI v18 iniciando...');

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

  // P1 — motor físico (funciona bem, 179 linhas)
  console.log('\n=== P1: Relação de Vendas ===');
  const p1 = await extrairTabelaFisica(page, frame, 'P1_VENDA', 6);
  p1.forEach(l => baseDeDados.push([hoje, 'P1_VENDA', l]));

  // Navega P6
  await navegarP6(frame);

  // Espera tabela da P6 carregar
  try {
    await frame.waitForSelector('div[role="gridcell"]', { state: 'visible', timeout: 20000 });
  } catch (_) {}
  await aguardar(3000);

  // P6 — motor de botões (confirmado pelo diagnóstico)
  console.log('\n=== P6: Dias Sem Vender ===');
  const p6 = await extrairTabelaBotoes(frame, 'P6_CORRETOR', 8);
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
  console.log('   Meta: P1 ~179 | P6 ~172');
})();
