const { chromium } = require('playwright');

const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbx90wUuh6OqPQ9OYU_md0VVZ1AMq-GqaA_R1AzoTAKDqDFMobL5ajDwJg-EIAIiBX1xCQ/exec';

(async () => {
  console.log('🚀 Iniciando Robô Nível 5 (Envio Linha a Linha e Sniper Force)...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  
  let baseDeDados = [["Data_Captura", "Métricas_Lidas", "Dados_Brutos"]];
  const hoje = new Date().toLocaleString('pt-BR');

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
                  } else { tentativasSemNovoDado++; }

                  document.querySelectorAll('.scroll-region, .scrollable-area, div.bodyCells').forEach(el => el.scrollBy(0, 500));
                  await new Promise(r => setTimeout(r, 1000));
              }
              return Array.from(linhasExtraidas);
          });
      };

      // EXTRAÇÃO P1 (Agora envia separando linha por linha para não quebrar o Sheets)
      console.log('👁️ Lendo Página 1...');
      const tabelasP1 = await extrairComScroll(pbiFrame);
      tabelasP1.forEach(linha => baseDeDados.push([hoje, "P1_VENDA", linha]));
      console.log(`📊 P1: ${tabelasP1.length} linhas preparadas no cofre!`);

      // NAVEGAÇÃO SNIPER APRIMORADA
      console.log('➡️ Usando Navegação Sniper pelo Menu Central...');
      try {
          // Busca o botão pela classe oficial de navegação e clica no centro dele
          await pbiFrame.locator('button.page-navigation-item, span:has-text("de 6")').last().click({ force: true, position: { x: 10, y: 10 } });
          console.log('✅ Menu de páginas aberto. Procurando o alvo...');
          await page.waitForTimeout(2500); 

          // Busca a aba exata contendo o texto e clica
          await pbiFrame.getByText('Vendas - Dias S/ Vender').last().click({ force: true });
          console.log('🎯 Clique certeiro na Página de Corretores!');
          await page.waitForTimeout(12000); // Aguarda os gráficos da P6
      } catch (e) {
          console.log('⚠️ Falha no Menu Sniper. Recorrendo à seta manual...');
          for(let i = 0; i < 5; i++) {
              await pbiFrame.locator('.pbi-glyph-chevronright').last().click({force: true}).catch(()=>{});
              await page.waitForTimeout(2500);
          }
      }

      // EXTRAÇÃO P6 (Linha a Linha)
      console.log('👁️ Lendo Página 6...');
      const tabelasP6 = await extrairComScroll(pbiFrame);
      tabelasP6.forEach(linha => baseDeDados.push([hoje, "P6_CORRETOR", linha]));
      console.log(`📊 P6: ${tabelasP6.length} linhas preparadas no cofre!`);

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
