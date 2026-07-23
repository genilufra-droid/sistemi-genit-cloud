from pathlib import Path

path=Path(__file__).resolve().parents[1]/'tests/phase43-export-logistics.cjs'
text=path.read_text(encoding='utf-8')
old="JSON.stringify({sealNo:'SEAL-043',containerNo:'CONT-043',cmrNo:'CMR-043'})"
new="JSON.stringify({sealNo:'SEAL-043',containerNo:'CONT-043',cmrNo:'CMR-043',packingListNo:'PL-043',commercialInvoiceNo:'CI-043',customsDeclarationNo:'DOG-043'})"
if old in text:
    text=text.replace(old,new,1)
elif new not in text:
    raise SystemExit('Seal payload anchor not found in Phase 4.3 regression test')
if "commercialInvoiceNo:'CI-043'" not in text:
    raise SystemExit('Commercial Invoice was not added to regression payload')
path.write_text(text,encoding='utf-8')
print('Phase 4.3 export regression payload updated.')
