const { chromium } = require('playwright');

// A SUA PONTE SECRETA PARA O GOOGLE SHEETS
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbx90wUuh6OqPQ9OYU_md0VVZ1AMq-GqaA_R1AzoTAKDqDFMobL5ajDwJg-EIAIiBX1xCQ/exec';

(async () => {
  console.log('🚀 Iniciando Robô Nível 2 (Network + Visão Computacional)...');
  
  // Abre o navegador em resolução Full HD para garantir que as tabelas apareçam inteiras
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  
  let baseDeDados = [["Data_Captura", "Métricas_Lidas", "Dados_Brutos"]];
  const hoje = new Date().toLocaleString('pt-BR');

  // 1. OUVINTE DE REDE (Mantemos isso apenas para pegar os Milhões exatos do VGV)
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

  console.log('🌐 Acessando Página 1 (Diretoria Lisboa)...');
  await page.goto('https://construtora-metrocasa.github.io/central/lisboa/Diretoria-Garra-385.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(12000); // Aguarda os gráficos renderizarem na tela

  // 2. EXTRAÇÃO VISUAL (Página 1 - Lendo as tabelas na tela)
  console.log('👁️ Lendo tabela de Vendas (Empreendimento, Estágio, Corretor)...');
  const tabelasP1 = await page.evaluate(() => {
      let linhas = [];
      // Procura todas as linhas visuais na tela
      document.querySelectorAll('div[role="row"]').forEach(row => {
          let dadosLinha = [];
          // Extrai o texto de cada coluna
          row.querySelectorAll('div[role="columnheader"], div[role="gridcell"]').forEach(cell => {
              let texto = cell.innerText || cell.getAttribute('title') || '';
              if(texto.trim()) dadosLinha.push(texto.trim());
          });
          // Se achou texto, junta tudo separado por "|"
          if(dadosLinha.length > 0) linhas.push(dadosLinha.join(' | '));
      });
      return linhas;
  });
  baseDeDados.push([hoje, "DOM_TABELAS_P1", JSON.stringify(tabelasP1)]);

  // 3. NAVEGAÇÃO PARA A PÁGINA 6
  console.log('➡️ Navegando até a Página 6...');
  for(let i = 1; i < 6; i++) {
      try {
          // Simula o clique do mouse na seta da direita da barra do Power BI
          await page.click('.pbi-glyph-chevronright, button.navigation-next', { timeout: 4000 });
          await page.waitForTimeout(2500); // Aguarda a página virar
      } catch (e) {
          console.log(`Aviso: Tentativa ${i} de mudar de página.`);
      }
  }

  await page.waitForTimeout(8000); // Aguarda a Página 6 carregar os dados

  // 4. EXTRAÇÃO VISUAL (Página 6 - Corretores e Dias sem Vender)
  console.log('👁️ Lendo tabela de Corretores e Dias sem Vender da P6...');
  const tabelasP6 = await page.evaluate(() => {
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

  console.log('📤 Transmitindo matriz de dados para o cofre no Google Sheets...');
  const sendResponse = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(baseDeDados)
  });
  
  console.log('🎯 Resposta do Sheets:', await sendResponse.text());
  await browser.close();
  console.log('✅ Missão Nível 2 Concluída!');
})();
