import { useEffect } from 'react';
import { useReplayStore } from '../store/useReplayStore';

interface ReplayDebuggerPageProps {
  logId: string | null;
  onBack: () => void;
}

function formatTokens(input: number | null, output: number | null, total: number | null): string {
  return `${input ?? 0} / ${output ?? 0} / ${total ?? 0}`;
}

function formatJsonPreview(preview: string | null | undefined): string {
  if (!preview) {
    return 'N/A';
  }

  const trimmed = preview.trim();
  if (!trimmed) {
    return 'N/A';
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === 'object') {
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    return preview;
  }

  return preview;
}

export function ReplayDebuggerPage({ logId, onBack }: ReplayDebuggerPageProps) {
  const detail = useReplayStore((state) => state.logDetailState);
  const error = useReplayStore((state) => state.error);
  const loadLogDetail = useReplayStore((state) => state.loadLogDetail);
  const clear = useReplayStore((state) => state.clear);

  useEffect(() => {
    if (!logId) {
      return;
    }

    void loadLogDetail(logId);
    return () => {
      clear();
    };
  }, [clear, loadLogDetail, logId]);

  if (!logId) {
    return (
      <section className="panel">
        <h2>Log Detail</h2>
        <p className="meta-line">Select a call log first.</p>
      </section>
    );
  }

  const call = detail?.call ?? null;

  return (
    <section className="replay-page">
      <section className="panel">
        <div className="dashboard-header-row">
          <h2>Log Detail</h2>
          <div className="row-actions">
            <button type="button" onClick={onBack}>
              Back to Logs
            </button>
          </div>
        </div>
        {error ? <p className="error-line">Error: {error}</p> : null}
        {!call ? <p className="meta-line">Loading log detail...</p> : null}
      </section>

      {call ? (
        <>
          <section className="panel">
            <h3>Summary</h3>
            <div className="log-summary-layout">
              <section className="log-summary-group log-summary-group-wide">
                <h4>Identity</h4>
                <dl className="log-summary-list">
                  <div className="log-summary-row">
                    <dt>Time</dt>
                    <dd>{new Date(call.createdAt).toLocaleString()}</dd>
                  </div>
                  <div className="log-summary-row">
                    <dt>Project / Endpoint</dt>
                    <dd>
                      {call.projectName ?? call.projectKey ?? 'N/A'} / {call.endpointName ?? call.endpointKey ?? 'N/A'}
                    </dd>
                  </div>
                  <div className="log-summary-row">
                    <dt>Provider / Model</dt>
                    <dd>
                      {call.providerLabel ?? call.providerKey ?? 'N/A'} / {call.model ?? 'N/A'}
                    </dd>
                  </div>
                  {call.promptHash ? (
                    <div className="log-summary-row">
                      <dt>Prompt Hash</dt>
                      <dd className="log-summary-hash">{call.promptHash}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>

              <section className="log-summary-group">
                <h4>Runtime</h4>
                <dl className="log-summary-list">
                  <div className="log-summary-row">
                    <dt>Success</dt>
                    <dd>{call.success ? 'Yes' : 'No'}</dd>
                  </div>
                  <div className="log-summary-row">
                    <dt>Output Source</dt>
                    <dd>{call.outputSource ?? 'N/A'}</dd>
                  </div>
                  <div className="log-summary-row">
                    <dt>Structured Output</dt>
                    <dd>{call.structuredOutputTriggered ? 'Yes' : 'No'}</dd>
                  </div>
                  <div className="log-summary-row">
                    <dt>Repair Triggered</dt>
                    <dd>{call.repairTriggered ? 'Yes' : 'No'}</dd>
                  </div>
                </dl>
              </section>

              <section className="log-summary-group">
                <h4>Attempts</h4>
                <dl className="log-summary-list">
                  <div className="log-summary-row">
                    <dt>API Call Count</dt>
                    <dd>{call.apiCallCount}</dd>
                  </div>
                  <div className="log-summary-row">
                    <dt>Repair Count</dt>
                    <dd>{call.repairCount}</dd>
                  </div>
                  <div className="log-summary-row">
                    <dt>Attempt Count</dt>
                    <dd>{call.attemptCount}</dd>
                  </div>
                </dl>
              </section>

              <section className="log-summary-group">
                <h4>Performance</h4>
                <dl className="log-summary-list">
                  <div className="log-summary-row">
                    <dt>Latency</dt>
                    <dd>{call.latencyMs === null ? 'N/A' : `${call.latencyMs} ms`}</dd>
                  </div>
                  <div className="log-summary-row">
                    <dt>Tokens (I/O/T)</dt>
                    <dd>{formatTokens(call.inputTokens, call.outputTokens, call.totalTokens)}</dd>
                  </div>
                  <div className="log-summary-row">
                    <dt>Cached Tokens</dt>
                    <dd>{call.cachedTokens ?? 0}</dd>
                  </div>
                </dl>
              </section>

              {!call.success ? (
                <section className="log-summary-group log-summary-group-wide">
                  <h4>Failure</h4>
                  <dl className="log-summary-list">
                    <div className="log-summary-row">
                      <dt>Error Type</dt>
                      <dd>{call.errorType ?? 'N/A'}</dd>
                    </div>
                    <div className="log-summary-row">
                      <dt>Failure Stage</dt>
                      <dd>{call.failureStage ?? 'N/A'}</dd>
                    </div>
                  </dl>
                </section>
              ) : null}
            </div>
          </section>

          <section className="replay-grid">
            <section className="panel log-preview-panel log-preview-panel-input">
              <div className="log-preview-header">
                <h3>Input Preview</h3>
                <span className="log-preview-kind log-preview-kind-input">Input</span>
              </div>
              <pre className="log-preview-block">{formatJsonPreview(call.inputPreview)}</pre>
            </section>

            <section className="panel log-preview-panel log-preview-panel-output">
              <div className="log-preview-header">
                <h3>Final Output Preview</h3>
                <span className="log-preview-kind log-preview-kind-output">Output</span>
              </div>
              <pre className="log-preview-block">{formatJsonPreview(call.outputPreview)}</pre>
            </section>
          </section>

          {call.debugSnapshotAvailable ? (
            <section className="panel">
              <p className="meta-line">
                Deep debug snapshot exists for this call and is stored separately from default logs.
              </p>
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
