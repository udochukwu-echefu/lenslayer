"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, FileText, ListChecks, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

const steps = ["Summary", "Risk", "Evidence", "Decision"] as const;

export default function SampleReviewPage() {
  const [step, setStep] = useState(0);
  return <main className="sample-page">
    <header className="sample-nav"><BrandMark /><div><span>Free public beta</span><Link className="button" href="/">Open workspace<ArrowRight size={15} /></Link></div></header>
    <section className="sample-shell">
      <aside><p className="eyebrow">Interactive sample</p><h1>See a contract decision take shape.</h1><p>Walk through a fictional supplier agreement. Nothing here is legal advice or a review of a real document.</p><nav aria-label="Sample review steps">{steps.map((label, index) => <button className={step === index ? "active" : ""} onClick={() => setStep(index)} key={label}><span>{index + 1}</span>{label}</button>)}</nav></aside>
      <article className="sample-review">
        <header><div><FileText size={18} /><span>Fictional supplier agreement</span></div><span className="status ready">Sample</span></header>
        {step === 0 && <section><p className="eyebrow">Plain-language summary</p><h2>This agreement lets Bright Supplies provide office equipment for 12 months.</h2><div className="sample-signals"><div><span>Attention</span><strong>High</strong></div><div><span>High risks</span><strong>1</strong></div><div><span>Open points</span><strong>2</strong></div></div><p>The customer must pay in 14 days, but the supplier can raise prices with little warning. The contract also limits what the customer can recover if deliveries fail.</p></section>}
        {step === 1 && <section><p className="eyebrow">Priority finding</p><div className="sample-finding"><AlertTriangle size={20} /><div><span className="pill high">High risk</span><h2>One-sided price changes</h2><p>The supplier can change prices at any time, while the customer has no clear right to leave.</p><strong>Suggested next step</strong><p>Require 30 days&apos; notice and let the customer cancel before a new price begins.</p></div></div></section>}
        {step === 2 && <section><p className="eyebrow">Source evidence</p><h2>Every important finding points back to the words that caused it.</h2><blockquote><ShieldCheck size={18} /><div><cite>Section 4.2 · Pricing</cite><p>“Supplier may revise the Charges from time to time by written notice to Customer.”</p></div></blockquote><p>The quotation is evidence. The explanation is Lenslayer&apos;s first-pass guidance. A person still makes the decision.</p></section>}
        {step === 3 && <section><p className="eyebrow">Deal Passport</p><h2>Needs attention before signing</h2><div className="sample-checklist"><p><CheckCircle2 size={17} /><span><strong>Accepted</strong>Delivery dates are now fixed.</span></p><p><AlertTriangle size={17} /><span><strong>Unresolved</strong>Price-change notice.</span></p><p><ListChecks size={17} /><span><strong>Next owner</strong>Amina to confirm fallback wording.</span></p></div><p>The final record keeps the review, versions, negotiation outcomes, approvals, owners, and key dates together.</p></section>}
        <footer><button className="button secondary" type="button" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>Back</button>{step < steps.length - 1 ? <button className="button" type="button" onClick={() => setStep((value) => value + 1)}>Next step<ArrowRight size={15} /></button> : <Link className="button" href="/">Open workspace<ArrowRight size={15} /></Link>}</footer>
      </article>
    </section>
  </main>;
}
