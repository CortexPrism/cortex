#!/usr/bin/env deno run --allow-read

const PACKAGES_DIR = 'packages';
const SRC_DIR = 'src';

interface PackageInfo {
  name: string;
  path: string;
  contractsDir: string;
  srcDir: string;
}

async function getPackages(): Promise<PackageInfo[]> {
  const pkgs: PackageInfo[] = [];
  for await (const entry of Deno.readDir(PACKAGES_DIR)) {
    if (!entry.isDirectory) continue;
    const pkgPath = `${PACKAGES_DIR}/${entry.name}`;
    const contractsDir = `${pkgPath}/contracts`;
    const srcDir = `${pkgPath}/src`;
    try {
      await Deno.stat(contractsDir);
      await Deno.stat(srcDir);
      pkgs.push({ name: entry.name, path: pkgPath, contractsDir, srcDir });
    } catch {
      // Skip incomplete packages
    }
  }
  return pkgs;
}

function checkImportsInFile(
  filePath: string,
  content: string,
  packages: PackageInfo[],
): string[] {
  const violations: string[] = [];
  const currentPkg = packages.find((p) => filePath.startsWith(p.path + '/'));

  const importRe = /from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(content)) !== null) {
    const importPath = match[1];
    // Only check workspace-style imports (@cortex/...) or relative imports
    if (importPath.startsWith('@cortex/')) {
      const parts = importPath.split('/');
      const targetPkgName = parts[0].replace('@cortex/', '');
      const targetPath = parts.slice(1).join('/');

      if (currentPkg && targetPkgName !== currentPkg.name) {
        // Cross-package import: must be from contracts/
        if (!targetPath.startsWith('contracts/')) {
          violations.push(
            `${filePath}: imports '${importPath}' — cross-package imports must use contracts/`,
          );
        }
      }
    }
  }

  // Check that only src/main.ts imports from old src/
  if (filePath.endsWith('/src/main.ts')) return violations; // main.ts is exempt

  const srcImportRe = /from\s+['"]\.\.\/[.][/]src\//g;
  let m2: RegExpExecArray | null;
  while ((m2 = srcImportRe.exec(content)) !== null) {
    violations.push(
      `${filePath}: imports from old 'src/' path — should use contracts instead`,
    );
  }

  return violations;
}

async function scanDirectory(dir: string, packages: PackageInfo[]): Promise<string[]> {
  const violations: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const fullPath = `${dir}/${entry.name}`;
    if (entry.isDirectory && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      violations.push(...await scanDirectory(fullPath, packages));
    } else if (entry.isFile && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      const content = await Deno.readTextFile(fullPath);
      violations.push(...checkImportsInFile(fullPath, content, packages));
    }
  }
  return violations;
}

async function main() {
  const packages = await getPackages();
  console.log(`Checking ${packages.length} packages...`);

  const allViolations: string[] = [];

  for (const pkg of packages) {
    const srcViolations = await scanDirectory(pkg.srcDir, packages);
    const contractsViolations = await scanDirectory(pkg.contractsDir, packages);
    allViolations.push(...srcViolations, ...contractsViolations);
  }

  // Check src/main.ts
  try {
    const mainContent = await Deno.readTextFile(`${SRC_DIR}/main.ts`);
    // main.ts is exempt
  } catch {
    // ok
  }

  if (allViolations.length === 0) {
    console.log('All import boundaries are valid.');
    Deno.exit(0);
  } else {
    console.error(`Found ${allViolations.length} boundary violations:`);
    for (const v of allViolations) {
      console.error(`  - ${v}`);
    }
    Deno.exit(1);
  }
}

main();
