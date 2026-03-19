/**
 * rastreador.js — Robô PBI v17
 * Fix: filtra "Additional Conditional Formatting" que o Power BI injeta
 *      como primeira célula em linhas com formatação condicional.
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
      console.log('✅ Tabela focada.');
    } else {
      await celula.click({ force: true });
    }
  } catch (e) {
    console.log('⚠️ Clique de emergência no centro da tela.');
    await page.mouse.click(960, 540);
  }
}

async function extrairTabela(page, frame, nomeTabela, maxSemNovo = 6) {
  console.log(`\n📋 Extraindo: ${nomeTabela}`);
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

        if (celulas.length < 2) return;

        // ── FIX PRINCIPAL ──
        // O Power BI injeta "N Additional Conditional Formatting" como primeira célula
        // em linhas com formatação condicional. Detectamos e removemos esse prefixo.
        if (/Additional Conditional Formatting/i.test(celulas[0])) {
          celulas.shift(); // remove a primeira célula espúria
        }

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

    await page.mouse.wheel(0, 1000);
    await page.keyboard.press('PageDown');
    await page.keyboard.press('ArrowDown');
    await aguardar(2000);
  }

  console.log(`🎯 ${nomeTabela}: ${linhas.size} linhas.`);
  return Array.from(linhas);
}

async function navegarP6(page, frame) {
  console.log('\n➡️ Navegando para P6...');

  try {
    await frame.evaluate(() => {
      document.querySelectorAll('.sections-container, .sectionsList, nav[role]').forEach(el => {
        el.scrollLeft += 1000;
      });
    });
    await aguardar(1000);
    await frame.locator('button[aria-label="Vendas - Dias S/ Vender"]').click({ timeout: 6000 });
    console.log('✅ P6 via aba direta.');
    await aguardar(15000);
    return;
  } catch (e) {
    console.log('⚠️ Aba direta falhou. Usando Next Page...');
  }

  for (let i = 1; i <= 5; i++) {
    await frame.locator('button[aria-label="Next Page"]').click({ force: true, timeout: 4000 }).catch(() => {});
    console.log(`  Clique ${i}/5`);
    await aguardar(2500);
  }
  console.log('✅ Navegação concluída. Aguardando P6...');
  await aguardar(15000);

  // Foca na tabela da P6 (fix do problema de scroll preso na barra de navegação)
  await page.mouse.move(960, 500);
  await page.mouse.click(960, 500);
  await aguardar(1000);
}

(async () => {
  console.log('🚀 Robô PBI v17 iniciando...');

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
  const p1 = await extrairTabela(page, frame, 'P1_VENDA');
  p1.forEach(l => baseDeDados.push([hoje, 'P1_VENDA', l]));

  await navegarP6(page, frame);

  console.log('\n=== P6: Dias Sem Vender ===');
  const p6 = await extrairTabela(page, frame, 'P6_CORRETOR', 8);
  p6.forEach(l => baseDeDados.push([hoje, 'P6_CORRETOR', l]));

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
})();
