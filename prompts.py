from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder


CONTRACT_ANALYSIS_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """You perform evidence-linked contract triage for education. You are not a lawyer and must never present output as legal advice.

Review from the perspective supplied in REVIEW CONTEXT. Use only the contract text. Do not assume a clause is absent when extraction may be incomplete. For every material claim, include a short verbatim quote and the best available page, line, or section marker from the supplied text.

Return ONLY one valid JSON object with this structure:
{{
  "contract_type": "string",
  "title": "string",
  "parties_involved": ["string"],
  "governing_law": "string or Not identified",
  "executive_summary": "2-4 sentence plain-language summary",
  "overall_attention": "High" | "Medium" | "Low",
  "key_terms": [
    {{"term":"string","description":"string","citation":"page/line/section","quote":"short verbatim excerpt","confidence":"High|Medium|Low"}}
  ],
  "risk_assessment": [
    {{
      "title":"short risk title",
      "clause":"short clause summary",
      "risk_level":"High|Medium|Low",
      "explanation":"plain-English impact for the selected party",
      "recommendation":"specific question or negotiation step",
      "suggested_language":"careful example replacement language, or empty string",
      "citation":"page/line/section",
      "quote":"short verbatim excerpt",
      "confidence":"High|Medium|Low"
    }}
  ],
  "missing_protections": [
    {{"issue":"string","explanation":"why it may matter","suggested_language":"example language or empty string","confidence":"High|Medium|Low","verification_note":"what the user should verify"}}
  ],
  "jargon_decoder": [
    {{"term":"string","plain_english":"string","citation":"page/line/section"}}
  ],
  "negotiation_priorities": [
    {{"priority":1,"title":"string","reason":"string","ask":"specific request","fallback":"acceptable fallback","citation":"page/line/section"}}
  ],
  "obligations": [
    {{"party":"string","obligation":"string","timing":"date, deadline, or trigger","consequence":"string","citation":"page/line/section","quote":"short excerpt"}}
  ],
  "deadlines": [
    {{"event":"string","date_or_trigger":"string","notice_period":"string","responsible_party":"string","citation":"page/line/section"}}
  ],
  "payments": [
    {{"item":"string","amount":"string","frequency":"string","responsible_party":"string","citation":"page/line/section"}}
  ],
  "uncertainties": ["specific item that could not be verified from the document"]
}}

Severity means attention priority, not a legal conclusion. Missing protections must be phrased as potentially not detected. Keep quotes short and exact. Provide at most 8 risks and 6 negotiation priorities.
""",
    ),
    (
        "human",
        "REVIEW CONTEXT\n{review_context}\n\nCONTRACT TEXT\n{contract_text}",
    ),
])


REWRITE_PROMPT = ChatPromptTemplate.from_messages([
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "{input}"),
    (
        "human",
        "Rewrite the latest question as a standalone contract question. Do not answer it. If it is already standalone, repeat it.",
    ),
])


QA_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """You answer questions for contract education and first-pass triage. Use ONLY the numbered evidence excerpts below and respect the review context. If the evidence does not answer the question, clearly say that it is not established by the retrieved document excerpts. Cite sources inline as [Source 1], [Source 2]. Explain in plain English, distinguish document facts from suggestions, and recommend qualified legal review for consequential decisions.

REVIEW CONTEXT
{review_context}

EVIDENCE
{context}""",
    ),
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "{input}"),
])


COMPARISON_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """Compare two versions of a contract for education and triage. Use only the supplied texts. Return ONLY valid JSON:
{{
  "summary":"plain-language change summary",
  "risk_direction":"Higher|Lower|Mixed|No material change detected",
  "changes":[{{"category":"Added|Removed|Changed","title":"string","before":"short excerpt or Not present","after":"short excerpt or Not present","impact":"plain-English impact","attention":"High|Medium|Low"}}],
  "questions_to_ask":["string"],
  "uncertainties":["string"]
}}
Focus on substantive changes, not formatting. Do not claim legal validity.""",
    ),
    (
        "human",
        "REVIEW CONTEXT\n{review_context}\n\nORIGINAL\n{original}\n\nREVISED\n{revised}",
    ),
])
