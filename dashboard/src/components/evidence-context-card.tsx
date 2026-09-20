import { ArrowUpRight, FileText, Quote } from "lucide-react";
import Link from "next/link";

type EvidenceContextCardProps = {
  title: string;
  location: string;
  excerpt: string;
  href?: string;
  onOpen?: () => void;
};

export function EvidenceContextCard({ title, location, excerpt, href, onOpen }: EvidenceContextCardProps) {
  const content = <>
    <header>
      <span className="context-file-icon"><FileText size={14} /></span>
      <div><strong>{title}</strong><small>{location}</small></div>
      {href && <ArrowUpRight size={14} aria-hidden="true" />}
    </header>
    <blockquote><Quote size={13} aria-hidden="true" /><p>{excerpt}</p></blockquote>
  </>;

  return href
    ? <Link className="evidence-context-card" href={href} prefetch={false} onClick={onOpen}>{content}</Link>
    : <article className="evidence-context-card">{content}</article>;
}
