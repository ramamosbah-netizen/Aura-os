import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const modules = ['commissioning', 'projects', 'engineering', 'doccontrol', 'site', 'quality', 'hse'];
export function inventory(root = process.cwd()) {
  const rows = [];
  function scan(dir) {
    for (const item of readdirSync(join(root, dir), { withFileTypes: true })) {
      const file = `${dir}/${item.name}`;
      if (item.isDirectory()) { scan(file); continue; }
      if (!item.name.endsWith('.service.ts') && item.name !== 'project-write-guard.ts') continue;
      const source = readFileSync(join(root, file), 'utf8');
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      function visit(node, owner = '', methodNode = null) {
        if (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) { owner = node.name?.getText(ast) ?? owner; methodNode = node; }
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'assert') {
          let target = node.arguments[1];
          const checks = [];
          const provenance = [];
          const compact = n => ts.createPrinter({ removeComments: true }).printNode(ts.EmitHint.Unspecified,n,ast).replace(/\s+/g,' ').trim();
          function inspect(n) {
            if(ts.isVariableDeclaration(n) && target && ts.isIdentifier(target) && n.name.getText(ast)===target.text && n.initializer) target=n.initializer;
            if(ts.isVariableDeclaration(n) && n.initializer && ts.isAwaitExpression(n.initializer)) provenance.push(compact(n));
            if(ts.isCallExpression(n) && /(?:requireProject|assertProjectOwnership|assertProjectBaselineWritable|assertParentOwnership|validate)$/.test(n.expression.getText(ast))) checks.push(compact(n));
            ts.forEachChild(n,inspect);
          }
          if(methodNode) inspect(methodNode);
          rows.push({ file, method: owner, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
            assertion: node.getText(ast), target: compact(target), checks, provenance,
            key: `${file}#${owner}` });
        }
        ts.forEachChild(node, child => visit(child, owner, methodNode));
      }
      visit(ast);
    }
  }
  for (const mod of modules) scan(`modules/${mod}/src`);
  return rows.sort((a, b) => a.key.localeCompare(b.key));
}
export function helperCalls(root = process.cwd()) {
  const names = new Set(['assertDrawingPerm','assertDocPerm','assertNcrPerm','assertReportPerm',
    'assertIncidentPermission','assertPermitPermission','assertProjectAccess','assertProjectWriteAllowed']);
  const result = [];
  for(const module of modules) for(const entry of readdirSync(join(root,`modules/${module}/src`))) {
    if(!entry.endsWith('.service.ts')) continue;
    const file=`modules/${module}/src/${entry}`;
    const ast=ts.createSourceFile(file,readFileSync(join(root,file),'utf8'),ts.ScriptTarget.Latest,true);
    function visit(n,owner='') {
      if(ts.isMethodDeclaration(n)) owner=n.name.getText(ast);
      if(ts.isCallExpression(n)) {
        const name=ts.isPropertyAccessExpression(n.expression)?n.expression.name.text:n.expression.getText(ast);
        if(names.has(name)||(name==='guard'&&['project-risk.service.ts','project-issue.service.ts'].includes(entry))) {
          const call=ts.createPrinter({removeComments:true}).printNode(ts.EmitHint.Unspecified,n,ast).replace(/\s+/g,' ').trim();
          result.push({file,method:owner,call});
        }
      }
      ts.forEachChild(n,c=>visit(c,owner));
    }
    visit(ast);
  }
  return result.sort((a,b)=>`${a.file}#${a.method}#${a.call}`.localeCompare(`${b.file}#${b.method}#${b.call}`));
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/service-auth-inventory.mjs')) console.log(JSON.stringify(inventory(), null, 2));
