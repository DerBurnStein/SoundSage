export function NorenBanner({ kanji, title, subtitle }: { kanji: string; title: string; subtitle: string }) {
  return <div style={{ border: '1px solid var(--rule)', padding: 12 }}><div>{kanji} {title}</div><div style={{ color: 'var(--muted)' }}>{subtitle}</div></div>;
}
