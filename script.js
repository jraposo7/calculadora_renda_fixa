(() => {
  const $ = id => document.getElementById(id);
  const ids = ['principal','months','monthly','selic','cdi','ipca','taxMode','b3fee','treasuryFee','bankFee','entryFee','lciTax',
    'tPost','tPre','tIpca','cPost','cPre','cIpca','lPost','lPre','lIpca'];
  const defaults = {};
  ids.forEach(id => defaults[id] = $(id).value);

  const STORAGE_KEY = 'rf-inputs';
  const THEME_KEY = 'rf-theme';

  const money = n => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number.isFinite(n) ? n : 0);
  const pct = n => (n*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) + '%';
  const val = id => Number($(id).value);
  const clampRate = n => Math.max(-0.9999, n);

  // ---------- PERSISTÊNCIA DE INPUTS ----------
  function saveInputs() {
    try {
      const data = {};
      ids.forEach(id => { data[id] = $(id).value; });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Não foi possível salvar inputs:', e);
    }
  }

  function loadInputs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return false;
      let restored = false;
      ids.forEach(id => {
        if (data[id] !== undefined && data[id] !== null) {
          // Só restaura se o elemento existir
          if ($(id)) { $(id).value = data[id]; restored = true; }
        }
      });
      return restored;
    } catch (e) {
      console.warn('Não foi possível restaurar inputs:', e);
      return false;
    }
  }

  // ---------- API BCB ----------
  const BCB_SERIES = {
    selic: { code: 432, label: 'Selic' },
    cdi: { code: 4389, label: 'CDI' },
    ipca: { code: 13522, label: 'IPCA 12m' }
  };

  const apiStatus = $('apiStatus');

  function setApiStatus(state, text) {
    apiStatus.className = 'api-status ' + state;
    apiStatus.textContent = text;
  }

  async function fetchBCBSeries(code) {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/1?formato=json`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) throw new Error('Sem dados');
    const last = data[data.length - 1];
    const value = parseFloat(String(last.valor).replace(',', '.'));
    if (!Number.isFinite(value)) throw new Error('Valor inválido');
    return { value, date: last.data };
  }

  async function refreshFromBCB() {
    setApiStatus('loading', 'Consultando BCB...');
    try {
      const [selic, cdi, ipca] = await Promise.all([
        fetchBCBSeries(BCB_SERIES.selic.code),
        fetchBCBSeries(BCB_SERIES.cdi.code),
        fetchBCBSeries(BCB_SERIES.ipca.code)
      ]);

      $('selic').value = selic.value.toFixed(2);
      $('cdi').value = cdi.value.toFixed(2);
      $('ipca').value = ipca.value.toFixed(2);

      setApiStatus('ok', `BCB: ${selic.date} (Selic ${selic.value.toFixed(2)}%, CDI ${cdi.value.toFixed(2)}%, IPCA ${ipca.value.toFixed(2)}%)`);
      // Salva os novos valores e recalcula
      saveInputs();
      calculate();
    } catch (err) {
      console.error(err);
      setApiStatus('error', 'Falha ao consultar BCB — usando valores locais');
    }
  }

  $('refreshApi').addEventListener('click', refreshFromBCB);

  // ---------- TEMA ----------
  const themeToggle = $('themeToggle');
  const themeIcon = $('themeIcon');
  const themeLabel = $('themeLabel');

  function applyTheme(isDark, manual = false) {
    const html = document.documentElement;
    if (isDark) {
      html.classList.add('dark');
      themeIcon.textContent = '☀️';
      themeLabel.textContent = 'Claro';
    } else {
      html.classList.remove('dark');
      themeIcon.textContent = '🌙';
      themeLabel.textContent = 'Escuro';
    }
    if (manual) {
      localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    }
    updateChartTheme();
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) {
      applyTheme(saved === 'dark', true);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(prefersDark, false);
    }
  }

  themeToggle.addEventListener('click', () => {
    const isDark = !document.documentElement.classList.contains('dark');
    applyTheme(isDark, true);
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(THEME_KEY)) {
      applyTheme(e.matches, false);
    }
  });

  // ---------- IR REGRESSIVO ----------
  function irRate(months) {
    const mode = $('taxMode').value;
    if (mode !== 'regressivo') return Number(mode)/100;
    const days = months * 365 / 12;
    if (days <= 180) return .225;
    if (days <= 360) return .20;
    if (days <= 720) return .175;
    return .15;
  }

  // ---------- SIMULAÇÃO ----------
  function simulate({name, product, kind, rate, principal, months, monthly=0, annualCost=0, entryCost=0, tax}) {
    const start = principal * (1 - entryCost/100);
    const monthlyNetContribution = monthly * (1 - entryCost/100);
    const monthlyGross = Math.pow(1 + clampRate(rate), 1/12) - 1;
    const monthlyCost = Math.pow(1 + Math.max(-.99, annualCost/100), 1/12) - 1;
    let balance = start;

    const series = [principal];
    let grossBal = principal;
    for (let m=0; m<months; m++) {
      balance *= (1 + monthlyGross);
      balance *= (1 - monthlyCost);
      grossBal *= (1 + monthlyGross);
      if (monthly > 0) {
        balance += monthlyNetContribution;
        grossBal += monthly;
      }
      series.push(grossBal);
    }

    const totalInvested = principal + monthly * months;
    const grossBeforeCosts = grossBal;
    const costs = Math.max(0, principal - start) + Math.max(0, months * (monthly - monthlyNetContribution)) + Math.max(0, grossBeforeCosts - balance);
    const investedBase = start + monthlyNetContribution * months;
    const taxableGain = Math.max(0, balance - investedBase);
    const taxAmount = taxableGain * tax;
    const net = balance - taxAmount;
    const gain = net - totalInvested;
    const rent = totalInvested > 0 ? net / totalInvested - 1 : 0;

    return {name, product, kind, gross:grossBeforeCosts, costs, tax:taxAmount, net, gain, rent, totalInvested, rate, series};
  }

  // ---------- GRÁFICO ----------
  let chartInstance = null;

  const colorMap = {
    'Tesouro — Pós-fixado (Selic)': '#0d9488',
    'Tesouro — Prefixado': '#0f766e',
    'Tesouro — IPCA+': '#14b8a6',
    'CDB — Pós-fixado': '#7c3aed',
    'CDB — Prefixado': '#6d28d9',
    'CDB — IPCA+': '#8b5cf6',
    'LCI — Pós-fixada': '#db2777',
    'LCI — Prefixada': '#be185d',
    'LCI — IPCA+': '#f472b6'
  };

  function updateChartTheme() {
    if (!chartInstance) return;
    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? '#1e293b' : '#f1f5f9';
    const labelColor = isDark ? '#94a3b8' : '#64748b';
    const textColor = isDark ? '#e2e8f0' : '#0f172a';

    chartInstance.options.scales.y.grid.color = gridColor;
    chartInstance.options.scales.y.ticks.color = labelColor;
    chartInstance.options.scales.x.ticks.color = labelColor;
    chartInstance.options.plugins.legend.labels.color = textColor;
    chartInstance.options.plugins.tooltip.backgroundColor = isDark ? '#1e293b' : '#ffffff';
    chartInstance.options.plugins.tooltip.titleColor = textColor;
    chartInstance.options.plugins.tooltip.bodyColor = textColor;
    chartInstance.options.plugins.tooltip.borderColor = isDark ? '#334155' : '#e2e8f0';
    chartInstance.update('none');
  }

  function renderChart(rows, months) {
    const labels = ['Início'];
    for (let i = 1; i <= months; i++) labels.push('Mês ' + i);
    labels.push('Líquido');

    const isDark = document.documentElement.classList.contains('dark');

    const datasets = [];
    rows.forEach(r => {
      const color = colorMap[r.name] || '#64748b';
      const brutoData = [...r.series, r.net];

      datasets.push({
        label: r.name,
        data: brutoData,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointRadius: (ctx) => ctx.dataIndex === months + 1 ? 5 : 0,
        pointHoverRadius: 6,
        pointBackgroundColor: (ctx) => ctx.dataIndex === months + 1 ? (isDark ? '#111827' : '#ffffff') : color,
        pointBorderColor: color,
        pointBorderWidth: (ctx) => ctx.dataIndex === months + 1 ? 2 : 1,
        pointStyle: 'circle',
        tension: 0.15,
        spanGaps: false,
        fill: false,
        segment: {
          borderDash: ctx => ctx.p0DataIndex === months ? [6, 4] : undefined
        }
      });
    });

    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    const ctx = document.getElementById('evolutionChart').getContext('2d');
    const textColor = isDark ? '#e2e8f0' : '#0f172a';
    const labelColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? '#1e293b' : '#f1f5f9';

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              usePointStyle: true,
              boxWidth: 10,
              padding: 12,
              font: { size: 11, weight: '500' },
              color: textColor
            }
          },
          tooltip: {
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            titleColor: textColor,
            bodyColor: textColor,
            borderColor: isDark ? '#334155' : '#e2e8f0',
            borderWidth: 1,
            callbacks: {
              label: (context) => {
                const label = context.dataset.label || '';
                const value = context.parsed.y;
                if (value === null || value === undefined) return null;
                const suffix = context.dataIndex === months + 1 ? ' (líquido)' : ' (bruto)';
                return `${label}${suffix}: ${money(value)}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            ticks: {
              callback: (value) => {
                if (value >= 1e6) return 'R$ ' + (value/1e6).toFixed(1) + 'M';
                if (value >= 1e3) return 'R$ ' + (value/1e3).toFixed(1) + 'k';
                return 'R$ ' + value;
              },
              font: { size: 10 },
              color: labelColor
            },
            grid: { color: gridColor }
          },
          x: {
            ticks: {
              maxTicksLimit: 14,
              font: { size: 10 },
              color: labelColor
            },
            grid: { display: false }
          }
        }
      }
    });

    updateChartTheme();
  }

  // ---------- CÁLCULO PRINCIPAL ----------
  function calculate() {
    const principal = val('principal'), months = Math.floor(val('months')), monthly = Math.max(0, val('monthly') || 0);
    const valid = principal >= 0 && months >= 1 && months <= 600 && (principal > 0 || monthly > 0) &&
      ['monthly','selic','cdi','ipca','b3fee','treasuryFee','bankFee','entryFee','lciTax','tPost','tPre','tIpca','cPost','cPre','cIpca','lPost','lPre','lIpca'].every(id => Number.isFinite(val(id)));

    $('empty').classList.toggle('hidden', valid);
    if (!valid) {
      if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
      return;
    }

    const cdi = val('cdi')/100, ipca = val('ipca')/100;
    const treasuryCost = val('b3fee') + val('treasuryFee');
    const bankCost = val('bankFee'), entry = val('entryFee');
    const tax = irRate(months), lciTax = Math.max(0,val('lciTax'))/100;
    const rateIPCA = (real) => (1+ipca)*(1+real/100)-1;

    const rows = [
      simulate({name:'Tesouro — Pós-fixado (Selic)',product:'Tesouro Direto',kind:'Pós-fixado',rate:val('selic')/100,principal,months,monthly,annualCost:treasuryCost,tax}),
      simulate({name:'Tesouro — Prefixado',product:'Tesouro Direto',kind:'Prefixado',rate:val('tPre')/100,principal,months,monthly,annualCost:treasuryCost,tax}),
      simulate({name:'Tesouro — IPCA+',product:'Tesouro Direto',kind:'IPCA+',rate:rateIPCA(val('tIpca')),principal,months,monthly,annualCost:treasuryCost,tax}),
      simulate({name:'CDB — Pós-fixado',product:'CDB',kind:'Pós-fixado',rate:cdi*val('cPost')/100,principal,months,monthly,annualCost:bankCost,entryCost:entry,tax}),
      simulate({name:'CDB — Prefixado',product:'CDB',kind:'Prefixado',rate:val('cPre')/100,principal,months,monthly,annualCost:bankCost,entryCost:entry,tax}),
      simulate({name:'CDB — IPCA+',product:'CDB',kind:'IPCA+',rate:rateIPCA(val('cIpca')),principal,months,monthly,annualCost:bankCost,entryCost:entry,tax}),
      simulate({name:'LCI — Pós-fixada',product:'LCI',kind:'Pós-fixado',rate:cdi*val('lPost')/100,principal,months,monthly,annualCost:bankCost,entryCost:entry,tax:lciTax}),
      simulate({name:'LCI — Prefixada',product:'LCI',kind:'Prefixado',rate:val('lPre')/100,principal,months,monthly,annualCost:bankCost,entryCost:entry,tax:lciTax}),
      simulate({name:'LCI — IPCA+',product:'LCI',kind:'IPCA+',rate:rateIPCA(val('lIpca')),principal,months,monthly,annualCost:bankCost,entryCost:entry,tax:lciTax})
    ];

    const sorted = [...rows].sort((a,b)=>b.net-a.net);

    $('results').innerHTML = sorted.map((r,i)=>`
      <tr style="border-bottom: 1px solid var(--border);" class="${i===0?'highlight-row':''}">
        <td class="py-3 pr-2"><div class="font-semibold">${r.name}</div><div class="text-xs text-muted">${r.product} · ${r.kind}</div></td>
        <td class="px-1.5 text-right number whitespace-nowrap">${money(r.gross)}</td>
        <td class="px-1.5 text-right number whitespace-nowrap">${money(r.costs)}</td>
        <td class="px-1.5 text-right number whitespace-nowrap">${money(r.tax)}</td>
        <td class="px-1.5 text-right font-bold number whitespace-nowrap">${money(r.net)}</td>
        <td class="py-3 pl-2 text-right font-bold number whitespace-nowrap ${i===0?'highlight-text':''}">${pct(r.rent)}</td>
      </tr>`).join('');

    $('bestName').textContent = sorted[0].name;
    $('bestValue').textContent = money(sorted[0].net);
    $('bestRent').textContent = `Rentab. líquida de ${pct(sorted[0].rent)}`;
    $('invested').textContent = money(sorted[0].totalInvested);
    $('investedNote').textContent = monthly > 0
      ? `${money(principal)} de aporte inicial + ${money(monthly)} × ${months} ${months===1?'mês':'meses'}`
      : 'Aporte inicial, sem aportes mensais';
    $('term').textContent = months + (months===1?' mês':' meses');

    const inflationFactor = Math.pow(1+ipca, months/12);
    const realNet = sorted[0].net/inflationFactor;
    $('realResult').textContent = `Melhor resultado: ganho nominal líquido de ${money(sorted[0].gain)} (rentabilidade líquida de ${pct(sorted[0].rent)} sobre o total investido). Poder de compra estimado do valor final, descontando o IPCA informado: ${money(realNet)} em reais de hoje.`;

    renderChart(sorted, months);
    window.lastRows = sorted;
  }

  // ---------- EVENTOS ----------
  $('calculate').addEventListener('click', () => {
    saveInputs();
    calculate();
  });

  // Salva automaticamente ao alterar qualquer campo e recalcula
  ids.forEach(id => {
    const el = $(id);
    const evt = el.tagName === 'SELECT' ? 'change' : 'change';
    el.addEventListener(evt, () => {
      saveInputs();
      calculate();
    });
    // Também salva durante a digitação (input) para não perder dados
    el.addEventListener('input', saveInputs);
  });

  $('reset').addEventListener('click', () => {
    ids.forEach(id => $(id).value = defaults[id]);
    setApiStatus('ok', 'Dados locais restaurados');
    saveInputs();
    calculate();
  });

  $('csv').addEventListener('click', () => {
    if (!window.lastRows) calculate();
    const rows = window.lastRows || [];
    const lines = [['Investimento','Produto','Modalidade','Total investido','Bruto antes de custos','Custos','IR/IOF','Liquido final','Rentabilidade liquida (%)'],
      ...rows.map(r=>[r.name,r.product,r.kind,r.totalInvested.toFixed(2),r.gross.toFixed(2),r.costs.toFixed(2),r.tax.toFixed(2),r.net.toFixed(2),(r.rent*100).toFixed(2)])];
    const csv = '\uFEFF' + lines.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(';')).join('\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    a.download='comparativo-renda-fixa.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ---------- INICIALIZAÇÃO ----------
  initTheme();

  // Tenta restaurar inputs salvos; se não houver, usa os padrões
  const restored = loadInputs();

  // Calcula com os valores restaurados/padrão
  calculate();

  // Se NÃO havia dados salvos, busca do BCB automaticamente.
  // Se havia dados salvos, mantém os valores do usuário e apenas informa.
  if (!restored) {
    refreshFromBCB();
  } else {
    setApiStatus('ok', 'Última simulação restaurada');
  }

  window.addEventListener('resize', () => {
    if (chartInstance) chartInstance.resize();
  });
})();
