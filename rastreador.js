/**
 * rastreador.js — Robô PBI v21
 *
 * P1: volta ao motor do v18 (sem bug de dupla chamada)
 * P6: mecanismo do v18 que extraiu 60 linhas + hover antes de clicar
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

// Coleta linhas do DOM — uma única chamada por iteração
function coletarNovas(linhas, batch) {
  let novos = 0;
  for (const l of batch) {
    if (!linhas.has(l)) { linhas.add(l); novos++; }
  }
  return novos;
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

// ─── P1: motor físico — mouse.wheel + teclado ─────────────────────────────────
async function extrairP1(page, frame) {
  console.log('\n📋 Extraindo: P1_VENDA');
  await focarTabela(page, frame);

  const linhas = new Set();
  let semNovo = 0;

  for (let v = 0; v < 80 && semNovo < 6; v++) {
    const novos = coletarNovas(linhas, await frame.evaluate(LER_DOM));

    if (novos > 0) {
      semNovo = 0;
      console.log('  [' + (v+1) + '] +' + novos + ' | total: ' + linhas.size);
    } else {
      semNovo++;
    }

    await page.mouse.wheel(0, 1000);
    await page.keyboard.press('PageDown');
    await page.keyboard.press('ArrowDown');
    await aguardar(2000);
  }

  console.log('🎯 P1_VENDA: ' + linhas.size + ' linhas.');
  return Array.from(linhas);
}

// ─── P6: hover + scrollDown ───────────────────────────────────────────────────
async function extrairP6(page, frame) {
  console.log('\n📋 Extraindo: P6_CORRETOR');

  // Encontra posição central da tabela para manter hover
  const pos = await frame.evaluate(() => {
    const rows = document.querySelectorAll('div[role="row"]');
    if (rows.length > 0) {
      const r = rows[Math.floor(rows.length / 2)].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return { x: 640, y: 500 };
  });

  const linhas = new Set();
  let semNovo = 0;

  for (let v = 0; v < 150 && semNovo < 12; v++) {
    const novos = coletarNovas(linhas, await frame.evaluate(LER_DOM));

    if (novos > 0) {
      semNovo = 0;
      console.log('  [' + (v+1) + '] +' + novos + ' | total: ' + linhas.size);
    } else {
      semNovo++;
    }

    // Mantém mouse sobre a tabela para que scrollDown fique visível
    await page.mouse.move(pos.x, pos.y);
    await aguardar(200);

    // Clica no scrollDown 8x
    await frame.evaluate(() => {
      const sels = ['button.scrollDown', '.scrollDown', 'button[aria-label="Scroll down"]'];
      for (const s of sels) {
        const btn = document.querySelector(s);
        if (btn) { for (let i = 0; i < 8; i++) btn.click(); return; }
      }
    });

    await aguardar(2500);
  }

  console.log('🎯 P6_CORRETOR: ' + linhas.size + ' linhas.');
  return Array.from(linhas);
}

// ─── NAVEGA P6 ────────────────────────────────────────────────────────────────
async function navegarP6(frame) {
  console.log('\n➡️ Navegando para P6...');

  // JS click direto — ignora visibilidade (funcionou no v18/v19/v20)
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

  // Fallback: Next Page 5x
  console.log('⚠️ JS click não encontrou botão. Usando Next Page...');
  for (let i = 1; i <= 5; i++) {
    await frame.locator('button[aria-label="Next Page"]').click({ force: true, timeout: 4000 }).catch(() => {});
    console.log('  Clique ' + i + '/5');
    await aguardar(2500);
  }
  console.log('✅ Navegação via Next Page.');
  await aguardar(15000);
}

// ─── PRINCIPAL ────────────────────────────────────────────────────────────────
(async () => {
  console.log('🚀 Robô PBI v21 iniciando...');

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
  const p6 = await extrairP6(page, frame);
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
  console.log('   Meta: P1 ~180 | P6 ~172');
})();
