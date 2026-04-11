export function createParseSingleFlight() {
  let activeRequest = null;

  return {
    start(nextRequest) {
      if (activeRequest) {
        return {
          ok: false,
          activeRequest,
        };
      }

      activeRequest = {
        requestId: nextRequest.requestId,
        tabId: nextRequest.tabId,
      };

      return {
        ok: true,
        activeRequest,
      };
    },

    finish(requestId) {
      if (!activeRequest) {
        return;
      }

      if (activeRequest.requestId !== requestId) {
        return;
      }

      activeRequest = null;
    },

    getActive() {
      return activeRequest;
    },
  };
}
