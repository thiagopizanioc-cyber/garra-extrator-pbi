const { chromium } = require('playwright');

(async () => {
  console.log('🚀 Iniciando rastreador invisível da Equipe Garra...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // O "Ouvinte": Intercepta a comunicação secreta do Power BI
  page.on('response', async (response) => {
    const url = response.url();
    // A Microsoft geralmente trafega os dados em links com 'querydata'
    if (url.includes('querydata')) {
      console.log(`\n🔍 PACOTE INTERCEPTADO NO ALVO:`);
      try {
        const body = await response.text();
        // Imprime os primeiros 800 caracteres para estudarmos a estrutura
        console.log('📦 CONTEÚDO (Amostra):', body.substring(0, 800));
      } catch (e) {
        console.log('❌ Erro ao decodificar o pacote.');
      }
    }
  });

  console.log('🌐 Infiltrando no link da Metrocasa (Diretoria Lisboa)...');
  await page.goto('https://construtora-metrocasa.github.io/central/lisboa/Diretoria-Garra-385.html', { waitUntil: 'networkidle' });

  console.log('⏳ Aguardando 15 segundos para os gráficos renderizarem e os dados trafegarem...');
  await page.waitForTimeout(15000);

  console.log('✅ Missão de rastreio finalizada. Fechando conexão.');
  await browser.close();
})();
