const { chromium } = require('playwright');

const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbx90wUuh6OqPQ9OYU_md0VVZ1AMq-GqaA_R1AzoTAKDqDFMobL5ajDwJg-EIAIiBX1xCQ/exec';

(async () => {
  console.log('🚀 Iniciando Robô Nível 3 (Rolagem Virtual e Bypass de Navegação)...');
  
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
      console.log('✅ iFrame detectado! Iniciando extração com Scroll na Página 1...');
      
      // Função poderosa que rola a tabela até o fim para pegar todas as linhas
      const extrairComScroll = async (frame) => {
          return await frame.evaluate(async () => {
              let linhasExtraidas = new Set();
              let tentativasSemNovoDado = 0;
              let ultimoTamanho = 0;

              // Rola no máximo 15 vezes para evitar loops infinitos
              while(tentativasSemNovoDado < 4) {
                  // Lê tudo que está visível na tela
                  document.querySelectorAll('div[role="row"]').forEach(row => {
                      let dadosLinha = [];
                      row.querySelectorAll('div[role="columnheader"], div[role="gridcell"]').forEach(cell => {
                          let texto = cell.innerText || cell.getAttribute('title') || '';
                          if(texto.trim()) dadosLinha.push(texto.trim());
                      });
                      if(dadosLinha.length > 1) linhasExtraidas.add(dadosLinha.join(' | '));
                  });

                  // Verifica se achou dados novos
                  if(linhasExtraidas.size > ultimoTamanho) {
                      ultimoTamanho = linhasExtraidas.size;
                      tentativasSemNovoDado = 0; // Zera as tentativas se encontrou coisa nova
                  } else {
                      tentativasSemNovoDado++; // Se não achou, conta tentativa vazia
                  }

                  // Hack: Força a rolagem em todas as áreas que têm barra de scroll no Power BI
                  document.querySelectorAll('.scroll-region, .scrollable-area, div.bodyCells, div[style*="overflow"]').forEach(el => {
                      el.scrollBy(0, 500); // Desce a página
                  });

                  // Aguarda 1 segundo para o Power BI renderizar as novas linhas
                  await new Promise(r => setTimeout(r, 1000));
              }
              return Array.from(linhasExtraidas);
          });
      };

      // RODA NA PÁGINA 1
      const tabelasP1 = await extrairComScroll(pbiFrame);
      baseDeDados.push([hoje, "DOM_TABELAS_P1", JSON.stringify(tabelasP1)]);
      console.log(`📊 P1: Total de ${tabelasP1.length} linhas capturadas!`);

      // FORÇANDO A NAVEGAÇÃO PARA A PÁGINA 6
      console.log('➡️ Forçando navegação até a Página 6...');
      for(let i = 1; i < 6; i++) {
          await pbiFrame.evaluate(() => {
              // Procura todos os botões que possam ser o "Próxima Página"
              let botoes = document.querySelectorAll('.pbi-glyph-chevronright, button[title="Próxima Página"], button[title="Next Page"]');
              if(botoes.length > 0) botoes[botoes.length - 1].click(); // Clica
          });
          console.log(`⏳ Aguardando carregamento da página...`);
          await page.waitForTimeout(3000); 
      }

      await page.waitForTimeout(5000); // Aguarda a P6 renderizar completamente

      // RODA NA PÁGINA 6
      console.log('👁️ Iniciando extração com Scroll na Página 6...');
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
  
  console.log('🎯 Resposta:', await sendResponse.text());
  await browser.close();
})();
