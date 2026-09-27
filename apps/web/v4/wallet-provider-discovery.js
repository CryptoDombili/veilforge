const EIP6963_ANNOUNCE = 'eip6963:announceProvider';
const EIP6963_REQUEST = 'eip6963:requestProvider';

function safeRead(target, property) {
  try { return target?.[property]; } catch { return undefined; }
}

function isProvider(provider) {
  try { return typeof provider?.request === 'function'; } catch { return false; }
}

function normalizeCandidate(candidate, source) {
  const provider = candidate?.provider ?? candidate;
  if (!isProvider(provider)) return null;
  const supplied = candidate?.info ?? {};
  return Object.freeze({
    provider,
    source,
    info: Object.freeze({
      name: String(supplied.name ?? '').trim(),
      rdns: String(supplied.rdns ?? '').trim(),
      uuid: String(supplied.uuid ?? '').trim(),
      icon: String(supplied.icon ?? '').trim(),
    }),
  });
}

function legacyCandidates(scope) {
  const candidates = [];
  const injected = safeRead(scope, 'ethereum');
  const providers = safeRead(injected, 'providers');
  if (Array.isArray(providers)) candidates.push(...providers);
  else if (injected) candidates.push(injected);
  const keplr = safeRead(safeRead(scope, 'keplr'), 'ethereum');
  const phantom = safeRead(safeRead(scope, 'phantom'), 'ethereum');
  if (keplr) candidates.push({ provider: keplr, info: { name: 'Keplr EVM', rdns: 'app.keplr' } });
  if (phantom) candidates.push({ provider: phantom, info: { name: 'Phantom', rdns: 'app.phantom' } });
  return candidates.map((candidate) => normalizeCandidate(candidate, 'legacy')).filter(Boolean);
}

function uniqueCandidates(candidates) {
  const providers = new Set();
  return candidates.filter((candidate) => {
    if (providers.has(candidate.provider)) return false;
    providers.add(candidate.provider);
    return true;
  });
}

function providerOrder(left, right) {
  const leftKey = `${left.info.rdns}\u0000${left.info.name}\u0000${left.info.uuid}`.toLowerCase();
  const rightKey = `${right.info.rdns}\u0000${right.info.name}\u0000${right.info.uuid}`.toLowerCase();
  return leftKey.localeCompare(rightKey);
}

function requestEvent(scope) {
  const EventConstructor = safeRead(scope, 'Event');
  if (typeof EventConstructor === 'function') {
    try { return new EventConstructor(EIP6963_REQUEST); } catch {}
  }
  return Object.freeze({ type: EIP6963_REQUEST });
}

export async function discoverWalletProviders({ scope = globalThis, waitMs = 80 } = {}) {
  const announced = [];
  const addEventListener = safeRead(scope, 'addEventListener');
  const removeEventListener = safeRead(scope, 'removeEventListener');
  const dispatchEvent = safeRead(scope, 'dispatchEvent');
  const onAnnouncement = (event) => {
    const candidate = normalizeCandidate(event?.detail, 'eip6963');
    if (candidate) announced.push(candidate);
  };
  if (typeof addEventListener === 'function') {
    try { addEventListener.call(scope, EIP6963_ANNOUNCE, onAnnouncement); } catch {}
  }
  try {
    if (typeof dispatchEvent === 'function') {
      try { dispatchEvent.call(scope, requestEvent(scope)); } catch {}
    }
    const delay = Number.isFinite(waitMs) ? Math.max(0, Math.min(250, waitMs)) : 80;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  } finally {
    if (typeof removeEventListener === 'function') {
      try { removeEventListener.call(scope, EIP6963_ANNOUNCE, onAnnouncement); } catch {}
    }
  }
  const preferred = uniqueCandidates(announced).sort(providerOrder);
  if (preferred.length > 0) return Object.freeze(preferred);
  return Object.freeze(uniqueCandidates(legacyCandidates(scope)));
}

export async function discoverWalletProvider(options = {}) {
  const providers = await discoverWalletProviders(options);
  return providers[0]?.provider ?? null;
}
