/**
 * rastreador.js — Robô PBI v19
 * Fix P6: mais cliques por iteração + espera maior para renderização
 * Fix P6: detecta fim real da tabela via total informado no rodapé
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
    if (box) { await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.click(box.x + 10, box.y + 10); }
    else { await celula.click({ force: true }); }
    console.log('✅ Tabela focada.');
  } catch (e) {
    console.log('⚠️ Foco de emergência.'); await page.mouse.click(960, 540);
  }
}

function coletarLinhas(rawLinhas, linhasSet) {
  let novos = 0;
  rawLinhas.forEach(l => { if (!linhasSet.has(l)) { linhasSet.add(l); novos++; } });
  return novos;
}

const AVALIAR_DOM = () => {
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
};

// ─── EXTRAÇÃO P1: motor físico ────────────────────────────────────────────────
async function extrairP1(page, frame) {
  console.log('\n📋 Extraindo: P1_VENDA');
  await focarTabela(page, frame);
  const linhas = new Set();
  let semNovo = 0;
  for (let v = 0; v < 80 && semNovo < 6; v++) {
    const novos = coletarLinhas(await frame.evaluate(AVALIAR_DOM), linhas);
    if (novos > 0) { semNovo = 0; console.log('  [' + (v+1) + '] +' + novos + ' | total: ' + linhas.size); }
    else semNovo++;
    await page.mouse.wheel(0, 1000);
    await page.keyboard.press('PageDown');
    await page.keyboard.press('ArrowDown');
    await aguardar(2000);
  }
  console.log('🎯 P1_VENDA: ' + linhas.size + ' linhas.');
  return Array.from(linhas);
}

// ─── EXTRAÇÃO P6: botão scrollDown com espera longa ──────────────────────────
async function extrairP6(frame) {
  console.log('\n📋 Extraindo: P6_CORRETOR (modo botão scrollDown)');
  const linhas = new Set();
  let semNovo = 0;
  let totalEsperado = 0;

  // Tenta ler o total do rodapé da tabela (ex: "172")
  try {
    totalEsperado = await frame.evaluate(() => {
      const all = document.querySelectorAll('div[role="gridcell"], div[role="row"]');
      for (const el of all) {
        const t = (el.innerText || '').trim();
        // Rodapé tem um número isolado grande como "172"
        if (/^\d+$/.test(t) && parseInt(t) > 50) return parseInt(t);
      }
      return 0;
    });
    if (totalEsperado) console.log('  📊 Total esperado: ' + totalEsperado + ' corretores');
  } catch (_) {}

  for (let v = 0; v < 150 && semNovo < 10; v++) {
    const novos = coletarLinhas(await frame.evaluate(AVALIAR_DOM), linhas);
    if (novos > 0) {
      semNovo = 0;
      console.log('  [' + (v+1) + '] +' + novos + ' | total: ' + linhas.size + (totalEsperado ? ' / ' + totalEsperado : ''));
    } else {
      semNovo++;
    }

    // Para se já temos o total esperado
    if (totalEsperado > 0 && linhas.size >= totalEsperado) {
      console.log('  ✅ Total esperado atingido!');
      break;
    }

    // Clica no scrollDown — 10x para garantir avanço
    await frame.evaluate(() => {
      const btn = document.querySelector('button.scrollDown') ||
                  document.querySelector('.scrollDown') ||
                  document.querySelector('button[aria-label*="down" i]');
      if (btn) { for (let i = 0; i < 10; i++) btn.click(); }
    });

    // Espera mais longa para o Power BI carregar o próximo lote
    await aguardar(2500);
  }

  console.log('🎯 P6_CORRETOR: ' + linhas.size + ' linhas.');
  return Array.from(linhas);
}

// ─── NAVEGA P6 ────────────────────────────────────────────────────────────────
async function navegarP6(frame) {
  console.log('\n➡️ Navegando para P6...');
  // JS click direto — ignora visibilidade (funcionou no v18)
  try {
    const clicou = await frame.evaluate(() => {
      const btns = document.querySelectorAll('button[aria-label]');
      for (const btn of btns) {
        if (btn.getAttribute('aria-label') === 'Vendas - Dias S/ Vender') { btn.click(); return true; }
      }
      return false;
    });
    if (clicou) { console.log('✅ P6 via JS click.'); await aguardar(15000); return; }
    console.log('⚠️ Botão P6 não encontrado no DOM.');
  } catch (e) { console.log('⚠️ JS click falhou.'); }

  // Fallback: Next Page 5x
  for (let i = 1; i <= 5; i++) {
    await frame.locator('button[aria-label="Next Page"]').click({ force: true, timeout: 4000 }).catch(() => {});
    console.log('  Clique ' + i + '/5'); await aguardar(2500);
  }
  console.log('✅ Navegação via Next Page.'); await aguardar(15000);
}

// ─── PRINCIPAL ────────────────────────────────────────────────────────────────
(async () => {
  console.log('🚀 Robô PBI v19 iniciando...');

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

  console.log('\n=== P1: Relação de Vendas ===');
  const p1 = await extrairP1(page, frame);
  p1.forEach(l => baseDeDados.push([hoje, 'P1_VENDA', l]));

  await navegarP6(frame);
  try { await frame.waitForSelector('div[role="gridcell"]', { state: 'visible', timeout: 20000 }); } catch (_) {}
  await aguardar(3000);

  console.log('\n=== P6: Dias Sem Vender ===');
  const p6 = await extrairP6(frame);
  p6.forEach(l => baseDeDados.push([hoje, 'P6_CORRETOR', l]));

  console.log('\n📤 Enviando ' + baseDeDados.length + ' linhas...');
  try {
    const resp = await fetch(WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseDeDados),
    });
    console.log('🎯 GAS:', await resp.text());
  } catch (e) { console.log('❌ Envio falhou:', e.message); }

  await browser.close();
  console.log('\n✅ Concluído. P1: ' + p1.length + ' | P6: ' + p6.length + ' | Total: ' + baseDeDados.length);
  console.log('   Meta: P1 ~180 | P6 ~172');
})();
