import fs from 'node:fs';

const file = 'apps/web/src/Phase2Pages.jsx';
let source = fs.readFileSync(file, 'utf8');

const importLine = "import { ProductsRegistryPage, PartnersRegistryPage } from './RegistryPages.jsx';";
if (!source.includes(importLine)) {
  source = source.replace("import './phase2.css';", `import './phase2.css';\n${importLine}`);
}

source = source.replace("if(page==='products') return <ProductsPage/>;", "if(page==='products') return <ProductsRegistryPage/>;");
source = source.replace("if(page==='suppliers') return <PartnersPage type=\"SUPPLIER\"/>;", "if(page==='suppliers') return <PartnersRegistryPage type=\"SUPPLIER\"/>;");
source = source.replace("if(page==='customers') return <PartnersPage type=\"CUSTOMER\"/>;", "if(page==='customers') return <PartnersRegistryPage type=\"CUSTOMER\"/>;");

fs.writeFileSync(file, source);
