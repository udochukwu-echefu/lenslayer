import { DocumentConverter } from "@/components/document-converter";

export default function ConvertPage() {
  return <div className="page converter-page">
    <div className="page-heading"><div><h1 className="page-title">Document converter</h1><p className="page-description">Turn bank statements and transaction-led financial PDFs into clean CSV, Excel, or API-ready JSON.</p></div></div>
    <DocumentConverter />
  </div>;
}
