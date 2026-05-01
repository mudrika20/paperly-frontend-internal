# Paperly Project Persistent Rules
- ALWAYS use Prompt Caching for the system prompts.
- Output MUST be structured JSON for extractions.
- When rendering Marking Schemes, always use the table layout defined in MarkingSchemeCard.jsx.
- Maintain the paper_reference_key (YEAR_SUBJECT_PAPER_VARIANT) across all DB entries.
- If a document is a Marking Scheme, force-route to the MS pipeline.
- Avoid verbose explanations; provide high-quality code first.