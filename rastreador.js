const { chromium } = require('playwright');

// A NOSSA PONTE SECRETA PARA O GOOGLE SHEETS
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbx90wUuh6OqPQ9OYU_md0VVZ1AMq-GqaA_R1AzoTAKDqDFMobL5ajDwJg-EIAIiBX1xCQ/exec';

(async () => {
  console.log('🚀 Iniciando Extrator PBI da Equipe Garra...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Matriz que vai formar as linhas e colunas na planilha
  let baseDeDados = [
    ["Data_Captura", "Métricas_Lidas", "Dados_Brutos"] // Cabeçalho da Planilha
  ];
  
  const hoje = new Date().toLocaleString('pt-BR');

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('querydata')) {
      try {
        const body = await response.text();
        const json = JSON.parse(body);
        
        const results = json.results || [];
        for (const res of results) {
          const descriptor = res.result?.data?.descriptor?.Select || [];
          
          if (descriptor.length > 0) {
            // Pega o nome oficial das métricas (Ex: Sum(BD.VLRVENDA))
            const metricNames = descriptor.map(d => d.Name).join(" | ");
            
            // Pega a "caixa forte" onde a Microsoft esconde os números
            const dsr = res.result?.data?.dsr || {};
            
            // Guarda na nossa matriz (limitando o texto para não estourar a célula do Google)
            baseDeDados.push([hoje, metricNames, JSON.stringify(dsr).substring(0, 45000)]);
            console.log(`✅ Capturado: ${metricNames}`);
          }
        }
      } catch (e) {
        // Ignora pacotes vazios ou corrompidos
      }
    }
  });

  console.log('🌐 Acessando Diretoria Lisboa (Metrocasa)...');
  await page.goto('https://construtora-metrocasa.github.io/central/lisboa/Diretoria-Garra-385.html', { waitUntil: 'networkidle' });

  console.log('⏳ Aguardando 15 segundos para a leitura completa...');
  await page.waitForTimeout(15000);

  console.log('📤 Transmitindo dados para o cofre no Google Sheets...');
  
  // Dispara o pacote para a sua URL
  const sendResponse = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(baseDeDados)
  });
  
  const status = await sendResponse.text();
  console.log('🎯 Resposta do Sheets:', status);

  await browser.close();
  console.log('✅ Missão 100% concluída!');
})();
