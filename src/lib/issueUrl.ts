export function buildIssueUrl(templateFile: string): string {
  const repoUrl = import.meta.env.VITE_REPOSITORY_URL?.replace(/\/$/, '');
  if (!repoUrl) return '#';
  return `${repoUrl}/issues/new?template=${templateFile}`;
}
