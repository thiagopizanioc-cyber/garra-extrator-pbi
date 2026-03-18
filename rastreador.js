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
// MOTOR FÍSICO DE EXTRAÇÃO (USADO NA P1 E NA P6)
// ========================================================================
async function extrairTabelaFisica(page, frame, nomeTabela) {
  console.log(`\n📋 Iniciando Extração Física: ${nomeTabela}`);
  const linhas = new Set();
  let tentativasSemNovoDado = 0;

  // 1. MIRA E FOCO (Encontra a tabela na tela e clica nela)
  try {
    // Pega a última célula de dados visível (que sempre pertence à tabela principal)
    const celulaAlvo = frame.locator('div[role="gridcell"], div[role="row"]').last();
    
    // Pega as coordenadas X e Y na tela
    const box = await celulaAlvo.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 10, box.y + 10); // Move o ponteiro do mouse para cima da tabela
      await page.mouse.click(box.x + 10, box.y + 10); // Clica para ativar o foco do teclado
      console.log('✅ Tabela focada fisicamente pelo mouse.');
    } else {
      await celulaAlvo.click({ force: true });
    }
  } catch (e) {
    console.log('⚠️ Aviso: Foco físico falhou, tentando forçar via código...');
  }

  // 2. LOOP DE DESCIDA BRUTA (PageDown e Mouse Wheel)
  for (let volta = 0; volta < 40 && tentativasSemNovoDado < 4; volta++) {
    
    // Fotografa a tela atual e extrai os textos
    const linhasNaTela = await frame.evaluate(() => {
      const resultado = [];
      document.querySelectorAll('div[role="row"]').forEach(row => {
        const celulas = [];
        row.querySelectorAll('div[role="gridcell"], div[role="columnheader"]').forEach(c => {
          const texto = (c.getAttribute('title') || c.innerText || '').trim().replace(/\n/g, ' ');
          // Limpa lixo do Power BI
          if (texto && texto !== 'Select Row' && !texto.includes('Row Selection')) {
             celulas.push(texto);
          }
        });
        if (celulas.length >= 2) resultado.push(celulas.join(' | '));
      });
      return resultado;
    });

    // Conta se achou algo que ainda não estava no Set
    let novosNestaVolta = 0;
    linhasNaTela.forEach(linha => { 
      if (!linhas.has(linha)) { 
        linhas.add(linha); 
        novosNestaVolta++; 
      } 
    });
    
    if (novosNestaVolta > 0) {
      tentativasSemNovoDado = 0; // Zera as falhas
      console.log(`  [Descida ${volta+1}] +${novosNestaVolta} novas | Total capturado: ${linhas.size}`);
    } else {
      tentativasSemNovoDado++; // Aumenta o alerta de fim de tabela
    }

    // 3. O GOLPE FÍSICO (Scroll + Teclado)
    await page.mouse.wheel(0, 1000); // Gira a rodinha do mouse com força
    await page.keyboard.press('PageDown'); // Aperta PageDown
    await page.keyboard.press('ArrowDown'); // Dá um toque para baixo para garantir o destravamento
    
    // Dá tempo para a Microsoft renderizar os dados ocultos
    await aguardar(1800); 
  }

  console.log(`🎯 ${nomeTabela} finalizada: ${linhas.size} linhas absolutas extraídas.`);
  return Array.from(linhas);
}

// ========================================================================
// ORQUESTRAÇÃO
// ========================================================================
(async () => {
  console.log('🚀 Robô PBI v11 (Motor Físico Total) iniciando...');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 1920, height: 1080 } }).then(ctx => ctx.newPage());

  const baseDeDados = [['Data_Captura', 'Métricas_Lidas', 'Dados_Brutos']];
  const hoje = new Date().toLocaleString('pt-BR');

  // Intercepta os KPIs financeiros
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

  // === AÇÃO 1: EXTRAIR PÁGINA 1 COM MOTOR FÍSICO ===
  const p1 = await extrairTabelaFisica(page, frame, 'P1_VENDA');
  p1.forEach(l => baseDeDados.push([hoje, 'P1_VENDA', l]));

  // === AÇÃO 2: NAVEGAÇÃO BRUTA PARA PÁGINA 6 ===
  console.log('\n➡️ Atravessando para a Página 6...');
  try {
    for (let i = 0; i < 5; i++) {
      // Força o clique no botão de "Próxima aba" nativo da barra inferior do Power BI
      await frame.locator('button.navRight, button[title="Próxima Página"], button[title="Next Page"], .pbi-glyph-chevronright').last().click({ force: true, timeout: 4000 });
      await aguardar(2500);
      console.log(`  Página virada (${i+1}/5)`);
    }
    console.log('✅ Travessia concluída. Aguardando renderização...');
    await aguardar(12000); 
  } catch (e) {
    console.log('⚠️ Falha ao virar a página.');
  }

  // === AÇÃO 3: EXTRAIR PÁGINA 6 COM MOTOR FÍSICO ===
  const p6 = await extrairTabelaFisica(page, frame, 'P6_CORRETOR');
  p6.forEach(l => baseDeDados.push([hoje, 'P6_CORRETOR', l]));

  // === AÇÃO 4: TRANSMISSÃO PARA O COFRE ===
  console.log('\n📤 Enviando pacote blindado para o Google Sheets...');
  try {
    const resp = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseDeDados),
    });
    console.log('🎯 Servidor Google Respondeu:', await resp.text());
  } catch (e) {
    console.log('❌ Falha na transmissão:', e.message);
  }

  await browser.close();
  console.log('\n✅ Missão Nível 11 Concluída!');
})();
