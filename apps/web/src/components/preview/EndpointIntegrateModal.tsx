import { useCallback, useEffect, useState } from 'react';
import type { EndpointSpecCurrentResponse, EndpointSummary } from '@contrix/spec-core';
import type { RuntimePreflightResponse } from '@contrix/runtime-core';
import { fetchEndpointSpecCurrent, fetchRuntimePreflightByEndpoint } from '../../services/api';
import { subscribeEndpointContentUpdated } from '../../services/endpointSyncEvents';
import { EndpointIntegratePanel } from './EndpointIntegratePanel';

interface EndpointIntegrateModalProps {
  endpoint: EndpointSummary;
}

export function EndpointIntegrateModal({ endpoint }: EndpointIntegrateModalProps) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [specCurrent, setSpecCurrent] = useState<EndpointSpecCurrentResponse | null>(null);
  const [runtimePreflight, setRuntimePreflight] = useState<RuntimePreflightResponse | null>(null);

  const endpointId = endpoint.id;

  const loadIntegrateData = useCallback(
    async (initialLoad = false) => {
      if (initialLoad) {
        setLoading(true);
      } else {
        setSyncing(true);
      }

      setError(null);

      try {
        const [specData, runtimePreflightData] = await Promise.all([
          fetchEndpointSpecCurrent(endpointId),
          fetchRuntimePreflightByEndpoint(endpointId)
        ]);
        setSpecCurrent(specData);
        setRuntimePreflight(runtimePreflightData);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Failed to load endpoint integration data.');
      } finally {
        if (initialLoad) {
          setLoading(false);
        } else {
          setSyncing(false);
        }
      }
    },
    [endpointId]
  );

  useEffect(() => {
    void loadIntegrateData(true);
  }, [loadIntegrateData]);

  useEffect(() => {
    return subscribeEndpointContentUpdated((detail) => {
      if (detail.endpointId !== endpointId) {
        return;
      }

      void loadIntegrateData(false);
    });
  }, [endpointId, loadIntegrateData]);

  return (
    <section className="preview-panel-stack">
      {syncing ? (
        <section className="panel compact-panel">
          <p className="meta-line">Syncing integrate data...</p>
        </section>
      ) : null}

      {error ? (
        <section className="panel compact-panel">
          <p className="error-line">{error}</p>
        </section>
      ) : null}

      {loading ? (
        <section className="panel compact-panel">
          <p className="meta-line">Loading integrate data...</p>
        </section>
      ) : (
        <EndpointIntegratePanel endpoint={endpoint} specCurrent={specCurrent} runtimePreflight={runtimePreflight} />
      )}
    </section>
  );
}
