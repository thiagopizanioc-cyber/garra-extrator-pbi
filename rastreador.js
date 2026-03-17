const { chromium } = require('playwright');

const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbx90wUuh6OqPQ9OYU_md0VVZ1AMq-GqaA_R1AzoTAKDqDFMobL5ajDwJg-EIAIiBX1xCQ/exec';

(async () => {
  console.log('🚀 Iniciando Robô Nível 2.1 (Bypass de iFrame)...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  
  let baseDeDados = [["Data_Captura", "Métricas_Lidas", "Dados_Brutos"]];
  const hoje = new Date().toLocaleString('pt-BR');

  // 1. OUVINTE DE REDE (Mantido para VGV)
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

  // ==========================================
  // A MÁGICA AQUI: ENTRANDO NO IFRAME
  // ==========================================
  console.log('🪟 Procurando a janela do Power BI (iFrame)...');
  const iframeElement = await page.$('iframe');
  const pbiFrame = await iframeElement.contentFrame();

  if (pbiFrame) {
      console.log('✅ iFrame detectado! Lendo tabelas da Página 1...');
      
      const tabelasP1 = await pbiFrame.evaluate(() => {
          let linhas = [];
          document.querySelectorAll('div[role="row"]').forEach(row => {
              let dadosLinha = [];
              row.querySelectorAll('div[role="columnheader"], div[role="gridcell"]').forEach(cell => {
                  let texto = cell.innerText || cell.getAttribute('title') || '';
                  if(texto.trim()) dadosLinha.push(texto.trim());
              });
              if(dadosLinha.length > 0) linhas.push(dadosLinha.join(' | '));
          });
          return linhas;
      });
      baseDeDados.push([hoje, "DOM_TABELAS_P1", JSON.stringify(tabelasP1)]);

      console.log('➡️ Navegando até a Página 6...');
      for(let i = 1; i < 6; i++) {
          try {
              await pbiFrame.click('.pbi-glyph-chevronright, button.navigation-next', { timeout: 4000 });
              await page.waitForTimeout(2500); 
          } catch (e) {
              console.log(`Aviso de clique na página ${i}`);
          }
      }

      await page.waitForTimeout(8000); 

      console.log('👁️ Lendo tabelas da Página 6...');
      const tabelasP6 = await pbiFrame.evaluate(() => {
          let linhas = [];
          document.querySelectorAll('div[role="row"]').forEach(row => {
              let dadosLinha = [];
              row.querySelectorAll('div[role="columnheader"], div[role="gridcell"]').forEach(cell => {
                  let texto = cell.innerText || cell.getAttribute('title') || '';
                  if(texto.trim()) dadosLinha.push(texto.trim());
              });
              if(dadosLinha.length > 0) linhas.push(dadosLinha.join(' | '));
          });
          return linhas;
      });
      baseDeDados.push([hoje, "DOM_TABELAS_P6", JSON.stringify(tabelasP6)]);
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
