from pathlib import Path

path=Path(__file__).resolve().parents[1]/'apps/web/phase5-finance-ui.js'
text=path.read_text(encoding='utf-8')
old="  var originalRefresh=App.refreshAll;\n  App.refreshAll=async function(){var result=await originalRefresh.apply(this,arguments);try{await loadFinance(false);}catch(_){}return result;};"
new="  var originalRefresh=App.refreshAll;\n  function isFinanceView(view){return['financeDashboard','financeAccounts','cashReceipts','cashPayments','bankPosts','financeJournal','cashClosings','financeReports'].indexOf(view)>=0;}\n  App.refreshAll=async function(){var result=await originalRefresh.apply(this,arguments);if(isFinanceView(this.currentView)){try{await loadFinance(false);}catch(_){}}return result;};"
if old in text:
    text=text.replace(old,new,1)
elif new not in text:
    raise SystemExit('Phase 5 refresh anchor not found')
for marker in ['function isFinanceView','if(isFinanceView(this.currentView))']:
    if marker not in text: raise SystemExit(f'Missing marker: {marker}')
path.write_text(text,encoding='utf-8')
print('Phase 5 finance refresh is now view-scoped.')
