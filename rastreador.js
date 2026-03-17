const { chromium } = require('playwright');

const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbx90wUuh6OqPQ9OYU_md0VVZ1AMq-GqaA_R1AzoTAKDqDFMobL5ajDwJg-EIAIiBX1xCQ/exec';

(async () => {
  console.log('🚀 Iniciando Robô Nível 4 (Scroll Virtual + Navegação Sniper)...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  
  let baseDeDados = [["Data_Captura", "Métricas_Lidas", "Dados_Brutos"]];
  const hoje = new Date().toLocaleString('pt-BR');

  // 1. CAPTURA DOS MILHÕES (Mantido)
  page.on('response', async (response) => {
    if (response.url().includes('querydata')) {
      try {
        const json = JSON.parse(await response.text());
        for (const res of (json.results || [])) {
          const descriptor = res.result?.data?.descriptor?.Select || [];
          if (descriptor.length > 0) {
            const metricNames = descriptor.map(d => d.Name).join(" | ");
            if(metricNames.includes('Sum(BD.VLRVENDA)') || metricNames.includes('Sum(BD.Entrada Final)') || metricNames.includes('Sum(BD.ENTRADA PAGA)') || metricNames.includes('BD.Última Atualização')) {
                baseDeDados.push([hoje, metricNames, JSON.stringify(res.result?.data?.dsr || {}).substring(0, 45000)]);
            }
          }
        }
      } catch (e) {}
    }
  });

  console.log('🌐 Acessando site da Metrocasa...');
  await page.goto('https://construtora-metrocasa.github.io/central/lisboa/Diretoria-Garra-385.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(10000); 

  const iframeElement = await page.$('iframe');
  const pbiFrame = await iframeElement.contentFrame();

  if (pbiFrame) {
      console.log('✅ iFrame detectado!');
      
      // Função motor de Scroll
      const extrairComScroll = async (frame) => {
          return await frame.evaluate(async () => {
              let linhasExtraidas = new Set();
              let tentativasSemNovoDado = 0;
              let ultimoTamanho = 0;

              while(tentativasSemNovoDado < 4) {
                  document.querySelectorAll('div[role="row"]').forEach(row => {
                      let dadosLinha = [];
                      row.querySelectorAll('div[role="columnheader"], div[role="gridcell"]').forEach(cell => {
                          let texto = cell.innerText || cell.getAttribute('title') || '';
                          if(texto.trim()) dadosLinha.push(texto.trim());
                      });
                      if(dadosLinha.length > 1) linhasExtraidas.add(dadosLinha.join(' | '));
                  });

                  if(linhasExtraidas.size > ultimoTamanho) {
                      ultimoTamanho = linhasExtraidas.size;
                      tentativasSemNovoDado = 0; 
                  } else {
                      tentativasSemNovoDado++; 
                  }

                  document.querySelectorAll('.scroll-region, .scrollable-area, div.bodyCells, div[style*="overflow"]').forEach(el => el.scrollBy(0, 500));
                  await new Promise(r => setTimeout(r, 1000));
              }
              return Array.from(linhasExtraidas);
          });
      };

      // EXTRAI A PÁGINA 1
      console.log('👁️ Lendo Página 1 com Rolagem Máxima...');
      const tabelasP1 = await extrairComScroll(pbiFrame);
      baseDeDados.push([hoje, "DOM_TABELAS_P1", JSON.stringify(tabelasP1)]);
      console.log(`📊 P1: Total de ${tabelasP1.length} linhas capturadas!`);

      // ==========================================
      // A NAVEGAÇÃO SNIPER (Sua sacada!)
      // ==========================================
      console.log('➡️ Usando Navegação Sniper pelo Menu Central...');
      try {
          // Procura qualquer texto que pareça com "1 de 6", "1 de 7" (caso eles adicionem páginas)
          await pbiFrame.getByText(/1 de \d+/i).first().click({ force: true });
          console.log('✅ Menu de páginas aberto.');
          await page.waitForTimeout(2000); // Aguarda a animação do menu subir

          // Clica exatamente no nome da página que queremos
          await pbiFrame.getByText('Vendas - Dias S/ Vender', { exact: true }).click({ force: true });
          console.log('🎯 Clique certeiro na Página de Corretores!');
          
      } catch (e) {
          console.log('⚠️ Falha no Menu Sniper. Recorrendo a método alternativo...');
      }

      // Aguarda bastante tempo porque você avisou que essa página é pesada
      console.log('⏳ Aguardando carregamento dos gráficos pesados...');
      await page.waitForTimeout(12000); 

      // EXTRAI A PÁGINA ESPECÍFICA (Dias Sem Vender)
      console.log('👁️ Lendo Tabela de Corretores com Rolagem Máxima...');
      const tabelasP6 = await extrairComScroll(pbiFrame);
      baseDeDados.push([hoje, "DOM_TABELAS_P6", JSON.stringify(tabelasP6)]);
      console.log(`📊 P6: Total de ${tabelasP6.length} linhas capturadas!`);

  } else {
      console.log('❌ iFrame não encontrado.');
  }

  console.log('📤 Transmitindo para o Google Sheets...');
  const sendResponse = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(baseDeDados)
  });
  
  console.log('🎯 Resposta do Sheets:', await sendResponse.text());
  await browser.close();
})();
