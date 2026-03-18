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

// ========================================================================
// MOTOR FÍSICO COM MIRA A LASER (FOCA EXATAMENTE NA TABELA)
// ========================================================================
async function extrairTabelaFisica(page, frame, nomeTabela) {
  console.log(`\n📋 Iniciando Extração Física: ${nomeTabela}`);
  const linhas = new Set();
  let tentativasSemNovoDado = 0;

  try {
    // A GRANDE MUDANÇA: Procura exclusivamente células que estejam DENTRO do corpo de uma tabela
    const celulaAlvo = frame.locator('div.bodyCells div[role="gridcell"]').first();
    const box = await celulaAlvo.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 10, box.y + 10);
      await page.mouse.click(box.x + 10, box.y + 10);
      console.log('✅ Tabela real focada fisicamente pelo mouse.');
    } else {
      await celulaAlvo.click({ force: true });
    }
  } catch (e) {
    console.log('⚠️ Aviso: Tentando clicar genéricamente na tela...');
    await page.mouse.click(960, 540); // Clica no centro da tela como último recurso
  }

  // Loop de Descida (PageDown)
  for (let volta = 0; volta < 40 && tentativasSemNovoDado < 4; volta++) {
    const linhasNaTela = await frame.evaluate(() => {
      const resultado = [];
      document.querySelectorAll('div[role="row"]').forEach(row => {
        const celulas = [];
        row.querySelectorAll('div[role="gridcell"], div[role="columnheader"]').forEach(c => {
          const texto = (c.getAttribute('title') || c.innerText || '').trim().replace(/\n/g, ' ');
          if (texto && texto !== 'Select Row' && !texto.includes('Row Selection')) celulas.push(texto);
        });
        if (celulas.length >= 2) resultado.push(celulas.join(' | '));
      });
      return resultado;
    });

    let novosNestaVolta = 0;
    linhasNaTela.forEach(linha => { 
      if (!linhas.has(linha)) { linhas.add(linha); novosNestaVolta++; } 
    });
    
    if (novosNestaVolta > 0) {
      tentativasSemNovoDado = 0;
      console.log(`  [Descida ${volta+1}] +${novosNestaVolta} novas | Total: ${linhas.size}`);
    } else {
      tentativasSemNovoDado++;
    }

    // A marretada física
    await page.mouse.wheel(0, 1000);
    await page.keyboard.press('PageDown');
    await page.keyboard.press('ArrowDown');
    await aguardar(1800); 
  }
  console.log(`🎯 ${nomeTabela}: ${linhas.size} linhas extraídas.`);
  return Array.from(linhas);
}

// ========================================================================
// NAVEGAÇÃO COMPROVADA (CÓDIGO DO AUXILIAR)
// ========================================================================
async function navegarP6(frame) {
  console.log('\n➡️ Navegando para P6...');
  try {
    await frame.evaluate(() => {
      document.querySelectorAll('.sections-container, .sectionsList').forEach(el => el.scrollLeft += 1000);
    });
    await aguardar(1000);
    const aba = frame.locator('button[aria-label="Vendas - Dias S/ Vender"]');
    await aba.click({ timeout: 4000 });
    console.log('✅ P6 acessada via aba direta');
    await aguardar(12000);
  } catch(e) {
    console.log('⚠️ Aba direta falhou, ativando Next Page (5 cliques)...');
    // SELETOR CORRIGIDO QUE FUNCIONA NO SEU PAINEL:
    for(let i=1; i<=5; i++) {
      await frame.locator('button[title="Next Page"], button.navRight').click({ force: true });
      console.log(`  Clique ${i}/5`);
      await aguardar(2500);
    }
    console.log('✅ P6 acessada via Next Page');
    await aguardar(12000);
  }
}

// ========================================================================
// ORQUESTRAÇÃO PRINCIPAL
// ========================================================================
(async () => {
  console.log('🚀 Robô PBI v13 (Navegação Precisa + Motor Físico) iniciando...');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 1920, height: 1080 } }).then(ctx => ctx.newPage());
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
  await aguardar(15000); 
  const frame = await encontrarFrame(page);

  // 1. EXTRAI VENDAS (P1)
  const p1 = await extrairTabelaFisica(page, frame, 'P1_VENDA');
  p1.forEach(l => baseDeDados.push([hoje, 'P1_VENDA', l]));

  // 2. NAVEGA PARA P6
  await navegarP6(frame);

  // 3. EXTRAI CORRETORES (P6)
  const p6 = await extrairTabelaFisica(page, frame, 'P6_CORRETOR');
  p6.forEach(l => baseDeDados.push([hoje, 'P6_CORRETOR', l]));

  // 4. ENVIA PARA A PLANILHA
  console.log('\n📤 Enviando pacote final para o Google Sheets...');
  try {
    const resp = await fetch(WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseDeDados),
    });
    console.log('🎯 Servidor Google Respondeu:', await resp.text());
  } catch (e) {
    console.log('❌ Falha na transmissão:', e.message);
  }

  await browser.close();
})();
