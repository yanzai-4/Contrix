export const ENDPOINT_CONTENT_UPDATED_EVENT = 'contrix:endpoint-content-updated';

export interface EndpointContentUpdatedDetail {
  endpointId: string;
  source: 'edit';
}

type EndpointContentUpdatedListener = (detail: EndpointContentUpdatedDetail) => void;

export function emitEndpointContentUpdated(detail: EndpointContentUpdatedDetail): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<EndpointContentUpdatedDetail>(ENDPOINT_CONTENT_UPDATED_EVENT, { detail }));
}

export function subscribeEndpointContentUpdated(listener: EndpointContentUpdatedListener): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<EndpointContentUpdatedDetail>;
    const detail = customEvent.detail;

    if (!detail?.endpointId) {
      return;
    }

    listener(detail);
  };

  window.addEventListener(ENDPOINT_CONTENT_UPDATED_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(ENDPOINT_CONTENT_UPDATED_EVENT, handler as EventListener);
  };
}
