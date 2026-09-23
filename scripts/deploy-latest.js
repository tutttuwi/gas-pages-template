const { execFileSync, spawnSync } = require('node:child_process');

function listDeployments() {
  const output = execFileSync('pnpm', ['exec', 'clasp', '--json', 'deployments'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const start = output.indexOf('[');
  const end = output.lastIndexOf(']');
  if (start === -1 || end < start) {
    console.error('Could not read deployments from `pnpm exec clasp --json deployments`.');
    console.error(output);
    process.exit(1);
  }
  const deployments = JSON.parse(output.slice(start, end + 1));
  if (!Array.isArray(deployments)) {
    console.error('Unexpected deployments JSON.');
    process.exit(1);
  }
  return deployments;
}

function pickLatestDeployment(deployments) {
  const entries = deployments
    .map((deployment, index) => ({ deployment, index }))
    .filter(
      ({ deployment }) =>
        deployment &&
        typeof deployment.deploymentId === 'string' &&
        deployment.deploymentId.length > 0,
    );
  if (entries.length === 0) {
    console.error('No deployments found. Create one with: pnpm exec clasp deploy');
    process.exit(1);
  }

  entries.sort((a, b) => {
    const versionA = Number.isFinite(a.deployment.versionNumber) ? a.deployment.versionNumber : -1;
    const versionB = Number.isFinite(b.deployment.versionNumber) ? b.deployment.versionNumber : -1;
    if (versionA !== versionB) return versionB - versionA;
    return b.index - a.index;
  });

  return entries[0].deployment;
}

function main() {
  const latest = pickLatestDeployment(listDeployments());
  const versionLabel = Number.isFinite(latest.versionNumber) ? `@${latest.versionNumber}` : '@HEAD';
  console.log(`Using DEPLOYMENT_ID=${latest.deploymentId} ${versionLabel}`);

  const result = spawnSync('pnpm', ['run', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DEPLOYMENT_ID: latest.deploymentId },
  });

  process.exit(result.status ?? 1);
}

if (require.main === module) {
  main();
}

module.exports = { listDeployments, pickLatestDeployment };
