// Purpose: present suggested-reply AI tools after sign-in.

/** Render the private mailbox's suggested-reply AI panel and provider disclosure. */
export default function AiAssistantPanel({ configured, model }) {
  return (
    <aside className="ai-panel assistant-panel" aria-label="AI email tools">
      <div className="ai-panel-heading">
        <span className="ai-sparkle" aria-hidden="true">✦</span>
        <span>AI STUDIO</span>
        <span className={`ai-live${configured ? ' ai-live-ready' : ' ai-live-setup'}`}>
          <i />{configured ? 'READY' : 'SETUP NEEDED'}
        </span>
      </div>

      <div className="ai-concept-card">
        <div className="ai-concept-art" aria-hidden="true">
          <span className="ai-envelope-icon">✉</span>
          <span className="ai-art-sparkle ai-art-sparkle-one">✦</span>
          <span className="ai-art-sparkle ai-art-sparkle-two">✧</span>
          <div className="ai-reply-preview">
            <span className="ai-reply-avatar">A</span>
            <span><strong>AI suggested reply</strong><small>Thanks for the update!</small></span>
            <span className="ai-reply-check" aria-hidden="true">✓</span>
          </div>
        </div>
        <div className="ai-copy assistant-copy">
          <span className="ai-eyebrow">EMAIL, WITH A LITTLE HELP</span>
          <h2>Make every message easier.</h2>
          <p>Find a thoughtful reply to your message.</p>
        </div>
      </div>

      <p className="ai-privacy-copy">
        {configured
          ? `Uses ${model}. Text you submit is sent to OpenRouter and its selected model provider.`
          : 'Add an OpenRouter API key in the local .env file to enable AI tools.'}
      </p>
      <div className="ai-footnote"><span aria-hidden="true">✦</span> AI suggestions are yours to review before using</div>
    </aside>
  );
}
