export function progressLine(event) {
  const stage = event.stage ? ` ${event.stage}` : '';
  return `Stage:${stage} — ${event.status}`;
}
export function createProgressWriter({ enabled = true, write = (text) => process.stderr.write(text) } = {}) {
  return enabled ? (event) => write(`${progressLine(event)}\n`) : () => {};
}
