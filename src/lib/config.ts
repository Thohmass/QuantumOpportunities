// Site-wide settings. The feedback address is a placeholder until the real one exists.
export const FEEDBACK_EMAIL = 'feedback@example.org';
export const REPO_URL = 'https://github.com/Thohmass/QuantumOpportunities';

export function issueUrl(template: 'suggest-event' | 'correction' | 'bug', title = ''): string {
  const p = new URLSearchParams({ template: `${template}.yml` });
  if (title) p.set('title', title);
  return `${REPO_URL}/issues/new?${p.toString()}`;
}

export function mailto(subject: string, body = ''): string {
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
