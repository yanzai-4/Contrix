import { useEffect, useMemo, useState } from 'react';
import { MonacoReadOnly } from '../common/MonacoReadOnly';
import { subscribeEndpointContentUpdated } from '../../services/endpointSyncEvents';
import { useEndpointRuntimeStore } from '../../store/useEndpointRuntimeStore';
import { RuntimeJsonInputForm } from './RuntimeJsonInputForm';
import {
  buildLineDiff,
  computeSharedOutputOverlap,
  countSharedOutputGroups,
  formatLatency,
  formatPercent,
  formatTokenCount,
  isFailedAttempt,
  prettyJson,
  runSeries,
  summarizeInline,
  toErrorMessage,
  type CompareModelResult,
  type StabilitySummary
} from './runtime-analysis';

export function EndpointRuntimePanel() {
  const {
    endpointId,
    endpointName,
    routePreview,
    runtimeMeta,
    inputJsonSchema,
    runtimeResult,
    runtimePreflightState,
    runtimeReadinessState,
    runtimeAttemptTraceState,
    validationState,
    repairTraceState,
    inputText,
    inputJsonText,
    loadingMeta,
    checkingReadiness,
    compilingPrompt,
    running,
    error,
    refreshMeta,
    checkReadiness,
    compilePromptForRuntime,
    setInputText,
    setInputJsonText,
    setOverrideModel,
    runRuntime
  } = useEndpointRuntimeStore();

  useEffect(() => {
    if (!endpointId) {
      return undefined;
    }

    return subscribeEndpointContentUpdated((detail) => {
      if (detail.endpointId !== endpointId) {
        return;
      }

      void refreshMeta();
      void checkReadiness();
    });
  }, [endpointId, refreshMeta, checkReadiness]);

  useEffect(() => {
    if (!runtimePreflightState) {
      return;
    }

    const shouldAutoCompilePrompt =
      runtimePreflightState.specStatus === 'current' &&
      (runtimePreflightState.promptStatus === 'stale' || runtimePreflightState.promptStatus === 'missing');

    if (!shouldAutoCompilePrompt || compilingPrompt || checkingReadiness || running) {
      return;
    }

    void compilePromptForRuntime();
  }, [runtimePreflightState, compilingPrompt, checkingReadiness, running, compilePromptForRuntime]);

  const inputMode = runtimePreflightState?.inputMode ?? runtimeMeta?.inputMode ?? 'text';
  const readiness = runtimeReadinessState?.status ?? runtimePreflightState?.runtimeReadiness ?? '-';
  const readinessIssues = runtimeReadinessState?.issues ?? runtimePreflightState?.issues ?? [];
  const hasReadinessProblem = readiness !== 'ready' || readinessIssues.length > 0;
  const routeDisplay = routePreview
    ? routePreview.startsWith('http://') || routePreview.startsWith('https://')
      ? routePreview
      : `localhost:4411${routePreview.startsWith('/') ? '' : '/'}${routePreview}`
    : '-';
  const effectiveModelForTest = runtimePreflightState?.resolvedModel ?? runtimeMeta?.model ?? '-';
  const providerForTest = runtimePreflightState?.providerType ?? runtimeMeta?.providerType ?? '-';
  const isReady = runtimePreflightState?.runtimeReadiness === 'ready';
  const attempts = runtimeResult?.attempts ?? runtimeAttemptTraceState;
  const retryCount = attempts.filter((attempt) => attempt.retryTriggered).length;
  const repairTriggered =
    repairTraceState.length > 0 ||
    attempts.some((attempt) => Boolean(attempt.deterministicRepairResult) || Boolean(attempt.repairPromptUsed));
  const outputSource = runtimeResult?.success ? runtimeResult.outputSource : null;
  const fallbackTriggered = outputSource ? outputSource.startsWith('fallback_') : false;
  const repairSucceeded =
    outputSource === 'deterministic_repair' || outputSource === 'repair_retry_deterministic_repair';
  const totalLatencyMs = attempts.length > 0 ? attempts.reduce((total, attempt) => total + attempt.latencyMs, 0) : null;
  const inputTokens = runtimeResult?.success ? runtimeResult.usage.inputTokens : null;
  const outputTokens = runtimeResult?.success ? runtimeResult.usage.outputTokens : null;
  const cachedInputTokens = runtimeResult?.success ? runtimeResult.usage.cachedInputTokens : null;
  const failedAttempts = runtimeAttemptTraceState.filter(isFailedAttempt);
  const repairSourceAttempt =
    attempts.find((attempt) => Boolean(attempt.deterministicRepairResult && attempt.rawProviderText)) ??
    failedAttempts[0] ??
    null;
  const problematicOutput = repairSourceAttempt?.rawProviderText ?? null;
  const repairedOutput = runtimeResult?.success ? prettyJson(runtimeResult.finalOutputJson) : null;
  const repairDiff =
    runtimeResult?.success && repairTriggered && problematicOutput && repairedOutput
      ? buildLineDiff(problematicOutput, repairedOutput)
      : null;
  const validationIssuesForDisplay =
    runtimeResult && !runtimeResult.success ? runtimeResult.lastValidationIssues : validationState.lastValidationIssues;
  const hasValidationIssueList = validationIssuesForDisplay.length > 0;
  const [testMode, setTestMode] = useState<TestMode>('single');
  const [stabilityRunCount, setStabilityRunCount] = useState<number>(10);
  const [stabilityRunning, setStabilityRunning] = useState(false);
  const [stabilityProgress, setStabilityProgress] = useState<number>(0);
  const [stabilityResult, setStabilityResult] = useState<StabilitySummary | null>(null);
  const [stabilityError, setStabilityError] = useState<string | null>(null);
  const [compareModelInputs, setCompareModelInputs] = useState<string[]>(['']);
  const [compareRunsPerModel, setCompareRunsPerModel] = useState<number>(5);
  const [compareRunning, setCompareRunning] = useState(false);
  const [compareProgress, setCompareProgress] = useState<string>('');
  const [compareResults, setCompareResults] = useState<CompareModelResult[]>([]);
  const [compareError, setCompareError] = useState<string | null>(null);

  useEffect(() => {
    setOverrideModel('');
    setStabilityResult(null);
    setStabilityError(null);
    setStabilityProgress(0);
    setCompareResults([]);
    setCompareError(null);
    setCompareProgress('');
    setCompareModelInputs(effectiveModelForTest && effectiveModelForTest !== '-' ? [effectiveModelForTest] : ['']);
    setTestMode('single');
  }, [endpointId, effectiveModelForTest, setOverrideModel]);

  const compareModels = useMemo(
    () =>
      Array.from(
        new Set(
          compareModelInputs
            .map((item) => item.trim())
            .filter(Boolean)
        )
      ),
    [compareModelInputs]
  );

  const updateCompareModelInput = (index: number, value: string) => {
    setCompareModelInputs((previous) => previous.map((current, currentIndex) => (currentIndex === index ? value : current)));
  };

  const addCompareModelInput = () => {
    setCompareModelInputs((previous) => [...previous, '']);
  };

  const removeCompareModelInput = (index: number) => {
    setCompareModelInputs((previous) => {
      if (previous.length <= 1) {
        return [''];
      }
      return previous.filter((_, currentIndex) => currentIndex !== index);
    });
  };

  const sharedOutputOverlap = useMemo(() => computeSharedOutputOverlap(compareResults), [compareResults]);
  const sharedOutputGroupCount = useMemo(() => countSharedOutputGroups(compareResults), [compareResults]);
  const busyAnyMode = loadingMeta || checkingReadiness || compilingPrompt || running || stabilityRunning || compareRunning;

  const runStabilityTest = async () => {
    if (!endpointId) {
      return;
    }

    if (!isReady) {
      setStabilityError('Runtime is not ready yet.');
      return;
    }

    setStabilityRunning(true);
    setStabilityError(null);
    setStabilityResult(null);
    setStabilityProgress(0);

    try {
      const summary = await runSeries(
        endpointId,
        inputMode === 'json' ? 'json' : 'text',
        inputText,
        inputJsonText,
        null,
        stabilityRunCount,
        (currentRun) => setStabilityProgress(currentRun)
      );
      setStabilityResult(summary);
    } catch (error) {
      setStabilityError(toErrorMessage(error));
    } finally {
      setStabilityRunning(false);
    }
  };

  const runCompareModels = async () => {
    if (!endpointId) {
      return;
    }

    if (!isReady) {
      setCompareError('Runtime is not ready yet.');
      return;
    }

    if (compareModels.length === 0) {
      setCompareError('Add at least one model to compare.');
      return;
    }

    setCompareRunning(true);
    setCompareError(null);
    setCompareResults([]);
    setCompareProgress('');

    try {
      const nextResults: CompareModelResult[] = [];

      for (let modelIndex = 0; modelIndex < compareModels.length; modelIndex += 1) {
        const model = compareModels[modelIndex] ?? '';
        if (!model) {
          continue;
        }

        setCompareProgress(`Running ${model} (${modelIndex + 1}/${compareModels.length})...`);

        const summary = await runSeries(
          endpointId,
          inputMode === 'json' ? 'json' : 'text',
          inputText,
          inputJsonText,
          model,
          compareRunsPerModel,
          (currentRun) =>
            setCompareProgress(
              `Running ${model} (${modelIndex + 1}/${compareModels.length}), run ${currentRun}/${compareRunsPerModel}...`
            )
        );

        nextResults.push({
          model,
          summary
        });
      }

      setCompareResults(nextResults);
      setCompareProgress('');
    } catch (error) {
      setCompareError(toErrorMessage(error));
      setCompareProgress('');
    } finally {
      setCompareRunning(false);
    }
  };

  if (!endpointId) {
    return null;
  }

  const modeTitle = testMode === 'single' ? 'Result' : testMode === 'stability' ? 'Stability Results' : 'Comparison Results';

  return (
    <section className="runtime-panel-stack">
      <section className="panel">
        <div className="schema-header-row">
          <div>
            <h3>Test: {endpointName ?? endpointId}</h3>
            <div className="runtime-top-card-grid">
              <article className="runtime-result-metric">
                <p className="runtime-result-metric-label">Route</p>
                <p className="runtime-result-metric-value">{routeDisplay === '-' ? '-' : <code>{routeDisplay}</code>}</p>
              </article>
              <article className="runtime-result-metric">
                <p className="runtime-result-metric-label">Provider</p>
                <p className="runtime-result-metric-value">{providerForTest}</p>
              </article>
              <article className="runtime-result-metric">
                <p className="runtime-result-metric-label">Current Model</p>
                <p className="runtime-result-metric-value">{effectiveModelForTest === '-' ? '-' : <code>{effectiveModelForTest}</code>}</p>
              </article>
            </div>
          </div>
        </div>

        <div className="runtime-mode-switch-row">
          <p className="runtime-mode-switch-label">Test Mode</p>
          <div className="runtime-mode-switch">
            <button
              type="button"
              className={`runtime-mode-switch-btn${testMode === 'single' ? ' active' : ''}`}
              onClick={() => setTestMode('single')}
              disabled={busyAnyMode}
            >
              Single Run
            </button>
            <button
              type="button"
              className={`runtime-mode-switch-btn${testMode === 'stability' ? ' active' : ''}`}
              onClick={() => setTestMode('stability')}
              disabled={busyAnyMode}
            >
              Stability Test
            </button>
            <button
              type="button"
              className={`runtime-mode-switch-btn${testMode === 'compare' ? ' active' : ''}`}
              onClick={() => setTestMode('compare')}
              disabled={busyAnyMode}
            >
              Compare Models
            </button>
          </div>
        </div>

        {loadingMeta || checkingReadiness || compilingPrompt ? <p className="meta-line">Syncing runtime...</p> : null}

        {hasReadinessProblem ? (
          <section className="runtime-warning-panel">
            <p className="runtime-warning-title">Runtime is not ready</p>
            <p className="runtime-warning-message">Status: {readiness}</p>
            {readinessIssues.length > 0 ? (
              <ul>
                {readinessIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {error ? <p className="error-line">{error}</p> : null}
      </section>

      <section className="runtime-workspace-grid">
        <section className="panel compact-panel runtime-workspace-left">
          <h3>Input</h3>
          {inputMode === 'text' ? (
            <label>
              inputText
              <textarea rows={12} value={inputText} onChange={(event) => setInputText(event.target.value)} />
            </label>
          ) : (
            <>
              {inputJsonSchema ? (
                <RuntimeJsonInputForm
                  schema={inputJsonSchema}
                  valueText={inputJsonText}
                  onChangeValueText={setInputJsonText}
                />
              ) : (
                <label>
                  inputJson
                  <textarea
                    className="json-editor"
                    rows={14}
                    value={inputJsonText}
                    onChange={(event) => setInputJsonText(event.target.value)}
                  />
                </label>
              )}
            </>
          )}

          <section className="runtime-mode-action-block">
            <p className="runtime-mode-action-heading">Send</p>
            {testMode === 'stability' ? (
              <div className="runtime-mode-controls">
                <label>
                  Runs
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={stabilityRunCount}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value);
                      if (!Number.isFinite(nextValue)) {
                        return;
                      }
                      setStabilityRunCount(Math.max(1, Math.min(100, Math.floor(nextValue))));
                    }}
                  />
                </label>
              </div>
            ) : null}

            {testMode === 'compare' ? (
              <div className="runtime-mode-controls runtime-mode-controls-wide">
                <div className="runtime-compare-model-inputs">
                  <p className="runtime-mode-control-title">Models</p>
                  {compareModelInputs.map((modelInput, index) => (
                    <div key={`compare-model-input-${index}`} className="runtime-compare-model-input-row">
                      <input
                        type="text"
                        placeholder={`Model ${index + 1}`}
                        value={modelInput}
                        onChange={(event) => updateCompareModelInput(index, event.target.value)}
                      />
                      {compareModelInputs.length > 1 ? (
                        <button
                          type="button"
                          className="runtime-inline-action-btn danger"
                          onClick={() => removeCompareModelInput(index)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <button type="button" className="runtime-inline-action-btn" onClick={addCompareModelInput}>
                    + Add Model
                  </button>
                </div>
                <label>
                  Runs Per Model
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={compareRunsPerModel}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value);
                      if (!Number.isFinite(nextValue)) {
                        return;
                      }
                      setCompareRunsPerModel(Math.max(1, Math.min(50, Math.floor(nextValue))));
                    }}
                  />
                </label>
              </div>
            ) : null}

            <button
              type="button"
              className="runtime-send-btn"
              onClick={() => {
                if (testMode === 'single') {
                  void runRuntime();
                  return;
                }
                if (testMode === 'stability') {
                  void runStabilityTest();
                  return;
                }
                void runCompareModels();
              }}
              disabled={
                busyAnyMode ||
                !isReady ||
                (testMode === 'compare' && compareModels.length === 0) ||
                (testMode === 'stability' && stabilityRunCount < 1)
              }
            >
              {testMode === 'single'
                ? running
                  ? 'Sending...'
                  : 'Send Request'
                : testMode === 'stability'
                  ? stabilityRunning
                    ? `Running ${stabilityProgress}/${stabilityRunCount}...`
                    : 'Run Stability Test'
                  : compareRunning
                    ? compareProgress || 'Comparing Models...'
                    : 'Run Model Comparison'}
            </button>
          </section>
        </section>

        <section className="panel compact-panel runtime-workspace-right">
          <h3>{modeTitle}</h3>
          {testMode === 'single' ? (
            <>
              {!runtimeResult ? (
                <p className="meta-line">No result yet.</p>
              ) : (
                <>
                  <div className="runtime-result-header">
                    {runtimeResult.success ? (
                      fallbackTriggered ? (
                        <span className="runtime-result-badge runtime-result-badge-fallback">Fallback</span>
                      ) : (
                        <span className="runtime-result-badge runtime-result-badge-success">Success</span>
                      )
                    ) : (
                      <span className="runtime-result-badge runtime-result-badge-failed">Failed</span>
                    )}
                    {retryCount > 0 ? (
                      <span className="runtime-result-badge runtime-result-badge-retry">Retry x{retryCount}</span>
                    ) : null}
                    {repairSucceeded ? (
                      <span className="runtime-result-badge runtime-result-badge-repaired">Auto Repaired</span>
                    ) : null}
                  </div>

                  <div className="runtime-result-metric-grid">
                    <div className="runtime-result-metric">
                      <p className="runtime-result-metric-label">Input Tokens</p>
                      <p className="runtime-result-metric-value">{formatTokenCount(inputTokens)}</p>
                    </div>
                    <div className="runtime-result-metric">
                      <p className="runtime-result-metric-label">Output Tokens</p>
                      <p className="runtime-result-metric-value">{formatTokenCount(outputTokens)}</p>
                    </div>
                    <div className="runtime-result-metric">
                      <p className="runtime-result-metric-label">Cached Tokens</p>
                      <p className="runtime-result-metric-value">{formatTokenCount(cachedInputTokens)}</p>
                    </div>
                    <div className="runtime-result-metric">
                      <p className="runtime-result-metric-label">Latency</p>
                      <p className="runtime-result-metric-value">{formatLatency(totalLatencyMs)}</p>
                    </div>
                  </div>

                  <section className="runtime-output-block">
                    <p className="runtime-output-label">Final Output JSON</p>
                    {runtimeResult.success ? (
                      <MonacoReadOnly value={prettyJson(runtimeResult.finalOutputJson)} language="json" height={280} />
                    ) : (
                      <p className="meta-line">No final output JSON.</p>
                    )}
                  </section>

                  {!runtimeResult.success ? (
                    <section className="runtime-error-panel">
                      <p className="runtime-error-title">Runtime Error</p>
                      <p className="runtime-error-message">{runtimeResult.error.message}</p>
                      <p className="runtime-error-meta">
                        {runtimeResult.error.type} / {runtimeResult.error.stage}
                      </p>
                    </section>
                  ) : null}

                  <details className="runtime-debug-disclosure runtime-debug-inline">
                    <summary className="runtime-debug-disclosure-summary">Execution Details</summary>
                    <div className="runtime-debug-flat-stack">
                      <section className="runtime-debug-section">
                        <h4 className="runtime-debug-heading">Attempt Trace</h4>
                        {failedAttempts.length === 0 ? (
                          <p className="runtime-validation-success">No failed attempts. No trace issues detected.</p>
                        ) : (
                          <div className="runtime-failed-attempt-list">
                            {failedAttempts.map((attempt) => (
                              <article
                                key={`${attempt.attemptIndex}-${attempt.providerCallIndex}`}
                                className="runtime-failed-attempt-card"
                              >
                                <p className="runtime-failed-attempt-title">
                                  Failed Attempt {attempt.attemptIndex} / Call {attempt.providerCallIndex}
                                </p>
                                <p className="runtime-failed-attempt-meta">
                                  Stage: {attempt.errorStage ?? 'validation'} | Latency: {attempt.latencyMs}ms | Retry:{' '}
                                  {attempt.retryTriggered ? 'yes' : 'no'}
                                </p>
                                {attempt.errorType ? (
                                  <p className="runtime-failed-attempt-meta">
                                    Error: {attempt.errorType}
                                    {attempt.message ? ` - ${attempt.message}` : ''}
                                  </p>
                                ) : null}
                                {attempt.rawProviderText ? (
                                  <MonacoReadOnly value={attempt.rawProviderText} language="markdown" height={150} />
                                ) : (
                                  <p className="meta-line">No failed raw output content for this attempt.</p>
                                )}

                                {attempt.validationResult && !attempt.validationResult.success ? (
                                  <ul className="validation-errors">
                                    {attempt.validationResult.errors.map((issue, index) => (
                                      <li key={`${attempt.attemptIndex}-${issue.path}-${issue.keyword}-${index}`}>
                                        {issue.path || '/'}: {issue.message}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </article>
                            ))}
                          </div>
                        )}
                      </section>

                      <section className="runtime-debug-section">
                        <h4 className="runtime-debug-heading">Validation / Repair</h4>

                        {runtimeResult.success && !repairTriggered && !hasValidationIssueList ? (
                          <p className="runtime-validation-success">
                            Validation passed with no repair needed. No validation issues detected.
                          </p>
                        ) : null}

                        {runtimeResult.success && repairTriggered ? (
                          <section className="runtime-repair-diff-board">
                            <p className="meta-line">
                              Repair was applied. Red lines show problematic content. Yellow lines show added fixed content.
                            </p>
                            {repairDiff ? (
                              <div className="runtime-repair-diff-grid">
                                <section className="runtime-repair-pane runtime-repair-pane-problem">
                                  <p className="runtime-repair-pane-title">Original Problematic Output</p>
                                  <pre className="runtime-diff-lines">
                                    {repairDiff.beforeLines.map((line, index) => (
                                      <span
                                        key={`before-${index}`}
                                        className={`runtime-diff-line ${line.state === 'removed' ? 'runtime-diff-line-removed' : ''}`}
                                      >
                                        {line.text || ' '}
                                      </span>
                                    ))}
                                  </pre>
                                </section>

                                <section className="runtime-repair-pane runtime-repair-pane-fixed">
                                  <p className="runtime-repair-pane-title">Repaired Output</p>
                                  <pre className="runtime-diff-lines">
                                    {repairDiff.afterLines.map((line, index) => (
                                      <span
                                        key={`after-${index}`}
                                        className={`runtime-diff-line ${line.state === 'added' ? 'runtime-diff-line-added' : ''}`}
                                      >
                                        {line.text || ' '}
                                      </span>
                                    ))}
                                  </pre>
                                </section>
                              </div>
                            ) : (
                              <MonacoReadOnly value={repairedOutput ?? '{}'} language="json" height={220} />
                            )}
                          </section>
                        ) : null}

                        {hasValidationIssueList ? (
                          <ul className="validation-errors">
                            {validationIssuesForDisplay.map((issue, index) => (
                              <li key={`${issue.path}-${issue.keyword}-${index}`}>
                                {issue.path || '/'}: {issue.message}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {!runtimeResult.success ? (
                          <p className="runtime-error-meta">
                            Validation/repair did not produce a valid final output. {summarizeInline(runtimeResult.error.message)}
                          </p>
                        ) : null}
                      </section>
                    </div>
                  </details>
                </>
              )}
            </>
          ) : null}

          {testMode === 'stability' ? (
            <>
              {stabilityError ? (
                <section className="runtime-error-panel">
                  <p className="runtime-error-title">Stability Test Error</p>
                  <p className="runtime-error-message">{stabilityError}</p>
                </section>
              ) : null}
              {!stabilityResult && !stabilityRunning ? (
                <p className="meta-line">Run a stability test to see consistency analytics.</p>
              ) : null}
              {stabilityResult ? (
                <div className="runtime-analysis-stack">
                  <div className="runtime-analysis-summary-grid">
                    <article className="runtime-result-metric">
                      <p className="runtime-result-metric-label">Total Runs</p>
                      <p className="runtime-result-metric-value">{stabilityResult.totalRuns}</p>
                    </article>
                    <article className="runtime-result-metric">
                      <p className="runtime-result-metric-label">Success Rate</p>
                      <p className="runtime-result-metric-value">{formatPercent(stabilityResult.successRate)}</p>
                    </article>
                    <article className="runtime-result-metric">
                      <p className="runtime-result-metric-label">Unique Outputs</p>
                      <p className="runtime-result-metric-value">{stabilityResult.uniqueOutputCount}</p>
                    </article>
                    <article className="runtime-result-metric">
                      <p className="runtime-result-metric-label">Repeated Outputs</p>
                      <p className="runtime-result-metric-value">{stabilityResult.repeatedOutputCount}</p>
                    </article>
                    <article className="runtime-result-metric">
                      <p className="runtime-result-metric-label">Most Common Output</p>
                      <p className="runtime-result-metric-value">{stabilityResult.mostCommonOutputCount}</p>
                    </article>
                    <article className="runtime-result-metric">
                      <p className="runtime-result-metric-label">Output Match Rate</p>
                      <p className="runtime-result-metric-value">{formatPercent(stabilityResult.mostCommonOutputRatio)}</p>
                    </article>
                    <article className="runtime-result-metric">
                      <p className="runtime-result-metric-label">Average Latency</p>
                      <p className="runtime-result-metric-value">{formatLatency(stabilityResult.averageLatencyMs)}</p>
                    </article>
                    <article className="runtime-result-metric">
                      <p className="runtime-result-metric-label">Average Tokens</p>
                      <p className="runtime-result-metric-value">{formatTokenCount(stabilityResult.averageTokens)}</p>
                    </article>
                    <article className="runtime-result-metric">
                      <p className="runtime-result-metric-label">Retry Occurrence</p>
                      <p className="runtime-result-metric-value">
                        {stabilityResult.retryOccurrenceCount}/{stabilityResult.totalRuns}
                      </p>
                    </article>
                    <article className="runtime-result-metric">
                      <p className="runtime-result-metric-label">Repair Occurrence</p>
                      <p className="runtime-result-metric-value">
                        {stabilityResult.repairOccurrenceCount}/{stabilityResult.totalRuns}
                      </p>
                    </article>
                  </div>

                  <section className="runtime-analysis-output-groups">
                    <h4 className="runtime-debug-heading">Output Groups</h4>
                    {stabilityResult.outputGroups.length === 0 ? (
                      <p className="meta-line">No successful JSON output groups found.</p>
                    ) : (
                      <div className="runtime-analysis-output-list">
                        {stabilityResult.outputGroups.map((group, index) => {
                          const ratio = stabilityResult.totalRuns > 0 ? (group.count / stabilityResult.totalRuns) * 100 : 0;
                          return (
                            <article
                              key={group.key}
                              className={`runtime-analysis-output-item${index === 0 ? ' is-most-common' : ''}`}
                            >
                              <header>
                                <p>{index === 0 ? 'Most Common Output' : `Output ${index + 1}`}</p>
                                <span>
                                  {group.count} runs ({formatPercent(ratio)})
                                </span>
                              </header>
                              <pre className="runtime-tools-preview-block">{group.preview}</pre>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              ) : null}
            </>
          ) : null}

          {testMode === 'compare' ? (
            <>
              {compareError ? (
                <section className="runtime-error-panel">
                  <p className="runtime-error-title">Model Comparison Error</p>
                  <p className="runtime-error-message">{compareError}</p>
                </section>
              ) : null}
              {!compareResults.length && !compareRunning ? (
                <p className="meta-line">Run model comparison to inspect overlap, stability, and performance by model.</p>
              ) : null}
              {compareResults.length > 0 ? (
                <div className="runtime-analysis-stack">
                  <div className="runtime-analysis-summary-grid">
                    <article className="runtime-result-metric">
                      <p className="runtime-result-metric-label">Models Compared</p>
                      <p className="runtime-result-metric-value">{compareResults.length}</p>
                    </article>
                    <article className="runtime-result-metric">
                      <p className="runtime-result-metric-label">Runs Per Model</p>
                      <p className="runtime-result-metric-value">{compareRunsPerModel}</p>
                    </article>
                    <article className="runtime-result-metric">
                      <p className="runtime-result-metric-label">Shared Output Groups</p>
                      <p className="runtime-result-metric-value">{sharedOutputGroupCount}</p>
                    </article>
                    <article className="runtime-result-metric">
                      <p className="runtime-result-metric-label">Highest Shared Overlap</p>
                      <p className="runtime-result-metric-value">
                        {sharedOutputOverlap ? `${sharedOutputOverlap.modelMatches.length} models` : 'No shared output'}
                      </p>
                    </article>
                  </div>

                  {sharedOutputOverlap ? (
                    <section className="runtime-shared-overlap-card">
                      <h4 className="runtime-debug-heading">Shared Output Overlap</h4>
                      <p className="runtime-shared-overlap-meta">
                        Dominant shared output appears across {sharedOutputOverlap.modelMatches.length} models.
                      </p>
                      <div className="runtime-shared-overlap-model-list">
                        {sharedOutputOverlap.modelMatches.map((match) => (
                          <article key={`${sharedOutputOverlap.key}-${match.model}`} className="runtime-result-metric">
                            <p className="runtime-result-metric-label">{match.model}</p>
                            <p className="runtime-result-metric-value">
                              {match.count} runs ({formatPercent(match.ratio)})
                            </p>
                          </article>
                        ))}
                      </div>
                      <pre className="runtime-tools-preview-block">{sharedOutputOverlap.preview}</pre>
                    </section>
                  ) : null}

                  <section className="runtime-compare-model-grid">
                    {compareResults.map((result) => (
                      <article key={result.model} className="runtime-compare-model-card">
                        <header className="runtime-compare-model-header">
                          <h4>{result.model}</h4>
                          <span>{formatPercent(result.summary.successRate)} success</span>
                        </header>
                        <div className="runtime-compare-model-stats">
                          <article className="runtime-result-metric">
                            <p className="runtime-result-metric-label">Unique Outputs</p>
                            <p className="runtime-result-metric-value">{result.summary.uniqueOutputCount}</p>
                          </article>
                          <article className="runtime-result-metric">
                            <p className="runtime-result-metric-label">Average Latency</p>
                            <p className="runtime-result-metric-value">{formatLatency(result.summary.averageLatencyMs)}</p>
                          </article>
                          <article className="runtime-result-metric">
                            <p className="runtime-result-metric-label">Average Tokens</p>
                            <p className="runtime-result-metric-value">{formatTokenCount(result.summary.averageTokens)}</p>
                          </article>
                          <article className="runtime-result-metric">
                            <p className="runtime-result-metric-label">Retry / Repair</p>
                            <p className="runtime-result-metric-value">
                              {result.summary.retryOccurrenceCount}/{result.summary.repairOccurrenceCount}
                            </p>
                          </article>
                          <article className="runtime-result-metric">
                            <p className="runtime-result-metric-label">Most Common Output</p>
                            <p className="runtime-result-metric-value">{result.summary.mostCommonOutputCount}</p>
                          </article>
                          <article className="runtime-result-metric">
                            <p className="runtime-result-metric-label">Output Match Rate</p>
                            <p className="runtime-result-metric-value">{formatPercent(result.summary.mostCommonOutputRatio)}</p>
                          </article>
                        </div>
                        {result.summary.mostCommonOutputPreview ? (
                          <pre className="runtime-tools-preview-block">{result.summary.mostCommonOutputPreview}</pre>
                        ) : (
                          <p className="meta-line">No successful output preview for this model.</p>
                        )}
                      </article>
                    ))}
                  </section>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </section>

    </section>
  );
}

type TestMode = 'single' | 'stability' | 'compare';
