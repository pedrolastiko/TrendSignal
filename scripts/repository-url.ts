/**
 * Resolves the public repository URL advertised in the collector's User-Agent.
 *
 * Identifying the bot with a contact URL is standard polite-crawler practice, and
 * some publisher CDNs reject an anonymous bot UA outright (PwC answers 403 to a
 * bare `TrendSignalBot/1.0`). Collection and the audit harness therefore resolve
 * it the same way so a local run reproduces what the workflow actually sends.
 *
 * Never hard-codes an owner or repository — it reads the environment GitHub
 * Actions already provides, with an explicit override for local runs.
 */
export function resolveRepositoryUrl(): string | undefined {
  const explicit = process.env.VITE_REPOSITORY_URL?.trim();
  if (explicit) return explicit;

  const server = process.env.GITHUB_SERVER_URL?.trim();
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  if (server && repository) return `${server}/${repository}`;

  return undefined;
}
