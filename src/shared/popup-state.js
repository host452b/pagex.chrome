export function canCopyForSelectedTab(parseState, selectedTabId) {
  if (!parseState || !parseState.canCopy || !parseState.result) {
    return false;
  }

  if (!Number.isInteger(selectedTabId) || selectedTabId <= 0) {
    return false;
  }

  if (parseState.selectedTabId !== selectedTabId) {
    return false;
  }

  return true;
}

export function isParseButtonDisabled({
  hasTabs,
  isStartingParse,
  parseState,
}) {
  if (!hasTabs) {
    return true;
  }

  if (isStartingParse) {
    return true;
  }

  if (parseState && parseState.status === 'running') {
    return true;
  }

  return false;
}

export function getResultMismatchMessage(parseState, selectedTabId) {
  if (!parseState || !Number.isInteger(parseState.selectedTabId)) {
    return '';
  }

  if (!Number.isInteger(selectedTabId) || selectedTabId <= 0) {
    return '';
  }

  if (parseState.selectedTabId === selectedTabId) {
    return '';
  }

  return 'The selected tab does not match the last parsed result. Select Parse again for this tab before copying.';
}
