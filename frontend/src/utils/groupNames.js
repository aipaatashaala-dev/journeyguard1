export function formatTrainGroupName(trainName, trainNumber) {
  const cleanName = normalizeTrainName(trainName);
  if (cleanName) {
    return `${cleanName} Group`;
  }

  const cleanNumber = String(trainNumber || '').trim();
  if (cleanNumber) {
    return `Train ${cleanNumber} Group`;
  }

  return 'Train Group';
}

function normalizeTrainName(trainName) {
  const value = String(trainName || '').trim();
  if (!value) {
    return '';
  }

  return value
    .split(/\s+/)
    .map((token) => {
      if (!token || token !== token.toUpperCase()) {
        return token;
      }
      if (/\d/.test(token) || token.length <= 4) {
        return token;
      }
      return token.charAt(0) + token.slice(1).toLowerCase();
    })
    .join(' ');
}
