from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CAPS_MIN = "if(req.method==='GET'&&url.pathname==='/api/master-data/capabilities')return json(res,200,[{entityType:'FARMER',canCreate:true},{entityType:'DRIVER',canCreate:true},{entityType:'ROUTE',canCreate:true},{entityType:'AGENT',canCreate:true},{entityType:'ASSET',canCreate:true},{entityType:'EXPENSE_CATEGORY',canCreate:true},{entityType:'CASH_ACCOUNT',canCreate:true,native:true},{entityType:'BANK_ACCOUNT',canCreate:true,native:true}]);"
CAPS_PRETTY = "    if (req.method === 'GET' && url.pathname === '/api/master-data/capabilities') {\n      if (!authorized(req)) return json(res, 401, { error: 'AUTH_REQUIRED', message: 'Duhet të identifikoheni.' });\n      return json(res, 200, [{ entityType:'FARMER', canCreate:true },{ entityType:'DRIVER', canCreate:true },{ entityType:'ROUTE', canCreate:true },{ entityType:'AGENT', canCreate:true },{ entityType:'ASSET', canCreate:true },{ entityType:'EXPENSE_CATEGORY', canCreate:true },{ entityType:'CASH_ACCOUNT', canCreate:true, native:true },{ entityType:'BANK_ACCOUNT', canCreate:true, native:true }]);\n    }\n"


def patch(path, transform):
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    updated = transform(text)
    if updated == text:
        print(f'{path}: already patched or no change')
    else:
        target.write_text(updated, encoding='utf-8')
        print(f'{path}: patched')


def cloud_smoke(text):
    if '/api/master-data/capabilities' not in text:
        anchor = "    if (req.method === 'GET' && ['/api/trace/farms', '/api/trace/parcels', '/api/trace/lots', '/api/weights'].includes(url.pathname)) {"
        if anchor not in text:
            raise SystemExit('Cloud smoke anchor not found')
        text = text.replace(anchor, CAPS_PRETTY + anchor, 1)
    return text


def phase42(text):
    if '/api/master-data/capabilities' not in text:
        anchor = "if(req.method==='GET'&&url.pathname==='/api/cloud/bootstrap'){state.bootstrapCalls++;return json(res,200,bootstrap());}"
        if anchor not in text:
            raise SystemExit('Phase 4.2 bootstrap anchor not found')
        text = text.replace(anchor, anchor + '\n' + CAPS_MIN, 1)
    old = "if(!ctaText.includes('+ Shto Artikull'))throw new Error('CTA + Shto Artikull mungon.');"
    new = "if(!ctaText.includes('+ Shto të ri')||!ctaText.includes('Artikull'))throw new Error('CTA + Shto të ri — Artikull mungon.');"
    if old in text:
        text = text.replace(old, new, 1)
    elif new not in text:
        raise SystemExit('Phase 4.2 CTA assertion anchor not found')
    return text


def phase43(text):
    if '/api/master-data/capabilities' not in text:
        anchor = "if(req.method==='GET'&&url.pathname==='/api/cloud/bootstrap'){state.bootstrapCalls++;return json(res,200,bootstrap());}"
        if anchor not in text:
            raise SystemExit('Phase 4.3 bootstrap anchor not found')
        text = text.replace(anchor, anchor + '\n' + CAPS_MIN, 1)
    return text


def phase4_trace(text):
    if '/api/master-data/capabilities' not in text:
        anchor = "    if(req.method==='GET'&&url.pathname==='/api/cloud/bootstrap'){state.bootstrapCalls++;return json(res,200,bootstrap());}"
        if anchor not in text:
            raise SystemExit('Phase 4 trace bootstrap anchor not found')
        pretty_min = "    " + CAPS_MIN
        text = text.replace(anchor, anchor + '\n' + pretty_min, 1)
    old = "  await page.waitForSelector('#sg-p4-origin-panel',{state:'visible'});\n  const formState=await page.evaluate"
    new = "  await page.waitForSelector('#sg-p4-origin-panel',{state:'visible'});\n  await page.waitForSelector('#wf-lot');\n  await page.waitForSelector('#wf-p4-farm');\n  await page.waitForSelector('#wf-p4-parcel');\n  const formState=await page.evaluate"
    if old in text:
        text = text.replace(old, new, 1)
    elif new not in text:
        raise SystemExit('Phase 4 trace form wait anchor not found')
    return text


patch('tests/cloud-erp-adapter-smoke.cjs', cloud_smoke)
patch('tests/phase42-processing-ui-smoke.cjs', phase42)
patch('tests/phase43-export-ui-smoke.cjs', phase43)
patch('tests/phase4-traceability-ui-smoke.cjs', phase4_trace)

for relative in [
    'tests/cloud-erp-adapter-smoke.cjs',
    'tests/phase42-processing-ui-smoke.cjs',
    'tests/phase43-export-ui-smoke.cjs',
    'tests/phase4-traceability-ui-smoke.cjs',
]:
    content = (ROOT / relative).read_text(encoding='utf-8')
    if '/api/master-data/capabilities' not in content:
        raise SystemExit(f'Capabilities mock missing after patch: {relative}')
print('Legacy browser tests now match the global create capability contract.')
