const javascriptPath = /\.(?:c?js|mjs)$/iu;
const javascriptMime = /^(?:text|application)\/javascript\b/iu;

// Use the build inventory, not a response-time existence check: an expected
// module remains application-owned even if its generated file goes missing.
export function createArtifactModuleMimeCheck({ origin, generatedFiles }) {
  const artifactOrigin = new URL(origin).origin;
  if (!Array.isArray(generatedFiles) || generatedFiles.some((file) =>
    typeof file !== 'string' || file.includes('\\') || file.split('/').some((part) => !part || part === '.' || part === '..'))) {
    throw new Error('Artifact MIME validation requires canonical generated file paths.');
  }
  const modulePaths = new Set(generatedFiles.filter((file) => javascriptPath.test(file)).map((file) => `/${file}`));
  if (!modulePaths.size) throw new Error('Artifact MIME validation requires a nonempty JavaScript inventory.');

  return function hasArtifactModuleMimeFailure(response) {
    const url = new URL(response.url());
    if (url.origin !== artifactOrigin) return false;
    const pathname = decodeURIComponent(url.pathname);
    return modulePaths.has(pathname) && response.status() === 200
      && !javascriptMime.test(response.headers()['content-type'] ?? '');
  };
}
