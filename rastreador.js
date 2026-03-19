/**
 * rastreador.js — Robô PBI v22
 * Fix P6: mouse.wheel posicionado DENTRO da tabela (x=620, y=580)
 * O scrollDown em (73,548) era da barra lateral, não da tabela.
 * mouse.wheel na posição correta funciona igual ao P1.
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

// ─── Extração genérica: mouse.wheel na posição x,y ───────────────────────────
async function extrairComWheel(page, frame, nomeTabela, mouseX, mouseY, maxSemNovo) {
  console.log('\n📋 Extraindo: ' + nomeTabela + ' (wheel em x=' + mouseX + ', y=' + mouseY + ')');

  // Posiciona o mouse e clica uma vez para garantir foco
  await page.mouse.move(mouseX, mouseY);
  await page.mouse.click(mouseX, mouseY);
  await aguardar(500);

  const linhas = new Set();
  let semNovo = 0;

  for (let v = 0; v < 120 && semNovo < maxSemNovo; v++) {
    const batch = await frame.evaluate(LER_DOM);
    let novos = 0;
    batch.forEach(l => { if (!linhas.has(l)) { linhas.add(l); novos++; } });

    if (novos > 0) {
      semNovo = 0;
      console.log('  [' + (v+1) + '] +' + novos + ' | total: ' + linhas.size);
    } else {
      semNovo++;
    }

    // Wheel com mouse dentro da tabela
    await page.mouse.move(mouseX, mouseY);
    await page.mouse.wheel(0, 800);
    await aguardar(2000);
  }

  console.log('🎯 ' + nomeTabela + ': ' + linhas.size + ' linhas.');
  return Array.from(linhas);
}

// ─── Navega P6 ────────────────────────────────────────────────────────────────
async function navegarP6(frame) {
  console.log('\n➡️ Navegando para P6...');

  const clicou = await frame.evaluate(() => {
    for (const btn of document.querySelectorAll('button[aria-label]')) {
      if (btn.getAttribute('aria-label') === 'Vendas - Dias S/ Vender') {
        btn.click(); return true;
      }
    }
    return false;
  }).catch(() => false);

  if (clicou) {
    console.log('✅ P6 via JS click.');
    await aguardar(15000);
    return;
  }

  console.log('⚠️ JS click não encontrou. Usando Next Page...');
  for (let i = 1; i <= 5; i++) {
    await frame.locator('button[aria-label="Next Page"]').click({ force: true, timeout: 4000 }).catch(() => {});
    console.log('  Clique ' + i + '/5');
    await aguardar(2500);
  }
  console.log('✅ Next Page concluído.');
  await aguardar(15000);
}

// ─── Principal ────────────────────────────────────────────────────────────────
(async () => {
  console.log('🚀 Robô PBI v22 iniciando...');

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

  // P1 — tabela fica no lado direito da tela, aproximadamente x=1100, y=500
  console.log('\n=== P1: Relação de Vendas ===');
  await focarTabela(page, frame);
  const p1BoundingBox = await frame.evaluate(() => {
    const rows = document.querySelectorAll('div[role="gridcell"]');
    if (rows.length > 5) {
      const r = rows[Math.floor(rows.length / 2)].getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }
    return { x: 1100, y: 500 };
  });
  console.log('  📍 Posição tabela P1: x=' + p1BoundingBox.x + ', y=' + p1BoundingBox.y);
  const p1 = await extrairComWheel(page, frame, 'P1_VENDA', p1BoundingBox.x, p1BoundingBox.y, 6);
  p1.forEach(l => baseDeDados.push([hoje, 'P1_VENDA', l]));

  // P6
  await navegarP6(frame);
  try { await frame.waitForSelector('div[role="gridcell"]', { state: 'visible', timeout: 20000 }); } catch (_) {}
  await aguardar(3000);

  // Encontra posição real da tabela na P6
  const p6BoundingBox = await frame.evaluate(() => {
    const rows = document.querySelectorAll('div[role="gridcell"]');
    if (rows.length > 5) {
      const r = rows[Math.floor(rows.length / 2)].getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }
    return { x: 620, y: 580 };
  });
  console.log('\n=== P6: Dias Sem Vender ===');
  console.log('  📍 Posição tabela P6: x=' + p6BoundingBox.x + ', y=' + p6BoundingBox.y);
  const p6 = await extrairComWheel(page, frame, 'P6_CORRETOR', p6BoundingBox.x, p6BoundingBox.y, 10);
  p6.forEach(l => baseDeDados.push([hoje, 'P6_CORRETOR', l]));

  console.log('\n📤 Enviando ' + baseDeDados.length + ' linhas...');
  try {
    const resp = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseDeDados),
    });
    console.log('🎯 GAS:', await resp.text());
  } catch (e) { console.log('❌ Envio falhou:', e.message); }

  await browser.close();
  console.log('\n✅ Concluído. P1: ' + p1.length + ' | P6: ' + p6.length + ' | Total: ' + baseDeDados.length);
  console.log('   Meta: P1 ~180 | P6 ~170');
})();
