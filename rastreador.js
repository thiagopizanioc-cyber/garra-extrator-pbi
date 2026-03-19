/**
 * rastreador.js — Robô PBI v24
 * P1: detecção dinâmica da posição (v22 — extraía 205 linhas)
 * P6: scrollTop direto no mid-viewport (v23 — extraiu 172 linhas ✅)
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

const LER_DOM = () => {
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

// ─── P1: wheel com posição dinâmica (v22 que extraiu 205 linhas) ──────────────
async function extrairP1(page, frame) {
  console.log('\n📋 Extraindo: P1_VENDA');

  // Foca na tabela
  try {
    await frame.waitForSelector('div[role="gridcell"]', { state: 'visible', timeout: 20000 });
    const celula = frame.locator('div[role="gridcell"]').last();
    const box = await celula.boundingBox();
    if (box) { await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.click(box.x + 10, box.y + 10); }
    else { await celula.click({ force: true }); }
  } catch (_) { await page.mouse.click(960, 540); }
  console.log('✅ Tabela focada.');

  // Detecta posição real da tabela
  const pos = await frame.evaluate(() => {
    const cells = document.querySelectorAll('div[role="gridcell"]');
    if (cells.length > 5) {
      const r = cells[Math.floor(cells.length / 2)].getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }
    return { x: 1100, y: 500 };
  });
  console.log('  📍 Posição tabela P1: x=' + pos.x + ', y=' + pos.y);

  const linhas = new Set();
  let semNovo = 0;

  for (let v = 0; v < 80 && semNovo < 6; v++) {
    const batch = await frame.evaluate(LER_DOM);
    let novos = 0;
    batch.forEach(l => { if (!linhas.has(l)) { linhas.add(l); novos++; } });
    if (novos > 0) { semNovo = 0; console.log('  [' + (v+1) + '] +' + novos + ' | total: ' + linhas.size); }
    else semNovo++;

    await page.mouse.move(pos.x, pos.y);
    await page.mouse.wheel(0, 800);
    await aguardar(2000);
  }

  console.log('🎯 P1_VENDA: ' + linhas.size + ' linhas.');
  return Array.from(linhas);
}

// ─── P6: scrollTop direto no mid-viewport (v23 que extraiu 172 linhas ✅) ─────
async function extrairP6(frame) {
  console.log('\n📋 Extraindo: P6_CORRETOR (scrollTop direto)');

  // Fecha navFlyout se estiver aberto
  await frame.evaluate(() => { document.body.click(); });
  await aguardar(500);

  const linhas = new Set();
  let semNovo = 0;
  let scrollAtual = 0;
  const STEP = 200;

  const maxScroll = await frame.evaluate(() => {
    const el = document.querySelector('div.mid-viewport');
    return el ? el.scrollHeight - el.clientHeight : 2400;
  });
  console.log('  📐 Scroll máximo: ' + maxScroll + 'px');

  for (let v = 0; v < 200 && semNovo < 12; v++) {
    const batch = await frame.evaluate(LER_DOM);
    let novos = 0;
    batch.forEach(l => { if (!linhas.has(l)) { linhas.add(l); novos++; } });

    if (novos > 0) {
      semNovo = 0;
      console.log('  [' + (v+1) + '] +' + novos + ' | total: ' + linhas.size + ' | scroll: ' + scrollAtual + 'px');
    } else {
      semNovo++;
    }

    if (scrollAtual >= maxScroll) {
      console.log('  ✅ Fim do scroll atingido.');
      break;
    }

    scrollAtual += STEP;
    await frame.evaluate((top) => {
      const el = document.querySelector('div.mid-viewport');
      if (el) el.scrollTop = top;
    }, scrollAtual);

    await aguardar(1800);
  }

  console.log('🎯 P6_CORRETOR: ' + linhas.size + ' linhas.');
  return Array.from(linhas);
}

// ─── Navega P6 ────────────────────────────────────────────────────────────────
async function navegarP6(frame) {
  console.log('\n➡️ Navegando para P6...');
  const clicou = await frame.evaluate(() => {
    for (const btn of document.querySelectorAll('button[aria-label]')) {
      if (btn.getAttribute('aria-label') === 'Vendas - Dias S/ Vender') { btn.click(); return true; }
    }
    return false;
  }).catch(() => false);

  if (clicou) { console.log('✅ P6 via JS click.'); await aguardar(15000); return; }

  for (let i = 1; i <= 5; i++) {
    await frame.locator('button[aria-label="Next Page"]').click({ force: true, timeout: 4000 }).catch(() => {});
    console.log('  Clique ' + i + '/5'); await aguardar(2500);
  }
  console.log('✅ Next Page concluído.'); await aguardar(15000);
}

// ─── Principal ────────────────────────────────────────────────────────────────
(async () => {
  console.log('🚀 Robô PBI v24 iniciando...');

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
        if (['Sum(BD.VLRVENDA)', 'Sum(BD.Entrada Final)', 'Sum(BD.ENTRADA PAGA)', 'BD.Última Atualização']
            .some(a => nomes.includes(a))) {
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
